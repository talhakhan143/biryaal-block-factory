<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Super Admin bypasses every permission check.
        Gate::before(function (User $user) {
            return $user->hasRole('Super Admin') ? true : null;
        });

        // Password reset link points to the React frontend reset page.
        ResetPassword::createUrlUsing(function (User $user, string $token) {
            $base = rtrim(config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/');

            return "{$base}/reset-password?token={$token}&email=".urlencode($user->email);
        });
    }
}
