<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->unique();          // e.g. 1000 Cash
            $table->string('name');
            // asset, liability, equity, income, expense
            $table->string('type');
            // normal balance side: debit | credit
            $table->string('normal_balance');
            $table->boolean('is_system')->default(false); // protected core accounts
            $table->timestamps();

            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};
