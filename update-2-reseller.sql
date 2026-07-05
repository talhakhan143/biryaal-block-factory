-- ============================================================
-- Barval Block Factory — Update #2: Resellers Point module
-- Import via phpMyAdmin into the LIVE database.
-- Idempotent: safe to run more than once.
-- ============================================================
SET FOREIGN_KEY_CHECKS=0;

-- ---- 1) New tables ----
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_suppliers` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `balance` bigint NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reseller_suppliers_name_index` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_items` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unit',
  `sale_price` bigint NOT NULL DEFAULT '0',
  `avg_cost` bigint NOT NULL DEFAULT '0',
  `stock_qty` decimal(15,3) NOT NULL DEFAULT '0.000',
  `low_stock_threshold` decimal(15,3) NOT NULL DEFAULT '0.000',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reseller_items_name_index` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_purchases` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_supplier_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_item_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purchase_date` date NOT NULL,
  `quantity` decimal(15,3) NOT NULL,
  `unit_cost` bigint NOT NULL,
  `transport_cost` bigint NOT NULL DEFAULT '0',
  `loading_cost` bigint NOT NULL DEFAULT '0',
  `unloading_cost` bigint NOT NULL DEFAULT '0',
  `total_cost` bigint NOT NULL,
  `paid_amount` bigint NOT NULL DEFAULT '0',
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `bank_ref` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reseller_purchases_reference_unique` (`reference`),
  KEY `reseller_purchases_reseller_supplier_id_foreign` (`reseller_supplier_id`),
  KEY `reseller_purchases_reseller_item_id_foreign` (`reseller_item_id`),
  KEY `reseller_purchases_created_by_foreign` (`created_by`),
  KEY `reseller_purchases_purchase_date_index` (`purchase_date`),
  KEY `reseller_purchases_payment_status_index` (`payment_status`),
  CONSTRAINT `reseller_purchases_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_purchases_reseller_item_id_foreign` FOREIGN KEY (`reseller_item_id`) REFERENCES `reseller_items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `reseller_purchases_reseller_supplier_id_foreign` FOREIGN KEY (`reseller_supplier_id`) REFERENCES `reseller_suppliers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_rentals` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unit',
  `quantity` decimal(15,3) NOT NULL DEFAULT '1.000',
  `per_day_rate` bigint NOT NULL,
  `start_date` date NOT NULL,
  `return_date` date DEFAULT NULL,
  `days` int unsigned DEFAULT NULL,
  `accrued_total` bigint NOT NULL DEFAULT '0',
  `paid_amount` bigint NOT NULL DEFAULT '0',
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reseller_rentals_reference_unique` (`reference`),
  KEY `reseller_rentals_customer_id_foreign` (`customer_id`),
  KEY `reseller_rentals_created_by_foreign` (`created_by`),
  KEY `reseller_rentals_status_index` (`status`),
  CONSTRAINT `reseller_rentals_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_rentals_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_payments` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `direction` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_supplier_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reseller_purchase_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reseller_rental_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reseller_sale_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reseller_sales_return_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reseller_dispatch_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_date` date NOT NULL,
  `amount` bigint NOT NULL,
  `method` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `bank_ref` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reseller_payments_reference_unique` (`reference`),
  KEY `reseller_payments_reseller_supplier_id_foreign` (`reseller_supplier_id`),
  KEY `reseller_payments_customer_id_foreign` (`customer_id`),
  KEY `reseller_payments_reseller_purchase_id_foreign` (`reseller_purchase_id`),
  KEY `reseller_payments_reseller_rental_id_foreign` (`reseller_rental_id`),
  KEY `reseller_payments_created_by_foreign` (`created_by`),
  KEY `reseller_payments_payment_date_index` (`payment_date`),
  KEY `reseller_payments_reseller_sale_id_foreign` (`reseller_sale_id`),
  KEY `reseller_payments_reseller_sales_return_id_foreign` (`reseller_sales_return_id`),
  KEY `reseller_payments_reseller_dispatch_id_foreign` (`reseller_dispatch_id`),
  CONSTRAINT `reseller_payments_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_payments_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_payments_reseller_dispatch_id_foreign` FOREIGN KEY (`reseller_dispatch_id`) REFERENCES `reseller_dispatches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_payments_reseller_purchase_id_foreign` FOREIGN KEY (`reseller_purchase_id`) REFERENCES `reseller_purchases` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_payments_reseller_rental_id_foreign` FOREIGN KEY (`reseller_rental_id`) REFERENCES `reseller_rentals` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_payments_reseller_sale_id_foreign` FOREIGN KEY (`reseller_sale_id`) REFERENCES `reseller_sales` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_payments_reseller_sales_return_id_foreign` FOREIGN KEY (`reseller_sales_return_id`) REFERENCES `reseller_sales_returns` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_payments_reseller_supplier_id_foreign` FOREIGN KEY (`reseller_supplier_id`) REFERENCES `reseller_suppliers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_sales` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invoice_no` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sale_date` date NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `subtotal` bigint NOT NULL DEFAULT '0',
  `discount` bigint NOT NULL DEFAULT '0',
  `transport_fare` bigint NOT NULL DEFAULT '0',
  `total` bigint NOT NULL DEFAULT '0',
  `paid` bigint NOT NULL DEFAULT '0',
  `balance` bigint NOT NULL DEFAULT '0',
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `payment_method` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_ref` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reseller_sales_invoice_no_unique` (`invoice_no`),
  KEY `reseller_sales_created_by_foreign` (`created_by`),
  KEY `reseller_sales_sale_date_index` (`sale_date`),
  KEY `reseller_sales_customer_id_index` (`customer_id`),
  CONSTRAINT `reseller_sales_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_sales_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_sale_items` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_sale_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_item_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(15,3) NOT NULL,
  `unit_price` bigint NOT NULL,
  `unit_cost` bigint NOT NULL DEFAULT '0',
  `line_total` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reseller_sale_items_reseller_sale_id_foreign` (`reseller_sale_id`),
  KEY `reseller_sale_items_reseller_item_id_foreign` (`reseller_item_id`),
  CONSTRAINT `reseller_sale_items_reseller_item_id_foreign` FOREIGN KEY (`reseller_item_id`) REFERENCES `reseller_items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `reseller_sale_items_reseller_sale_id_foreign` FOREIGN KEY (`reseller_sale_id`) REFERENCES `reseller_sales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_dispatches` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_sale_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `driver_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `trip_rate` bigint NOT NULL DEFAULT '0',
  `trip_paid` bigint NOT NULL DEFAULT '0',
  `dispatch_date` date NOT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `delivered_at` timestamp NULL DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reseller_dispatches_reference_unique` (`reference`),
  KEY `reseller_dispatches_reseller_sale_id_foreign` (`reseller_sale_id`),
  KEY `reseller_dispatches_customer_id_foreign` (`customer_id`),
  KEY `reseller_dispatches_driver_id_foreign` (`driver_id`),
  KEY `reseller_dispatches_vehicle_id_foreign` (`vehicle_id`),
  KEY `reseller_dispatches_created_by_foreign` (`created_by`),
  KEY `reseller_dispatches_status_index` (`status`),
  CONSTRAINT `reseller_dispatches_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_dispatches_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_dispatches_driver_id_foreign` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_dispatches_reseller_sale_id_foreign` FOREIGN KEY (`reseller_sale_id`) REFERENCES `reseller_sales` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_dispatches_vehicle_id_foreign` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_dispatch_items` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_dispatch_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_item_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(15,3) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reseller_dispatch_items_reseller_dispatch_id_foreign` (`reseller_dispatch_id`),
  KEY `reseller_dispatch_items_reseller_item_id_foreign` (`reseller_item_id`),
  CONSTRAINT `reseller_dispatch_items_reseller_dispatch_id_foreign` FOREIGN KEY (`reseller_dispatch_id`) REFERENCES `reseller_dispatches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reseller_dispatch_items_reseller_item_id_foreign` FOREIGN KEY (`reseller_item_id`) REFERENCES `reseller_items` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_sales_returns` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_sale_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `return_date` date NOT NULL,
  `return_value` bigint NOT NULL DEFAULT '0',
  `deduction` bigint NOT NULL DEFAULT '0',
  `refund_amount` bigint NOT NULL DEFAULT '0',
  `refund_mode` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reseller_sales_returns_reference_unique` (`reference`),
  KEY `reseller_sales_returns_reseller_sale_id_foreign` (`reseller_sale_id`),
  KEY `reseller_sales_returns_customer_id_foreign` (`customer_id`),
  KEY `reseller_sales_returns_created_by_foreign` (`created_by`),
  CONSTRAINT `reseller_sales_returns_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_sales_returns_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reseller_sales_returns_reseller_sale_id_foreign` FOREIGN KEY (`reseller_sale_id`) REFERENCES `reseller_sales` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `reseller_sales_return_items` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_sales_return_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reseller_item_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(15,3) NOT NULL,
  `unit_price` bigint NOT NULL,
  `line_total` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reseller_sales_return_items_reseller_sales_return_id_foreign` (`reseller_sales_return_id`),
  KEY `reseller_sales_return_items_reseller_item_id_foreign` (`reseller_item_id`),
  CONSTRAINT `reseller_sales_return_items_reseller_item_id_foreign` FOREIGN KEY (`reseller_item_id`) REFERENCES `reseller_items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `reseller_sales_return_items_reseller_sales_return_id_foreign` FOREIGN KEY (`reseller_sales_return_id`) REFERENCES `reseller_sales_returns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

-- ---- 2) Permissions ----
INSERT IGNORE INTO permissions (name, guard_name, created_at, updated_at) VALUES
  ('reseller.view','web',NOW(),NOW()), ('reseller.manage','web',NOW(),NOW());

-- ---- 3) Grant to Owner + Super Admin (by role name) ----
INSERT IGNORE INTO role_has_permissions (permission_id, role_id)
  SELECT p.id, r.id FROM permissions p JOIN roles r
  WHERE p.name IN ('reseller.view','reseller.manage') AND r.name IN ('Owner','Super Admin');

-- ---- 4) Default reseller items (guarded) ----
INSERT INTO reseller_items (id,name,unit,sale_price,avg_cost,stock_qty,low_stock_threshold,is_active,created_at,updated_at)
  SELECT UUID(),'Cement','bag',0,0,0,0,1,NOW(),NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM reseller_items WHERE name='Cement');
INSERT INTO reseller_items (id,name,unit,sale_price,avg_cost,stock_qty,low_stock_threshold,is_active,created_at,updated_at)
  SELECT UUID(),'Crush','unit',0,0,0,0,1,NOW(),NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM reseller_items WHERE name='Crush');
INSERT INTO reseller_items (id,name,unit,sale_price,avg_cost,stock_qty,low_stock_threshold,is_active,created_at,updated_at)
  SELECT UUID(),'Raiti','unit',0,0,0,0,1,NOW(),NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM reseller_items WHERE name='Raiti');
INSERT INTO reseller_items (id,name,unit,sale_price,avg_cost,stock_qty,low_stock_threshold,is_active,created_at,updated_at)
  SELECT UUID(),'Sarya','mann',0,0,0,0,1,NOW(),NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM reseller_items WHERE name='Sarya');
INSERT INTO reseller_items (id,name,unit,sale_price,avg_cost,stock_qty,low_stock_threshold,is_active,created_at,updated_at)
  SELECT UUID(),'Enten','ent',0,0,0,0,1,NOW(),NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM reseller_items WHERE name='Enten');

-- ---- 5) Record migrations ----
SET @b = (SELECT COALESCE(MAX(batch),0)+1 FROM migrations);
INSERT IGNORE INTO migrations (migration, batch) VALUES
  ('2026_07_05_120000_create_reseller_tables',@b),
  ('2026_07_05_130000_create_reseller_sales_tables',@b),
  ('2026_07_05_140000_add_trip_to_reseller_dispatches',@b);

SET FOREIGN_KEY_CHECKS=1;
