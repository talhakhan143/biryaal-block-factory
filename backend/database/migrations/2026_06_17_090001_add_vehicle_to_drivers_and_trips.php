<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            $table->string('vehicle_name')->nullable()->after('license_no');
            $table->string('vehicle_plate')->nullable()->after('vehicle_name');
        });

        Schema::table('transport_trips', function (Blueprint $table) {
            // snapshot of the driver's vehicle at trip time
            $table->string('vehicle_label')->nullable()->after('vehicle_id');
        });
    }

    public function down(): void
    {
        Schema::table('drivers', fn (Blueprint $table) => $table->dropColumn(['vehicle_name', 'vehicle_plate']));
        Schema::table('transport_trips', fn (Blueprint $table) => $table->dropColumn('vehicle_label'));
    }
};
