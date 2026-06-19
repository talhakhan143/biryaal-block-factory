<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $users = User::query()
            ->with('roles')
            // Hide Super Admin (developer) accounts from everyone except another Super Admin.
            ->unless($this->isSuperAdmin($request), fn ($q) => $q->whereDoesntHave('roles', fn ($r) => $r->where('name', 'Super Admin')))
            ->when($request->search, fn ($q, $s) => $q->where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%"))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 20));

        return UserResource::collection($users);
    }

    public function roles(Request $request)
    {
        $roles = Role::orderBy('name')->pluck('name');

        if (! $this->isSuperAdmin($request)) {
            $roles = $roles->reject(fn ($r) => $r === 'Super Admin')->values();
        }

        return response()->json($roles);
    }

    private function isSuperAdmin(Request $request): bool
    {
        return (bool) $request->user()?->hasRole('Super Admin');
    }

    /** Block non-super-admins from creating/assigning the Super Admin role. */
    private function guardSuperAdminRole(Request $request, string $role): void
    {
        if ($role === 'Super Admin' && ! $this->isSuperAdmin($request)) {
            abort(403, 'Not allowed.');
        }
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
            'phone' => ['nullable', 'string', 'max:50'],
            'role' => ['required', 'string', 'exists:roles,name'],
        ]);
        $this->guardSuperAdminRole($request, $data['role']);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'phone' => $data['phone'] ?? null,
            'is_active' => true,
        ]);
        $user->syncRoles([$data['role']]);

        return new UserResource($user->load('roles'));
    }

    public function update(Request $request, User $user)
    {
        // Non-super-admins can't touch a Super Admin account at all.
        if ($user->hasRole('Super Admin') && ! $this->isSuperAdmin($request)) {
            abort(404);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:50'],
            'role' => ['required', 'string', 'exists:roles,name'],
            'password' => ['nullable', 'string', 'min:6'],
            'is_active' => ['boolean'],
        ]);
        $this->guardSuperAdminRole($request, $data['role']);

        $user->fill([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'is_active' => $data['is_active'] ?? $user->is_active,
        ]);
        if (! empty($data['password'])) {
            $user->password = $data['password'];
        }
        $user->save();
        $user->syncRoles([$data['role']]);

        return new UserResource($user->load('roles'));
    }
}
