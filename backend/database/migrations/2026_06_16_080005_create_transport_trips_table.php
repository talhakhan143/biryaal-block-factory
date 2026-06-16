<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transport_trips', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();          // TRP-000001
            $table->foreignUuid('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('driver_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('dispatch_id')->nullable()->constrained()->nullOnDelete();
            $table->date('trip_date');
            $table->string('from_location')->nullable();
            $table->string('to_location')->nullable();
            // all money paisa
            $table->bigInteger('rate');                     // trip cost
            $table->bigInteger('paid')->default(0);
            $table->bigInteger('balance')->default(0);
            // paid | partial | unpaid
            $table->string('status')->default('unpaid');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('trip_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transport_trips');
    }
};
