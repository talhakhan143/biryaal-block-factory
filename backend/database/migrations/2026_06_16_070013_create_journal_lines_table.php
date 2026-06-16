<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('journal_entry_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('account_id')->constrained()->restrictOnDelete();
            // exactly one of debit/credit is non-zero, both in paisa
            $table->bigInteger('debit')->default(0);
            $table->bigInteger('credit')->default(0);
            $table->string('memo')->nullable();
            $table->timestamps();

            $table->index('account_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_lines');
    }
};
