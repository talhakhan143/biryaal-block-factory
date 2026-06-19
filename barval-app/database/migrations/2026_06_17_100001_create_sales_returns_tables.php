<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_returns', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();           // RET-000001
            $table->foreignUuid('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->date('return_date');
            // all paisa
            $table->bigInteger('return_value');              // goods value returned
            $table->bigInteger('deduction')->default(0);     // kiraya / amount cut, factory keeps
            $table->bigInteger('refund_amount');             // return_value - deduction
            $table->string('refund_mode')->default('cash');  // cash | bank | account (reduce dues)
            $table->string('bank_ref')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('return_date');
        });

        Schema::create('sales_return_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('sales_return_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('quantity');
            $table->bigInteger('unit_price');
            $table->bigInteger('line_total');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_return_items');
        Schema::dropIfExists('sales_returns');
    }
};
