<?php

namespace App\Services\Search;

use App\Models\Customer;
use App\Models\Driver;
use App\Models\Expense;
use App\Models\Labourer;
use App\Models\MaterialPurchase;
use App\Models\Product;
use App\Models\RawMaterial;
use App\Models\ResellerItem;
use App\Models\ResellerSale;
use App\Models\ResellerSupplier;
use App\Models\Sale;
use App\Models\Staff;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Support\Money;
use Illuminate\Contracts\Auth\Access\Gate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Aik hi dabbe se poore system me dhoondna.
 *
 * Har group ka apna permission hai, bilkul usi tarah jaise uska apna page hai.
 * Jis cheez ka page kisi user ko nazar nahi aata, uske nataij bhi usay nahi
 * milte: search kisi deewar me surakh nahi banati.
 */
class GlobalSearchService
{
    /** Har group se zyada se zyada itne nataij. */
    private const PER_GROUP = 6;

    public function __construct(private Gate $gate) {}

    /**
     * @return array<int,array<string,mixed>>
     */
    public function search(string $term): array
    {
        $term = trim($term);
        if (mb_strlen($term) < 2) {
            return [];
        }

        $groups = [
            $this->group('customers', 'Customers', 'customers.view', fn () => Customer::query()
                ->where(fn (Builder $q) => $q->where('name', 'like', "%{$term}%")->orWhere('phone', 'like', "%{$term}%"))
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (Customer $c) => [
                    'title' => $c->name,
                    'subtitle' => trim(($c->phone ?? '').' '.($c->address ?? '')) ?: null,
                    'meta' => $this->partyMeta((int) $c->balance, 'Lena', 'Advance jama'),
                    'to' => "/customers/{$c->id}",
                ])),

            $this->group('sales', 'Sales (bills)', 'sales.view', fn () => Sale::query()
                ->with('customer:id,name')
                ->where(fn (Builder $q) => $q->where('invoice_no', 'like', "%{$term}%")
                    ->orWhereHas('customer', fn (Builder $q) => $q->where('name', 'like', "%{$term}%")))
                ->orderByDesc('sale_date')->limit(self::PER_GROUP)->get()
                ->map(fn (Sale $s) => [
                    'title' => $s->invoice_no,
                    'subtitle' => ($s->customer?->name ?? 'Walk-in').' · '.$s->sale_date?->toDateString(),
                    'meta' => Money::format((int) $s->total).($s->balance > 0 ? ' · baqi '.Money::format((int) $s->balance) : ''),
                    'to' => $s->customer_id ? "/customers/{$s->customer_id}" : '/sales',
                ])),

            $this->group('suppliers', 'Suppliers', 'suppliers.view', fn () => Supplier::query()
                ->where(fn (Builder $q) => $q->where('name', 'like', "%{$term}%")->orWhere('phone', 'like', "%{$term}%"))
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (Supplier $s) => [
                    'title' => $s->name,
                    'subtitle' => $s->phone,
                    'meta' => $this->partyMeta((int) $s->balance, 'Dena', 'Advance diya'),
                    'to' => "/suppliers/{$s->id}",
                ])),

            $this->group('purchases', 'Purchases', 'purchases.view', fn () => MaterialPurchase::query()
                ->with(['supplier:id,name', 'rawMaterial:id,name'])
                ->where(fn (Builder $q) => $q->where('reference', 'like', "%{$term}%")
                    ->orWhereHas('supplier', fn (Builder $q) => $q->where('name', 'like', "%{$term}%"))
                    ->orWhereHas('rawMaterial', fn (Builder $q) => $q->where('name', 'like', "%{$term}%")))
                ->orderByDesc('purchase_date')->limit(self::PER_GROUP)->get()
                ->map(fn (MaterialPurchase $p) => [
                    'title' => $p->reference,
                    'subtitle' => trim(($p->rawMaterial?->name ?? '').' · '.($p->supplier?->name ?? '')),
                    'meta' => Money::format((int) $p->total_cost),
                    'to' => $p->supplier_id ? "/suppliers/{$p->supplier_id}" : '/purchases',
                ])),

            $this->group('drivers', 'Drivers', 'transport.view', fn () => Driver::query()
                ->where(fn (Builder $q) => $q->where('name', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%")
                    ->orWhere('vehicle_name', 'like', "%{$term}%")
                    ->orWhere('vehicle_plate', 'like', "%{$term}%"))
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (Driver $d) => [
                    'title' => $d->name,
                    'subtitle' => trim(($d->vehicle_name ?? '').' '.($d->vehicle_plate ?? '')) ?: $d->phone,
                    'meta' => $this->partyMeta((int) $d->balance, 'Dena', 'Advance diya'),
                    'to' => "/drivers/{$d->id}",
                ])),

            $this->group('trips', 'Kiraya (trips)', 'transport.view', fn () => TransportTrip::query()
                ->with('driver:id,name')
                ->where('reference', 'like', "%{$term}%")
                ->orderByDesc('trip_date')->limit(self::PER_GROUP)->get()
                ->map(fn (TransportTrip $t) => [
                    'title' => $t->reference,
                    'subtitle' => ($t->driver?->name ?? 'Driver nahi').' · '.($t->kind === TransportTrip::INBOUND ? 'maal laaya' : 'maal bheja'),
                    'meta' => Money::format((int) $t->rate),
                    'to' => $t->driver_id ? "/drivers/{$t->driver_id}" : '/transport',
                ])),

            $this->group('products', 'Products', 'inventory.view', fn () => Product::query()
                ->where(fn (Builder $q) => $q->where('name', 'like', "%{$term}%")->orWhere('sku', 'like', "%{$term}%"))
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (Product $p) => [
                    'title' => $p->name,
                    'subtitle' => $p->sku,
                    'meta' => Money::format((int) $p->sale_price),
                    'to' => '/products',
                ])),

            $this->group('materials', 'Raw materials', 'materials.view', fn () => RawMaterial::query()
                ->where('name', 'like', "%{$term}%")
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (RawMaterial $m) => [
                    'title' => $m->name,
                    'subtitle' => $m->unit,
                    'meta' => $m->current_qty.' '.$m->unit,
                    'to' => '/materials',
                ])),

            $this->group('expenses', 'Kharchay', 'expenses.view', fn () => Expense::query()
                ->where(fn (Builder $q) => $q->where('reference', 'like', "%{$term}%")
                    ->orWhere('title', 'like', "%{$term}%")
                    ->orWhere('category', 'like', "%{$term}%"))
                ->orderByDesc('expense_date')->limit(self::PER_GROUP)->get()
                ->map(fn (Expense $e) => [
                    'title' => $e->title,
                    'subtitle' => $e->reference.' · '.$e->category,
                    'meta' => Money::format((int) $e->amount),
                    'to' => '/expenses?from='.$e->expense_date?->toDateString().'&to='.$e->expense_date?->toDateString(),
                ])),

            $this->group('labour', 'Mazdoor', 'labour.view', fn () => Labourer::query()
                ->where(fn (Builder $q) => $q->where('name', 'like', "%{$term}%")->orWhere('phone', 'like', "%{$term}%"))
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (Labourer $l) => [
                    'title' => $l->name,
                    'subtitle' => $l->phone,
                    'meta' => $this->partyMeta((int) $l->balance, 'Dena', 'Advance diya'),
                    'to' => '/labour',
                ])),

            $this->group('staff', 'Staff', 'hr.view', fn () => Staff::query()
                ->where(fn (Builder $q) => $q->where('name', 'like', "%{$term}%")->orWhere('phone', 'like', "%{$term}%"))
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (Staff $st) => [
                    'title' => $st->name,
                    'subtitle' => $st->role,
                    'meta' => Money::format((int) $st->monthly_salary).' / mahina',
                    'to' => '/staff',
                ])),

            // Resellers Point apni alag books hai, magar dhoondna wahan bhi
            // utna hi zaroori hai. Links usi portal ke andar jaate hain.
            $this->group('reseller_sales', 'Resellers Point: bills', 'reseller.view', fn () => ResellerSale::query()
                ->with('customer:id,name')
                ->where(fn (Builder $q) => $q->where('invoice_no', 'like', "%{$term}%")
                    ->orWhereHas('customer', fn (Builder $q) => $q->where('name', 'like', "%{$term}%")))
                ->orderByDesc('sale_date')->limit(self::PER_GROUP)->get()
                ->map(fn (ResellerSale $s) => [
                    'title' => $s->invoice_no,
                    'subtitle' => ($s->customer?->name ?? 'Walk-in').' · '.$s->sale_date?->toDateString(),
                    'meta' => Money::format((int) $s->total).($s->balance > 0 ? ' · baqi '.Money::format((int) $s->balance) : ''),
                    'to' => $s->customer_id ? "/reseller/customers/{$s->customer_id}" : '/reseller/sales',
                ])),

            $this->group('reseller_items', 'Resellers Point: maal', 'reseller.view', fn () => ResellerItem::query()
                ->where('name', 'like', "%{$term}%")
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (ResellerItem $i) => [
                    'title' => $i->name,
                    'subtitle' => $i->unit,
                    'meta' => Money::format((int) $i->sale_price),
                    'to' => '/reseller/items',
                ])),

            $this->group('reseller_suppliers', 'Resellers Point: suppliers', 'reseller.view', fn () => ResellerSupplier::query()
                ->where(fn (Builder $q) => $q->where('name', 'like', "%{$term}%")->orWhere('phone', 'like', "%{$term}%"))
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (ResellerSupplier $s) => [
                    'title' => $s->name,
                    'subtitle' => $s->phone,
                    'meta' => $this->partyMeta((int) $s->balance, 'Dena', 'Advance diya'),
                    'to' => '/reseller/suppliers',
                ])),
        ];

        return collect($groups)->filter()->values()->all();
    }

    /**
     * Permission na ho to group bilkul nahi banta, yani query bhi nahi chalti.
     *
     * @param  callable():Collection  $find
     */
    private function group(string $key, string $label, string $permission, callable $find): ?array
    {
        if (! $this->gate->allows($permission)) {
            return null;
        }

        $items = $find()->values();

        return $items->isEmpty() ? null : [
            'key' => $key,
            'label' => $label,
            'items' => $items->all(),
        ];
    }

    /** Musbat balance aik baat kehta hai, minus uska ulta. */
    private function partyMeta(int $balance, string $owedLabel, string $advanceLabel): ?string
    {
        if ($balance > 0) {
            return $owedLabel.' '.Money::format($balance);
        }
        if ($balance < 0) {
            return $advanceLabel.' '.Money::format(-$balance);
        }

        return null;
    }
}
