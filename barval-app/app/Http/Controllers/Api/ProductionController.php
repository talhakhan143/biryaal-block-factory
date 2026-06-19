<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductionRequest;
use App\Http\Resources\ProductionBatchResource;
use App\Models\ProductionBatch;
use App\Services\Production\ProductionService;
use Illuminate\Http\Request;

class ProductionController extends Controller
{
    public function __construct(private ProductionService $service) {}

    public function index(Request $request)
    {
        $batches = ProductionBatch::query()
            ->with(['product', 'supervisor'])
            ->when($request->product_id, fn ($q, $id) => $q->where('product_id', $id))
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->from, fn ($q, $d) => $q->whereDate('production_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('production_date', '<=', $d))
            ->latest('production_date')
            ->paginate($request->integer('per_page', 15));

        return ProductionBatchResource::collection($batches);
    }

    public function store(StoreProductionRequest $request)
    {
        $batch = $this->service->record($request->validated());

        return new ProductionBatchResource($batch->load(['product', 'supervisor']));
    }

    public function show(ProductionBatch $production)
    {
        return new ProductionBatchResource($production->load(['product', 'supervisor']));
    }

    /** Manually trigger curing promotion (also runs on schedule). */
    public function promote()
    {
        $count = $this->service->promoteDueBatches();

        return response()->json(['promoted' => $count]);
    }

    /** Mark one batch ready early (e.g. cured fast in hot weather). */
    public function markReady(ProductionBatch $production)
    {
        $batch = $this->service->markReady($production);

        return new ProductionBatchResource($batch->load(['product', 'supervisor']));
    }
}
