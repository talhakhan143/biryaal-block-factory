<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use OwenIt\Auditing\Models\Audit;

class AuditController extends Controller
{
    public function index(Request $request)
    {
        $audits = Audit::query()
            ->with('user')
            ->when($request->event, fn ($q, $e) => $q->where('event', $e))
            ->latest()
            ->paginate($request->integer('per_page', 30));

        $audits->getCollection()->transform(fn (Audit $a) => [
            'id' => $a->id,
            'event' => $a->event,
            'model' => class_basename($a->auditable_type),
            'user' => $a->user?->name ?? 'System',
            'old_values' => $a->old_values,
            'new_values' => $a->new_values,
            'created_at' => $a->created_at,
        ]);

        return response()->json($audits);
    }
}
