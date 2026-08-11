# E-Formation — Handoff

État réel du projet, à jour au 2026-08-10. Ce document complète (et corrige par endroits)
`README.md`, qui décrit l'intention initiale du projet plutôt que son état actuel — par exemple
il documente encore SQL Server comme base de données principale, alors que **le backend réel
tourne sur PostgreSQL depuis le 2026-08-09** (voir plus bas).

**Mise à jour 2026-08-10 (suite) :** les trois points signalés plus haut dans la première version
de ce document ont été traités : les 9 fichiers non suivis sont maintenant commités, la dérive de
schéma est corrigée (schéma SQL Server resynchronisé + 12 tables manquantes créées sur les deux
bases), et les deux "fonctionnalités incomplètes" (PDF de certificat, routes de notification
admin) sont en fait fonctionnelles — voir [Historique récent](#historique-récent-derniers-commits)
pour le détail. Seuls le chat et l'upload d'icône de badge restent ouverts, voir plus bas.

---

## Démarrage rapide

```bash
npm install                 # à la racine — installe backend + frontend
npm run dev                 # backend (port 3001) + frontend (port 3000) en parallèle
```

Ou séparément : `npm run dev:backend` / `npm run dev:frontend`.

**Base de données** : PostgreSQL 18 en service Windows local (pas de Docker), base
`db_eformation`. `backend/.env` (gitignored, jamais committé) contient déjà
`DB_CLIENT=pg` + les identifiants — rien à configurer pour relancer sur cette machine.
Voir [Base de données](#base-de-données--postgresql-actif-sql-server-en-repli) pour l'historique
et comment revenir à SQL Server si besoin.

**Connexion** : la page de connexion propose 6 comptes de démonstration en un clic
(Super Admin, Admin, Director, Manager, Supervisor, Agent), tous avec le mot de passe
`Admin123!`.

**Tests** : `cd backend && npm test` → 19 suites / 114 tests, doivent tous passer.
`npx tsc --noEmit` doit être propre côté `backend/` et côté `frontend/`.

---

## Architecture

| | |
|---|---|
| Backend | Node.js + TypeScript, Express, Socket.IO (chat/live temps réel) |
| Frontend | React 18 + TypeScript, Vite, TailwindCSS, Radix UI, TanStack Query, React Router v6 |
| Base de données | PostgreSQL (actif) via Knex.js, SQL Server (repli, driver natif `mssql`) |
| Auth | JWT (access + refresh), + SSO (`oauth.service.ts`) et LDAP (`ldap.service.ts`) |

Répertoires clés :
- `backend/src/routes/` — un fichier par domaine (users, courses, chat, live-session, badges, notifications, certificates, admin...)
- `backend/src/database/db-helpers.ts` — couche d'abstraction SQL portable (voir ci-dessous)
- `frontend/src/pages/` — une page par route, `frontend/src/pages/admin/` pour l'espace admin
- `db/bci_lms_schema_postgres.sql` et `db/bci_lms_schema_sqlserver.sql` — schémas complets et synchronisés (71 tables chacun), tous deux générés par introspection de la base SQL Server réelle (voir [Base de données](#base-de-données--postgresql-actif-sql-server-en-repli))

Un guide utilisateur avec capture d'écran de chaque page de l'application (généré en pilotant
Chrome sur l'app réelle) a été produit le 2026-08-10 — demander si besoin, il n'est pas dans le
dépôt (fichier `.docx` envoyé directement).

---

## Base de données — PostgreSQL actif, SQL Server en repli

Le backend a été rendu portable entre SGBD via Knex.js (`backend/src/database/knex.ts`,
`backend/src/database/db-helpers.ts`), puis réellement basculé sur PostgreSQL le 2026-08-09.
Contrôlé par `DB_CLIENT` dans `.env` (`pg` ou `mssql`, défaut `mssql` si absent).

- Les **576 points d'accès SQL brut** du backend sont tous dialect-aware (plus de
  `SYSUTCDATETIME`/`OUTPUT INSERTED.id`/`OPENJSON`/`ISNULL`/`TOP` non branché qui traînerait hors
  d'un bloc `IS_PG`).
- **Toutes les données réelles ont été migrées** (920 lignes / 59 tables) vers Postgres via
  `db/scripts/migrate_data_to_postgres.js`. SQL Server n'a pas été touché — repasser dessus est
  un simple changement de `DB_CLIENT=mssql` dans `.env`, sans perte de données d'un côté ou de
  l'autre.
- Les deux schémas committés sont **générés par introspection de la base SQL Server réelle**
  (`sys.tables`/`sys.columns`/`sys.foreign_keys`), jamais édités à la main. SQL Server est le
  schéma "source" par convention (c'est lui qui reçoit les nouveaux `db/migrations/*.sql`), et
  Postgres est traduit à partir de lui. Pour régénérer les deux depuis `backend/` :
  ```
  node ../db/scripts/dump_mssql_schema.js ../db/scripts/.tmp
  node ../db/scripts/gen_mssql_schema.js ../db/scripts/.tmp
  node ../db/scripts/gen_pg_schema.js ../db/scripts/.tmp
  ```
  Ça régénère les *fichiers* `.sql` — ça n'applique rien. Pour SQL Server, rejouer le fichier
  généré via `sqlcmd` (guardé `IF OBJECT_ID(...) IS NULL`, sans danger à ré-exécuter). Pour
  Postgres, il n'y a pas d'équivalent générique "rejoue tout le fichier" une fois que des tables
  existent déjà des deux côtés — les `ALTER TABLE ADD CONSTRAINT` ne sont pas idempotents côté
  Postgres. `db/scripts/apply_new_tables_to_postgres.js` montre le pattern utilisé pour ajouter
  seulement les tables/colonnes réellement nouvelles à la base Postgres live sans toucher à
  l'existant — à adapter (ou écrire un script similaire) si de nouvelles tables sont ajoutées côté
  SQL Server plus tard.
- **Piège connu et corrigé** : `node-pg` renvoie les colonnes `BIGINT` (tous les `id`, et tout
  `COUNT(*)`) comme des **chaînes**, pas des nombres — contrairement au driver mssql. Un
  `pg.types.setTypeParser(20, parseInt)` global dans `backend/src/database/knex.ts` corrige ça,
  mais si un nouveau bug de type "addition qui concatène au lieu d'additionner" apparaît, c'est
  le premier suspect.
- **Un seul exécuteur de migration Knex existe** (`npm run migrate:latest` dans `backend/`,
  config `backend/knexfile.ts`), et il ne couvre qu'**une seule migration de preuve**
  (`backend/src/database/003_core_missing_tables.ts`) — **il ne recrée pas les 71 tables**. Pour
  provisionner une base Postgres fraîche, il faut appliquer `db/bci_lms_schema_postgres.sql`
  directement (`psql`), pas compter sur `npm run migrate:latest`. Par ailleurs le script racine
  `npm run db:migrate` (dans `package.json` à la racine) appelle `cd backend && npm run migrate`
  — un script qui **n'existe pas** dans `backend/package.json` (qui a `migrate:latest`, pas
  `migrate`) ; ce raccourci racine est cassé, ne pas s'y fier.
- Les 11 fichiers `db/migrations/*.sql` (SQL Server, appliqués manuellement via
  `sqlcmd -S localhost -d db_eformation -E -i <file>`) restent la seule trace de comment le
  schéma SQL Server est arrivé à son état actuel. Ils ne sont **pas** rejoués par le pipeline
  Postgres — après en avoir appliqué un nouveau côté SQL Server, régénérer les deux fichiers
  `.sql` committés (commande ci-dessus) puis appliquer manuellement l'équivalent à la base
  Postgres live (voir `db/scripts/apply_new_tables_to_postgres.js` pour le pattern).

## Dérive de schéma (résolue le 2026-08-10)

Deux catégories étaient documentées ici, toutes deux corrigées :

1. **Colonnes/tables qui existaient réellement dans la base mais dans aucun fichier `.sql`
   committé** (`courses.category`/`level`/`duration`, `badges.badge_type`, etc.) — resynchronisé :
   `db/bci_lms_schema_sqlserver.sql` a désormais son propre générateur
   (`db/scripts/gen_mssql_schema.js`, même principe que `gen_pg_schema.js`) et les deux fichiers
   schéma sont maintenant réellement à jour avec la base live (71 tables chacun, vérifié appliqué
   proprement à la fois en no-op sur la base existante et from-scratch sur une base vide).

2. **Tables référencées par du code route/service mais qui n'existaient nulle part** —
   `ai_usage_logs`, `scheduled_reports`, `blog_categories`/`blog_tags`/`blog_post_tags`/
   `blog_comments` (+ 5 colonnes manquantes sur `blog_posts`), `push_subscriptions`,
   `user_devices`, `user_profiles`, `search_history`, `webhooks`/`webhook_deliveries` : créées via
   `db/migrations/011_missing_tables_and_blog_columns.sql` (SQL Server) puis répliquées sur la
   base Postgres live via `db/scripts/apply_new_tables_to_postgres.js`. `awarded_badges` était un
   cas à part : pas une table manquante mais du code mort référençant un ancien nom — remplacé par
   le vrai nom `user_badges` dans `analytics.routes.ts`/`report.routes.ts` (+ 3 bugs de nom de
   colonne trouvés au passage dans les mêmes requêtes : `badges.type`→`badge_type`,
   `enrollments.progress`→`progress_percent`, `audit_logs.resource_type/resource_id`→
   `entity/entity_id`). La table `webhook_subscriptions` (différente, orpheline, non utilisée par
   aucun code) a été laissée en place plutôt que supprimée sans certitude.

   Toutes ces routes sont maintenant vérifiées fonctionnelles en direct contre le backend réel
   (voir [Historique récent](#historique-récent-derniers-commits)).

---

## Fonctionnalités connues comme incomplètes ou cassées

- **Le bouton "Nouvelle conversation" du chat était mort** (aucun `onClick`) — **une tâche de
  fond est en cours sur ce point précis** au moment de la rédaction de ce document (voir
  [Travaux en cours](#travaux-en-cours-au-moment-de-la-rédaction)). Le point difficile n'est pas
  le câblage frontend mais qu'il n'existe aucune route backend permettant à un utilisateur
  non-admin de chercher un collègue à qui écrire (`GET /search/users` est restreinte à
  admin/director/manager) — il faut une nouvelle route respectant le même scoping de visibilité
  hiérarchique que celui corrigé sur `GET /users` (voir plus bas), sans quoi on rouvre la même
  fuite.
- **Upload d'icône de badge non câblé.** `badges.icon_file_id` existe en base mais n'est jamais
  renseigné (vérifié : les 6 badges réels ont tous `icon_file_id = NULL`) — pas d'UI pour
  associer un fichier à un badge.

Deux points listés ici dans une version précédente de ce document se sont révélés être des
faux positifs (l'un basé sur un grep périmé, l'autre sur des routes réellement absentes mais
dont le vrai fix était plus simple que prévu) — corrigés le 2026-08-10, détail dans
[Historique récent](#historique-récent-derniers-commits) :
- La génération de PDF de certificat **est** implémentée (`certificate.routes.ts`,
  `generateCertificatePDF`, pdfkit + QR code) — seuls les certificats seedés directement en base
  (hors de la route `POST /certificates`) n'avaient jamais eu leur PDF généré. Backfillé.
- `AdminNotificationsPage.tsx` appelait des routes inexistantes (`GET /notifications/all`,
  `POST /notifications/send`), mais le backend avait déjà `POST /notifications` et
  `POST /notifications/bulk` fonctionnels — il manquait juste la route de listing admin et le
  ciblage par rôle sur `/bulk`. Ajoutés, page réécrite contre le vrai schéma.

---

## Sécurité — actions manuelles requises

- **`backend/.env` a été committé avec de vraies valeurs par le passé** (mot de passe DB,
  `JWT_SECRET`, `JWT_REFRESH_SECRET`). Le suivi git a été arrêté et `.gitignore` mis à jour, mais
  ces valeurs restent lisibles dans l'historique git tant qu'il n'est pas réécrit. **Rotation
  manuelle nécessaire** avant tout passage en production — un garde-fou dans
  `backend/src/config/index.ts` empêche déjà de démarrer avec `NODE_ENV=production` et les
  secrets par défaut, mais ça ne protège pas contre la lecture de l'historique.
- Un correctif de sécurité réel a été appliqué cette session sur `backend/src/routes/live-session.routes.ts`
  (`POST /:id/end`) : la route ne vérifiait ni le propriétaire de la session ni le tenant — tout
  utilisateur authentifié pouvait terminer la session live de n'importe qui. Corrigé pour reprendre
  la même vérification que `POST /:id/start`. Si un nouveau endpoint est ajouté à ce fichier,
  vérifier qu'il a bien un contrôle d'appartenance équivalent.
- `GET /users` et `GET /users/:id` avaient une fuite de visibilité hiérarchique (un utilisateur
  pouvait voir ses pairs/supérieurs) — corrigée dans une session antérieure. Toute nouvelle route
  qui liste des utilisateurs doit reprendre ce même scoping plutôt que d'ouvrir `GET /users` à de
  nouveaux rôles.
- **Visioconférence intégrée (LiveKit) — nécessite un compte externe non fourni.** Le bouton
  "Rejoindre" d'une session live sans `meetingUrl` externe ouvre désormais une visioconférence
  intégrée (`LiveKitRoomEmbed.tsx` côté frontend, `POST /live-sessions/:id/livekit-token` côté
  backend). Le code est complet et testé (cf. `live-session.livekit.routes.test.ts`), mais il faut
  `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` dans `backend/.env` pour fonctionner — tant
  qu'ils sont absents, la route répond 500 avec un message clair au lieu de planter. Ces identifiants
  ne peuvent pas être générés automatiquement : il faut créer un compte sur https://cloud.livekit.io
  (gratuit jusqu'à un certain volume) et copier les 3 valeurs du projet.

---

## Hygiène du dépôt

`git status` signale encore :

- Des modifications non commitées, plus anciennes et sans rapport avec le travail récent :
  `backend/src/routes/course.routes.ts`, `frontend/src/pages/{DashboardPage,QuizPage,SearchPage}.tsx`,
  `frontend/src/pages/admin/{AdminCourseEditPage,AdminCoursesPage}.tsx`. À examiner avant de les
  committer ou de les écraser — ne pas supposer qu'elles sont sans conséquence.
- Deux fichiers markdown à la racine, quasi identiques : `prompt-specification-LMS-react.md` et
  `prompt-specification-LMS-react copy.md` — probablement un doublon à nettoyer.
- `.claude/settings.local.json` modifié — configuration locale de l'outillage, généralement pas à
  committer.
- `frontend/E-Formation_Guide_Utilisateur.docx` — le guide utilisateur généré le 2026-08-10, à la
  racine de `frontend/` par accident ; à déplacer ou supprimer, ce n'est pas un artefact de build.

---

## Historique récent (derniers commits)

```
ea9d929 Close the remaining "known gaps" from HANDOFF.md: certificate PDFs + admin notifications
b964edb Close the schema-drift gap: sync sqlserver schema file + create 12 tables real code needed
cd94c6c Commit 9 backend/frontend files the app was silently depending on
bcb01f6 Fix live-app bugs found while walking the whole application: bigint-as-string,
        notifications, badges schema mismatch, missing live-session flow
64684c8 Switch the real backend to PostgreSQL; fix /me route params + test isolation
ff63ba1 Add a complete PostgreSQL schema, generated from the live SQL Server DB
ce72530 Complete DBMS-portability conversion of the remaining backend files
96c2bc7 Redesign login page as a two-column layout
286510e Fix quiz-taking flow: implement missing POST /attempts/begin
420168d Fix password reset: actually send the email, fix field-name mismatch
61d8074 Extend DBMS-portability conversion to 6 more files
3500e27 Add DBMS-portability layer (Knex.js) validated on PostgreSQL
```

Le fil conducteur des dernières sessions : rendre le backend portable SQL Server ↔ PostgreSQL,
basculer réellement dessus avec les vraies données, puis parcourir l'application entière à la
recherche de bugs restants (chat, badges, sessions live, exports, notifications, schéma manquant,
certificats, centre de notifications admin) — cette dernière passe n'est toujours pas exhaustive :
le blog (contenu réel, au-delà du round-trip de vérification technique), les assignments et le
flux complet cours/leçon/quiz côté apprenant n'ont pas encore été revérifiés après le passage à
Postgres.

---

## Travaux en cours au moment de la rédaction

Une session en arrière-plan (`task_58cc8753`) est en train de câbler le bouton "Nouvelle
conversation" du chat (voir plus haut) — vérifier son état avant de reprendre ce point pour ne
pas dupliquer le travail.

---

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| Super Admin | superadmin@demo.local | Admin123! |
| Admin | admin@demo.local | Admin123! |
| Director | director@demo.local | Admin123! |
| Manager | manager@demo.local | Admin123! |
| Supervisor | supervisor@demo.local | Admin123! |
| Agent | agent@demo.local | Admin123! |

Le compte Admin a des données réalistes (cours, badges, XP) ; Super Admin a accès à la page
`/admin/platform` (gestion multi-organisations), inaccessible aux autres rôles.
