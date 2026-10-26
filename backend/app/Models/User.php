<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

#[Fillable(['name', 'email', 'password', 'phone', 'is_active'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    /**
     * Dashboard ki wo chaar daliyan jinhein banda chhupa sakta hai.
     * Ye slug frontend aur API dono mein wahi hain, naye naam mat banao.
     */
    public const DASHBOARD_GROUPS = ['income', 'sales', 'cash', 'dues'];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'preferences' => 'array',
        ];
    }

    /**
     * Kaunsi daliyan is bande ke dashboard par chhupi hui hain.
     *
     * preferences khali bhi ho sakti hai, aur hath se badli hui row mein kuch
     * bhi para ho sakta hai, isliye jo stored hai us par bharosa nahi karte.
     * DASHBOARD_GROUPS ko base rakha hai, isi se tarteeb bhi hamesha aik si rehti hai.
     *
     * @return list<string>
     */
    public function hiddenDashboardGroups(): array
    {
        $stored = data_get($this->preferences, 'dashboard_hidden', []);

        if (! is_array($stored)) {
            return [];
        }

        // array_intersect har value ko string banata hai, to nested array ya object
        // "Array to string conversion" phenk deta tha aur /me ke saath /login bhi
        // mar jata tha. Live DB phpMyAdmin se hath se patch hoti hai, is liye aisi
        // row asal mein mumkin hai. Pehle sirf strings chhanti hain.
        $stored = array_filter($stored, 'is_string');

        return array_values(array_intersect(self::DASHBOARD_GROUPS, $stored));
    }
}
