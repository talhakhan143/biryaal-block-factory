<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Resellers Point — a business run alongside the block factory but with its
 * OWN books. Nothing here posts to the factory ledger / trial balance. Only
 * the `customers` table is shared (same customer across both panels).
 */
return new class extends Migration
{
    public function up(): void
    {
        // Own suppliers (udhaar tracked here, separate from factory suppliers)
        Schema::create('reseller_suppliers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('phone')->nullable();
            $table->string('address')->nullable();
            $table->string('notes')->nullable();
            $table->bigInteger('balance')->default(0); // paisa we owe the supplier
            $table->boolean('is_active')->default(true);
            $table->softDeletes();
            $table->timestamps();
            $table->index('name');
        });

        // Sellable/stocked items (cement, crush, raiti, sarya, enten, …)
        Schema::create('reseller_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('unit')->default('unit'); // bag | unit | mann | ent | kg | cft …
            $table->bigInteger('sale_price')->default(0); // rate per unit (paisa)
            $table->bigInteger('avg_cost')->default(0);   // moving-avg landed cost (paisa)
            $table->decimal('stock_qty', 15, 3)->default(0);
            $table->decimal('low_stock_threshold', 15, 3)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index('name');
        });

        // Purchases (maal khareedna) — builds stock + supplier udhaar
        Schema::create('reseller_purchases', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();
            $table->foreignUuid('reseller_supplier_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('reseller_item_id')->constrained()->restrictOnDelete();
            $table->date('purchase_date');
            $table->decimal('quantity', 15, 3);
            $table->bigInteger('unit_cost');                 // paisa per unit
            $table->bigInteger('transport_cost')->default(0);
            $table->bigInteger('loading_cost')->default(0);
            $table->bigInteger('unloading_cost')->default(0);
            $table->bigInteger('total_cost');
            $table->bigInteger('paid_amount')->default(0);
            $table->string('payment_status')->default('unpaid'); // unpaid | partial | paid
            $table->string('bank_ref')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('purchase_date');
            $table->index('payment_status');
        });

        // Kiraya (rental) — per-day charges accrue until returned
        Schema::create('reseller_rentals', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();
            $table->foreignUuid('customer_id')->constrained()->restrictOnDelete(); // SHARED customers
            $table->string('item_name');
            $table->string('unit')->default('unit');
            $table->decimal('quantity', 15, 3)->default(1);
            $table->bigInteger('per_day_rate'); // paisa per unit per day
            $table->date('start_date');
            $table->date('return_date')->nullable();
            $table->unsignedInteger('days')->nullable();       // frozen on return
            $table->bigInteger('accrued_total')->default(0);   // frozen on return
            $table->bigInteger('paid_amount')->default(0);
            $table->string('status')->default('active');       // active | returned
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('status');
        });

        // Reseller cash log — the separate hisab (money in from kiraya, out to suppliers)
        Schema::create('reseller_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();
            $table->string('direction'); // in (kiraya receipt) | out (supplier pay)
            $table->foreignUuid('reseller_supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('reseller_purchase_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('reseller_rental_id')->nullable()->constrained()->nullOnDelete();
            $table->date('payment_date');
            $table->bigInteger('amount');
            $table->string('method')->default('cash'); // cash | bank
            $table->string('bank_ref')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('payment_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reseller_payments');
        Schema::dropIfExists('reseller_rentals');
        Schema::dropIfExists('reseller_purchases');
        Schema::dropIfExists('reseller_items');
        Schema::dropIfExists('reseller_suppliers');
    }
};
