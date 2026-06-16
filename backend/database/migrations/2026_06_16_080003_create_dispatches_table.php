<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dispatches', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();          // DSP-000001 (challan no)
            $table->foreignUuid('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('driver_id')->nullable()->constrained()->nullOnDelete();
            $table->date('dispatch_date');
            // pending | delivered
            $table->string('status')->default('pending');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('dispatch_date');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dispatches');
    }
};
