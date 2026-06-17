<?php

namespace App\Services\Transport;

use App\Models\Account;
use App\Models\Driver;
use App\Models\TransportTrip;
use App\Services\Accounting\LedgerService;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class TransportService
{
    public function __construct(private LedgerService $ledger) {}

    /**
     * Record a transport trip. The trip cost is a transport expense; any unpaid
     * portion becomes a payable owed to the driver.
     *
     * @param  array{vehicle_id?:string,driver_id?:string,dispatch_id?:string,trip_date:string,from_location?:string,to_location?:string,rate:int,paid?:int,method?:string,notes?:string}  $data
     */
    public function recordTrip(array $data): TransportTrip
    {
        return DB::transaction(function () use ($data) {
            $rate = (int) $data['rate'];
            $paid = min((int) ($data['paid'] ?? 0), $rate);
            $balance = $rate - $paid;

            $trip = TransportTrip::create([
                'reference' => Sequence::next('TRP'),
                'vehicle_id' => $data['vehicle_id'] ?? null,
                'vehicle_label' => $data['vehicle_label'] ?? null,
                'driver_id' => $data['driver_id'] ?? null,
                'dispatch_id' => $data['dispatch_id'] ?? null,
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

            $cashAccount = ($data['method'] ?? 'cash') === 'bank' ? Account::BANK : Account::CASH;
            // Freight is paid from what the customer paid (clearing), not a factory expense.
            $lines = [['account' => Account::TRANSPORT_CLEARING, 'debit' => $rate, 'memo' => 'Driver freight']];
            if ($paid > 0) {
                $lines[] = ['account' => $cashAccount, 'credit' => $paid];
            }
            if ($balance > 0) {
                $lines[] = ['account' => Account::PAYABLE, 'credit' => $balance, 'memo' => 'Driver dues'];
            }

            $this->ledger->post($data['trip_date'], "Transport {$trip->reference}", $lines, $trip);

            return $trip;
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
