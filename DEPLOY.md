# Deploying to Hostinger Shared Hosting

Shared hosting has no Docker, no PostgreSQL, and no long-running daemons. This app is built
around those constraints: MySQL, Bearer-token auth, and a cron-driven scheduler.

## 1. Database
In hPanel → Databases → create a MySQL database + user. Note the name/user/password.

## 2. Backend (Laravel)
1. Upload the `backend/` folder (or `git clone`) outside `public_html`, e.g. `~/block-erp`.
2. Point the domain/subdomain document root to `~/block-erp/public`.
3. `composer install --no-dev --optimize-autoloader`
4. `cp .env.example .env` and set:
   ```
   APP_ENV=production
   APP_DEBUG=false
   APP_URL=https://api.yourdomain.com
   DB_CONNECTION=mysql
   DB_HOST=localhost
   DB_DATABASE=...   DB_USERNAME=...   DB_PASSWORD=...
   ```
5. `php artisan key:generate`
6. `php artisan migrate --force --seed`   (seed once; creates roles, chart of accounts, owner user — **change the owner password immediately**)
7. `php artisan config:cache route:cache`

## 3. Auto-curing scheduler (cron)
In hPanel → Advanced → Cron Jobs, add ONE entry running every minute:
```
* * * * * cd ~/block-erp && php artisan schedule:run >> /dev/null 2>&1
```
This fires `blocks:promote-cured` daily at 00:30 (curing → ready stock).

## 4. Frontend (React SPA)
1. Set `frontend/.env`: `VITE_API_URL=https://api.yourdomain.com/api/v1`
2. `npm install && npm run build`
3. Upload the `frontend/dist/` contents to the SPA's `public_html`.
4. Add an `.htaccess` so client-side routes resolve to `index.html`:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

## 5. CORS
Frontend and API are separate origins. In `backend/config/cors.php` (publish if absent) set
`allowed_origins` to your SPA domain. Bearer-token auth needs no cookies/credentials.

## Email (password reset)
Password reset links email to the user's own address. Set SMTP + frontend URL in `.env`:
```
FRONTEND_URL=https://app.yourdomain.com
MAIL_MAILER=smtp
MAIL_HOST=smtp.hostinger.com   MAIL_PORT=465   MAIL_ENCRYPTION=ssl
MAIL_USERNAME=you@yourdomain.com   MAIL_PASSWORD=...   MAIL_FROM_ADDRESS=you@yourdomain.com
```
Locally `MAIL_MAILER=log` writes the reset link to `storage/logs/laravel.log` (no SMTP needed).
Super Admin / Owner can also set any user's password directly from the Users page (no email).

## Backups
Add a daily cron to dump the DB:
```
0 2 * * * mysqldump -u USER -pPASS DBNAME > ~/backups/block_$(date +\%F).sql
```
