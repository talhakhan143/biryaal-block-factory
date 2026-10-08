<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Resellers Point selling side, POS/sales, dispatch (challan) and returns.
 * Own tables + own money (receivable tracked per-sale, NOT on customers.balance
 * which belongs to the block factory). Customers, drivers and vehicles are the
 * only shared entities.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reseller_sales', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('invoice_no')->unique();
            $table->foreignUuid('customer_id')->nullable()->constrained()->nullOnDelete(); // shared; null = walk-in
            $table->date('sale_date');
            $table->string('type')->default('cash'); // cash | credit
            $table->bigInteger('subtotal')->default(0);
            $table->bigInteger('discount')->default(0);
            $table->bigInteger('transport_fare')->default(0);
            $table->bigInteger('total')->default(0);
            $table->bigInteger('paid')->default(0);
            $table->bigInteger('balance')->default(0);   // reseller receivable (separate)
            $table->string('status')->default('unpaid'); // unpaid | partial | paid
            $table->string('payment_method')->nullable();
            $table->string('bank_ref')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('sale_date');
            $table->index('customer_id');
        });

        Schema::create('reseller_sale_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('reseller_sale_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('reseller_item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 15, 3);
            $table->bigInteger('unit_price');
            $table->bigInteger('unit_cost')->default(0); // avg cost snapshot for margin
            $table->bigInteger('line_total');
            $table->timestamps();
        });

        Schema::create('reseller_dispatches', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();
            $table->foreignUuid('reseller_sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('driver_id')->nullable()->constrained()->nullOnDelete();   // shared drivers
            $table->foreignUuid('vehicle_id')->nullable()->constrained()->nullOnDelete();  // shared vehicles
            $table->date('dispatch_date');
            $table->string('status')->default('pending'); // pending | delivered
            $table->timestamp('delivered_at')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('status');
        });

        Schema::create('reseller_dispatch_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('reseller_dispatch_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('reseller_item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 15, 3);
            $table->timestamps();
        });

        Schema::create('reseller_sales_returns', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();
            $table->foreignUuid('reseller_sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->date('return_date');
            $table->bigInteger('return_value')->default(0);
            $table->bigInteger('deduction')->default(0);
            $table->bigInteger('refund_amount')->default(0);
            $table->string('refund_mode')->default('cash'); // cash | account
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('reseller_sales_return_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('reseller_sales_return_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('reseller_item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 15, 3);
            $table->bigInteger('unit_price');
            $table->bigInteger('line_total');
            $table->timestamps();
        });

        // Link cash log to sales / returns too
        Schema::table('reseller_payments', function (Blueprint $table) {
            $table->foreignUuid('reseller_sale_id')->nullable()->after('reseller_rental_id')->constrained()->nullOnDelete();
            $table->foreignUuid('reseller_sales_return_id')->nullable()->after('reseller_sale_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('reseller_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reseller_sale_id');
            $table->dropConstrainedForeignId('reseller_sales_return_id');
        });
        Schema::dropIfExists('reseller_sales_return_items');
        Schema::dropIfExists('reseller_sales_returns');
        Schema::dropIfExists('reseller_dispatch_items');
        Schema::dropIfExists('reseller_dispatches');
        Schema::dropIfExists('reseller_sale_items');
        Schema::dropIfExists('reseller_sales');
    }
};
