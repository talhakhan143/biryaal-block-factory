<?php

namespace App\Services\Parties;

use App\Models\Customer;
use App\Models\Dispatch;
use App\Models\Driver;
use App\Models\FinishedGoodsStock;
use App\Models\JournalEntry;
use App\Models\Payment;
use App\Models\RawMaterial;
use App\Models\Sale;
use App\Models\SalesReturn;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\TransportTrip;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Kisi bande ko poora mitana: uska record aur us se judi har entry.
 *
 * Owner ka faisla: koi recycle bin nahi, seedha delete, aur screen par Urdu
 * me saaf warning ke sab kuch chala jayega aur wapas nahi aayega.
 *
 * Khata barabar kaise rehta hai: har document ki apni journal entry khud me
 * balanced hoti hai (debit = credit). Poori entry nikal dene se dono taraf
 * barabar kam hoti hain, is liye trial balance hil nahi sakta. Jo cheez
 * khud theek nahi hoti wo STOCK hai, kyunke wo khate se bahar hai, is liye
 * usay haath se wapas karna parta hai:
 *   sale ne block kaate the      -> wapas ready me
 *   return ne block wapas kiye the -> wapas nikaal do
 *   khareed ne kacha maal barhaya tha -> wapas kam karo
 *
 * Bande ka apna balance sifar ho jata hai kyunke jin entries ne usay hilaya
 * tha wo ab mojood hi nahi.
 */
class PartyPurgeService
{
    /**
     * Mitane se pehle ginti, taake screen par bataya ja sake ke kya kya jayega.
     *
     * @return array<string,int>
     */
    public function preview(Model $party): array
    {
        return match (true) {
            $party instanceof Customer => array_filter([
                'bills' => $party->sales()->count(),
                'challan' => Dispatch::where('customer_id', $party->getKey())->count(),
                'wapsi' => SalesReturn::whereIn('sale_id', $party->sales()->select('id'))->count(),
                'payments' => $party->payments()->count(),
            ]),
            $party instanceof Supplier => array_filter([
                'khareed' => $party->purchases()->count(),
                'payments' => $party->payments()->count(),
            ]),
            $party instanceof Driver => array_filter([
                'trips' => $party->trips()->count(),
                'payments' => $party->payments()->count(),
            ]),
            default => [],
        };
    }

    /** Customer, uske bill, challan, wapsi aur payments, sab khatam. */
    public function purgeCustomer(Customer $customer): void
    {
        DB::transaction(function () use ($customer) {
            $sales = $customer->sales()->with('items')->get();

            foreach ($sales as $sale) {
                // Wapsi ne jo block stock me daale the wo nikal do, phir jo
                // sale ne kaate the wo wapas daal do. Tarteeb se karna zaroori
                // hai warna ginti aapas me gadbad ho jati hai.
                foreach (SalesReturn::where('sale_id', $sale->getKey())->with('items')->get() as $return) {
                    foreach ($return->items as $item) {
                        $this->moveReady($item->product_id, -(int) $item->quantity);
                    }
                    $this->dropEntries($return);
                    $return->items()->delete();
                    $return->delete();
                }

                foreach ($sale->items as $item) {
                    $this->moveReady($item->product_id, (int) $item->quantity);
                }

                foreach (Dispatch::where('sale_id', $sale->getKey())->get() as $dispatch) {
                    $this->purgeDispatch($dispatch);
                }

                $this->dropPayments($sale);
                $this->dropEntries($sale);
                $sale->items()->delete();
                $sale->delete();
            }

            // Jo challan seedha customer ke naam tha, kisi bill se juda nahi.
            foreach (Dispatch::where('customer_id', $customer->getKey())->get() as $dispatch) {
                $this->purgeDispatch($dispatch);
            }

            $this->dropPartyPayments($customer);
            $customer->delete();
        });
    }

    /** Supplier, uski har khareed aur payments, sab khatam. */
    public function purgeSupplier(Supplier $supplier): void
    {
        DB::transaction(function () use ($supplier) {
            foreach ($supplier->purchases()->get() as $purchase) {
                // Khareed ka kiraya driver ki apni trip par hota hai. Wo trip
                // driver ka maamla hai, supplier ka nahi, is liye usay mitate
                // nahi: sirf khareed se rishta tod dete hain.
                TransportTrip::where('material_purchase_id', $purchase->getKey())
                    ->update(['material_purchase_id' => null]);

                $this->moveRaw($purchase->raw_material_id, -(float) $purchase->quantity);
                $this->dropPayments($purchase);
                $this->dropEntries($purchase);
                $purchase->delete();
            }

            $this->dropPartyPayments($supplier);
            $supplier->delete();
        });
    }

    /** Driver, uski har trip aur payments, sab khatam. */
    public function purgeDriver(Driver $driver): void
    {
        DB::transaction(function () use ($driver) {
            foreach ($driver->trips()->get() as $trip) {
                $this->dropPayments($trip);
                $this->dropEntries($trip);
                $trip->delete();
            }

            // Challan par driver ka naam likha hota hai. Challan customer ka
            // maamla hai, is liye usay rehne dete hain, bas naam hata dete hain.
            Dispatch::where('driver_id', $driver->getKey())->update(['driver_id' => null]);

            $this->dropPartyPayments($driver);
            $driver->delete();
        });
    }

    /** Challan aur uski trip. Stock ko haath nahi lagta, wo sale par kat chuka hota hai. */
    private function purgeDispatch(Dispatch $dispatch): void
    {
        foreach (TransportTrip::where('dispatch_id', $dispatch->getKey())->get() as $trip) {
            $this->dropPayments($trip);
            $this->dropEntries($trip);
            $trip->delete();
        }

        $this->dropEntries($dispatch);
        $dispatch->items()->delete();
        $dispatch->delete();
    }

    /** Us document se judi payments: unki apni entry bhi jati hai. */
    private function dropPayments(Model $doc): void
    {
        foreach (Payment::where('allocatable_type', $doc->getMorphClass())
            ->where('allocatable_id', $doc->getKey())->get() as $payment) {
            $this->dropEntries($payment);
            $payment->delete();
        }
    }

    /** Bande ke naam ki wo payments jo kisi aik bill se judi nahi thin. */
    private function dropPartyPayments(Model $party): void
    {
        foreach (Payment::where('party_type', $party->getMorphClass())
            ->where('party_id', $party->getKey())->get() as $payment) {
            $this->dropEntries($payment);
            $payment->delete();
        }
    }

    /**
     * Document ki journal entry aur uski lines.
     *
     * Poori entry jati hai, is liye debit aur credit barabar kam hote hain aur
     * trial balance hil nahi sakta.
     */
    private function dropEntries(Model $doc): void
    {
        JournalEntry::where('source_type', $doc->getMorphClass())
            ->where('source_id', $doc->getKey())
            ->get()
            ->each(function (JournalEntry $entry) {
                $entry->lines()->delete();
                $entry->delete();
            });

        // stock_movements apne morph ko 'reference' kehti hai, 'source' nahi.
        StockMovement::where('reference_type', $doc->getMorphClass())
            ->where('reference_id', $doc->getKey())
            ->delete();
    }

    private function moveReady(?string $productId, int $qty): void
    {
        if (! $productId || $qty === 0) {
            return;
        }

        FinishedGoodsStock::where('product_id', $productId)->increment('ready_qty', $qty);
    }

    private function moveRaw(?string $materialId, float $qty): void
    {
        if (! $materialId || $qty === 0.0) {
            return;
        }

        RawMaterial::whereKey($materialId)->increment('current_qty', $qty);
    }
}
