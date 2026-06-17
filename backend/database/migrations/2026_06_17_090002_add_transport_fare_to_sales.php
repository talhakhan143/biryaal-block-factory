<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            // freight charged to the customer (paisa). Pass-through to the driver,
            // not factory revenue.
            $table->bigInteger('transport_fare')->default(0)->after('discount');
        });
    }

    public function down(): void
    {
        Schema::table('sales', fn (Blueprint $table) => $table->dropColumn('transport_fare'));
    }
};
