<?php

namespace App\Services\Transport;

use App\Models\Account;
use App\Models\Driver;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\Payment;
use App\Models\TransportTrip;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class TransportService
{
    public function __construct(private LedgerService $ledger) {}

    /**
     * Record a transport trip. The trip cost is a transport expense; any unpaid
     * portion becomes a payable owed to the driver.
     *
     * @param  array{vehicle_id?:string,driver_id?:string,dispatch_id?:string,material_purchase_id?:string,kind?:string,trip_date:string,from_location?:string,to_location?:string,rate:int,paid?:int,method?:string,notes?:string}  $data
     */
    public function recordTrip(array $data): TransportTrip
    {
        return DB::transaction(function () use ($data) {
            $kind = ($data['kind'] ?? TransportTrip::OUTBOUND) === TransportTrip::INBOUND
                ? TransportTrip::INBOUND
                : TransportTrip::OUTBOUND;
            $rate = (int) $data['rate'];
            $paid = min((int) ($data['paid'] ?? 0), $rate);
            $balance = $rate - $paid;

            $trip = TransportTrip::create([
                'reference' => Sequence::next('TRP'),
                'vehicle_id' => $data['vehicle_id'] ?? null,
                'vehicle_label' => $data['vehicle_label'] ?? null,
                'driver_id' => $data['driver_id'] ?? null,
                'dispatch_id' => $data['dispatch_id'] ?? null,
                'material_purchase_id' => $data['material_purchase_id'] ?? null,
                'kind' => $kind,
                'trip_date' => $data['trip_date'],
                'from_location' => $data['from_location'] ?? null,
                'to_location' => $data['to_location'] ?? null,
                'rate' => $rate,
                'paid' => $paid,
                'balance' => $balance,
                'status' => $this->status($rate, $paid),
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            if ($balance > 0 && ! empty($data['driver_id'])) {
                Driver::whereKey($data['driver_id'])->increment('balance', $balance);
            }

            $isBank = ($data['method'] ?? 'cash') === 'bank';
            $cashAccount = $isBank ? Account::BANK : Account::CASH;

            // Kiraya kis khate me jaye:
            //  - Customer ko maal bhejna: customer ne kiraya diya tha, wo 2100
            //    clearing me para hai, yahan se nikal jata hai. Pass through.
            //  - Maal laane ka kiraya: owner ke faisle ke baad purchase par
            //    kiraya likha hi nahi jata, is liye clearing me kabhi kuch para
            //    hi nahi hota. Ye seedha factory ka kharcha hai, chahe trip kisi
            //    khareed se judi ho ya na ho.
            //
            // Pehle yahan material_purchase_id dekha jata tha, aur khareed se
            // judi trip ka kiraya 2100 me chala jata tha, jahan usay wash karne
            // wala koi credit hai hi nahi: kiraya P&L se gayab ho jata aur
            // clearing minus me chali jati. Us waqt purchase khud 2100 credit
            // karti thi, ab nahi karti, is liye shart hata di.
            $costAccount = $kind === TransportTrip::INBOUND
                ? Account::EXPENSE
                : Account::TRANSPORT_CLEARING;
            $lines = [['account' => $costAccount, 'debit' => $rate, 'memo' => $kind === TransportTrip::INBOUND ? 'Maal laane ka kiraya' : 'Driver freight']];
            if ($paid > 0) {
                $lines[] = ['account' => $cashAccount, 'credit' => $paid, 'memo' => $isBank ? ($data['bank_ref'] ?? null) : null];
            }
            if ($balance > 0) {
                $lines[] = ['account' => Account::PAYABLE, 'credit' => $balance, 'memo' => 'Driver dues'];
            }

            $this->ledger->post($data['trip_date'], "Transport {$trip->reference}", $lines, $trip);

            return $trip;
        });
    }

    /**
     * Galat likha hua kiraya theek karna.
     *
     * Tareeqa wahi hai jo payment ke rollback me chalta hai: purana asar
     * KHATE SE parho, hatao, phir nayi rakam ka asar lagao. Row wahi rehti
     * hai, nayi nahi banti, is liye jo parchi driver ko de di gayi thi us ka
     * reference wahi rehta hai.
     *
     * Simt (maal laaya ya bheja) yahan se nahi badalti: bahar jane wali trip
     * 2100 clearing se guzarti hai aur andar aane wali 5000 kharche me, simt
     * badalte hi clearing me aik taraf ka paisa adhoora reh jata hai.
     *
     * @param  array{trip_date?:string,driver_id?:string,vehicle_id?:string,vehicle_label?:string,material_purchase_id?:string,kind?:string,from_location?:string,to_location?:string,rate?:int,paid?:int,method?:string,bank_ref?:string,notes?:string}  $data
     */
    public function updateTrip(TransportTrip $trip, array $data): TransportTrip
    {
        return DB::transaction(function () use ($trip, $data) {
            $kind = $trip->kind === TransportTrip::INBOUND ? TransportTrip::INBOUND : TransportTrip::OUTBOUND;

            if (isset($data['kind']) && $data['kind'] !== $kind) {
                throw new InvalidArgumentException(
                    'Trip ki simt (maal laaya ya maal bheja) yahan se nahi badalti. Simt galat likhi gayi ho to ye trip wapas lein aur nayi likhein.'
                );
            }

            if ($kind === TransportTrip::OUTBOUND && ! empty($data['material_purchase_id'])) {
                throw new InvalidArgumentException(
                    'Maal bhejne wali trip kisi khareed se nahi jurti. Khareed ka khana sirf maal laane wali trip par hota hai.'
                );
            }

            // Pehli deewar: is trip par alag se paisa diya ja chuka ho to
            // kiraya hilane se wo payment hawa me latak jayegi.
            $tied = Payment::where('allocatable_type', $trip->getMorphClass())
                ->where('allocatable_id', $trip->getKey())
                ->first();
            if ($tied) {
                throw new InvalidArgumentException(
                    "Is trip ka paisa {$tied->reference} se diya ja chuka hai, is liye kiraya yahan se nahi badalta. Pehle wo payment wapas lein, phir kiraya theek karein."
                );
            }

            $entries = JournalEntry::where('source_type', $trip->getMorphClass())
                ->where('source_id', $trip->getKey())
                ->get();
            if ($entries->isEmpty()) {
                throw new InvalidArgumentException(
                    'Is trip ki khate me koi entry nahi mili, is liye yahan se theek nahi ho sakti.'
                );
            }

            $lines = JournalLine::with('account')->whereIn('journal_entry_id', $entries->modelKeys())->get();
            $net = fn (string $code) => (int) $lines
                ->filter(fn (JournalLine $l) => $l->account?->code === $code)
                ->sum(fn (JournalLine $l) => (int) $l->credit - (int) $l->debit);

            // Purana asar khate ki line se, trip ke apne paid/balance column se
            // nahi: driver ko mila hua lump payment un columns ko hila deta hai,
            // khate ki line aik dafa likhi jati hai aur phir kabhi nahi hilti.
            $oldPayable = $net(Account::PAYABLE);
            $oldBank = $net(Account::BANK);
            $oldCash = $net(Account::CASH) + $oldBank;
            $oldBankRef = $lines->first(fn (JournalLine $l) => $l->account?->code === Account::BANK)?->memo;

            // Doosri deewar: row aur khata aik baat na kehte hon to beech me
            // koi lump payment is trip par lag chuki hai.
            if ($oldCash !== (int) $trip->paid) {
                throw new InvalidArgumentException(
                    'Is trip ka kuch paisa baad me driver ki alag payment se diya gaya hai, is liye kiraya yahan se nahi badalta. Pehle wo payment wapas lein.'
                );
            }

            $rate = (int) ($data['rate'] ?? $trip->rate);
            if ($rate <= 0) {
                throw new InvalidArgumentException('Kiraya sifar nahi ho sakta.');
            }
            $paid = min(max((int) ($data['paid'] ?? $oldCash), 0), $rate);
            $balance = $rate - $paid;
            $date = $data['trip_date'] ?? $trip->trip_date->toDateString();
            $driverId = $data['driver_id'] ?? $trip->driver_id;

            // Tareeqa na bheja gaya ho to purana hi rehta hai, warna cash ka
            // likha hua paisa chupke se bank se cash me chala jata hai.
            $method = $data['method'] ?? ($oldBank > 0 ? 'bank' : 'cash');
            $cashAccount = CashAccountResolver::code($method);
            $bankRef = array_key_exists('bank_ref', $data) ? $data['bank_ref'] : $oldBankRef;

            // Reference wahi rehta hai jo parchi par chhap chuka hai.
            $description = $entries->first()->description;
            $entries->each(function (JournalEntry $entry) {
                $entry->lines()->delete();
                $entry->delete();
            });

            // Purana baqi purane driver se utaro, naya baqi naye driver par
            // chadhao. Driver badal gaya ho to dono taraf theek ho jata hai.
            if ($oldPayable !== 0 && $trip->driver_id) {
                Driver::whereKey($trip->driver_id)->decrement('balance', $oldPayable);
            }
            if ($balance > 0 && $driverId) {
                Driver::whereKey($driverId)->increment('balance', $balance);
            }

            $trip->update([
                'trip_date' => $date,
                'driver_id' => $driverId,
                'vehicle_id' => array_key_exists('vehicle_id', $data) ? $data['vehicle_id'] : $trip->vehicle_id,
                'vehicle_label' => array_key_exists('vehicle_label', $data) ? $data['vehicle_label'] : $trip->vehicle_label,
                'material_purchase_id' => $kind === TransportTrip::INBOUND && array_key_exists('material_purchase_id', $data)
                    ? $data['material_purchase_id']
                    : $trip->material_purchase_id,
                'from_location' => array_key_exists('from_location', $data) ? $data['from_location'] : $trip->from_location,
                'to_location' => array_key_exists('to_location', $data) ? $data['to_location'] : $trip->to_location,
                'rate' => $rate,
                'paid' => $paid,
                'balance' => $balance,
                'status' => $this->status($rate, $paid),
                'notes' => array_key_exists('notes', $data) ? $data['notes'] : $trip->notes,
            ]);

            // Khate ka khana wahi jo recordTrip me hai: maal laane ka kiraya
            // seedha 5000 kharcha, maal bhejne ka 2100 clearing.
            $costAccount = $kind === TransportTrip::INBOUND
                ? Account::EXPENSE
                : Account::TRANSPORT_CLEARING;
            $newLines = [['account' => $costAccount, 'debit' => $rate, 'memo' => $kind === TransportTrip::INBOUND ? 'Maal laane ka kiraya' : 'Driver freight']];
            if ($paid > 0) {
                $newLines[] = ['account' => $cashAccount, 'credit' => $paid, 'memo' => $method === 'bank' ? $bankRef : null];
            }
            if ($balance > 0) {
                $newLines[] = ['account' => Account::PAYABLE, 'credit' => $balance, 'memo' => 'Driver dues'];
            }

            $this->ledger->post($date, $description, $newLines, $trip);

            return $trip->refresh();
        });
    }

    /**
     * Trip bilkul hata dena, jaise likhi hi na gayi ho.
     *
     * Khareed par se driver hata dene par yahi chalta hai: driver ka baqi utar
     * jata hai aur khate ki entry mit jati hai. Purana asar trip ke apne column
     * se nahi, khate ki line se parha jata hai, kyunke driver ko diya hua lump
     * payment un columns ko hila deta hai.
     */
    public function removeTrip(TransportTrip $trip): void
    {
        DB::transaction(function () use ($trip) {
            $tied = Payment::where('allocatable_type', $trip->getMorphClass())
                ->where('allocatable_id', $trip->getKey())
                ->first();
            if ($tied) {
                throw new InvalidArgumentException(
                    "Is trip ka paisa {$tied->reference} se diya ja chuka hai, is liye driver yahan se nahi hatta. Pehle wo payment wapas lein."
                );
            }

            $entries = JournalEntry::where('source_type', $trip->getMorphClass())
                ->where('source_id', $trip->getKey())
                ->get();
            $lines = JournalLine::with('account')->whereIn('journal_entry_id', $entries->modelKeys())->get();
            $oldPayable = (int) $lines
                ->filter(fn (JournalLine $l) => $l->account?->code === Account::PAYABLE)
                ->sum(fn (JournalLine $l) => (int) $l->credit - (int) $l->debit);
            $oldCash = (int) $lines
                ->filter(fn (JournalLine $l) => in_array($l->account?->code, [Account::CASH, Account::BANK], true))
                ->sum(fn (JournalLine $l) => (int) $l->credit - (int) $l->debit);

            if ($oldCash !== (int) $trip->paid) {
                throw new InvalidArgumentException(
                    'Is trip ka kuch paisa baad me driver ki alag payment se diya gaya hai, is liye driver yahan se nahi hatta. Pehle wo payment wapas lein.'
                );
            }

            $entries->each(function (JournalEntry $entry) {
                $entry->lines()->delete();
                $entry->delete();
            });

            if ($oldPayable !== 0 && $trip->driver_id) {
                Driver::whereKey($trip->driver_id)->decrement('balance', $oldPayable);
            }

            $trip->delete();
        });
    }

    private function status(int $rate, int $paid): string
    {
        if ($paid <= 0) {
            return 'unpaid';
        }

        return $paid >= $rate ? 'paid' : 'partial';
    }
}
