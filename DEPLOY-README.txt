==================================================================
  BARYAL — cPanel Deploy (Terminal ki zarurat NAHI)
  Domain: baryal.com.pk
==================================================================

Is branch (cpanel-deploy) me:
  - barval-app/       -> Laravel app (vendor pehle se installed). Web-root ke
                         BAHAR rehta hai (security).
  - public_html/      -> React SPA + index.php (web root).
  - .cpanel.yml       -> deploy script. $HOME use karta hai, koi hardcoded
                         path nahi — account recreate ho to bhi chalega.
  - update-2-reseller.sql -> purani DB ke liye patch. Nayi DB par zarurat NAHI.

DATABASE yahan NAHI hai — jaan bujh kar. DB dump me real user rows aur password
hashes hote hain, wo git repo me nahi jane chahiye. Import karne wali file
laptop par hai:  deploy/baryal-com-pk/03-db-fresh.sql

LOGIN PASSWORDS bhi is repo me kahin nahi likhe. Super Admin ka password alag
se diya gaya hai; Owner/Sales ke password Super Admin > Users page se set karo.

------------------------------------------------------------------
STEP 1 — MySQL database banao (cPanel > "MySQL Databases")
------------------------------------------------------------------
  1. New Database: baryal   (cPanel naam dega: cpaneluser_baryal)
  2. New User + strong password.
  3. "Add User To Database" -> ALL PRIVILEGES.
  4. Teeno (db name, user, password) note kar lo.

------------------------------------------------------------------
STEP 2 — Database import (cPanel > phpMyAdmin)
------------------------------------------------------------------
  1. Left me apna database select karo.
  2. "Import" tab -> laptop wali 03-db-fresh.sql choose karo -> Go.
  3. 55 tables ban jayengi. Business data zero, sirf 3 users:
       mr.talha143@gmail.com        (Super Admin)
       muhammadali@baryal.com.pk    (Owner)
       sales@baryal.com.pk          (Sales User)

------------------------------------------------------------------
STEP 3 — Git deploy (cPanel > Git Version Control)
------------------------------------------------------------------
  1. Create -> Clone URL: repo ka URL, Branch: cpanel-deploy
     (private repo ke liye SSH URL + deploy key; ya clone ke waqt repo
      temporarily public kar lo, clone ke baad wapis private)
  2. Manage -> "Update from Remote" -> "Deploy HEAD Commit"
  3. .cpanel.yml khud hi $HOME/barval-app aur $HOME/public_html me files
     rakh dega aur stale cache saaf kar dega.

------------------------------------------------------------------
STEP 4 — .env (cPanel > File Manager)
------------------------------------------------------------------
  barval-app/.env banao. Template laptop par:
      deploy/baryal-com-pk/02-env-production.txt
  DB_DATABASE / DB_USERNAME / DB_PASSWORD apne wale bhar do. APP_KEY pehle se
  diya hua hai. .env kabhi git me commit nahi karna.

------------------------------------------------------------------
STEP 5 — Domain + SSL
------------------------------------------------------------------
  1. Registrar par nameservers is host ke daalo (baryal.com.pk).
  2. Domain ka Document Root = $HOME/public_html
  3. Propagate hone par: SSL/TLS Status -> Run AutoSSL (https zaroori).

------------------------------------------------------------------
STEP 6 — Cron (curing -> ready stock, roz 00:30)
------------------------------------------------------------------
  cPanel > Cron Jobs > har minute:
  * * * * * cd $HOME/barval-app && /opt/cpanel/ea-php84/root/usr/bin/php artisan schedule:run >> /dev/null 2>&1

------------------------------------------------------------------
STEP 7 — Deploy ke baad
------------------------------------------------------------------
  [ ] https://baryal.com.pk khulta hai, login form KHALI aata hai
  [ ] Super Admin login chalta hai
  [ ] owner@blockfactory.test / password se login FAIL hota hai
  [ ] Users page se Owner aur Sales ke password set kiye
  [ ] Owner login karke ek baar Sync Access chalao (permission cache flush)
