<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SettingsController extends Controller
{
    /**
     * Dashboard par kaunsi raqam chhupi rahegi, ye banda khud set karta hai.
     *
     * HAR tabdeeli par password lagta hai, chhupane par bhi aur kholne par bhi.
     * Owner ka kehna saaf hai: "koi b akr chnage nhe kr skaega". Yani jis ki
     * screen khuli pari ho, uske parde se koi chhed bhi nahi sakta aur laga bhi
     * nahi sakta.
     */
    public function dashboardPrivacy(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'hidden' => ['present', 'array'],
            'hidden.*' => ['string', Rule::in(User::DASHBOARD_GROUPS)],
            'current_password' => ['required', 'string'],
        ], [
            // Laravel ka default message English hai aur seedha owner ko dikhta hai.
            'current_password.required' => 'Apna password likhein, is ke baghair ye setting badalti nahi.',
        ]);

        // Ginti yahan hai aur route ke throttle par nahi, kyunke wo har request
        // ginta tha, aur uska English "Too Many Attempts." seedha owner ko
        // dikhta tha. Yahan sirf galat password ginna jata hai.
        $key = 'dashboard-privacy:'.$user->id;

        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages([
                'current_password' => ['Bohat dafa galat password. '.RateLimiter::availableIn($key).' second baad dobara koshish karein.'],
            ]);
        }

        if (! Hash::check($data['current_password'], $user->password)) {
            RateLimiter::hit($key, 300);

            throw ValidationException::withMessages([
                'current_password' => ['Password galat hai. Ye setting badalne ke liye apna password zaroori hai.'],
            ]);
        }

        RateLimiter::clear($key);

        // Tarteeb hamesha DASHBOARD_GROUPS wali, warna do barabar listein bhi
        // alag lagti hain aur duplicate slug bhi andar reh jata hai.
        $next = array_values(array_intersect(User::DASHBOARD_GROUPS, $data['hidden']));

        // preferences mein aage chal kar doosri settings bhi aa sakti hain,
        // isliye poori array overwrite nahi karte.
        $preferences = $user->preferences ?? [];
        $preferences['dashboard_hidden'] = $next;
        $user->preferences = $preferences;
        $user->save();

        return response()->json(['data' => new UserResource($user->fresh())]);
    }
}
