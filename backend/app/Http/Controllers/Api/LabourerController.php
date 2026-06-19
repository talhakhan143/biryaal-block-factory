<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\LabourerResource;
use App\Http\Resources\PaymentResource;
use App\Models\Labourer;
use App\Services\Payments\PaymentService;
use App\Support\Money;
use Illuminate\Http\Request;

class LabourerController extends Controller
{
    use HasTableQuery;

    public function __construct(private PaymentService $payments) {}

    public function index(Request $request)
    {
        $query = Labourer::query();
        $this->applyTableQuery($query, $request, ['name', 'phone', 'daily_wage', 'balance', 'is_active'], ['name', 'phone'], 'name');

        return LabourerResource::collection($query->paginate($request->integer('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $this->validateData($request);
        $data['daily_wage'] = Money::toPaisa($data['daily_wage']);

        return new LabourerResource(Labourer::create($data));
    }

    public function update(Request $request, Labourer $labourer)
    {
        $data = $this->validateData($request);
        if (isset($data['daily_wage'])) {
            $data['daily_wage'] = Money::toPaisa($data['daily_wage']);
        }
        $labourer->update($data);

        return new LabourerResource($labourer);
    }

    public function destroy(Labourer $labourer)
    {
        $labourer->delete(); // attendances cascade

        return response()->noContent();
    }

    /** Pay outstanding wages to a labourer. */
    public function pay(Request $request, Labourer $labourer)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        return new PaymentResource($this->payments->settleParty($labourer, $data));
    }

    private function validateData(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'daily_wage' => ['required', 'numeric', 'gt:0'],
            'is_active' => ['boolean'],
        ]);
    }
}
