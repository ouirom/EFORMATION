import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { AuditService } from '../services/audit.service';
import { CourseService, ModuleService, LessonService } from '../services/course.service';
import { CategoryService } from '../services/category.service';
import { BadRequestError } from '../middleware/error.middleware';
import { parseSpreadsheet, buildXlsxTemplate } from '../utils/xlsx';
import { db, IS_PG } from '../database/db-helpers';
import { TenantSettingsService } from '../services/tenant-settings.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const MAX_IMPORT_ROWS = 500;

interface RowResult {
  line: number;
  label: string;
  status: 'created' | 'skipped' | 'error';
  message?: string;
}

function sendXlsx(res: any, filename: string, buffer: Buffer) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

async function readUploadedRows(req: AuthRequest): Promise<Record<string, string>[]> {
  if (!req.file) {
    throw BadRequestError('A spreadsheet file is required (field name: file)');
  }
  const rows = await parseSpreadsheet(req.file);
  if (rows.length === 0) {
    throw BadRequestError('The file has no data rows');
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw BadRequestError(`The file has too many rows (max ${MAX_IMPORT_ROWS})`);
  }
  return rows;
}

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return ['oui', 'yes', 'true', '1', 'vrai'].includes(value.trim().toLowerCase());
}

// ==================== ORGANIZATION HIERARCHY ====================

router.get('/organization/template', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const buffer = await buildXlsxTemplate(
      'Organisation',
      [
        { header: 'enterpriseName' },
        { header: 'enterpriseCode' },
        { header: 'subsidiaryName' },
        { header: 'subsidiaryCode' },
        { header: 'directionName' },
        { header: 'directionCode' },
        { header: 'serviceName' },
        { header: 'serviceCode' },
      ],
      [
        ['Entreprise Demo', 'DEMO', '', '', 'Direction Technique', 'TECH', 'Ingénierie', 'ENG'],
        ['Entreprise Demo', 'DEMO', '', '', 'Direction Technique', 'TECH', 'Support', 'SUP'],
        ['Entreprise Demo', 'DEMO', 'Filiale Côte d\'Ivoire', 'FIL-CI', 'Direction Commerciale', 'COM-CI', 'Ventes', 'VTE-CI'],
        ['Entreprise Demo', 'DEMO', '', '', 'Direction Opérations', 'OPS', '', ''],
      ],
      [
        'Une ligne = un service (ou une direction si serviceName est vide, ou une entreprise si directionName est aussi vide).',
        'enterpriseName est obligatoire sur chaque ligne.',
        'directionName est obligatoire si serviceName est renseigné.',
        "subsidiaryName (filiale) est optionnel : renseigné, la direction de la ligne est créée dans cette filiale de l'entreprise ; vide, elle est rattachée directement à l'entreprise.",
        'Les colonnes *Code sont optionnelles ; si un enterprise/direction/service du même nom (ou code) existe déjà pour votre organisation, il est réutilisé au lieu d\'être recréé (import idempotent, rejouable sans risque de doublons).',
      ]
    );
    sendXlsx(res, 'modele_organisation.xlsx', buffer);
  } catch (error) {
    next(error);
  }
});

router.post('/organization', authenticate, authorize('admin'), upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    const rows = await readUploadedRows(req);
    const tenantId = req.user!.tenantId;

    const results: RowResult[] = [];
    let created = 0;

    // Caches so repeated enterprise/direction names across rows don't re-query.
    const enterpriseCache = new Map<string, number>();
    const subsidiaryCache = new Map<string, number>();
    const directionCache = new Map<string, number>();

    for (let i = 0; i < rows.length; i++) {
      const line = i + 2;
      const row = rows[i];
      const enterpriseName = (row.enterpriseName || '').trim();
      const enterpriseCode = (row.enterpriseCode || '').trim() || null;
      const subsidiaryName = (row.subsidiaryName || '').trim();
      const subsidiaryCode = (row.subsidiaryCode || '').trim() || null;
      const directionName = (row.directionName || '').trim();
      const directionCode = (row.directionCode || '').trim() || null;
      const serviceName = (row.serviceName || '').trim();
      const serviceCode = (row.serviceCode || '').trim() || null;

      if (!enterpriseName) {
        results.push({ line, label: '(sans nom)', status: 'error', message: 'enterpriseName est requis' });
        continue;
      }
      if (serviceName && !directionName) {
        results.push({ line, label: serviceName, status: 'error', message: 'directionName est requis quand serviceName est renseigné' });
        continue;
      }

      try {
        let enterpriseId = enterpriseCache.get(enterpriseName.toLowerCase());
        let enterpriseWasCreated = false;
        if (!enterpriseId) {
          const existing = await DatabaseService.query<{ id: number }>(
            `SELECT id FROM enterprises WHERE tenant_id = @tenantId AND (LOWER(name) = @name OR (code IS NOT NULL AND code = @code))`,
            { tenantId, name: enterpriseName.toLowerCase(), code: enterpriseCode }
          );
          if (existing.length > 0) {
            enterpriseId = existing[0].id;
          } else {
            const inserted = await DatabaseService.query<{ id: number }>(
              IS_PG
                ? `INSERT INTO enterprises (tenant_id, name, code) VALUES (@tenantId, @name, @code) RETURNING id`
                : `INSERT INTO enterprises (tenant_id, name, code) OUTPUT INSERTED.id VALUES (@tenantId, @name, @code)`,
              { tenantId, name: enterpriseName, code: enterpriseCode }
            );
            enterpriseId = inserted[0].id;
            enterpriseWasCreated = true;
          }
          enterpriseCache.set(enterpriseName.toLowerCase(), enterpriseId);
        }

        // Optional subsidiary (filiale) of the enterprise.
        let subsidiaryId: number | null = null;
        let subsidiaryWasCreated = false;
        if (subsidiaryName) {
          const subsidiaryKey = `${enterpriseId}:${subsidiaryName.toLowerCase()}`;
          subsidiaryId = subsidiaryCache.get(subsidiaryKey) ?? null;
          if (!subsidiaryId) {
            const existing = await DatabaseService.query<{ id: number }>(
              `SELECT id FROM subsidiaries WHERE tenant_id = @tenantId AND enterprise_id = @enterpriseId AND (LOWER(name) = @name OR (code IS NOT NULL AND code = @code))`,
              { tenantId, enterpriseId, name: subsidiaryName.toLowerCase(), code: subsidiaryCode }
            );
            if (existing.length > 0) {
              subsidiaryId = existing[0].id;
            } else {
              const inserted = await DatabaseService.query<{ id: number }>(
                IS_PG
                  ? `INSERT INTO subsidiaries (tenant_id, enterprise_id, name, code) VALUES (@tenantId, @enterpriseId, @name, @code) RETURNING id`
                  : `INSERT INTO subsidiaries (tenant_id, enterprise_id, name, code) OUTPUT INSERTED.id VALUES (@tenantId, @enterpriseId, @name, @code)`,
                { tenantId, enterpriseId, name: subsidiaryName, code: subsidiaryCode }
              );
              subsidiaryId = inserted[0].id;
              subsidiaryWasCreated = true;
            }
            subsidiaryCache.set(subsidiaryKey, subsidiaryId as number);
          }
        }

        if (!directionName) {
          const wasCreated = subsidiaryName ? subsidiaryWasCreated : enterpriseWasCreated;
          results.push({
            line,
            label: subsidiaryName ? `${enterpriseName} / ${subsidiaryName}` : enterpriseName,
            status: wasCreated ? 'created' : 'skipped',
            message: subsidiaryName
              ? wasCreated ? 'Filiale créée' : 'Filiale déjà existante'
              : wasCreated ? 'Entreprise créée' : 'Entreprise déjà existante',
          });
          if (wasCreated) created++;
          continue;
        }

        const directionKey = `${enterpriseId}:${directionName.toLowerCase()}`;
        let directionId = directionCache.get(directionKey);
        let directionWasCreated = false;
        if (!directionId) {
          const existing = await DatabaseService.query<{ id: number }>(
            `SELECT id FROM directions WHERE tenant_id = @tenantId AND enterprise_id = @enterpriseId AND (LOWER(name) = @name OR (code IS NOT NULL AND code = @code))`,
            { tenantId, enterpriseId, name: directionName.toLowerCase(), code: directionCode }
          );
          if (existing.length > 0) {
            directionId = existing[0].id;
          } else {
            const inserted = await DatabaseService.query<{ id: number }>(
              IS_PG
                ? `INSERT INTO directions (tenant_id, enterprise_id, subsidiary_id, name, code) VALUES (@tenantId, @enterpriseId, @subsidiaryId, @name, @code) RETURNING id`
                : `INSERT INTO directions (tenant_id, enterprise_id, subsidiary_id, name, code) OUTPUT INSERTED.id VALUES (@tenantId, @enterpriseId, @subsidiaryId, @name, @code)`,
              { tenantId, enterpriseId, subsidiaryId, name: directionName, code: directionCode }
            );
            directionId = inserted[0].id;
            directionWasCreated = true;
          }
          directionCache.set(directionKey, directionId);
        }

        if (!serviceName) {
          results.push({
            line,
            label: `${enterpriseName} / ${directionName}`,
            status: directionWasCreated ? 'created' : 'skipped',
            message: directionWasCreated ? 'Direction créée' : 'Direction déjà existante',
          });
          if (directionWasCreated) created++;
          continue;
        }

        const existingService = await DatabaseService.query<{ id: number }>(
          `SELECT id FROM services WHERE tenant_id = @tenantId AND direction_id = @directionId AND (LOWER(name) = @name OR (code IS NOT NULL AND code = @code))`,
          { tenantId, directionId, name: serviceName.toLowerCase(), code: serviceCode }
        );

        if (existingService.length > 0) {
          results.push({ line, label: `${enterpriseName} / ${directionName} / ${serviceName}`, status: 'skipped', message: 'Service déjà existant' });
          continue;
        }

        await DatabaseService.execute(
          `INSERT INTO services (tenant_id, direction_id, name, code) VALUES (@tenantId, @directionId, @name, @code)`,
          { tenantId, directionId, name: serviceName, code: serviceCode }
        );
        created++;
        results.push({ line, label: `${enterpriseName} / ${directionName} / ${serviceName}`, status: 'created', message: 'Service créé' });
      } catch (error: any) {
        results.push({ line, label: enterpriseName, status: 'error', message: error.message || 'Erreur inconnue' });
      }
    }

    await AuditService.log(tenantId, req.user!.id, 'ORGANIZATION_IMPORTED', 'organizations', null, { rows: rows.length, created });

    res.json({ success: true, data: { total: rows.length, created, results } });
  } catch (error) {
    next(error);
  }
});

// ==================== USERS ====================

router.get('/users/template', authenticate, authorize('admin', 'director'), async (req, res, next) => {
  try {
    const buffer = await buildXlsxTemplate(
      'Utilisateurs',
      [
        { header: 'email' },
        { header: 'displayName' },
        { header: 'role' },
        { header: 'enterpriseCode' },
        { header: 'subsidiaryCode' },
        { header: 'directionCode' },
        { header: 'serviceCode' },
        { header: 'supervisorEmail' },
      ],
      [
        ['marie.martin@entreprise.com', 'Marie Martin', 'supervisor', 'DEMO', '', 'TECH', 'ENG', ''],
        ['jean.dupont@entreprise.com', 'Jean Dupont', 'agent', 'DEMO', '', 'TECH', 'ENG', 'marie.martin@entreprise.com'],
      ],
      [
        'email et displayName sont obligatoires.',
        "role doit être l'une des valeurs : agent, externe, stagiaire, supervisor, manager, director, admin, super_admin (les deux derniers requièrent des droits suffisants ; externe et stagiaire ont les mêmes droits qu'agent).",
        'Les colonnes *Code sont optionnelles et doivent correspondre à un code existant (voir le modèle Organisation) ; laissez vide si non applicable. Le niveau le plus bas suffit : un serviceCode renseigne aussi la direction, la filiale et l\'entreprise.',
        "supervisorEmail (optionnel) attribue un superviseur direct à cet utilisateur — l'email doit correspondre à un utilisateur existant (ou déjà présent plus haut dans ce même fichier) ayant un rôle strictement supérieur.",
        'Un mot de passe temporaire est généré automatiquement pour chaque utilisateur importé.',
        "Les emails déjà enregistrés sont ignorés (marqués 'skipped'), l'import est donc rejouable sans risque de doublons.",
      ]
    );
    sendXlsx(res, 'modele_utilisateurs.xlsx', buffer);
  } catch (error) {
    next(error);
  }
});

// ==================== COURSES ====================

router.get('/courses/template', authenticate, authorize('admin', 'director', 'manager'), async (req, res, next) => {
  try {
    const buffer = await buildXlsxTemplate(
      'Cours',
      [
        { header: 'title' },
        { header: 'description' },
        { header: 'category' },
        { header: 'level' },
        { header: 'durationMin' },
        { header: 'isPublished' },
      ],
      [
        ['Sécurité informatique', 'Sensibilisation aux risques numériques', 'compliance', 'beginner', 45, 'non'],
        ['Onboarding managers', 'Parcours pour les nouveaux managers', 'hr', 'intermediate', 90, 'oui'],
      ],
      [
        'title est obligatoire.',
        "category : code ou nom d'une catégorie existante (Administration > Affectations > Catégories), vide = aucune.",
        'level doit être : beginner, intermediate, advanced ou expert (par défaut beginner).',
        'isPublished : oui/non (par défaut non — le cours reste en brouillon).',
        'Un cours déjà existant avec le même titre est ignoré (import rejouable).',
      ]
    );
    sendXlsx(res, 'modele_cours.xlsx', buffer);
  } catch (error) {
    next(error);
  }
});

router.post('/courses', authenticate, authorize('admin', 'director', 'manager'), upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    const rows = await readUploadedRows(req);
    const tenantId = req.user!.tenantId;

    const existingTitles = await DatabaseService.query<{ title: string }>(
      'SELECT title FROM courses WHERE tenant_id = @tenantId',
      { tenantId }
    );
    const knownTitles = new Set(existingTitles.map((c) => c.title.toLowerCase()));

    const results: RowResult[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const line = i + 2;
      const row = rows[i];
      const title = (row.title || '').trim();

      if (!title) {
        results.push({ line, label: '(sans titre)', status: 'error', message: 'title est requis' });
        continue;
      }
      if (knownTitles.has(title.toLowerCase())) {
        results.push({ line, label: title, status: 'skipped', message: 'Un cours avec ce titre existe déjà' });
        continue;
      }

      const level = (row.level || 'beginner').trim();
      if (!['beginner', 'intermediate', 'advanced', 'expert'].includes(level)) {
        results.push({ line, label: title, status: 'error', message: `Niveau invalide "${level}"` });
        continue;
      }

      let category: string | null;
      try {
        category = await CategoryService.resolveForCourse(tenantId, row.category);
      } catch {
        results.push({ line, label: title, status: 'error', message: `Catégorie inconnue "${row.category}"` });
        continue;
      }

      try {
        const course = await CourseService.create({
          tenantId,
          title,
          description: row.description || undefined,
          category: category ?? undefined,
          level,
          duration: row.durationMin ? parseInt(row.durationMin, 10) : undefined,
          createdBy: req.user!.id,
        });

        if (truthy(row.isPublished)) {
          await DatabaseService.execute(
            `UPDATE courses SET is_published = ${db.bool(true)} WHERE id = @id AND tenant_id = @tenantId`,
            { id: course.id, tenantId }
          );
        }

        knownTitles.add(title.toLowerCase());
        created++;
        results.push({ line, label: title, status: 'created', message: 'Cours créé' });
      } catch (error: any) {
        results.push({ line, label: title, status: 'error', message: error.message || 'Erreur inconnue' });
      }
    }

    await AuditService.log(tenantId, req.user!.id, 'COURSES_IMPORTED', 'courses', null, { rows: rows.length, created });

    res.json({ success: true, data: { total: rows.length, created, results } });
  } catch (error) {
    next(error);
  }
});

// ==================== LESSONS ====================

router.get('/lessons/template', authenticate, authorize('admin', 'director', 'manager'), async (req, res, next) => {
  try {
    const buffer = await buildXlsxTemplate(
      'Lecons',
      [
        { header: 'courseTitle' },
        { header: 'moduleTitle' },
        { header: 'lessonTitle' },
        { header: 'durationMin' },
      ],
      [
        ['Sécurité informatique', 'Les bases', 'Reconnaître le phishing', 20],
        ['Sécurité informatique', 'Les bases', 'Choisir un mot de passe solide', 15],
      ],
      [
        'courseTitle doit correspondre exactement au titre d\'un cours déjà existant (voir le modèle Cours — importez-le d\'abord).',
        'moduleTitle est créé automatiquement s\'il n\'existe pas encore sous ce cours.',
        'lessonTitle est obligatoire. Une leçon déjà existante avec le même titre dans le même module est ignorée (import rejouable).',
      ]
    );
    sendXlsx(res, 'modele_lecons.xlsx', buffer);
  } catch (error) {
    next(error);
  }
});

router.post('/lessons', authenticate, authorize('admin', 'director', 'manager'), upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    const rows = await readUploadedRows(req);
    const tenantId = req.user!.tenantId;

    const moduleCache = new Map<string, number>();
    const results: RowResult[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const line = i + 2;
      const row = rows[i];
      const courseTitle = (row.courseTitle || '').trim();
      const moduleTitle = (row.moduleTitle || '').trim();
      const lessonTitle = (row.lessonTitle || '').trim();
      const label = [courseTitle, moduleTitle, lessonTitle].filter(Boolean).join(' / ') || '(ligne vide)';

      if (!courseTitle || !moduleTitle || !lessonTitle) {
        results.push({ line, label, status: 'error', message: 'courseTitle, moduleTitle et lessonTitle sont requis' });
        continue;
      }

      try {
        const courses = await DatabaseService.query<{ id: number }>(
          'SELECT id FROM courses WHERE tenant_id = @tenantId AND LOWER(title) = @title',
          { tenantId, title: courseTitle.toLowerCase() }
        );
        if (courses.length === 0) {
          results.push({ line, label, status: 'error', message: `Cours "${courseTitle}" introuvable — importez-le d'abord` });
          continue;
        }
        const courseId = courses[0].id;

        const moduleKey = `${courseId}:${moduleTitle.toLowerCase()}`;
        let moduleId = moduleCache.get(moduleKey);
        if (!moduleId) {
          const existingModules = await DatabaseService.query<{ id: number }>(
            'SELECT id FROM modules WHERE course_id = @courseId AND LOWER(title) = @title',
            { courseId, title: moduleTitle.toLowerCase() }
          );
          if (existingModules.length > 0) {
            moduleId = existingModules[0].id;
          } else {
            const maxPos = await DatabaseService.query<{ max_pos: number }>(
              'SELECT COALESCE(MAX(position), 0) as max_pos FROM modules WHERE course_id = @courseId',
              { courseId }
            );
            const newModule = await ModuleService.create({
              tenantId,
              courseId,
              title: moduleTitle,
              position: maxPos[0].max_pos + 1,
            });
            moduleId = newModule.id;
          }
          moduleCache.set(moduleKey, moduleId);
        }

        const existingLessons = await DatabaseService.query<{ id: number }>(
          'SELECT id FROM lessons WHERE module_id = @moduleId AND LOWER(title) = @title',
          { moduleId, title: lessonTitle.toLowerCase() }
        );
        if (existingLessons.length > 0) {
          results.push({ line, label, status: 'skipped', message: 'Une leçon avec ce titre existe déjà dans ce module' });
          continue;
        }

        const maxLessonPos = await DatabaseService.query<{ max_pos: number }>(
          'SELECT COALESCE(MAX(position), 0) as max_pos FROM lessons WHERE module_id = @moduleId',
          { moduleId }
        );

        await LessonService.create({
          tenantId,
          moduleId,
          title: lessonTitle,
          position: maxLessonPos[0].max_pos + 1,
          durationMin: row.durationMin ? parseInt(row.durationMin, 10) : undefined,
        });

        created++;
        results.push({ line, label, status: 'created', message: 'Leçon créée' });
      } catch (error: any) {
        results.push({ line, label, status: 'error', message: error.message || 'Erreur inconnue' });
      }
    }

    await AuditService.log(tenantId, req.user!.id, 'LESSONS_IMPORTED', 'lessons', null, { rows: rows.length, created });

    res.json({ success: true, data: { total: rows.length, created, results } });
  } catch (error) {
    next(error);
  }
});

// ==================== QUIZZES ====================

const QUESTION_TYPES = ['mcq', 'true_false', 'short_text', 'essay'];

router.get('/quizzes/template', authenticate, authorize('admin', 'director', 'manager'), async (req, res, next) => {
  try {
    const buffer = await buildXlsxTemplate(
      'Quiz',
      [
        { header: 'courseTitle' },
        { header: 'lessonTitle' },
        { header: 'quizTitle' },
        { header: 'passingScore' },
        { header: 'questionType' },
        { header: 'questionPrompt' },
        { header: 'questionPoints' },
        { header: 'choice1' },
        { header: 'choice1Correct' },
        { header: 'choice2' },
        { header: 'choice2Correct' },
        { header: 'choice3' },
        { header: 'choice3Correct' },
        { header: 'choice4' },
        { header: 'choice4Correct' },
      ],
      [
        ['Sécurité informatique', 'Reconnaître le phishing', 'Quiz phishing', 70, 'mcq', 'Que faire face à un email suspect ?', 1, 'Cliquer sur le lien pour vérifier', 'non', 'Le signaler et le supprimer', 'oui', 'Répondre pour demander confirmation', 'non', '', ''],
        ['Sécurité informatique', 'Reconnaître le phishing', 'Quiz phishing', 70, 'true_false', 'Un mot de passe unique par site est recommandé', 1, 'Vrai', 'oui', 'Faux', 'non', '', '', '', ''],
      ],
      [
        'Une ligne = une question. Toutes les lignes partageant le même quizTitle sous la même leçon forment le même quiz.',
        'courseTitle et lessonTitle doivent correspondre à un cours et une leçon déjà existants (importez-les d\'abord).',
        'Le quiz est créé automatiquement à la première question rencontrée (passingScore n\'est utilisé qu\'à la création).',
        'questionType : mcq, true_false, short_text ou essay.',
        'Pour mcq/true_false, remplissez choice1..choice4 (labels) et les colonnes *Correct associées (oui/non) — laissez vide les choix inutilisés.',
        'Pour short_text/essay, les colonnes choice* sont ignorées.',
      ]
    );
    sendXlsx(res, 'modele_quiz.xlsx', buffer);
  } catch (error) {
    next(error);
  }
});

router.post('/quizzes', authenticate, authorize('admin', 'director', 'manager'), upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    const rows = await readUploadedRows(req);
    const tenantId = req.user!.tenantId;

    const quizCache = new Map<string, number>();
    const results: RowResult[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const line = i + 2;
      const row = rows[i];
      const courseTitle = (row.courseTitle || '').trim();
      const lessonTitle = (row.lessonTitle || '').trim();
      const quizTitle = (row.quizTitle || '').trim();
      const questionType = (row.questionType || '').trim();
      const questionPrompt = (row.questionPrompt || '').trim();
      const label = [quizTitle, questionPrompt].filter(Boolean).join(' — ') || '(ligne vide)';

      if (!courseTitle || !lessonTitle || !quizTitle || !questionType || !questionPrompt) {
        results.push({ line, label, status: 'error', message: 'courseTitle, lessonTitle, quizTitle, questionType et questionPrompt sont requis' });
        continue;
      }
      if (!QUESTION_TYPES.includes(questionType)) {
        results.push({ line, label, status: 'error', message: `questionType invalide "${questionType}"` });
        continue;
      }

      try {
        const lessons = await DatabaseService.query<{ id: number }>(
          `SELECT l.id FROM lessons l
           JOIN modules m ON l.module_id = m.id
           JOIN courses c ON m.course_id = c.id
           WHERE c.tenant_id = @tenantId AND LOWER(c.title) = @courseTitle AND LOWER(l.title) = @lessonTitle`,
          { tenantId, courseTitle: courseTitle.toLowerCase(), lessonTitle: lessonTitle.toLowerCase() }
        );
        if (lessons.length === 0) {
          results.push({ line, label, status: 'error', message: `Leçon "${lessonTitle}" introuvable sous "${courseTitle}" — importez-la d'abord` });
          continue;
        }
        const lessonId = lessons[0].id;

        const quizKey = `${lessonId}:${quizTitle.toLowerCase()}`;
        let quizId = quizCache.get(quizKey);
        if (!quizId) {
          const existingQuizzes = await DatabaseService.query<{ id: number }>(
            'SELECT id FROM quizzes WHERE lesson_id = @lessonId AND LOWER(title) = @title',
            { lessonId, title: quizTitle.toLowerCase() }
          );
          if (existingQuizzes.length > 0) {
            quizId = existingQuizzes[0].id;
          } else {
            // Columns left empty take the organization's quiz defaults.
            const defaults = await TenantSettingsService.get(tenantId);
            const passingScore = row.passingScore ? parseInt(row.passingScore, 10) : defaults.quizDefaultPassingScore;
            const maxAttempts = defaults.quizDefaultMaxAttempts > 0 ? defaults.quizDefaultMaxAttempts : null;
            const inserted = await DatabaseService.query<{ id: number }>(
              IS_PG
                ? `INSERT INTO quizzes (tenant_id, lesson_id, title, passing_score, max_attempts)
                   VALUES (@tenantId, @lessonId, @title, @passingScore, @maxAttempts) RETURNING id`
                : `INSERT INTO quizzes (tenant_id, lesson_id, title, passing_score, max_attempts)
                   OUTPUT INSERTED.id VALUES (@tenantId, @lessonId, @title, @passingScore, @maxAttempts)`,
              { tenantId, lessonId, title: quizTitle, passingScore, maxAttempts }
            );
            quizId = inserted[0].id;
          }
          quizCache.set(quizKey, quizId);
        }

        const maxPos = await DatabaseService.query<{ max_pos: number }>(
          'SELECT COALESCE(MAX(position), 0) as max_pos FROM questions WHERE quiz_id = @quizId',
          { quizId }
        );
        const points = row.questionPoints ? parseInt(row.questionPoints, 10) : 1;

        const insertedQuestion = await DatabaseService.query<{ id: number }>(
          IS_PG
            ? `INSERT INTO questions (tenant_id, quiz_id, type, prompt, position, points)
               VALUES (@tenantId, @quizId, @type, @prompt, @position, @points) RETURNING id`
            : `INSERT INTO questions (tenant_id, quiz_id, type, prompt, position, points)
               OUTPUT INSERTED.id VALUES (@tenantId, @quizId, @type, @prompt, @position, @points)`,
          { tenantId, quizId, type: questionType, prompt: questionPrompt, position: maxPos[0].max_pos + 1, points }
        );
        const questionId = insertedQuestion[0].id;

        if (questionType === 'mcq' || questionType === 'true_false') {
          let choicePos = 1;
          for (let c = 1; c <= 4; c++) {
            const choiceLabel = (row[`choice${c}`] || '').trim();
            if (!choiceLabel) continue;
            await DatabaseService.execute(
              `INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
               VALUES (@tenantId, @questionId, @label, @isCorrect, @position)`,
              {
                tenantId,
                questionId,
                label: choiceLabel,
                isCorrect: truthy(row[`choice${c}Correct`]),
                position: choicePos++,
              }
            );
          }
        }

        created++;
        results.push({ line, label, status: 'created', message: 'Question ajoutée' });
      } catch (error: any) {
        results.push({ line, label, status: 'error', message: error.message || 'Erreur inconnue' });
      }
    }

    await AuditService.log(tenantId, req.user!.id, 'QUIZZES_IMPORTED', 'quizzes', null, { rows: rows.length, created });

    res.json({ success: true, data: { total: rows.length, created, results } });
  } catch (error) {
    next(error);
  }
});

export default router;
