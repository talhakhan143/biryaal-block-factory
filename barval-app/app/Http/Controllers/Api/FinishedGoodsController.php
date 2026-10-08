<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Http\Resources\StockMovementResource;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\Request;

class FinishedGoodsController extends Controller
{
    use HasTableQuery;

    public function __construct(private InventoryService $inventory) {}

    /** Current stock per product (curing / ready / damaged). */
    public function index(Request $request)
    {
        $sortable = ['name', 'sku', 'size', 'unit', 'sale_price'];
        $searchable = ['name', 'sku', 'size'];

        $query = Product::query()->with('stock')->where('is_active', true);
        $this->applyTableQuery($query, $request, $sortable, $searchable, 'name');

        // Jama poori list ka, sirf is page ka nahi.
        $totalsQuery = Product::query()->where('is_active', true);
        $this->applyTableQuery($totalsQuery, $request, $sortable, $searchable, 'name');
        $totals = $totalsQuery
            ->reorder()
            ->leftJoin('finished_goods_stock', 'finished_goods_stock.product_id', '=', 'products.id')
            ->selectRaw('COALESCE(SUM(finished_goods_stock.curing_qty),0) curing_qty, COALESCE(SUM(finished_goods_stock.ready_qty),0) ready_qty, COALESCE(SUM(finished_goods_stock.damaged_qty),0) damaged_qty')
            ->first();

        return ProductResource::collection($query->paginate($request->integer('per_page', 15)))
            ->additional(['totals' => [
                'curing_qty' => (int) $totals->curing_qty,
                'ready_qty' => (int) $totals->ready_qty,
                'damaged_qty' => (int) $totals->damaged_qty,
            ]]);
    }

    /** Full stock movement history. */
    public function movements(Request $request)
    {
        $movements = StockMovement::query()
            ->with('product')
            ->when($request->product_id, fn ($q, $id) => $q->where('product_id', $id))
            ->when($request->type, fn ($q, $t) => $q->where('type', $t))
            ->latest()
            ->paginate($request->integer('per_page', 20));

        return StockMovementResource::collection($movements);
    }

    public function adjust(Request $request)
    {
        $data = $request->validate([
            'product_id' => ['required', 'uuid', 'exists:products,id'],
            'bucket' => ['required', 'in:curing,ready,damaged'],
            'delta' => ['required', 'integer', 'not_in:0'],
            'note' => ['nullable', 'string'],
        ]);

        $product = Product::findOrFail($data['product_id']);
        $this->inventory->adjust($product, $data['bucket'], $data['delta'], $data['note'] ?? null);

        return new ProductResource($product->load('stock'));
    }

    public function damage(Request $request)
    {
        $data = $request->validate([
            'product_id' => ['required', 'uuid', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'gt:0'],
            'note' => ['nullable', 'string'],
        ]);

        $product = Product::findOrFail($data['product_id']);
        $this->inventory->markDamaged($product, $data['quantity'], $data['note'] ?? null);

        return new ProductResource($product->load('stock'));
    }
}
