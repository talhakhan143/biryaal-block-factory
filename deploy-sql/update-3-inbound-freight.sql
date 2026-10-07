-- ===================================================================
--  ACG ERP  ·  DB patch 3  ·  Inbound freight (maal laane wala driver)
-- ===================================================================
--
--  KAB CHALANA HAI
--    Sirf aik dafa, us deploy ke sath jo ye feature live kar raha hai.
--    Purani DB par chalani hai. Nayi DB par zarurat NAHI (migration khud
--    bana deti hai).
--
--  KAISE
--    cPanel > phpMyAdmin > apna database select karein > Import tab >
--    ye file choose karein > Go.
--
--  KYA KARTI HAI
--    `transport_trips` me aik naya nullable column `material_purchase_id`
--    daalti hai. Isi se pata chalta hai ke ye trip maal LAANE ki hai
--    (purchase se judi) ya maal BHEJNE ki (dispatch se judi).
--    Purani saari rows me ye khali rahega, yani un par koi asar nahi.
--
--  MEHFOOZ HAI
--    Dobara chala dein to bhi kuch nahi bigadta: pehle check karti hai ke
--    column mojood to nahi. Koi data delete ya update nahi hoti.
-- ===================================================================

-- Foreign key check band: aik naya FK add karte waqt MySQL table ke SAARE
-- purane FKs dobara jaanchta hai, aur purana data kabhi kabhi us jaanch me
-- atak jata hai. Yehi tareeqa update-2-reseller.sql me bhi istemal hua hai.
SET @old_fk := @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

SET @db := DATABASE();

-- 1) Column (agar pehle se na ho)
SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'transport_trips'
        AND COLUMN_NAME = 'material_purchase_id'
    ),
    'SELECT ''column already there, skipped'' AS note',
    'ALTER TABLE `transport_trips` ADD COLUMN `material_purchase_id` CHAR(36) NULL DEFAULT NULL AFTER `dispatch_id`'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) Index (foreign key ke liye zaroori)
SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'transport_trips'
        AND INDEX_NAME = 'transport_trips_material_purchase_id_index'
    ),
    'SELECT ''index already there, skipped'' AS note',
    'CREATE INDEX `transport_trips_material_purchase_id_index` ON `transport_trips` (`material_purchase_id`)'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3) Foreign key. Purchase delete ho to trip ka link khali ho jaye,
--    trip khud na mitay (driver ka hisaab mehfooz rahe).
SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'transport_trips'
        AND CONSTRAINT_NAME = 'transport_trips_material_purchase_id_foreign'
    ),
    'SELECT ''foreign key already there, skipped'' AS note',
    'ALTER TABLE `transport_trips` ADD CONSTRAINT `transport_trips_material_purchase_id_foreign` FOREIGN KEY (`material_purchase_id`) REFERENCES `material_purchases` (`id`) ON DELETE SET NULL'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4) Laravel ka migrations register bhi update kar dein, taake aage
--    chal kar `artisan migrate` ye migration dobara chalane ki koshish
--    na kare.
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_10_07_090000_add_material_purchase_to_transport_trips',
       COALESCE((SELECT MAX(b.batch) FROM (SELECT batch FROM `migrations`) b), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT migration FROM `migrations`) m
  WHERE m.migration = '2026_10_07_090000_add_material_purchase_to_transport_trips'
);

SET FOREIGN_KEY_CHECKS = @old_fk;

SELECT 'patch 3 done' AS result;
