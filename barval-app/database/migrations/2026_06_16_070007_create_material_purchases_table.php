<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('material_purchases', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();           // PUR-000001
            $table->foreignUuid('supplier_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('raw_material_id')->constrained()->restrictOnDelete();
            $table->date('purchase_date');
            $table->decimal('quantity', 15, 3);
            // all money columns in paisa
            $table->bigInteger('unit_cost');                 // per unit
            $table->bigInteger('transport_cost')->default(0);
            $table->bigInteger('loading_cost')->default(0);
            $table->bigInteger('unloading_cost')->default(0);
            $table->bigInteger('total_cost');                // qty*unit + extras
            $table->bigInteger('paid_amount')->default(0);
            // unpaid | partial | paid
            $table->string('payment_status')->default('unpaid');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('purchase_date');
            $table->index('payment_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('material_purchases');
    }
};
