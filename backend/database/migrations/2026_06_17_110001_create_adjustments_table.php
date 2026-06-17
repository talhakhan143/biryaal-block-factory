<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('adjustments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();        // ADJ-000001
            // customer_discount | customer_charge | supplier_discount | supplier_charge | cash_in | cash_out
            $table->string('mode');
            $table->nullableUuidMorphs('party');          // customer / supplier
            $table->date('adjustment_date');
            $table->bigInteger('amount');                 // paisa
            $table->string('method')->nullable();         // cash | bank (for cash modes)
            $table->string('bank_ref')->nullable();
            $table->string('reason');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('adjustment_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('adjustments');
    }
};
