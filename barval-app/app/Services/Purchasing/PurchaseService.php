<?php

namespace App\Services\Purchasing;

use App\Models\Account;
use App\Models\Driver;
use App\Models\MaterialPurchase;
use App\Models\RawMaterial;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Services\Transport\TransportService;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class PurchaseService
{
    public function __construct(private LedgerService $ledger, private TransportService $transport) {}

    /**
     * Record a material purchase.
     *
     * If a driver is named, the kiraya on this purchase becomes THAT DRIVER's
     * freight trip (exactly like a dispatch), so it is owed to him and paid
     * from the Drivers/Transport screens. The supplier is then billed for the
     * material only. The kiraya still sits inside `total_cost` because it is
     * part of what the material cost us.
     *
     * @param  array{supplier_id:string,raw_material_id:string,purchase_date:string,quantity:float,unit_cost:int,transport_cost?:int,loading_cost?:int,unloading_cost?:int,paid_amount?:int,method?:string,driver_id?:string,trip_paid?:int,notes?:string}  $data
     */
    public function record(array $data): MaterialPurchase
    {
        return DB::transaction(function () use ($data) {
            $supplier = Supplier::findOrFail($data['supplier_id']);
            $material = RawMaterial::findOrFail($data['raw_material_id']);

            $extras = (int) ($data['transport_cost'] ?? 0)
                + (int) ($data['loading_cost'] ?? 0)
                + (int) ($data['unloading_cost'] ?? 0);
            $totalCost = (int) round($data['quantity'] * $data['unit_cost']) + $extras;

            // Kiraya driver ko jaye ya supplier ke bill me rahe.
            $freight = (int) ($data['transport_cost'] ?? 0);
            $driverId = $data['driver_id'] ?? null;
            $freightToDriver = $driverId && $freight > 0;
            if ($driverId && $freight <= 0 && (int) ($data['trip_paid'] ?? 0) > 0) {
                // Warna driver ko diya hua cash kahin record hi nahi hota.
                throw new InvalidArgumentException('Driver ko paisa dena hai to pehle Transport (kiraya) likhein.');
            }
            $supplierBill = $totalCost - ($freightToDriver ? $freight : 0);

            $paid = min((int) ($data['paid_amount'] ?? 0), $supplierBill);
            $credit = $supplierBill - $paid;

            $purchase = MaterialPurchase::create([
                'reference' => Sequence::next('PUR'),
                'supplier_id' => $supplier->id,
                'raw_material_id' => $material->id,
                'purchase_date' => $data['purchase_date'],
                'quantity' => $data['quantity'],
                'unit_cost' => $data['unit_cost'],
                'transport_cost' => $data['transport_cost'] ?? 0,
                'loading_cost' => $data['loading_cost'] ?? 0,
                'unloading_cost' => $data['unloading_cost'] ?? 0,
                'total_cost' => $totalCost,
                'paid_amount' => $paid,
                'payment_status' => $this->status($supplierBill, $paid),
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
            if ($freightToDriver) {
                // Pass through: yahan clearing me credit, phir trip usay debit
                // karke driver ka payable khol deta hai. Bilkul sale/dispatch jaisa.
                $lines[] = ['account' => Account::TRANSPORT_CLEARING, 'credit' => $freight, 'memo' => 'Inbound freight'];
            }

            $this->ledger->post(
                $data['purchase_date'],
                "Purchase {$purchase->reference} - {$material->name}",
                $lines,
                $purchase,
            );

            if ($freightToDriver) {
                // Driver apni gaari khud carry karta hai (drivers.vehicle_name),
                // is liye alag se gaari poochhne ki zaroorat nahi.
                $driver = Driver::find($driverId);
                $this->transport->recordTrip([
                    'driver_id' => $driverId,
                    'vehicle_label' => trim(($driver?->vehicle_name ?? '').' '.($driver?->vehicle_plate ?? '')) ?: null,
                    'material_purchase_id' => $purchase->id,
                    'kind' => TransportTrip::INBOUND,
                    'trip_date' => $data['purchase_date'],
                    'to_location' => 'Factory',
                    'rate' => $freight,
                    'paid' => (int) ($data['trip_paid'] ?? 0),
                    'method' => $data['method'] ?? 'cash',
                    'notes' => "Material laaya: {$material->name} ({$purchase->reference})",
                ]);
            }

            return $purchase->fresh(['supplier', 'rawMaterial', 'trip.driver', 'trip.vehicle']);
        });
    }

    private function status(int $total, int $paid): string
    {
        if ($paid <= 0) {
            return 'unpaid';
        }

        return $paid >= $total ? 'paid' : 'partial';
    }
}
