<?php

namespace App\Services\Purchasing;

use App\Models\Account;
use App\Models\MaterialPurchase;
use App\Models\RawMaterial;
use App\Models\Supplier;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class PurchaseService
{
    public function __construct(private LedgerService $ledger) {}

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

            return $purchase->fresh(['supplier', 'rawMaterial']);
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
