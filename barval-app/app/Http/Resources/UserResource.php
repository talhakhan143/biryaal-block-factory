<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'is_active' => (bool) $this->is_active,
            'roles' => $this->getRoleNames(),
            'permissions' => $this->getAllPermissions()->pluck('name'),
            // /me aur /login yahin se bata dete hain kaunsi raqam chhupi hai,
            // taake frontend ko alag call na karni pade. Sirf apna parda apne ko:
            // users ki list bhi isi resource se banti hai, aur wahan doosre bande
            // ka parda dikhane ka koi faida nahi.
            //
            // login par $request->user() khali hota hai, wo route auth se bahar
            // hai aur AuthController khud hath se password check kar ke token
            // banata hai. Magar wahan serialize wahi banda hota hai jo abhi andar
            // aaya, is liye wo surat bhi apni hi hai. Ye shart na ho to login ke
            // jawab mein key gayab ho jati hai aur pehle render par chhupi raqam
            // aik lamhe ke liye jhalak jati hai.
            'dashboard_hidden' => $this->when(
                $request->user() === null || $request->user()->id === $this->id,
                fn () => $this->hiddenDashboardGroups(),
            ),
            'created_at' => $this->created_at,
        ];
    }
}
