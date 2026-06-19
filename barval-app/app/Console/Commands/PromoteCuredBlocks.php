<?php

namespace App\Console\Commands;

use App\Services\Production\ProductionService;
use Illuminate\Console\Command;

class PromoteCuredBlocks extends Command
{
    protected $signature = 'blocks:promote-cured';

    protected $description = 'Move production batches that have finished curing from curing stock to ready stock';

    public function handle(ProductionService $service): int
    {
        $count = $service->promoteDueBatches();

        $this->info("Promoted {$count} batch(es) to ready stock.");

        return self::SUCCESS;
    }
}
