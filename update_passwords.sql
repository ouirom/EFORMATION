USE [db_eformation];

-- Hash généré avec bcrypt pour "Admin123!" avec 12 rounds
-- Le hash: $2a$12$wILqKjsuDA5I4ULkWUUifuHiNh.0ecrZLs.NBvp1M5SGpjYLQZUvS
UPDATE users 
SET password_hash = '$2a$12$wILqKjsuDA5I4ULkWUUifuHiNh.0ecrZLs.NBvp1M5SGpjYLQZUvS'
WHERE email IN ('admin@demo.local', 'manager@demo.local', 'agent@demo.local');

-- Vérifier les mises à jour
SELECT email, LEFT(password_hash, 20) as hash_start, is_active FROM users WHERE email IN ('admin@demo.local', 'manager@demo.local', 'agent@demo.local');

PRINT 'Passwords updated for test users. Use: Admin123!';
