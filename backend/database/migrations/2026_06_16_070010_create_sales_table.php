<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('invoice_no')->unique();          // INV-000001
            $table->foreignUuid('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->date('sale_date');
            // cash | credit
            $table->string('type')->default('cash');
            // all money in paisa
            $table->bigInteger('subtotal')->default(0);
            $table->bigInteger('discount')->default(0);
            $table->bigInteger('total')->default(0);
            $table->bigInteger('paid')->default(0);
            $table->bigInteger('balance')->default(0);       // total - paid
            // paid | partial | unpaid
            $table->string('status')->default('paid');
            $table->string('payment_method')->nullable();    // cash | bank
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('sale_date');
            $table->index('type');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
