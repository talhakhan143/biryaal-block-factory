<?php

namespace App\Services\Purchasing;

use App\Models\Account;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\MaterialPurchase;
use App\Models\Payment;
use App\Models\RawMaterial;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Services\Transport\TransportService;
use App\Support\Money;
use App\Support\Sequence;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class PurchaseService
{
    public function __construct(
        private LedgerService $ledger,
        private TransportService $transport,
    ) {}

    /**
     * Maal laane wale driver ka kiraya.
     *
     * Kiraya is bill me NAHI chadhta. Uski apni alag trip banti hai driver ke
     * naam, bilkul wahi jo "Maal ka Kiraya" page banata hai: kharcha 5000 par,
     * aur driver ka baqi 2000 par. Form par sirf likhne ki jagah yahan hai,
     * ginna aik hi dafa jata hai, is liye double count ka sawal hi nahi.
     *
     * Trip khareed se juri hoti hai, isi liye Purchases ki row par "Laane wala
     * driver" nazar aata hai.
     */
    /**
     * Khareed theek karte waqt driver ka hisaab.
     *
     * Form hamesha driver ka khana bhejta hai, is liye teen soortein banti hain:
     * driver likha aur pehle se trip hai to wahi trip theek ho jati hai, trip
     * nahi hai to nayi ban jati hai, aur driver khali chhor diya ho to trip
     * bilkul hat jati hai. Har soorat me kiraya driver ke khate me rehta hai,
     * khareed ke bill me kabhi nahi.
     *
     * Jin requests me driver ka khana hai hi nahi (API se seedhi call) un me
     * trip ko haath nahi lagaya jata.
     */
    private function syncFreightDriver(MaterialPurchase $purchase, array $data): void
    {
        if (! array_key_exists('driver_id', $data) && ! array_key_exists('freight_rate', $data)) {
            return;
        }

        $trip = $purchase->trip()->first();
        $driverId = $data['driver_id'] ?? null;
        $rate = (int) ($data['freight_rate'] ?? 0);

        if (! $driverId || $rate <= 0) {
            if ($trip) {
                $this->transport->removeTrip($trip);
            }

            return;
        }

        if ($trip) {
            $this->transport->updateTrip($trip, [
                'driver_id' => $driverId,
                'trip_date' => $data['purchase_date'] ?? $purchase->purchase_date->toDateString(),
                'rate' => $rate,
                'paid' => (int) ($data['freight_paid'] ?? 0),
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
            ]);

            return;
        }

        $this->attachFreightDriver($purchase, $data + ['purchase_date' => $purchase->purchase_date->toDateString()]);
    }

    private function attachFreightDriver(MaterialPurchase $purchase, array $data): void
    {
        $rate = (int) ($data['freight_rate'] ?? 0);
        if (empty($data['driver_id']) || $rate <= 0) {
            return;
        }

        $this->transport->recordTrip([
            'kind' => TransportTrip::INBOUND,
            'driver_id' => $data['driver_id'],
            'material_purchase_id' => $purchase->id,
            'trip_date' => $data['purchase_date'],
            'rate' => $rate,
            'paid' => (int) ($data['freight_paid'] ?? 0),
            'method' => $data['method'] ?? 'cash',
            'bank_ref' => $data['bank_ref'] ?? null,
            'notes' => "Maal laaya: {$purchase->reference}",
        ]);
    }

    /**
     * Record a material purchase.
     *
     * Maal laane wale driver ka kiraya yahan jaan bujh kar nahi hai. Wo kiraya
     * "Maal ka Kiraya" wale page par us driver ke naam likha jata hai, jahan se
     * usay paisa bhi diya jata hai. Agar yahan bhi likha jata to wahi aik
     * kiraya do jagah chadh jata: aik dafa supplier ke bill me, aik dafa driver
     * ke khate me.
     *
     * `transport_cost` column purani entries ke liye abhi bhi hai (jo is faisle
     * se pehle likhi ja chuki hain), magar nayi purchase me hamesha sifar hoti hai.
     *
     * @param  array{supplier_id:string,raw_material_id:string,purchase_date:string,quantity:float,unit_cost:int,loading_cost?:int,unloading_cost?:int,paid_amount?:int,method?:string,notes?:string}  $data
     */
    public function record(array $data): MaterialPurchase
    {
        return DB::transaction(function () use ($data) {
            $supplier = Supplier::findOrFail($data['supplier_id']);
            $material = RawMaterial::findOrFail($data['raw_material_id']);

            $extras = (int) ($data['loading_cost'] ?? 0) + (int) ($data['unloading_cost'] ?? 0);
            $totalCost = (int) round($data['quantity'] * $data['unit_cost']) + $extras;

            $paid = min((int) ($data['paid_amount'] ?? 0), $totalCost);
            $credit = $totalCost - $paid;

            $purchase = MaterialPurchase::create([
                'reference' => Sequence::next('PUR'),
                'supplier_id' => $supplier->id,
                'raw_material_id' => $material->id,
                'purchase_date' => $data['purchase_date'],
                'quantity' => $data['quantity'],
                'unit_cost' => $data['unit_cost'],
                'transport_cost' => 0,
                'loading_cost' => $data['loading_cost'] ?? 0,
                'unloading_cost' => $data['unloading_cost'] ?? 0,
                'total_cost' => $totalCost,
                'paid_amount' => $paid,
                'payment_status' => $this->status($totalCost, $paid),
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            // raw material stock up
            $material->increment('current_qty', $data['quantity']);

            // supplier owed more by the unpaid portion
            if ($credit > 0) {
                $supplier->increment('balance', $credit);
            }

            // journal: Dr Inventory; Cr Cash (paid) + Cr Payable (unpaid)
            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
            $lines = [['account' => Account::INVENTORY, 'debit' => $totalCost, 'memo' => 'Material purchase']];
            if ($paid > 0) {
                $lines[] = ['account' => $cashAccount, 'credit' => $paid];
            }
            if ($credit > 0) {
                $lines[] = ['account' => Account::PAYABLE, 'credit' => $credit, 'memo' => $supplier->name];
            }

            $this->ledger->post(
                $data['purchase_date'],
                "Purchase {$purchase->reference} - {$material->name}",
                $lines,
                $purchase,
            );

            $this->attachFreightDriver($purchase, $data);

            return $purchase->fresh(['supplier', 'rawMaterial']);
        });
    }

    /**
     * Galat likhi hui khareed theek karna.
     *
     * Usool wahi hai jo payment me hai: andaza mat lagao, khate se parho. Is
     * purchase ne jo asar daala tha wo uski apni journal entry me likha hai,
     * aur wo line aik dafa likhi jati hai phir kabhi hilti nahi. Row ke apne
     * paid_amount par bharosa nahi kiya ja sakta, kyunki supplier ko di gayi
     * lump payment aur System ka reconcile dono usay baad me badal dete hain.
     *
     * Nayi row nahi banti, wahi row badalti hai, taake jo parchi supplier ko
     * de di gayi hai uska reference wahi rahe.
     *
     * @param  array{supplier_id?:string,raw_material_id?:string,purchase_date?:string,quantity?:float,unit_cost?:int,loading_cost?:int,unloading_cost?:int,paid_amount?:int,method?:string,bank_ref?:string,notes?:string}  $data
     */
    public function update(MaterialPurchase $purchase, array $data): MaterialPurchase
    {
        return DB::transaction(function () use ($purchase, $data) {
            $lines = JournalLine::query()
                ->with('account')
                ->whereHas('entry', fn ($q) => $q
                    ->where('source_type', $purchase->getMorphClass())
                    ->where('source_id', $purchase->id))
                ->get();

            // Is bill par alag se jo paisa diya ja chuka hai wo apni jagah
            // qaim rehta hai: wo asli payment hai, uski apni entry hai. Pehle
            // yahan error diya jata tha ke "pehle wo payment wapas lein", magar
            // owner ko har galti sudharne ka raasta chahiye, is liye ab usay
            // hisaab me le kar aage barh jate hain.
            $allocated = (int) Payment::where('allocatable_type', $purchase->getMorphClass())
                ->where('allocatable_id', $purchase->id)
                ->sum('amount');

            // Purana asar, sirf khate se parha hua.
            $oldCredit = $this->creditOn($lines, [Account::PAYABLE]);
            $oldCash = $this->creditOn($lines, [Account::CASH, Account::BANK]);
            $wasBank = $this->creditOn($lines, [Account::BANK]) !== 0;

            // Purana supplier ya maal delete ho chuka ho to rukte nahi: jo row
            // mojood hi nahi uska balance ya stock wapas karne ko kuch hai hi
            // nahi. Sirf naya chuna hua zaroori hai.
            $oldSupplier = $purchase->supplier;
            $oldMaterial = $purchase->rawMaterial;

            $supplier = isset($data['supplier_id']) ? Supplier::findOrFail($data['supplier_id']) : $oldSupplier;
            $material = isset($data['raw_material_id']) ? RawMaterial::findOrFail($data['raw_material_id']) : $oldMaterial;
            if (! $supplier || ! $material) {
                throw new InvalidArgumentException('Is khareed par supplier aur maal dono chunein.');
            }

            $oldQty = (float) $purchase->quantity;
            $qty = (float) ($data['quantity'] ?? $oldQty);
            $unit = (int) ($data['unit_cost'] ?? $purchase->unit_cost);
            $loading = (int) ($data['loading_cost'] ?? $purchase->loading_cost);
            $unloading = (int) ($data['unloading_cost'] ?? $purchase->unloading_cost);

            // Purani entries ka kiraya bill ke andar chadha hua hai. Is form me
            // kiraya ka khana nahi (owner ka faisla, kiraya sirf "Maal ka
            // Kiraya" par likha jata hai), is liye jo pehle se chadha hua hai
            // usay jaisa hai waisa rehne dete hain, warna chup chaap bill se
            // nikal jata aur maal ki lagat kam ho jati.
            $freight = (int) $purchase->transport_cost;

            $total = (int) round($qty * $unit) + $loading + $unloading + $freight;
            // Form par "Paid now" poore bill ka diya hua paisa hai, yani jo
            // khareed ke waqt diya aur jo baad me alag payment se diya. Khareed
            // ki apni entry me sirf pehla wala jata hai, doosre ki apni entry
            // pehle se mojood hai.
            $paid = (int) ($data['paid_amount'] ?? ($oldCash + $allocated));
            $cashNow = $paid - $allocated;
            $date = $data['purchase_date'] ?? $purchase->purchase_date->toDateString();
            $method = $data['method'] ?? ($wasBank ? 'bank' : 'cash');

            if ($total <= 0) {
                throw new InvalidArgumentException('Bill sifar nahi ho sakta. Quantity aur rate theek se likhein.');
            }
            if ($cashNow < 0) {
                throw new InvalidArgumentException(
                    'Is bill par alag se '.Money::format($allocated).' diye ja chuke hain, is liye diya hua paisa us se kam nahi ho sakta.'
                );
            }
            if ($paid > $total) {
                throw new InvalidArgumentException(
                    'Diya hua paisa '.Money::format($paid).' hai jo naye bill '.Money::format($total).' se zyada hai. Pehle rakam kam karein.'
                );
            }

            // Stock: purane maal se purani qty wapas, naye maal me nayi qty.
            // Dono alag maal ho sakte hain.
            if ($oldMaterial) {
                $sameMaterial = $material->getKey() === $oldMaterial->getKey();
                $leftOnOld = (float) $oldMaterial->current_qty - $oldQty + ($sameMaterial ? $qty : 0);
                if (round($leftOnOld, 3) < 0) {
                    throw new InvalidArgumentException(
                        'Is tabdeeli se '.$oldMaterial->name.' ka stock minus me chala jata hai. Pehle stock theek karein, phir ye khareed badlein.'
                    );
                }

                $oldMaterial->decrement('current_qty', $oldQty);
            }
            $material->increment('current_qty', $qty);

            // Supplier ka khata: purana udhaar utar kar naya chadhao. Supplier
            // badla ho to purana apne aap saaf ho jata hai.
            if ($oldCredit !== 0 && $oldSupplier) {
                $oldSupplier->decrement('balance', $oldCredit);
            }
            // Khareed ki apni udhaari: alag payment ne jo utara wo uski apni
            // entry me pehle se utar chuka hai, is liye yahan sirf cashNow ghatate hain.
            $credit = $total - $cashNow;
            if ($credit > 0) {
                $supplier->increment('balance', $credit);
            }

            JournalEntry::where('source_type', $purchase->getMorphClass())
                ->where('source_id', $purchase->id)
                ->get()
                ->each(function (JournalEntry $entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                });

            $purchase->update([
                'supplier_id' => $supplier->id,
                'raw_material_id' => $material->id,
                'purchase_date' => $date,
                'quantity' => $qty,
                'unit_cost' => $unit,
                'loading_cost' => $loading,
                'unloading_cost' => $unloading,
                'total_cost' => $total,
                'paid_amount' => $paid,
                'payment_status' => $this->status($total, $paid),
                'bank_ref' => $data['bank_ref'] ?? $purchase->bank_ref,
                'notes' => $data['notes'] ?? $purchase->notes,
            ]);

            // Nayi entry bilkul wahi shape jo record() likhti hai.
            $cashAccount = CashAccountResolver::code($method);
            $newLines = [['account' => Account::INVENTORY, 'debit' => $total, 'memo' => 'Material purchase']];
            if ($cashNow > 0) {
                $newLines[] = ['account' => $cashAccount, 'credit' => $cashNow];
            }
            if ($credit > 0) {
                $newLines[] = ['account' => Account::PAYABLE, 'credit' => $credit, 'memo' => $supplier->name];
            }

            $this->ledger->post(
                $date,
                "Purchase {$purchase->reference} - {$material->name}",
                $newLines,
                $purchase,
            );

            $this->syncFreightDriver($purchase, $data);

            return $purchase->fresh(['supplier', 'rawMaterial', 'trip.driver']);
        });
    }

    /**
     * In khaton par kitna CREDIT para tha. Debit minus kar dete hain taake
     * ulti taraf ki koi line bhi apne aap hisaab me aa jaye.
     *
     * @param  Collection<int,JournalLine>  $lines
     * @param  array<int,string>  $codes
     */
    private function creditOn(Collection $lines, array $codes): int
    {
        return (int) $lines
            ->filter(fn (JournalLine $line) => in_array($line->account?->code, $codes, true))
            ->sum(fn (JournalLine $line) => (int) $line->credit - (int) $line->debit);
    }

    private function status(int $total, int $paid): string
    {
        if ($paid <= 0) {
            return 'unpaid';
        }

        return $paid >= $total ? 'paid' : 'partial';
    }
}
