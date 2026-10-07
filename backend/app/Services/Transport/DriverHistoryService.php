<?php

namespace App\Services\Transport;

use App\Models\Account;
use App\Models\Driver;
use App\Models\Payment;
use App\Models\TransportTrip;
use App\Services\Accounting\PartyStatement;
use Illuminate\Support\Collection;

/**
 * Everything that ever happened with one driver.
 *
 * A driver works both directions: he takes blocks out to customers (dispatch)
 * and he brings raw material in from suppliers. Both are the same man and the
 * same khata, so this reads them together and labels which is which.
 *
 * Statement comes off the ledger (2000 Accounts Payable) for the same reason
 * every other statement does: a lump payment is spread back over open trips,
 * so `transport_trips.paid` is a moving snapshot and adding it up with the
 * payments counts the same money twice.
 */
class DriverHistoryService
{
    public function __construct(private PartyStatement $statement) {}

    public function history(Driver $driver): array
    {
        $trips = $this->trips($driver);
        $payments = $this->payments($driver);

        $docs = $this->docs($trips, $payments);
        $ledger = $this->statement->rows(Account::PAYABLE, $docs, 'credit');
        $computed = $ledger === [] ? 0 : (int) end($ledger)['running'];
        $stored = (int) $driver->balance;

        $inbound = $trips->where('kind', TransportTrip::INBOUND);
        $outbound = $trips->where('kind', TransportTrip::OUTBOUND);

        $dates = collect([$trips->max('trip_date'), $payments->max('payment_date')])
            ->filter()->map(fn ($d) => $d->toDateString())->sort()->values();

        return [
            'driver' => $driver,
            'summary' => [
                'trips_count' => $trips->count(),
                'kiraya_total' => (int) $trips->sum('rate'),
                'inbound_count' => $inbound->count(),
                'inbound_total' => (int) $inbound->sum('rate'),
                'outbound_count' => $outbound->count(),
                'outbound_total' => (int) $outbound->sum('rate'),
                'paid' => $this->statement->net([Account::CASH, Account::BANK], $docs, 'credit'),
                // Dena wahi jo musbat ho; minus ka matlab advance diya hua hai.
                'outstanding' => max($stored, 0),
                'advance' => max(-$stored, 0),
                'balance' => $stored,
                'first_activity' => $dates->first(),
                'last_activity' => $dates->last(),
                'ledger_balance' => $computed,
                'reconciled' => $computed === $stored,
            ],
            'ledger' => $ledger,
            'trips' => $trips,
            'payments' => $payments,
        ];
    }

    /**
     * @return array<class-string,array{0:string,1:Collection}>
     */
    private function docs(Collection $trips, Collection $payments): array
    {
        return [
            TransportTrip::class => ['trip', $trips->pluck('reference', 'id')],
            Payment::class => ['payment', $payments->pluck('reference', 'id')],
        ];
    }

    /** @return Collection<int,TransportTrip> */
    private function trips(Driver $driver): Collection
    {
        return TransportTrip::with(['vehicle:id,name,plate', 'materialPurchase:id,reference', 'materialPurchase.rawMaterial:id,name'])
            ->where('driver_id', $driver->id)
            ->orderByDesc('trip_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,Payment> */
    private function payments(Driver $driver): Collection
    {
        return Payment::where('party_type', $driver->getMorphClass())
            ->where('party_id', $driver->id)
            ->orderByDesc('payment_date')->orderByDesc('created_at')
            ->get();
    }
}
