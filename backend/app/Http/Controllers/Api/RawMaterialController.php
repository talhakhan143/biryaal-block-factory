<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\RawMaterialResource;
use App\Models\RawMaterial;
use Illuminate\Http\Request;

class RawMaterialController extends Controller
{
    use HasTableQuery;

    public function index(Request $request)
    {
        $query = RawMaterial::query()
            ->when($request->boolean('low_only'), fn ($q) => $q->whereColumn('current_qty', '<=', 'low_stock_threshold'));

        $this->applyTableQuery($query, $request, ['name', 'current_qty', 'unit'], ['name'], 'name');

        $materials = $query->paginate($request->integer('per_page', 50));

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

    public function destroy(RawMaterial $rawMaterial)
    {
        try {
            $rawMaterial->delete();
        } catch (\Illuminate\Database\QueryException) {
            return response()->json(['message' => 'Ye material purchases me use hua — delete nahi ho sakta. "Active" off karein.'], 422);
        }

        return response()->noContent();
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
