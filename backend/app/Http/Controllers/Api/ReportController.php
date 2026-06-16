<?php

namespace App\Http\Controllers\Api;

use App\Exports\ReportExport;
use App\Http\Controllers\Controller;
use App\Services\Reports\ReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class ReportController extends Controller
{
    public function __construct(private ReportService $service) {}

    /** JSON for on-screen rendering. */
    public function show(string $type, Request $request)
    {
        return response()->json($this->service->build($type, $request->from, $request->to));
    }

    /** Download as PDF. */
    public function pdf(string $type, Request $request)
    {
        $report = $this->service->build($type, $request->from, $request->to);
        $pdf = Pdf::loadView('reports.generic', [
            'report' => $report,
            'generatedAt' => now()->toDayDateTimeString(),
        ]);

        return $pdf->download($this->filename($type, 'pdf'));
    }

    /** Download as Excel. */
    public function excel(string $type, Request $request)
    {
        $report = $this->service->build($type, $request->from, $request->to);

        return Excel::download(new ReportExport($report), $this->filename($type, 'xlsx'));
    }

    private function filename(string $type, string $ext): string
    {
        return 'report-'.$type.'-'.now()->format('Y-m-d').'.'.$ext;
    }
}
