-- ===================================================================
--  ACG ERP  ·  DB patch 4  ·  Dashboard par raqam chhupane ki setting
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
--    `users` me aik naya nullable column `preferences` daalti hai. Ismein
--    har bande ki apni setting JSON ki shakal me parti hai, filhal sirf
--    ye ke dashboard par kaunsi raqam chhupi rahegi:
--      { "dashboard_hidden": ["income","sales"] }
--    Purani saari rows me ye khali (NULL) rahega, yani sab kuch pehle
--    jaisa nazar aata rahega jab tak banda khud chhupane na kahe.
--
--    json ke bajaye TEXT rakha hai kyunke server MariaDB ho sakta hai, aur
--    Laravel ka 'array' cast TEXT par har jagah chalta hai.
--
--  MEHFOOZ HAI
--    Dobara chala dein to bhi kuch nahi bigadta: pehle check karti hai ke
--    column mojood to nahi. Koi data delete ya update nahi hoti. Patch
--    sirf cheez barhata hai, isliye purana code is column ko nazarandaz
--    kar deta hai.
-- ===================================================================

SET @db := DATABASE();

-- 1) Column (agar pehle se na ho)
SET @sql := (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'preferences'
    ),
    'SELECT ''column already there, skipped'' AS note',
    'ALTER TABLE `users` ADD COLUMN `preferences` TEXT NULL DEFAULT NULL'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) Laravel ka migrations register bhi update kar dein, taake aage
--    chal kar `artisan migrate` ye migration dobara chalane ki koshish
--    na kare.
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_10_26_120000_add_preferences_to_users_table',
       COALESCE((SELECT MAX(b.batch) FROM (SELECT batch FROM `migrations`) b), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT migration FROM `migrations`) m
  WHERE m.migration = '2026_10_26_120000_add_preferences_to_users_table'
);

-- 3) Saboot: column laga ya nahi, aur register me entry gayi ya nahi.
SELECT 'patch 4 done' AS result,
       (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'preferences') AS preferences_column,
       (SELECT COUNT(*) FROM (SELECT migration FROM `migrations`) m
         WHERE m.migration = '2026_10_26_120000_add_preferences_to_users_table') AS migration_row;
