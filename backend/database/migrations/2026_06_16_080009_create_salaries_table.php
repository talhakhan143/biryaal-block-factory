<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('salaries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();          // SAL-000001
            $table->foreignUuid('staff_id')->constrained()->cascadeOnDelete();
            $table->string('month');                        // YYYY-MM
            $table->bigInteger('amount');                   // paisa
            $table->bigInteger('paid')->default(0);
            $table->bigInteger('balance')->default(0);
            $table->string('status')->default('unpaid');    // paid | partial | unpaid
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['staff_id', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('salaries');
    }
};
