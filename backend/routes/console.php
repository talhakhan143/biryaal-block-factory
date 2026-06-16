<?php

use Illuminate\Support\Facades\Schedule;

// Auto-curing: promote batches whose curing period elapsed.
// On Hostinger shared hosting a single cron entry runs `php artisan schedule:run`
// every minute, which fires this daily job.
Schedule::command('blocks:promote-cured')->dailyAt('00:30');
