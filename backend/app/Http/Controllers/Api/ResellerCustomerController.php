<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ResellerCustomerResource;
use App\Http\Resources\ResellerSaleResource;
use App\Models\Customer;
use App\Services\Reseller\ResellerCustomerHistoryService;
use Illuminate\Http\Request;

/**
 * Resellers Point ka apna customer screen.
 *
 * Customer ka naam aur phone dono portals me aik hi hai, magar paisa nahi:
 * yahan ke figures sirf reseller sales, kiraya aur reseller payments se bante
 * hain. Block factory ka balance, ledger ya munafa yahan kabhi nahi aata.
 */
class ResellerCustomerController extends Controller
{
    public function __construct(private ResellerCustomerHistoryService $history) {}

    /**
     * Customers who have any Resellers Point activity, with their dues.
     *
     * Rows PHP me bante hain (kiraya roz ka hisaab hai, SQL se nahi aata), is
     * liye page bhi collection par hi kaata jata hai. `totals` poori list ke
     * hain, sirf is page ke nahi.
     */
    public function index(Request $request)
    {
        $all = $this->history->dues($request->search);

        $perPage = max(1, $request->integer('per_page', 15));
        $page = max(1, $request->integer('page', 1));

        return response()->json([
            'data' => $all->forPage($page, $perPage)->values(),
            'totals' => [
                'outstanding' => (int) $all->sum('outstanding'),
                'kiraya_due' => (int) $all->sum('kiraya_due'),
                'received' => (int) $all->sum('received'),
                'owing' => $all->where('outstanding', '>', 0)->count(),
            ],
            'meta' => [
                'current_page' => $page,
                'last_page' => max(1, (int) ceil($all->count() / $perPage)),
                'total' => $all->count(),
            ],
        ]);
    }

    public function show(Customer $customer)
    {
        $data = $this->history->history($customer);

        return response()->json([
            'customer' => new ResellerCustomerResource($data['customer']),
            'summary' => $data['summary'],
            'sales' => ResellerSaleResource::collection($data['sales']),
            'receipts' => $data['receipts']->map(fn ($p) => [
                'id' => $p->id,
                'reference' => $p->reference,
                'payment_date' => $p->payment_date?->toDateString(),
                'amount' => (int) $p->amount,
                'method' => $p->method,
                'bank_ref' => $p->bank_ref,
            ])->values(),
            'returns' => $data['returns']->map(fn ($r) => [
                'id' => $r->id,
                'reference' => $r->reference,
                'return_date' => $r->return_date?->toDateString(),
                'return_value' => (int) $r->return_value,
                'deduction' => (int) $r->deduction,
                'refund_amount' => (int) $r->refund_amount,
                'refund_mode' => $r->refund_mode,
            ])->values(),
            'rentals' => $data['rentals'],
        ]);
    }
}
