<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Adjustment;
use App\Services\Accounting\AdjustmentService;
use App\Support\Money;
use Illuminate\Http\Request;

class AdjustmentController extends Controller
{
    public function __construct(private AdjustmentService $service) {}

    public function index(Request $request)
    {
        $rows = Adjustment::query()
            ->with('party')
            ->latest('adjustment_date')
            ->paginate($request->integer('per_page', 15));

        $rows->getCollection()->transform(fn (Adjustment $a) => [
            'id' => $a->id,
            'reference' => $a->reference,
            'mode' => $a->mode,
            'party_name' => $a->party?->name,
            'adjustment_date' => $a->adjustment_date->toDateString(),
            'amount' => (int) $a->amount,
            'method' => $a->method,
            'reason' => $a->reason,
        ]);

        return response()->json($rows);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'mode' => ['required', 'in:customer_discount,customer_charge,supplier_discount,supplier_charge,cash_in,cash_out'],
            'party_id' => ['nullable', 'uuid'],
            'adjustment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255'],
            'reason' => ['required', 'string', 'max:255'],
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        return response()->json(['data' => $this->service->create($data)], 201);
    }
}
