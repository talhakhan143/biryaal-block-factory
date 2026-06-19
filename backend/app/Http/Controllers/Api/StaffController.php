<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\StaffResource;
use App\Models\Staff;
use App\Support\Money;
use Illuminate\Http\Request;

class StaffController extends Controller
{
    use HasTableQuery;

    public function index(Request $request)
    {
        $query = Staff::query();
        $this->applyTableQuery($query, $request, ['name', 'monthly_salary'], ['name', 'phone'], 'name');

        return StaffResource::collection($query->paginate($request->integer('per_page', 50)));
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
            'monthly_salary' => ['required', 'numeric', 'gt:0'],
            'is_active' => ['boolean'],
        ]);
    }
}
