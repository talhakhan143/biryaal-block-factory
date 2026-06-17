<?php

namespace App\Services\Inventory;

use App\Models\FinishedGoodsStock;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use RuntimeException;

/**
 * Single source of truth for finished-goods stock movement.
 * Every change to curing/ready/damaged buckets is logged to stock_movements.
 */
class InventoryService
{
    /** Add freshly produced blocks into the curing bucket. */
    public function recordProduction(Product $product, int $qty, ?Model $reference = null, ?string $note = null): void
    {
        $stock = $this->stockFor($product);
        $stock->increment('curing_qty', $qty);

        $this->log($product, 'produced', 'curing', $qty, $reference, $note);
    }

    /** Move blocks from curing to ready once curing completes. */
    public function promoteToReady(Product $product, int $qty, ?Model $reference = null): void
    {
        $stock = $this->stockFor($product);

        if ($stock->curing_qty < $qty) {
            throw new RuntimeException("Insufficient curing stock for {$product->name}.");
        }

        $stock->decrement('curing_qty', $qty);
        $stock->increment('ready_qty', $qty);

        $this->log($product, 'cured', 'ready', $qty, $reference, 'Curing complete');
    }

    /** Remove blocks from ready stock for a sale. */
    public function consumeReady(Product $product, int $qty, ?Model $reference = null): void
    {
        $stock = $this->stockFor($product);

        if ($stock->ready_qty < $qty) {
            throw new RuntimeException("Insufficient ready stock for {$product->name}. Available: {$stock->ready_qty}.");
        }

        $stock->decrement('ready_qty', $qty);

        $this->log($product, 'sold', 'ready', -$qty, $reference);
    }

    /** Returned blocks come back into ready stock. */
    public function recordReturn(Product $product, int $qty, ?Model $reference = null, ?string $note = null): void
    {
        $stock = $this->stockFor($product);
        $stock->increment('ready_qty', $qty);

        $this->log($product, 'returned', 'ready', $qty, $reference, $note ?? 'Sales return');
    }

    /** Manual stock adjustment on a bucket (+/-). */
    public function adjust(Product $product, string $bucket, int $delta, ?string $note = null): void
    {
        $column = match ($bucket) {
            'curing' => 'curing_qty',
            'ready' => 'ready_qty',
            'damaged' => 'damaged_qty',
            default => throw new RuntimeException("Unknown stock bucket: {$bucket}"),
        };

        $stock = $this->stockFor($product);
        $newValue = $stock->{$column} + $delta;

        if ($newValue < 0) {
            throw new RuntimeException("Adjustment would make {$bucket} stock negative.");
        }

        $stock->update([$column => $newValue]);

        $this->log($product, 'adjusted', $bucket, $delta, null, $note);
    }

    /** Move ready blocks to the damaged bucket. */
    public function markDamaged(Product $product, int $qty, ?string $note = null): void
    {
        $stock = $this->stockFor($product);

        if ($stock->ready_qty < $qty) {
            throw new RuntimeException("Insufficient ready stock to mark damaged for {$product->name}.");
        }

        $stock->decrement('ready_qty', $qty);
        $stock->increment('damaged_qty', $qty);

        $this->log($product, 'damaged', 'damaged', $qty, null, $note);
    }

    private function stockFor(Product $product): FinishedGoodsStock
    {
        return FinishedGoodsStock::firstOrCreate(['product_id' => $product->id]);
    }

    private function log(Product $product, string $type, string $bucket, int $qty, ?Model $reference, ?string $note = null): void
    {
        StockMovement::create([
            'product_id' => $product->id,
            'type' => $type,
            'bucket' => $bucket,
            'quantity' => $qty,
            'reference_type' => $reference?->getMorphClass(),
            'reference_id' => $reference?->getKey(),
            'note' => $note,
            'created_by' => Auth::id(),
        ]);
    }
}
