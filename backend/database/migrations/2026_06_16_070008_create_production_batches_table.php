<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('production_batches', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();          // PRD-000001
            $table->foreignUuid('product_id')->constrained()->restrictOnDelete();
            $table->date('production_date');
            $table->string('shift')->default('day');        // day | night
            $table->unsignedBigInteger('quantity_produced');
            $table->unsignedInteger('curing_days')->default(7);
            $table->date('ready_at');                       // production_date + curing_days
            // curing | ready
            $table->string('status')->default('curing');
            $table->foreignId('supervisor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('production_date');
            $table->index(['status', 'ready_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('production_batches');
    }
};
