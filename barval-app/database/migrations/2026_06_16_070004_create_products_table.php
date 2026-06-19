<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');                 // 4 Inch Hollow Block
            $table->string('sku')->unique();        // BLK-4
            $table->string('size')->nullable();     // 4 inch
            $table->string('unit')->default('piece');
            $table->unsignedInteger('default_curing_days')->default(7);
            // default selling price per unit in paisa
            $table->bigInteger('sale_price')->default(0);
            $table->unsignedInteger('low_stock_threshold')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
