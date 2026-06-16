<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RawMaterialResource;
use App\Models\RawMaterial;
use Illuminate\Http\Request;

class RawMaterialController extends Controller
{
    public function index(Request $request)
    {
        $materials = RawMaterial::query()
            ->when($request->search, fn ($q, $s) => $q->where('name', 'like', "%{$s}%"))
            ->when($request->boolean('low_only'), fn ($q) => $q->whereColumn('current_qty', '<=', 'low_stock_threshold'))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 50));

        return RawMaterialResource::collection($materials);
    }

    public function store(Request $request)
    {
        $material = RawMaterial::create($request->validate($this->rules()));

        return new RawMaterialResource($material);
    }

    public function show(RawMaterial $rawMaterial)
    {
        return new RawMaterialResource($rawMaterial);
    }

    public function update(Request $request, RawMaterial $rawMaterial)
    {
        $rawMaterial->update($request->validate($this->rules()));

        return new RawMaterialResource($rawMaterial);
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'unit' => ['required', 'string', 'max:50'],
            'low_stock_threshold' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['boolean'],
        ];
    }
}
