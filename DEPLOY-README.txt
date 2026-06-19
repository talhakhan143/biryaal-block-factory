==================================================================
  BARVAL BLOCK FACTORY — cPanel Deploy (Terminal ki zarurat NAHI)
==================================================================

Bundle ke andar:
  - barval-app/      -> Laravel app (vendor pehle se installed). Web-root ke
                        BAHAR rakhna hai (security).
  - public_html/     -> jo public_html me jayega (React SPA + index.php).
  - barval-db.sql    -> database (schema + seed). phpMyAdmin se import.
  - DEPLOY-README.txt -> yeh file.

Seeded logins (sab ka password: password) — deploy ke FAURAN baad badalna,
Users page > Edit se:
  - Super Admin : mr.talha143@gmail.com        / password
  - Owner       : owner@blockfactory.test       / password
  - Accountant  : accountant@blockfactory.test  / password

------------------------------------------------------------------
STEP 1 — MySQL database banao (cPanel > "MySQL Databases")
------------------------------------------------------------------
  1. New Database: e.g. barval  (cPanel naam dega: cpaneluser_barval)
  2. New User + strong password.
  3. "Add User To Database" -> ALL PRIVILEGES.
  4. Teeno (db name, user, password) note kar lo.

------------------------------------------------------------------
STEP 2 — Database import (cPanel > phpMyAdmin)
------------------------------------------------------------------
  1. Left me apna database select karo (cpaneluser_barval).
  2. Upar "Import" tab -> barval-db.sql choose karo -> Go.
  3. 44 tables ban jayenge (data + logins ke saath).

------------------------------------------------------------------
STEP 3 — Files upload (cPanel > File Manager)
------------------------------------------------------------------
  A) barval-app/ folder ko HOME directory me upload karo
     (public_html ke ANDAR nahi — uske bahar, e.g. /home/USER/barval-app).
     Zip upload karke "Extract" sabse aasan.

  B) public_html/ ke ANDAR ke saare files (index.php, app.html, assets/,
     logo.png, etc.) public_html me daalo.

  Folder structure aakhir me:
     /home/USER/barval-app/        <- Laravel (app, vendor, .env, storage...)
     /home/USER/public_html/       <- index.php, app.html, assets/, logo.png

  NOTE: public_html/index.php pehle se ../barval-app ko point karta hai —
  agar tumne app folder ka naam "barval-app" rakha to kuch edit nahi karna.
  Alag naam rakha to index.php me $base wali line update kar dena.

------------------------------------------------------------------
STEP 4 — .env me DB creds bharo
------------------------------------------------------------------
  File: barval-app/.env  (File Manager me "Show Hidden Files" on karo)
  Yeh 3 lines apne Step-1 ke values se badlo:
     DB_DATABASE=cpaneluser_barval
     DB_USERNAME=cpaneluser_barvaluser
     DB_PASSWORD=...........
  APP_KEY pehle se bhara hua hai — chhedna mat.

------------------------------------------------------------------
STEP 5 — Permissions
------------------------------------------------------------------
  File Manager me in folders ko 775 (ya 755) karo, recursively:
     barval-app/storage
     barval-app/bootstrap/cache

------------------------------------------------------------------
STEP 6 — PHP version
------------------------------------------------------------------
  cPanel > "Select PHP Version" -> PHP 8.2 ya 8.3 ya 8.4 chuno.
  Extensions on hone chahiye: pdo_mysql, mbstring, openssl, ctype,
  fileinfo, bcmath, gd (PDF/Excel ke liye), zip.

------------------------------------------------------------------
DONE — https://baryal.pk kholo, login karo, passwords badlo.
------------------------------------------------------------------

Agar 500 error aaye:
  - barval-app/.env me APP_DEBUG=true karo (asli error dikhega), masla theek
    karke wapas false.
  - Common: galat DB creds, ya storage/ writable nahi.

Optional (auto block-curing ke liye) — cPanel > Cron Jobs:
  * * * * * cd /home/USER/barval-app && php artisan schedule:run >/dev/null 2>&1
