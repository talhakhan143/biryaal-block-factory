<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();          // PAY-000001
            // receipt (money in from customer) | payment (money out to supplier)
            $table->string('direction');
            // polymorphic party: customer | supplier
            $table->uuidMorphs('party');
            $table->date('payment_date');
            $table->bigInteger('amount');                   // paisa
            $table->string('method')->default('cash');      // cash | bank
            // optional link to invoice / purchase being settled
            $table->nullableUuidMorphs('allocatable');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('payment_date');
            $table->index('direction');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
