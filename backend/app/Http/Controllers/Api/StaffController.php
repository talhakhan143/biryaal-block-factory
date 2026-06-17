<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StaffResource;
use App\Models\Staff;
use App\Support\Money;
use Illuminate\Http\Request;

class StaffController extends Controller
{
    public function index(Request $request)
    {
        $staff = Staff::query()
            ->when($request->search, fn ($q, $s) => $q->where('name', 'like', "%{$s}%"))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 50));

        return StaffResource::collection($staff);
    }

    public function store(Request $request)
    {
        $data = $this->validateData($request);
        $data['monthly_salary'] = Money::toPaisa($data['monthly_salary']);

        return new StaffResource(Staff::create($data));
    }

    public function update(Request $request, Staff $staff)
    {
        $data = $this->validateData($request);
        if (isset($data['monthly_salary'])) {
            $data['monthly_salary'] = Money::toPaisa($data['monthly_salary']);
        }
        $staff->update($data);

        return new StaffResource($staff);
    }

    public function destroy(Staff $staff)
    {
        $staff->delete(); // salaries cascade

        return response()->noContent();
    }

    private function validateData(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'role' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:50'],
            'monthly_salary' => ['required', 'numeric', 'min:0'],
            'is_active' => ['boolean'],
        ]);
    }
}
