<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Har banda apni marzi ki setting yahan rakhega, filhal sirf ye ke dashboard
 * par kaunsi raqam chhupi rahegi: { "dashboard_hidden": ["income","sales"] }
 *
 * json ke bajaye TEXT rakha hai kyunke live server MariaDB ho sakta hai, aur
 * Laravel ka 'array' cast TEXT par har jagah chalta hai.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('preferences')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('preferences');
        });
    }
};
