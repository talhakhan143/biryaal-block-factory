<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VehicleResource;
use App\Models\Vehicle;
use App\Support\Money;
use Illuminate\Http\Request;

class VehicleController extends Controller
{
    public function index(Request $request)
    {
        $vehicles = Vehicle::query()
            ->when($request->search, fn ($q, $s) => $q->where('name', 'like', "%{$s}%")->orWhere('plate', 'like', "%{$s}%"))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 50));

        return VehicleResource::collection($vehicles);
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
