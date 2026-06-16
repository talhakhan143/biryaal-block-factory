# Cement Hollow Block Factory — ERP + POS + Money Management

Production-ready factory management for a cement hollow-block manufacturer (Pakistan).
Tracks raw material, production → curing → ready stock, sales/POS, customers, suppliers,
cash, receivables/payables and full double-entry accounting.

## Stack

- **Backend**: Laravel 13 (PHP 8.4), MySQL 8 / MariaDB, Sanctum Bearer-token auth, spatie/permission RBAC, owen-it auditing
- **Frontend**: React + TypeScript + Vite, Tailwind CSS v4, React Router, TanStack Query, Axios
- **Money**: stored as integer **paisa** (1 PKR = 100 paisa) everywhere — no floats in the ledger

> Original spec asked for Laravel 12 + PostgreSQL. We run **Laravel 13** (current stable) and
> **MySQL** because the deploy target is **Hostinger shared hosting** (no PostgreSQL, no Docker,
> no daemons). See `DEPLOY.md`.

## Phase 1 (delivered) — core money-making loop

Auth + RBAC · Suppliers · Raw materials · Material purchases · Production · Auto-curing ·
Finished goods (curing/ready/damaged + adjustments) · Customers · Sales/POS · Payments ·
Expenses · Cash book · Trial balance & P&L · Dashboard · Audit logs.

## Phase 2 (delivered) — operations

Dispatch + printable Challan · Vehicles · Drivers (dues + ledger + payments) ·
Transport trips (driver dues) · Labour (labourers + attendance + wage dues + payments) ·
Staff + monthly Salaries (generate/accrue + pay). All wage/transport/salary events post
balanced journal entries (accrual via Payable), so the trial balance stays balanced.

## Phase 3 (delivered) — reports

Reports module with **PDF (dompdf) + Excel (maatwebsite/excel) export**: Sales, Production,
Expenses, Inventory, Profit & Loss. Date-range filters, on-screen table, one-click download.
Uniform `ReportService` shape drives a single PDF blade + Excel exporter. Dashboard also shows
**today's blocks sold**.

## Phase 4 (delivered) — admin

**Products management** (add/rename block categories, set sale rate / curing days / low-stock alert /
active) · **User management** (create staff logins, assign roles, enable/disable) · **Audit Logs**
viewer (who changed what, attributed to the signed-in user) · **Account Ledger** drilldown (click any
chart-of-accounts line to see its full journal ledger).

The system is now feature-complete end to end. Optional future: customer/supplier statement PDFs,
Flutter mobile app (reuses the same API).

## Local setup

### Backend
```bash
cd backend
cp .env.example .env            # already configured for local MySQL in this repo
composer install
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --port=8000
```
Seeded logins (password `password`):
- `owner@blockfactory.test` — full access
- `accountant@blockfactory.test` — finance only

### Frontend
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173  (API at http://localhost:8000/api/v1 via .env)
```

### Auto-curing
Promotes batches whose curing period elapsed (curing → ready):
```bash
php artisan blocks:promote-cured     # manual
php artisan schedule:run             # scheduler (runs it daily at 00:30)
```

## Tests
```bash
cd backend && php artisan test
```
Covers: ledger always balances, curing promotion picks only due batches, sale decrements
ready stock + raises receivable, insufficient-stock guard, RBAC denial.

## Architecture notes
- **Layering**: Controller → FormRequest → Service → Eloquent model. Services own DB transactions.
- **Ledger**: every money event posts a balanced journal entry via `App\Services\Accounting\LedgerService`. Debits must equal credits or the post is rejected → the trial balance always balances.
- **Chart of accounts**: Cash, Bank, Receivable, Inventory, Payable, Capital, Sales, Expenses.
- **UUID** primary keys on all domain tables; `users`/auth stay bigint.
