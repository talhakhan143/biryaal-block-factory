<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finished_goods_stock', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('curing_qty')->default(0);
            $table->unsignedBigInteger('ready_qty')->default(0);
            $table->unsignedBigInteger('damaged_qty')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finished_goods_stock');
    }
};
