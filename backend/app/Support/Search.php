<?php

namespace App\Support;

final class Search
{
    /**
     * LIKE ke apne wildcards (% aur _) ko aam harf bana deta hai.
     *
     * Bina iske "%%" likhne par poori list aa jati hai aur "_a" kisi bhi harf
     * ke baad "a" se match kar jata hai. SQL injection ka masla nahi tha
     * (sab kuch bound hota hai), masla ye tha ke search ka natija ghalat aata.
     */
    public static function like(string $term): string
    {
        return '%'.addcslashes(trim($term), '%_\\').'%';
    }
}
