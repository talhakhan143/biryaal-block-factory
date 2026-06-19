<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Free-text note for bank/cheque/transfer details when method = bank.
    private array $tables = ['sales', 'material_purchases', 'expenses', 'payments'];

    public function up(): void
    {
        foreach ($this->tables as $t) {
            Schema::table($t, function (Blueprint $table) {
                $table->string('bank_ref')->nullable()->after('id');
            });
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $t) {
            Schema::table($t, fn (Blueprint $table) => $table->dropColumn('bank_ref'));
        }
    }
};
