<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\ResellerSalesReturnResource;
use App\Models\ResellerSalesReturn;
use App\Services\Reseller\ResellerSalesService;
use App\Support\Money;
use Illuminate\Http\Request;

class ResellerSalesReturnController extends Controller
{
    use HasTableQuery;

    public function __construct(private ResellerSalesService $service) {}

    public function index(Request $request)
    {
        $query = ResellerSalesReturn::query()
            // items bhi sath: wapsi ki parchi par maal ki line chhapni hoti hai.
            ->with(['customer', 'items.item:id,name'])
            ->when($request->customer_id, fn ($q, $id) => $q->where('customer_id', $id));

        $this->applyTableQuery($query, $request, ['return_date', 'refund_amount'], ['reference'], 'return_date', ['customer' => ['name']]);

        return ResellerSalesReturnResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'reseller_sale_id' => ['nullable', 'uuid', 'exists:reseller_sales,id'],
            'customer_id' => ['nullable', 'uuid', 'exists:customers,id'],
            'return_date' => ['required', 'date'],
            'deduction' => ['nullable', 'numeric', 'min:0'],
            'refund_mode' => ['nullable', 'in:cash,account'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.reseller_item_id' => ['required', 'uuid', 'exists:reseller_items,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        if (isset($data['deduction'])) {
            $data['deduction'] = Money::toPaisa($data['deduction']);
        }
        foreach ($data['items'] as &$it) {
            $it['unit_price'] = Money::toPaisa($it['unit_price']);
        }
        unset($it);

        return new ResellerSalesReturnResource($this->service->createReturn($data));
    }
}
