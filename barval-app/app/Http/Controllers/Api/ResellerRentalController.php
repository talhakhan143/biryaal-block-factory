<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\ResellerRentalResource;
use App\Models\ResellerRental;
use App\Services\Reseller\ResellerService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ResellerRentalController extends Controller
{
    use HasTableQuery;

    public function __construct(private ResellerService $service) {}

    public function index(Request $request)
    {
        $query = ResellerRental::query()
            ->with('customer')
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->customer_id, fn ($q, $id) => $q->where('customer_id', $id));

        $this->applyTableQuery(
            $query,
            $request,
            ['start_date', 'status', 'per_day_rate'],
            ['reference', 'item_name'],
            'start_date',
            ['customer' => ['name']],
        );

        return ResellerRentalResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'start_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_name' => ['required', 'string', 'max:255'],
            'items.*.unit' => ['nullable', 'string', 'max:30'],
            'items.*.quantity' => ['nullable', 'numeric', 'gt:0'],
            'items.*.per_day_rate' => ['required', 'numeric', 'gt:0'],
        ]);

        // Ek submit me kai items — har item ka apna rental (accrual/return alag).
        $created = DB::transaction(fn () => collect($data['items'])->map(fn ($it) => $this->service->startRental([
            'customer_id' => $data['customer_id'],
            'start_date' => $data['start_date'],
            'notes' => $data['notes'] ?? null,
            'item_name' => $it['item_name'],
            'unit' => $it['unit'] ?? 'unit',
            'quantity' => $it['quantity'] ?? 1,
            'per_day_rate' => Money::toPaisa($it['per_day_rate']),
        ])->load('customer')));

        return ResellerRentalResource::collection($created);
    }

    public function return(Request $request, ResellerRental $resellerRental)
    {
        $data = $request->validate([
            'return_date' => ['required', 'date'],
        ]);

        $this->service->returnRental($resellerRental, $data['return_date']);

        return new ResellerRentalResource($resellerRental->fresh()->load('customer'));
    }

    public function collect(Request $request, ResellerRental $resellerRental)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
        ], ['bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.']);
        $data['amount'] = Money::toPaisa($data['amount']);

        $this->service->collectRental($resellerRental, $data);

        return new ResellerRentalResource($resellerRental->fresh()->load('customer'));
    }
}
