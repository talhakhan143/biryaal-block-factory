<?php

namespace Database\Seeders;

use App\Models\FinishedGoodsStock;
use App\Models\Product;
use App\Models\RawMaterial;
use App\Support\Money;
use Illuminate\Database\Seeder;

class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        $blocks = [
            ['4 Inch Hollow Block', 'BLK-4', '4 inch', 35],
            ['5 Inch Hollow Block', 'BLK-5', '5 inch', 40],
            ['6 Inch Hollow Block', 'BLK-6', '6 inch', 50],
            ['8 Inch Hollow Block', 'BLK-8', '8 inch', 65],
        ];

        foreach ($blocks as [$name, $sku, $size, $priceRupees]) {
            $product = Product::updateOrCreate(
                ['sku' => $sku],
                [
                    'name' => $name,
                    'size' => $size,
                    'unit' => 'piece',
                    'default_curing_days' => 7,
                    'sale_price' => Money::toPaisa($priceRupees),
                    'low_stock_threshold' => 500,
                    'is_active' => true,
                ],
            );

            FinishedGoodsStock::firstOrCreate(['product_id' => $product->id]);
        }

        $materials = [
            ['Cement', 'bag'],
            ['Bajri', 'cft'],
            ['Rait', 'cft'],
            ['Water', 'litre'],
        ];

        foreach ($materials as [$name, $unit]) {
            RawMaterial::updateOrCreate(
                ['name' => $name],
                ['unit' => $unit, 'is_active' => true],
            );
        }
    }
}
