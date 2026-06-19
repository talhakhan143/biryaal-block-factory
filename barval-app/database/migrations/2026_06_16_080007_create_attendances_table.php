<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('labourer_id')->constrained()->cascadeOnDelete();
            $table->date('work_date');
            // present | half | absent
            $table->string('status')->default('present');
            // wage accrued for the day in paisa (0 for absent, half of daily for half)
            $table->bigInteger('wage')->default(0);
            $table->text('note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['labourer_id', 'work_date']);
            $table->index('work_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};
