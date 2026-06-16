<?php

namespace App\Services\Production;

use App\Models\Product;
use App\Models\ProductionBatch;
use App\Services\Inventory\InventoryService;
use App\Support\Sequence;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProductionService
{
    public function __construct(private InventoryService $inventory) {}

    /**
     * Record a production batch and push the quantity into curing stock.
     *
     * @param  array{product_id:string,production_date:string,shift?:string,quantity_produced:int,curing_days?:int,supervisor_id?:int,notes?:string}  $data
     */
    public function record(array $data): ProductionBatch
    {
        return DB::transaction(function () use ($data) {
            $product = Product::findOrFail($data['product_id']);
            $curingDays = (int) ($data['curing_days'] ?? $product->default_curing_days);
            $productionDate = Carbon::parse($data['production_date']);

            $batch = ProductionBatch::create([
                'reference' => Sequence::next('PRD'),
                'product_id' => $product->id,
                'production_date' => $productionDate->toDateString(),
                'shift' => $data['shift'] ?? 'day',
                'quantity_produced' => $data['quantity_produced'],
                'curing_days' => $curingDays,
                'ready_at' => $productionDate->copy()->addDays($curingDays)->toDateString(),
                'status' => 'curing',
                'supervisor_id' => $data['supervisor_id'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $this->inventory->recordProduction(
                $product,
                (int) $data['quantity_produced'],
                $batch,
                "Production {$batch->reference}",
            );

            return $batch;
        });
    }

    /**
     * Manually mark a single curing batch as ready right now
     * (e.g. hot weather cured it early). Idempotent: ignores already-ready batches.
     */
    public function markReady(ProductionBatch $batch): ProductionBatch
    {
        if ($batch->status !== 'curing') {
            return $batch;
        }

        return DB::transaction(function () use ($batch) {
            $this->inventory->promoteToReady(
                $batch->product,
                (int) $batch->quantity_produced,
                $batch,
            );
            $batch->update(['status' => 'ready']);

            return $batch;
        });
    }

    /**
     * Promote all batches whose curing period has elapsed.
     * Called by the blocks:promote-cured scheduled command.
     *
     * @return int number of batches promoted
     */
    public function promoteDueBatches(?Carbon $asOf = null): int
    {
        $asOf ??= Carbon::today();
        $count = 0;

        ProductionBatch::with('product')
            ->where('status', 'curing')
            ->whereDate('ready_at', '<=', $asOf->toDateString())
            ->chunkById(100, function ($batches) use (&$count) {
                foreach ($batches as $batch) {
                    DB::transaction(function () use ($batch) {
                        $this->inventory->promoteToReady(
                            $batch->product,
                            (int) $batch->quantity_produced,
                            $batch,
                        );
                        $batch->update(['status' => 'ready']);
                    });
                    $count++;
                }
            });

        return $count;
    }
}
