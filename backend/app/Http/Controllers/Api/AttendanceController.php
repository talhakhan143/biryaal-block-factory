<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttendanceResource;
use App\Models\Attendance;
use App\Services\Labour\LabourService;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    public function __construct(private LabourService $service) {}

    public function index(Request $request)
    {
        $attendances = Attendance::query()
            ->with('labourer')
            ->when($request->labourer_id, fn ($q, $id) => $q->where('labourer_id', $id))
            ->when($request->date, fn ($q, $d) => $q->whereDate('work_date', $d))
            ->when($request->from, fn ($q, $d) => $q->whereDate('work_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('work_date', '<=', $d))
            ->latest('work_date')
            ->paginate($request->integer('per_page', 30));

        return AttendanceResource::collection($attendances);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'labourer_id' => ['required', 'uuid', 'exists:labourers,id'],
            'work_date' => ['required', 'date', 'before_or_equal:today'],
            'status' => ['required', 'in:present,half,absent'],
            'note' => ['nullable', 'string'],
        ], [
            'work_date.before_or_equal' => 'Future date ki attendance nahi ho sakti — sirf aaj tak.',
        ]);

        return new AttendanceResource($this->service->markAttendance($data)->load('labourer'));
    }
}
