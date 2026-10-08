<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Trip kis simt ki hai.
 *   out = maal customer ko bhejna (dispatch ke sath banti hai, kiraya customer
 *         deta hai aur 2100 clearing se guzarta hai)
 *   in  = maal factory me laana (supplier se), jiska kiraya hamara kharcha hai
 *
 * Purani saari rows 'out' hain, jo wahi hai jo wo waqai theen.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transport_trips', function (Blueprint $table) {
            $table->string('kind')->default('out')->after('material_purchase_id');
        });

        // Jo trip kisi purchase se judi hai wo yaqeenan maal LAANE ki hai.
        DB::table('transport_trips')->whereNotNull('material_purchase_id')->update(['kind' => 'in']);
    }

    public function down(): void
    {
        Schema::table('transport_trips', function (Blueprint $table) {
            $table->dropColumn('kind');
        });
    }
};
