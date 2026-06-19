<?php

use Illuminate\Support\Facades\Route;

/*
 * Serve the built React SPA. The Vite build is copied into public/ and its
 * index.html is stored as public/app.html. Every non-API path returns the SPA
 * shell so client-side (react-router) deep links survive a refresh.
 *
 * API lives under /api/v1 (routes/api.php) and is matched before this fallback.
 */
$spa = function () {
    $shell = public_path('app.html');

    abort_unless(file_exists($shell), 404);

    return response(file_get_contents($shell), 200, ['Content-Type' => 'text/html']);
};

Route::get('/', $spa);
Route::fallback($spa);
