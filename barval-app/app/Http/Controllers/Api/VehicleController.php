<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\VehicleResource;
use App\Models\Vehicle;
use App\Support\Money;
use Illuminate\Http\Request;

class VehicleController extends Controller
{
    use HasTableQuery;

    public function index(Request $request)
    {
        $query = Vehicle::query();

        $this->applyTableQuery(
            $query,
            $request,
            ['name', 'plate', 'type', 'default_trip_rate', 'is_active', 'created_at'],
            ['name', 'plate', 'type'],
            'created_at',
        );

        return VehicleResource::collection($query->paginate($request->integer('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $this->validateData($request);
        $data['default_trip_rate'] = Money::toPaisa($data['default_trip_rate'] ?? 0);

        return new VehicleResource(Vehicle::create($data));
    }

    public function update(Request $request, Vehicle $vehicle)
    {
        $data = $this->validateData($request);
        if (isset($data['default_trip_rate'])) {
            $data['default_trip_rate'] = Money::toPaisa($data['default_trip_rate']);
        }
        $vehicle->update($data);

        return new VehicleResource($vehicle);
    }

    private function validateData(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'plate' => ['nullable', 'string', 'max:50'],
            'type' => ['nullable', 'string', 'max:50'],
            'default_trip_rate' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['boolean'],
        ]);
    }
}
