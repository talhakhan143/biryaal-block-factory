<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Admin\SystemResetService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SystemController extends Controller
{
    public function __construct(private SystemResetService $service) {}

    /**
     * DANGER: wipe all business/test data. Super Admin only, and the caller must
     * type the exact word RESET to confirm. Users, roles and the chart of
     * accounts are preserved.
     */
    public function reset(Request $request)
    {
        abort_unless($request->user()?->hasAnyRole(['Super Admin', 'Owner']), 403, 'Sirf Owner / Super Admin yeh kar sakta hai.');

        $data = $request->validate([
            'confirm' => ['required', 'string'],
        ], [
            'confirm.required' => 'Confirm karne ke liye RESET likhein.',
        ]);

        if ($data['confirm'] !== 'RESET') {
            throw ValidationException::withMessages([
                'confirm' => 'Galat — bilkul "RESET" (capital) likhein.',
            ]);
        }

        $wiped = $this->service->reset();

        return response()->json([
            'message' => 'System reset ho gaya — saara data clear. Users, roles aur accounts safe hain.',
            'tables_cleared' => count($wiped),
        ]);
    }
}
