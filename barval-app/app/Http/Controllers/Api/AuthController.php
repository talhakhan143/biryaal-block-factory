<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['This account is disabled.'],
            ]);
        }

        $token = $user->createToken($request->device_name ?? 'web')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => new UserResource($user),
        ]);
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    /**
     * Change your OWN password — requires the current password for verification.
     *
     * Sales Users cannot change their own password; the Owner manages it for them.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->hasRole('Sales User')) {
            abort(403, 'Aap apna password khud change nahi kar sakte. Owner se rabta karein.');
        }

        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Purana (current) password galat hai.'],
            ]);
        }

        $user->password = $data['password'];
        $user->save();

        // Keep this session alive, log out every other device.
        $current = $user->currentAccessToken();
        $user->tokens()->where('id', '!=', $current->id)->delete();

        return response()->json(['message' => 'Password change ho gaya.']);
    }

    /** Email a password reset link to the user's registered email. */
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $status = Password::sendResetLink($request->only('email'));

        // Always reply success-ish to avoid leaking which emails exist.
        return response()->json([
            'message' => $status === Password::RESET_LINK_SENT
                ? 'Reset link aapki email par bhej di gayi hai.'
                : 'Agar ye email registered hai to reset link bhej diya gaya hai.',
        ]);
    }

    /** Reset the password using the emailed token. */
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                ])->save();

                $user->tokens()->delete(); // log out existing sessions

                event(new PasswordReset($user));
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => [__($status)]]);
        }

        return response()->json(['message' => 'Password reset ho gaya. Ab login karein.']);
    }
}
