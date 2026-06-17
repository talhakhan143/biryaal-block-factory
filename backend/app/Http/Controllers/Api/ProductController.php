<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\FinishedGoodsStock;
use App\Models\Product;
use App\Support\Money;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $products = Product::query()
            ->with('stock')
            ->when($request->search, fn ($q, $s) => $q->where('name', 'like', "%{$s}%")->orWhere('sku', 'like', "%{$s}%"))
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 50));

        return ProductResource::collection($products);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $data['sale_price'] = Money::toPaisa($data['sale_price']);
        $product = Product::create($data);
        FinishedGoodsStock::firstOrCreate(['product_id' => $product->id]);

        return new ProductResource($product->load('stock'));
    }

    public function show(Product $product)
    {
        return new ProductResource($product->load('stock'));
    }

    public function update(Request $request, Product $product)
    {
        $data = $request->validate($this->rules($product->id));
        if (isset($data['sale_price'])) {
            $data['sale_price'] = Money::toPaisa($data['sale_price']);
        }
        $product->update($data);

        return new ProductResource($product->load('stock'));
    }

    public function destroy(Product $product)
    {
        try {
            $product->stock()->delete();
            $product->delete();
        } catch (\Illuminate\Database\QueryException $e) {
            return response()->json(['message' => 'Ye product use me hai (sale/production) — delete nahi ho sakta. "Active" off kar dein.'], 422);
        }

        return response()->noContent();
    }

    private function rules(?string $id = null): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'sku' => ['required', 'string', 'max:50', 'unique:products,sku'.($id ? ",{$id}" : '')],
            'size' => ['nullable', 'string', 'max:50'],
            'unit' => ['required', 'string', 'max:50'],
            'default_curing_days' => ['required', 'integer', 'min:0', 'max:60'],
            'sale_price' => ['required', 'numeric', 'min:0'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['boolean'],
        ];
    }
}
