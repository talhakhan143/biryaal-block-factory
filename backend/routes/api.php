<?php

use App\Http\Controllers\Api\AccountingController;
use App\Http\Controllers\Api\AdjustmentController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CashBookController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DispatchController;
use App\Http\Controllers\Api\DriverController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\FinishedGoodsController;
use App\Http\Controllers\Api\LabourerController;
use App\Http\Controllers\Api\MaterialPurchaseController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductionController;
use App\Http\Controllers\Api\RawMaterialController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SalaryController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\SalesReturnController;
use App\Http\Controllers\Api\StaffController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\TransportController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VehicleController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Public auth
    Route::post('login', [AuthController::class, 'login']);
    Route::post('forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('reset-password', [AuthController::class, 'resetPassword']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);

        Route::get('dashboard', [DashboardController::class, 'index'])
            ->middleware('permission:dashboard.view');

        // Suppliers
        Route::middleware('permission:suppliers.view')->group(function () {
            Route::get('suppliers', [SupplierController::class, 'index']);
            Route::get('suppliers/{supplier}', [SupplierController::class, 'show']);
            Route::get('suppliers/{supplier}/ledger', [SupplierController::class, 'ledger']);
        });
        Route::middleware('permission:suppliers.manage')->group(function () {
            Route::post('suppliers', [SupplierController::class, 'store']);
            Route::put('suppliers/{supplier}', [SupplierController::class, 'update']);
            Route::delete('suppliers/{supplier}', [SupplierController::class, 'destroy']);
        });

        // Customers
        Route::middleware('permission:customers.view')->group(function () {
            Route::get('customers', [CustomerController::class, 'index']);
            Route::get('customers/{customer}', [CustomerController::class, 'show']);
            Route::get('customers/{customer}/ledger', [CustomerController::class, 'ledger']);
        });
        Route::middleware('permission:customers.manage')->group(function () {
            Route::post('customers', [CustomerController::class, 'store']);
            Route::put('customers/{customer}', [CustomerController::class, 'update']);
            Route::delete('customers/{customer}', [CustomerController::class, 'destroy']);
        });

        // Raw materials
        Route::middleware('permission:materials.view')->group(function () {
            Route::get('raw-materials', [RawMaterialController::class, 'index']);
            Route::get('raw-materials/{rawMaterial}', [RawMaterialController::class, 'show']);
        });
        Route::middleware('permission:materials.manage')->group(function () {
            Route::post('raw-materials', [RawMaterialController::class, 'store']);
            Route::put('raw-materials/{rawMaterial}', [RawMaterialController::class, 'update']);
            Route::delete('raw-materials/{rawMaterial}', [RawMaterialController::class, 'destroy']);
        });

        // Products
        Route::get('products', [ProductController::class, 'index'])->middleware('permission:inventory.view');
        Route::get('products/{product}', [ProductController::class, 'show'])->middleware('permission:inventory.view');
        Route::middleware('permission:inventory.manage')->group(function () {
            Route::post('products', [ProductController::class, 'store']);
            Route::put('products/{product}', [ProductController::class, 'update']);
            Route::delete('products/{product}', [ProductController::class, 'destroy']);
        });

        // Material purchases
        Route::get('purchases', [MaterialPurchaseController::class, 'index'])->middleware('permission:purchases.view');
        Route::get('purchases/{materialPurchase}', [MaterialPurchaseController::class, 'show'])->middleware('permission:purchases.view');
        Route::post('purchases', [MaterialPurchaseController::class, 'store'])->middleware('permission:purchases.manage');
        Route::post('purchases/{materialPurchase}/pay', [MaterialPurchaseController::class, 'pay'])->middleware('permission:payments.manage');

        // Production
        Route::get('production', [ProductionController::class, 'index'])->middleware('permission:production.view');
        Route::get('production/{production}', [ProductionController::class, 'show'])->middleware('permission:production.view');
        Route::post('production', [ProductionController::class, 'store'])->middleware('permission:production.manage');
        Route::post('production/promote', [ProductionController::class, 'promote'])->middleware('permission:production.manage');
        Route::post('production/{production}/mark-ready', [ProductionController::class, 'markReady'])->middleware('permission:production.manage');

        // Finished goods
        Route::middleware('permission:inventory.view')->group(function () {
            Route::get('finished-goods', [FinishedGoodsController::class, 'index']);
            Route::get('finished-goods/movements', [FinishedGoodsController::class, 'movements']);
        });
        Route::middleware('permission:inventory.manage')->group(function () {
            Route::post('finished-goods/adjust', [FinishedGoodsController::class, 'adjust']);
            Route::post('finished-goods/damage', [FinishedGoodsController::class, 'damage']);
        });

        // Sales / POS
        Route::get('sales', [SaleController::class, 'index'])->middleware('permission:sales.view');
        Route::get('sales/{sale}', [SaleController::class, 'show'])->middleware('permission:sales.view');
        Route::post('sales', [SaleController::class, 'store'])->middleware('permission:sales.manage');
        Route::post('sales/{sale}/receive', [SaleController::class, 'receive'])->middleware('permission:payments.manage');

        // Block returns (wapsi)
        Route::get('sales-returns', [SalesReturnController::class, 'index'])->middleware('permission:sales.view');
        Route::get('sales-returns/{salesReturn}', [SalesReturnController::class, 'show'])->middleware('permission:sales.view');
        Route::post('sales-returns', [SalesReturnController::class, 'store'])->middleware('permission:sales.manage');

        // Payments
        Route::get('payments', [PaymentController::class, 'index'])->middleware('permission:payments.view');
        Route::middleware('permission:payments.manage')->group(function () {
            Route::post('payments/receipt', [PaymentController::class, 'receipt']);
            Route::post('payments/supplier', [PaymentController::class, 'payment']);
        });

        // Expenses
        Route::get('expenses', [ExpenseController::class, 'index'])->middleware('permission:expenses.view');
        Route::get('expenses/{expense}', [ExpenseController::class, 'show'])->middleware('permission:expenses.view');
        Route::post('expenses', [ExpenseController::class, 'store'])->middleware('permission:expenses.manage');

        // Vehicles & Drivers
        Route::get('vehicles', [VehicleController::class, 'index'])->middleware('permission:transport.view');
        Route::middleware('permission:transport.manage')->group(function () {
            Route::post('vehicles', [VehicleController::class, 'store']);
            Route::put('vehicles/{vehicle}', [VehicleController::class, 'update']);
        });
        Route::middleware('permission:transport.view')->group(function () {
            Route::get('drivers', [DriverController::class, 'index']);
            Route::get('drivers/{driver}/ledger', [DriverController::class, 'ledger']);
        });
        Route::middleware('permission:transport.manage')->group(function () {
            Route::post('drivers', [DriverController::class, 'store']);
            Route::put('drivers/{driver}', [DriverController::class, 'update']);
            Route::delete('drivers/{driver}', [DriverController::class, 'destroy']);
        });
        Route::post('drivers/{driver}/pay', [DriverController::class, 'pay'])->middleware('permission:payments.manage');

        // Transport trips
        Route::get('transport-trips', [TransportController::class, 'index'])->middleware('permission:transport.view');
        Route::post('transport-trips', [TransportController::class, 'store'])->middleware('permission:transport.manage');
        Route::post('transport-trips/{transportTrip}/pay', [TransportController::class, 'pay'])->middleware('permission:payments.manage');

        // Dispatch / Challan
        Route::middleware('permission:dispatch.view')->group(function () {
            Route::get('dispatches', [DispatchController::class, 'index']);
            Route::get('dispatches/pending', [DispatchController::class, 'pending']);
            Route::get('dispatches/{dispatch}', [DispatchController::class, 'show']);
        });
        Route::middleware('permission:dispatch.manage')->group(function () {
            Route::post('dispatches', [DispatchController::class, 'store']);
            Route::post('dispatches/{dispatch}/deliver', [DispatchController::class, 'deliver']);
        });

        // Labour
        Route::get('labourers', [LabourerController::class, 'index'])->middleware('permission:labour.view');
        Route::middleware('permission:labour.manage')->group(function () {
            Route::post('labourers', [LabourerController::class, 'store']);
            Route::put('labourers/{labourer}', [LabourerController::class, 'update']);
            Route::delete('labourers/{labourer}', [LabourerController::class, 'destroy']);
            Route::get('attendances', [AttendanceController::class, 'index']);
            Route::post('attendances', [AttendanceController::class, 'store']);
        });
        Route::post('labourers/{labourer}/pay', [LabourerController::class, 'pay'])->middleware('permission:payments.manage');

        // Staff & Salaries (HR)
        Route::middleware('permission:hr.view')->group(function () {
            Route::get('staff', [StaffController::class, 'index']);
            Route::get('salaries', [SalaryController::class, 'index']);
        });
        Route::middleware('permission:hr.manage')->group(function () {
            Route::post('staff', [StaffController::class, 'store']);
            Route::put('staff/{staff}', [StaffController::class, 'update']);
            Route::delete('staff/{staff}', [StaffController::class, 'destroy']);
            Route::post('salaries', [SalaryController::class, 'store']);
            Route::post('salaries/{salary}/pay', [SalaryController::class, 'pay']);
        });

        // User management
        Route::middleware('permission:users.manage')->group(function () {
            Route::get('users', [UserController::class, 'index']);
            Route::get('roles', [UserController::class, 'roles']);
            Route::post('users', [UserController::class, 'store']);
            Route::put('users/{user}', [UserController::class, 'update']);
        });

        // Audit logs
        Route::get('audits', [AuditController::class, 'index'])->middleware('permission:audit.view');

        // Reports (PDF / Excel export)
        Route::middleware('permission:reports.view')->group(function () {
            Route::get('reports/{type}', [ReportController::class, 'show']);
            Route::get('reports/{type}/pdf', [ReportController::class, 'pdf']);
            Route::get('reports/{type}/excel', [ReportController::class, 'excel']);
        });

        // Adjustments (manual balance / cash corrections)
        Route::get('adjustments', [AdjustmentController::class, 'index'])->middleware('permission:accounting.view');
        Route::post('adjustments', [AdjustmentController::class, 'store'])->middleware('permission:payments.manage');

        // Cash book & accounting
        Route::get('cash-book', [CashBookController::class, 'index'])->middleware('permission:accounting.view');
        Route::middleware('permission:accounting.view')->group(function () {
            Route::get('accounting/trial-balance', [AccountingController::class, 'trialBalance']);
            Route::get('accounting/profit-loss', [AccountingController::class, 'profitLoss']);
            Route::get('accounting/ledger/{code}', [AccountingController::class, 'accountLedger']);
        });
    });
});
