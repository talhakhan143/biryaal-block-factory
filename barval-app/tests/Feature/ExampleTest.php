<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Sabse chhota smoke test: app khud uth khari hoti hai.
 *
 * Pehle yahan Laravel ka default test tha jo "/" maangta tha. Is app me "/"
 * banne wala SPA shell deta hai jo web server ke DOCUMENT_ROOT se file
 * dhoondta hai, aur test CLI me wo khali hota hai. Is liye wo test hamesha
 * 404 deta tha: app ki sehat ka us se koi taluq nahi tha. Laravel ka health
 * check (/up) wahi kaam theek se karta hai.
 */
class ExampleTest extends TestCase
{
    public function test_the_application_boots(): void
    {
        $this->get('/up')->assertOk();
    }
}
