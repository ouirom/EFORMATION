-- Script pour créer un utilisateur de test
-- À exécuter dans SQL Server Management Studio ou sqlcmd

USE [db_eformation];
SET NOCOUNT ON;

-- Vérifier s'il y a des utilisateurs existants
SELECT COUNT(*) AS user_count FROM users;
SELECT TOP 5 id, email, display_name, role FROM users;

-- Si aucun utilisateur, créer l'admin par défaut
-- Hash bcrypt de "Admin123!" avec 12 rounds
IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@eformation.local')
BEGIN
  INSERT INTO users (
    tenant_id, 
    email, 
    username, 
    password_hash, 
    display_name, 
    role, 
    is_active
  ) VALUES (
    1, 
    'admin@eformation.local', 
    'admin', 
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VjKA.yV.2Rq6Gu',
    'Administrateur', 
    'admin', 
    1
  );
  PRINT 'Utilisateur admin créé';
END
ELSE
BEGIN
  PRINT 'Utilisateur admin existe déjà';
END;

-- Vérifier les utilisateurs après l'insertion
SELECT TOP 5 id, email, display_name, role, is_active FROM users;
