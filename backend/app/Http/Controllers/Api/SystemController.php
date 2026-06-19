<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Driver;
use App\Models\TransportTrip;
use App\Services\Admin\SystemResetService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SystemController extends Controller
{
    public function __construct(private SystemResetService $service) {}

    /**
     * DANGER: wipe all business/test data. Super Admin only, and the caller must
     * type the exact word RESET to confirm. Users, roles and the chart of
     * accounts are preserved.
     */
    public function reset(Request $request)
    {
        abort_unless($request->user()?->hasAnyRole(['Super Admin', 'Owner']), 403, 'Sirf Owner / Super Admin yeh kar sakta hai.');

        $data = $request->validate([
            'confirm' => ['required', 'string'],
        ], [
            'confirm.required' => 'Confirm karne ke liye RESET likhein.',
        ]);

        if ($data['confirm'] !== 'RESET') {
            throw ValidationException::withMessages([
                'confirm' => 'Galat — bilkul "RESET" (capital) likhein.',
            ]);
        }

        $wiped = $this->service->reset();

        return response()->json([
            'message' => 'System reset ho gaya — saara data clear. Users, roles aur accounts safe hain.',
            'tables_cleared' => count($wiped),
        ]);
    }

    /**
     * Re-sync each transport trip's paid/balance/status to its driver's actual
     * balance. Fixes rows left inconsistent by driver payments that were made
     * before per-trip allocation existed. Idempotent.
     */
    public function reconcileTransport(Request $request)
    {
        abort_unless($request->user()?->hasAnyRole(['Super Admin', 'Owner']), 403, 'Sirf Owner / Super Admin yeh kar sakta hai.');

        $fixed = 0;

        Driver::query()->get()->each(function (Driver $driver) use (&$fixed) {
            $trips = TransportTrip::where('driver_id', $driver->getKey())
                ->orderBy('trip_date')
                ->orderBy('created_at')
                ->get();

            if ($trips->isEmpty()) {
                return;
            }

            // Amount already paid = total fares minus what the driver is still owed.
            $totalRate = (int) $trips->sum('rate');
            $remaining = max(0, $totalRate - (int) $driver->balance);

            foreach ($trips as $trip) {
                $apply = min($remaining, (int) $trip->rate);
                $status = $apply <= 0 ? 'unpaid' : ($apply >= (int) $trip->rate ? 'paid' : 'partial');

                if ((int) $trip->paid !== $apply || $trip->status !== $status) {
                    $trip->update([
                        'paid' => $apply,
                        'balance' => (int) $trip->rate - $apply,
                        'status' => $status,
                    ]);
                    $fixed++;
                }

                $remaining -= $apply;
            }
        });

        return response()->json([
            'message' => "Transport reconcile ho gaya — {$fixed} trip(s) update hue.",
            'trips_fixed' => $fixed,
        ]);
    }
}
