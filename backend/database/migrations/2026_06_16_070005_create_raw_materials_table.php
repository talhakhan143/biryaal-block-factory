<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('raw_materials', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');               // Cement, Bajri, Rait, Water
            $table->string('unit')->default('unit'); // bag, cft, litre
            // on-hand quantity (decimal to support cft / litre)
            $table->decimal('current_qty', 15, 3)->default(0);
            $table->decimal('low_stock_threshold', 15, 3)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('raw_materials');
    }
};
