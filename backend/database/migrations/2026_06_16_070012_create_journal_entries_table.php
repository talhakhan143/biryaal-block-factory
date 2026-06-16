<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();      // JE-000001
            $table->date('entry_date');
            $table->string('description');
            // polymorphic source (UUID models): sale, material_purchase, payment, expense...
            $table->nullableUuidMorphs('source');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('entry_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_entries');
    }
};
