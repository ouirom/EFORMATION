-- Script d'initialisation pour E-Formation
-- Exécuter après bci_lms_schema_sqlserver.sql

USE [db_eformation];
SET NOCOUNT ON;

-- =====================
-- Insertion des données initiales
-- =====================

-- Créer le tenant par défaut s'il n'existe pas
IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1)
BEGIN
  SET IDENTITY_INSERT tenants ON;
  INSERT INTO tenants (id, name, slug) VALUES (1, 'E-Formation Default', 'default');
  SET IDENTITY_INSERT tenants OFF;
  PRINT 'Tenant par défaut créé';
END
ELSE
BEGIN
  PRINT 'Tenant par défaut existe déjà';
END;

-- Créer l'entreprise par défaut
IF NOT EXISTS (SELECT 1 FROM enterprises WHERE tenant_id = 1)
BEGIN
  INSERT INTO enterprises (tenant_id, name, code) VALUES (1, 'Entreprise Demo', 'DEMO');
  PRINT 'Entreprise par défaut créée';
END;

-- Créer un utilisateur admin par défaut (mot de passe: Admin123!)
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
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VjKA.yV.2Rq6Gu', -- Admin123!
    'Administrateur', 
    'admin', 
    1
  );
  PRINT 'Utilisateur admin créé (email: admin@eformation.local, mot de passe: Admin123!)';
END
ELSE
BEGIN
  PRINT 'Utilisateur admin existe déjà';
END;

-- Créer les préférences de notification pour l'admin
DECLARE @adminId BIGINT;
SELECT @adminId = id FROM users WHERE email = 'admin@eformation.local';

IF @adminId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM notification_preferences WHERE user_id = @adminId)
BEGIN
  INSERT INTO notification_preferences (tenant_id, user_id) VALUES (1, @adminId);
  PRINT 'Préférences de notification créées pour admin';
END;

-- Créer quelques catégories de cours par défaut
IF NOT EXISTS (SELECT 1 FROM categories WHERE tenant_id = 1)
BEGIN
  INSERT INTO categories (tenant_id, name) VALUES 
    (1, 'Développement'),
    (1, 'Management'),
    (1, 'Marketing'),
    (1, 'Ressources Humaines'),
    (1, 'Bureautique'),
    (1, 'Langues'),
    (1, 'Soft Skills');
  PRINT 'Catégories de cours créées';
END;

-- Créer quelques cours de test
IF NOT EXISTS (SELECT 1 FROM courses WHERE tenant_id = 1 AND title = 'Introduction à TypeScript')
BEGIN
  DECLARE @adminId2 BIGINT;
  SELECT @adminId2 = id FROM users WHERE email = 'admin@eformation.local';
  
  INSERT INTO courses (tenant_id, title, description, category, level, duration, created_by, is_published)
  VALUES 
    (1, 'Introduction à TypeScript', 'Apprenez les bases de TypeScript pour développer des applications robustes', 'Développement', 'beginner', 180, @adminId2, 1),
    (1, 'Leadership et Gestion d''Équipe', 'Devenez un leader efficace et gérez votre équipe avec succès', 'Management', 'intermediate', 240, @adminId2, 1),
    (1, 'Marketing Digital 101', 'Maîtrisez les principes fondamentaux du marketing digital', 'Marketing', 'beginner', 120, @adminId2, 1),
    (1, 'Gestion des Ressources Humaines', 'Formation complète en RH pour les gestionnaires', 'Ressources Humaines', 'intermediate', 300, @adminId2, 1),
    (1, 'Communication Efficace', 'Améliorez votre communication professionnelle et personnelle', 'Soft Skills', 'beginner', 90, @adminId2, 1),
    (1, 'Excel Avancé', 'Maîtrisez les fonctionnalités avancées d''Excel', 'Bureautique', 'intermediate', 150, @adminId2, 1),
    (1, 'Anglais Professionnel', 'Améliorez votre anglais pour le contexte professionnel', 'Langues', 'intermediate', 200, @adminId2, 1);
  PRINT 'Cours de test créés';
END;

-- Ajouter des modules et leçons pour le premier cours (Introduction à TypeScript)
IF NOT EXISTS (SELECT 1 FROM modules WHERE course_id = (SELECT TOP 1 id FROM courses WHERE title = 'Introduction à TypeScript'))
BEGIN
  DECLARE @tsCoureId BIGINT;
  SELECT @tsCoureId = id FROM courses WHERE title = 'Introduction à TypeScript';
  
  -- Modules
  INSERT INTO modules (tenant_id, course_id, title, position) VALUES
    (1, @tsCoureId, 'Les Bases de TypeScript', 1),
    (1, @tsCoureId, 'Types Avancés', 2),
    (1, @tsCoureId, 'Programmation Orientée Objet', 3);
    
  -- Leçons pour le module 1
  INSERT INTO lessons (tenant_id, module_id, title, type, duration_min, position) VALUES
    (1, (SELECT id FROM modules WHERE course_id = @tsCoureId AND position = 1), 'Qu''est-ce que TypeScript ?', 'text', 15, 1),
    (1, (SELECT id FROM modules WHERE course_id = @tsCoureId AND position = 1), 'Configuration de l''environnement', 'video', 20, 2),
    (1, (SELECT id FROM modules WHERE course_id = @tsCoureId AND position = 1), 'Variables et Types Primitifs', 'text', 25, 3);
    
  -- Leçons pour le module 2
  INSERT INTO lessons (tenant_id, module_id, title, type, duration_min, position) VALUES
    (1, (SELECT id FROM modules WHERE course_id = @tsCoureId AND position = 2), 'Types Génériques', 'video', 30, 1),
    (1, (SELECT id FROM modules WHERE course_id = @tsCoureId AND position = 2), 'Types Union et Intersection', 'text', 20, 2);
    
  -- Leçons pour le module 3
  INSERT INTO lessons (tenant_id, module_id, title, type, duration_min, position) VALUES
    (1, (SELECT id FROM modules WHERE course_id = @tsCoureId AND position = 3), 'Créer des Classes', 'video', 25, 1),
    (1, (SELECT id FROM modules WHERE course_id = @tsCoureId AND position = 3), 'Interfaces et Contrats', 'text', 20, 2);
    
  PRINT 'Modules et leçons TypeScript créés';
END;

-- Ajouter du contenu aux leçons (texte)
IF NOT EXISTS (SELECT 1 FROM contents WHERE lesson_id = (SELECT TOP 1 id FROM lessons WHERE title = 'Qu''est-ce que TypeScript ?'))
BEGIN
  INSERT INTO contents (tenant_id, lesson_id, type, title, body, position) VALUES
    (1, (SELECT TOP 1 id FROM lessons WHERE title = 'Qu''est-ce que TypeScript ?'), 'text', 'Introduction', 
     '<h2>Qu''est-ce que TypeScript ?</h2><p>TypeScript est un langage de programmation basé sur JavaScript qui ajoute des types statiques. Cela permet de détecter les erreurs avant l''exécution du code.</p><h3>Avantages:</h3><ul><li>Détection d''erreurs précoce</li><li>Meilleure documentation du code</li><li>Autocomplétion améliorée</li><li>Refactoring sécurisé</li></ul>', 1),
    (1, (SELECT TOP 1 id FROM lessons WHERE title = 'Configuration de l''environnement'), 'text', 'Installation', 
     '<h2>Configuration de l''environnement</h2><p>Pour commencer avec TypeScript, vous devez installer Node.js et npm, puis installer TypeScript globalement ou localement dans votre projet.</p><pre><code>npm install -g typescript\nnpm install --save-dev typescript</code></pre>', 1),
    (1, (SELECT TOP 1 id FROM lessons WHERE title = 'Variables et Types Primitifs'), 'text', 'Types Primitifs', 
     '<h2>Types Primitifs en TypeScript</h2><p>TypeScript supporte les types primitifs suivants:</p><ul><li><strong>number</strong> - Pour les nombres entiers et décimaux</li><li><strong>string</strong> - Pour les chaînes de caractères</li><li><strong>boolean</strong> - Pour les valeurs true/false</li><li><strong>null</strong> - Pour représenter l''absence de valeur</li><li><strong>undefined</strong> - Pour les variables non initialisées</li></ul>', 1);
END;

-- Créer quelques badges par défaut
IF NOT EXISTS (SELECT 1 FROM badges WHERE tenant_id = 1)
BEGIN
  INSERT INTO badges (tenant_id, code, name, description, criteria) VALUES 
    (1, 'first_step', 'Premier Pas', 'Terminer votre première leçon', '{"type": "lesson_complete", "count": 1}'),
    (1, 'diligent_student', 'Étudiant Assidu', 'Terminer 10 leçons', '{"type": "lesson_complete", "count": 10}'),
    (1, 'quiz_master', 'Maître du Quiz', 'Obtenir 100% à 5 quiz', '{"type": "quiz_perfect", "count": 5}'),
    (1, 'gold_certificate', 'Certificat d''Or', 'Obtenir 5 certificats', '{"type": "certificate", "count": 5}'),
    (1, 'expert', 'Expert', 'Terminer 10 cours complets', '{"type": "course_complete", "count": 10}');
  PRINT 'Badges par défaut créés';
END;

PRINT '';
PRINT '=== Initialisation terminée ===';
PRINT 'Vous pouvez vous connecter avec:';
PRINT 'Email: admin@eformation.local';
PRINT 'Mot de passe: Admin123!';
