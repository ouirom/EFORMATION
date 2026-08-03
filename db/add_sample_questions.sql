-- Add sample questions and choices for testing
DECLARE @TenantId INT = 1;

-- Insert sample questions and choices
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'mcq', 'Quel est le capital de la France?', 1);

DECLARE @Q1 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q1, 'Paris', 1, 1),
(@TenantId, @Q1, 'Lyon', 0, 2),
(@TenantId, @Q1, 'Marseille', 0, 3),
(@TenantId, @Q1, 'Toulouse', 0, 4);

-- Q2
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'mcq', 'En quelle année a été fondée l''Université de Paris?', 1);

DECLARE @Q2 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q2, '1200', 1, 1),
(@TenantId, @Q2, '1400', 0, 2),
(@TenantId, @Q2, '1600', 0, 3),
(@TenantId, @Q2, '1800', 0, 4);

-- Q3
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'mcq', 'Qui a écrit "Les Misérables"?', 1);

DECLARE @Q3 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q3, 'Victor Hugo', 1, 1),
(@TenantId, @Q3, 'Gustave Flaubert', 0, 2),
(@TenantId, @Q3, 'Honoré de Balzac', 0, 3),
(@TenantId, @Q3, 'Émile Zola', 0, 4);

-- Q4
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'true_false', 'La Terre est plate.', 1);

DECLARE @Q4 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q4, 'Vrai', 0, 1),
(@TenantId, @Q4, 'Faux', 1, 2);

-- Q5
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'true_false', 'La France est en Europe.', 1);

DECLARE @Q5 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q5, 'Vrai', 1, 1),
(@TenantId, @Q5, 'Faux', 0, 2);

-- Q6
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'mcq', 'Quel est le plus grand désert du monde?', 1);

DECLARE @Q6 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q6, 'Sahara', 1, 1),
(@TenantId, @Q6, 'Gobi', 0, 2),
(@TenantId, @Q6, 'Kalahari', 0, 3),
(@TenantId, @Q6, 'Mojave', 0, 4);

-- Q7
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'mcq', 'Combien de continents y a-t-il?', 1);

DECLARE @Q7 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q7, '5', 0, 1),
(@TenantId, @Q7, '6', 0, 2),
(@TenantId, @Q7, '7', 1, 3),
(@TenantId, @Q7, '8', 0, 4);

-- Q8
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'mcq', 'Quel est le plus haut sommet du monde?', 1);

DECLARE @Q8 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q8, 'Mont Blanc', 0, 1),
(@TenantId, @Q8, 'Mont Everest', 1, 2),
(@TenantId, @Q8, 'K2', 0, 3),
(@TenantId, @Q8, 'Denali', 0, 4);

-- Q9
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'true_false', 'L''eau bouille à 100 degrés Celsius au niveau de la mer.', 1);

DECLARE @Q9 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q9, 'Vrai', 1, 1),
(@TenantId, @Q9, 'Faux', 0, 2);

-- Q10
INSERT INTO questions (tenant_id, type, prompt, position)
VALUES (@TenantId, 'mcq', 'Quel est la capitale de l''Italie?', 1);

DECLARE @Q10 INT = SCOPE_IDENTITY();

INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
VALUES
(@TenantId, @Q10, 'Rome', 1, 1),
(@TenantId, @Q10, 'Milan', 0, 2),
(@TenantId, @Q10, 'Venise', 0, 3),
(@TenantId, @Q10, 'Florence', 0, 4);

PRINT '10 sample questions with choices added successfully!';
