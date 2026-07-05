<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reseller challan kiraya — recorded in reseller books only. trip_paid goes out
 * of reseller cash (reseller_payments), NOT the shared driver's balance, so
 * there is no conflict with the block factory transport ledger.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reseller_dispatches', function (Blueprint $table) {
            $table->bigInteger('trip_rate')->default(0)->after('vehicle_id');  // kiraya
            $table->bigInteger('trip_paid')->default(0)->after('trip_rate');   // driver ko diya
        });

        Schema::table('reseller_payments', function (Blueprint $table) {
            $table->foreignUuid('reseller_dispatch_id')->nullable()->after('reseller_sales_return_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('reseller_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reseller_dispatch_id');
        });
        Schema::table('reseller_dispatches', function (Blueprint $table) {
            $table->dropColumn(['trip_rate', 'trip_paid']);
        });
    }
};
