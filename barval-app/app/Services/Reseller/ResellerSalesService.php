<?php

namespace App\Services\Reseller;

use App\Models\Customer;
use App\Models\ResellerItem;
use App\Models\ResellerPayment;
use App\Models\ResellerSale;
use App\Models\ResellerSalesReturn;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Resellers Point selling + returns. Receivable lives ONLY on reseller_sales
 * (a customer's reseller dues = sum of their reseller_sales.balance) — it never
 * touches customers.balance, which is the block factory's. Money in/out is
 * logged in reseller_payments. Nothing posts to the block factory ledger.
 */
class ResellerSalesService
{
    /**
     * @param  array{customer_id?:string,sale_date:string,type:string,discount?:int,transport_fare?:int,paid?:int,payment_method?:string,bank_ref?:string,notes?:string,items:array<int,array{reseller_item_id:string,quantity:float,unit_price?:int}>}  $data
     */
    public function createSale(array $data): ResellerSale
    {
        if (empty($data['items'])) {
            throw new InvalidArgumentException('Bikri me kam se kam ek item hona chahiye.');
        }

        return DB::transaction(function () use ($data) {
            $customer = isset($data['customer_id']) ? Customer::findOrFail($data['customer_id']) : null;
            $type = $data['type'] ?? 'cash';
            if ($type === 'credit' && ! $customer) {
                throw new InvalidArgumentException('Udhaar bikri ke liye customer zaroori hai.');
            }

            $resolved = [];
            $subtotal = 0;
            foreach ($data['items'] as $line) {
                $item = ResellerItem::findOrFail($line['reseller_item_id']);
                $qty = (float) $line['quantity'];
                if ($qty <= 0) {
                    throw new InvalidArgumentException('Quantity ghalat hai.');
                }
                if ((float) $item->stock_qty < $qty) {
                    throw new InvalidArgumentException("{$item->name} ka stock kam hai (sirf {$item->stock_qty} {$item->unit}). Pehle khareed karein.");
                }
                $unitPrice = (int) ($line['unit_price'] ?? $item->sale_price);
                $lineTotal = (int) round($qty * $unitPrice);
                $subtotal += $lineTotal;
                $resolved[] = compact('item', 'qty', 'unitPrice', 'lineTotal');
            }

            $discount = (int) ($data['discount'] ?? 0);
            $fare = (int) ($data['transport_fare'] ?? 0);
            $goodsNet = $subtotal - $discount;
            if ($goodsNet < 0) {
                throw new InvalidArgumentException('Discount subtotal se zyada nahi ho sakta.');
            }
            $total = $goodsNet + $fare;
            $paid = $type === 'cash' ? $total : min((int) ($data['paid'] ?? 0), $total);
            $balance = $total - $paid;

            $sale = ResellerSale::create([
                'invoice_no' => Sequence::next('RINV'),
                'customer_id' => $customer?->id,
                'sale_date' => $data['sale_date'],
                'type' => $type,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'transport_fare' => $fare,
                'total' => $total,
                'paid' => $paid,
                'balance' => $balance,
                'status' => $this->status($total, $paid),
                'payment_method' => $data['payment_method'] ?? ($paid > 0 ? 'cash' : null),
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            foreach ($resolved as $r) {
                $sale->items()->create([
                    'reseller_item_id' => $r['item']->id,
                    'quantity' => $r['qty'],
                    'unit_price' => $r['unitPrice'],
                    'unit_cost' => (int) $r['item']->avg_cost,
                    'line_total' => $r['lineTotal'],
                ]);
                $r['item']->decrement('stock_qty', $r['qty']);
            }

            if ($paid > 0) {
                $this->logPayment(ResellerPayment::IN, $paid, $data['sale_date'], [
                    'customer_id' => $customer?->id,
                    'reseller_sale_id' => $sale->id,
                    'method' => $data['payment_method'] ?? 'cash',
                    'bank_ref' => $data['bank_ref'] ?? null,
                ]);
            }

            return $sale->load('items.item', 'customer');
        });
    }

    /**
     * @param  array{amount:int,payment_date:string,method?:string,bank_ref?:string}  $data
     */
    public function receiveForSale(ResellerSale $sale, array $data): ResellerPayment
    {
        return DB::transaction(function () use ($sale, $data) {
            $amount = min((int) $data['amount'], (int) $sale->balance);
            if ($amount <= 0) {
                throw new InvalidArgumentException('Is invoice ka koi baqi nahi.');
            }

            $paid = (int) $sale->paid + $amount;
            $sale->update([
                'paid' => $paid,
                'balance' => (int) $sale->total - $paid,
                'status' => $this->status((int) $sale->total, $paid),
            ]);

            return $this->logPayment(ResellerPayment::IN, $amount, $data['payment_date'], [
                'customer_id' => $sale->customer_id,
                'reseller_sale_id' => $sale->id,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
            ]);
        });
    }

    /** Delete a wrong sale: stock wapas, linked cash log removed. */
    public function voidSale(ResellerSale $sale): void
    {
        DB::transaction(function () use ($sale) {
            if ($sale->dispatches()->exists()) {
                throw new InvalidArgumentException('Is bikri par challan/dispatch ban chuka — pehle wo handle karein.');
            }
            if (ResellerSalesReturn::where('reseller_sale_id', $sale->id)->exists()) {
                throw new InvalidArgumentException('Is bikri par return mojood hai — delete nahi ho sakta.');
            }

            $sale->load('items');
            foreach ($sale->items as $it) {
                ResellerItem::whereKey($it->reseller_item_id)->increment('stock_qty', (float) $it->quantity);
            }

            ResellerPayment::where('reseller_sale_id', $sale->id)->delete();
            $sale->items()->delete();
            $sale->delete();
        });
    }

    /**
     * Maal wapas: stock returns, customer ka reseller udhaar kam (account) ya
     * cash refund (money out).
     *
     * @param  array{reseller_sale_id?:string,customer_id?:string,return_date:string,deduction?:int,refund_mode?:string,notes?:string,items:array<int,array{reseller_item_id:string,quantity:float,unit_price:int}>}  $data
     */
    public function createReturn(array $data): ResellerSalesReturn
    {
        if (empty($data['items'])) {
            throw new InvalidArgumentException('Return me kam se kam ek item hona chahiye.');
        }

        return DB::transaction(function () use ($data) {
            $customer = isset($data['customer_id']) ? Customer::find($data['customer_id']) : null;

            $resolved = [];
            $returnValue = 0;
            foreach ($data['items'] as $line) {
                $item = ResellerItem::findOrFail($line['reseller_item_id']);
                $qty = (float) $line['quantity'];
                $unitPrice = (int) $line['unit_price'];
                $lineTotal = (int) round($qty * $unitPrice);
                $returnValue += $lineTotal;
                $resolved[] = compact('item', 'qty', 'unitPrice', 'lineTotal');
            }

            $deduction = (int) ($data['deduction'] ?? 0);
            if ($deduction > $returnValue) {
                throw new InvalidArgumentException('Deduction return value se zyada nahi ho sakti.');
            }
            $refund = $returnValue - $deduction;
            $mode = $data['refund_mode'] ?? 'cash';

            $return = ResellerSalesReturn::create([
                'reference' => Sequence::next('RRET'),
                'reseller_sale_id' => $data['reseller_sale_id'] ?? null,
                'customer_id' => $customer?->id,
                'return_date' => $data['return_date'],
                'return_value' => $returnValue,
                'deduction' => $deduction,
                'refund_amount' => $refund,
                'refund_mode' => $mode,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            foreach ($resolved as $r) {
                $return->items()->create([
                    'reseller_item_id' => $r['item']->id,
                    'quantity' => $r['qty'],
                    'unit_price' => $r['unitPrice'],
                    'line_total' => $r['lineTotal'],
                ]);
                $r['item']->increment('stock_qty', $r['qty']); // stock wapas
            }

            if ($refund > 0) {
                if ($mode === 'account' && $customer) {
                    // customer ka reseller udhaar kam karo (oldest sales first)
                    $this->reduceReceivable($customer, $refund);
                } else {
                    // cash wapas — reseller cash OUT
                    $this->logPayment(ResellerPayment::OUT, $refund, $data['return_date'], [
                        'customer_id' => $customer?->id,
                        'reseller_sales_return_id' => $return->id,
                        'method' => 'cash',
                    ]);
                }
            }

            return $return->load('items.item', 'customer');
        });
    }

    /** Apply a refund against a customer's open reseller sales (reduce dues). */
    private function reduceReceivable(Customer $customer, int $amount): void
    {
        $remaining = $amount;
        $sales = ResellerSale::where('customer_id', $customer->id)
            ->where('balance', '>', 0)
            ->orderBy('sale_date')->orderBy('created_at')->get();

        foreach ($sales as $sale) {
            if ($remaining <= 0) {
                break;
            }
            $apply = min($remaining, (int) $sale->balance);
            $newTotal = (int) $sale->total - $apply;
            $newBalance = (int) $sale->balance - $apply;
            $sale->update([
                'total' => $newTotal,
                'balance' => $newBalance,
                'status' => $this->status($newTotal, (int) $sale->paid),
            ]);
            $remaining -= $apply;
        }
    }

    private function logPayment(string $direction, int $amount, string $date, array $refs): ResellerPayment
    {
        return ResellerPayment::create(array_merge([
            'reference' => Sequence::next('RPAY'),
            'direction' => $direction,
            'payment_date' => $date,
            'amount' => $amount,
            'method' => 'cash',
            'created_by' => Auth::id(),
        ], $refs));
    }

    private function status(int $total, int $paid): string
    {
        if ($paid <= 0) {
            return 'unpaid';
        }

        return $paid >= $total ? 'paid' : 'partial';
    }
}
