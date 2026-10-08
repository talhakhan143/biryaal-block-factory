<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Inbound freight. Until now a trip could only hang off a dispatch, so the
 * driver who BRINGS raw material to the factory had nowhere to live: the
 * kiraya was typed on the purchase and quietly billed to the supplier.
 * With this link the same driver ledger covers both directions.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transport_trips', function (Blueprint $table) {
            $table->foreignUuid('material_purchase_id')->nullable()->after('dispatch_id')
                ->constrained('material_purchases')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transport_trips', function (Blueprint $table) {
            $table->dropConstrainedForeignId('material_purchase_id');
        });
    }
};
