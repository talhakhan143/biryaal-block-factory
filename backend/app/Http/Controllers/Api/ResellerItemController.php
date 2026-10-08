<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\ResellerItemResource;
use App\Models\ResellerItem;
use App\Support\Money;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class ResellerItemController extends Controller
{
    use HasTableQuery;

    public function index(Request $request)
    {
        $query = ResellerItem::query()
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true));

        $this->applyTableQuery($query, $request, ['name', 'sale_price', 'unit', 'stock_qty', 'created_at'], ['name'], 'created_at');

        return ResellerItemResource::collection($query->paginate($request->integer('per_page', 100)));
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $data['sale_price'] = Money::toPaisa($data['sale_price']);

        return new ResellerItemResource(ResellerItem::create($data));
    }

    public function update(Request $request, ResellerItem $resellerItem)
    {
        $data = $request->validate($this->rules() + [
            'stock_qty' => ['nullable', 'numeric', 'min:0'], // manual stock correction
        ]);
        if (isset($data['sale_price'])) {
            $data['sale_price'] = Money::toPaisa($data['sale_price']);
        }
        $resellerItem->update($data);

        return new ResellerItemResource($resellerItem);
    }

    public function destroy(ResellerItem $resellerItem)
    {
        try {
            $resellerItem->delete();
        } catch (QueryException $e) {
            return response()->json(['message' => 'Ye item use me hai (purchase), delete nahi ho sakta. "Active" off kar dein.'], 422);
        }

        return response()->noContent();
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'unit' => ['required', 'string', 'max:30'],
            'sale_price' => ['required', 'numeric', 'min:0'],
            'low_stock_threshold' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['boolean'],
        ];
    }
}
