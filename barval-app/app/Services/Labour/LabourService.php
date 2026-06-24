<?php

namespace App\Services\Labour;

use App\Models\Account;
use App\Models\Attendance;
use App\Models\Labourer;
use App\Services\Accounting\LedgerService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class LabourService
{
    public function __construct(private LedgerService $ledger) {}

    /**
     * Mark a labourer's attendance for a day and accrue the wage as a payable.
     * present = full daily wage, half = 50%, absent = 0.
     *
     * @param  array{labourer_id:string,work_date:string,status:string,note?:string}  $data
     */
    public function markAttendance(array $data): Attendance
    {
        return DB::transaction(function () use ($data) {
            $labourer = Labourer::findOrFail($data['labourer_id']);

            if (Attendance::where('labourer_id', $labourer->id)->where('work_date', $data['work_date'])->exists()) {
                throw new InvalidArgumentException('Attendance already recorded for this date.');
            }

            $wage = match ($data['status']) {
                'present' => (int) $labourer->daily_wage,
                'half' => intdiv((int) $labourer->daily_wage, 2),
                default => 0,
            };

            $attendance = Attendance::create([
                'labourer_id' => $labourer->id,
                'work_date' => $data['work_date'],
                'status' => $data['status'],
                'wage' => $wage,
                'note' => $data['note'] ?? null,
                'created_by' => Auth::id(),
            ]);

            if ($wage > 0) {
                $labourer->increment('balance', $wage);
                $this->ledger->post(
                    $data['work_date'],
                    "Labour wage - {$labourer->name}",
                    [
                        ['account' => Account::EXPENSE, 'debit' => $wage, 'memo' => 'Daily labour'],
                        ['account' => Account::PAYABLE, 'credit' => $wage, 'memo' => $labourer->name],
                    ],
                    $attendance,
                );
            }

            return $attendance;
        });
    }

    /**
     * Mark attendance for many dates at once for one labourer. Dates already
     * recorded are skipped (never double-charged — corrections go through
     * Adjustments). Returns how many were actually marked.
     *
     * @param  array{labourer_id:string,status:string,dates:array<int,string>,note?:string}  $data
     */
    public function markAttendanceBulk(array $data): int
    {
        return DB::transaction(function () use ($data) {
            $labourer = Labourer::findOrFail($data['labourer_id']);

            $existing = Attendance::where('labourer_id', $labourer->id)
                ->whereIn('work_date', $data['dates'])
                ->pluck('work_date')
                ->map(fn ($d) => \Illuminate\Support\Carbon::parse($d)->toDateString())
                ->all();

            $wagePer = match ($data['status']) {
                'present' => (int) $labourer->daily_wage,
                'half' => intdiv((int) $labourer->daily_wage, 2),
                default => 0,
            };

            $marked = 0;
            foreach ($data['dates'] as $date) {
                if (in_array($date, $existing, true)) {
                    continue; // already recorded — leave it untouched
                }

                $attendance = Attendance::create([
                    'labourer_id' => $labourer->id,
                    'work_date' => $date,
                    'status' => $data['status'],
                    'wage' => $wagePer,
                    'note' => $data['note'] ?? null,
                    'created_by' => Auth::id(),
                ]);

                if ($wagePer > 0) {
                    $labourer->increment('balance', $wagePer);
                    $this->ledger->post(
                        $date,
                        "Labour wage - {$labourer->name}",
                        [
                            ['account' => Account::EXPENSE, 'debit' => $wagePer, 'memo' => 'Daily labour'],
                            ['account' => Account::PAYABLE, 'credit' => $wagePer, 'memo' => $labourer->name],
                        ],
                        $attendance,
                    );
                }

                $marked++;
            }

            return $marked;
        });
    }
}
