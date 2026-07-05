<?php

namespace Database\Seeders;

use App\Models\ResellerItem;
use Illuminate\Database\Seeder;

class ResellerCatalogSeeder extends Seeder
{
    public function run(): void
    {
        // Default resale items. Rate (sale_price) owner apni marzi se set karega.
        $items = [
            ['Cement', 'bag'],   // per bag
            ['Crush', 'unit'],   // per unit
            ['Raiti', 'unit'],   // per unit
            ['Sarya', 'mann'],   // per mann (50 kg)
            ['Enten', 'ent'],    // per ent (brick)
        ];

        foreach ($items as [$name, $unit]) {
            ResellerItem::firstOrCreate(
                ['name' => $name],
                ['unit' => $unit, 'sale_price' => 0, 'is_active' => true],
            );
        }
    }
}
