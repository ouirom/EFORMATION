# Prompt de développement — Plateforme de formation en ligne (LMS) en React

## Contexte
Tu es un développeur/architecte full-stack expert en React et en systèmes de gestion de formation (LMS). Tu dois concevoir et développer une application de formation en ligne évoluée, avec une gestion fine des utilisateurs, des contenus pédagogiques, des quiz et une traçabilité complète des actions (logs).

L'application doit être robuste, sécurisée, modulaire et évolutive, avec une séparation claire frontend (React) / backend (API REST ou GraphQL) / base de données.

---

## 1. Rôles et profils utilisateurs

- **Administrateur** : gestion complète (utilisateurs, contenus, formations, paramétrage, logs, sécurité).
- **Manager / Responsable** : suivi des formations de son équipe/périmètre (progression, résultats de quiz, temps passé), sans droits d'administration globale.
- **Formateur / Créateur de contenu** : création et édition des formations, documents, quiz.
- **Apprenant (utilisateur final)** : suit les formations, consulte les documents, passe les quiz.

Prévoir un système de rôles et permissions (RBAC) extensible.

---

## 2. Authentification et gestion des comptes

Trois modes de connexion doivent être supportés, configurables par l'administrateur :

1. **Inscription/enregistrement direct** : création de compte stocké dans la base applicative (email + mot de passe hashé, ex. bcrypt/argon2, avec politique de mot de passe configurable).
2. **Connexion via annuaire LDAP / Active Directory** : authentification déléguée à un serveur LDAP externe (paramètres de connexion : host, port, base DN, filtre de recherche, mapping des attributs utilisateur).
3. **Connexion via API externe (SSO/API tierce)** : intégration avec un système d'identité externe. Définir un **contrat de données attendu** (payload JSON) :
   ```json
   {
     "externalId": "string",
     "email": "string",
     "firstName": "string",
     "lastName": "string",
     "role": "string",
     "department": "string",
     "token": "string"
   }
   ```
   Prévoir la validation du token (JWT ou équivalent) et la synchronisation/mise à jour du profil utilisateur local.

### Gestion de session
- À la connexion, l'utilisateur est rattaché à une **session active**.
- Durée de session : **5 minutes d'inactivité** avant expiration (paramétrable côté admin).
- **Avertissement à 1 minute** de l'expiration : affichage d'un compte à rebours (modal) proposant de prolonger la session ou de se déconnecter.
- Expiration automatique avec redirection vers la page de connexion et sauvegarde de la progression en cours (ex. position dans un document/vidéo, réponses de quiz en cours).
- Gestion multi-onglets/multi-appareils (option : session unique ou sessions multiples selon configuration).

---

## 3. Gestion des formations et des contenus

- Une **formation** est composée de **modules/chapitres**, chacun rattaché à un ou plusieurs **documents pédagogiques** :
  - PowerPoint (.ppt/.pptx)
  - PDF
  - Lien vidéo (upload direct ou lien externe type YouTube/Vimeo/stream interne)
  - Autres formats (Word, images, SCORM si besoin d'évolutivité)
- Ces documents sont centralisés dans une **médiathèque / bibliothèque de contenus** (media box), avec :
  - Métadonnées (titre, description, type, taille, date d'ajout, auteur, version)
  - Système de versionning des documents
  - Prévisualisation intégrée (viewer PDF, viewer PPT, lecteur vidéo)
- Structuration d'un parcours : formation → modules → documents → quiz (optionnel par module ou en fin de formation).
- Gestion des prérequis entre formations/modules (parcours conditionnels).

---

## 4. Moteur de quiz

- Banque de questions par formation/module.
- **Ordre des questions aléatoire** à chaque tentative (et éventuellement ordre des réponses aléatoire).
- Tirage aléatoire d'un sous-ensemble de questions dans la banque (paramétrable : nombre de questions à tirer).
- Types de questions : QCM simple, QCM multiple, vrai/faux, texte libre (optionnel).
- Paramétrage : nombre de tentatives autorisées, score minimum de réussite, temps limite par question/quiz, affichage ou non de la correction.
- Génération d'un score et d'un statut (réussi/échoué) transmis au module de suivi.

---

## 5. Journalisation (Logs) et traçabilité

Système de logs consultable par les administrateurs et les managers (sur leur périmètre), avec filtres (utilisateur, période, formation, type d'action) et export (CSV/Excel/PDF).

Catégories de logs à implémenter :

1. **Logs de décision / logs applicatifs** : actions administratives (création/modification/suppression d'utilisateurs, formations, permissions).
2. **Logs de traitement** : actions techniques/système (traitements batch, imports, synchronisations LDAP/API, erreurs système).
3. **Logs de formation** : suivi de la progression (formation démarrée, module terminé, formation complétée, date/heure, durée).
4. **Logs de quiz** : tentative démarrée, réponses données, score obtenu, nombre de tentatives, date/heure.
5. **Logs de lecture des documents** :
   - Durée totale de consultation par document et par utilisateur
   - Nombre de fois consulté (nombre d'ouvertures)
   - Statut d'achèvement (lu entièrement / partiellement, % de progression pour vidéo/PDF)
   - Horodatage de chaque consultation

Chaque log doit contenir a minima : `userId`, `action`, `contextId` (formation/module/document/quiz), `timestamp`, `metadata` (JSON libre selon le type).

---

## 6. Tableaux de bord et reporting

- **Dashboard administrateur** : vue globale (nombre d'utilisateurs, formations actives, taux de complétion global, alertes).
- **Dashboard manager** : suivi de son équipe (progression individuelle, scores de quiz, temps passé, formations en retard/non commencées).
- **Dashboard apprenant** : ses formations en cours, à faire, terminées, ses résultats de quiz, son historique.
- Graphiques (courbes de progression, taux de réussite, temps moyen par formation) — librairie type Recharts ou Chart.js.
- Export de rapports (PDF/Excel) par utilisateur, par formation ou global.

---

## 7. Architecture technique attendue

- **Frontend** : React (avec React Router, gestion d'état via Redux Toolkit ou Zustand/Context selon complexité), TypeScript recommandé, UI via un design system (Tailwind CSS + composants type shadcn/ui ou Material UI).
- **Backend** : API REST (Node.js/Express ou NestJS) ou GraphQL, avec couche d'authentification modulaire (stratégies : local, LDAP, API/SSO — pattern type Passport.js).
- **Base de données** : relationnelle (PostgreSQL/MySQL) pour les données structurées (utilisateurs, formations, logs) ; éventuellement stockage objet (S3 ou équivalent) pour les documents/vidéos.
- **Gestion des sessions** : JWT avec refresh token + mécanisme d'expiration/renouvellement côté client (intercepteur Axios + timer de session).
- **Sécurité** : chiffrement des mots de passe, protection CSRF/XSS, validation des entrées, gestion des rôles/permissions au niveau API (middleware).
- **Scalabilité** : architecture modulaire permettant l'ajout futur de nouveaux modes d'authentification, types de contenus ou types de logs.

---

## 8. Modèle de données (suggestion — à adapter)

Entités principales : `User`, `Role`, `Session`, `Formation`, `Module`, `Document`, `Quiz`, `Question`, `Reponse`, `TentativeQuiz`, `LogLecture`, `LogFormation`, `LogQuiz`, `LogAdmin`, `LogTraitement`.

Décrire les relations clés (1-N, N-N) avant l'implémentation, notamment :
- `User` N-N `Formation` (via table de progression)
- `Formation` 1-N `Module` 1-N `Document`
- `Formation`/`Module` 1-N `Quiz` 1-N `Question`

---

## 9. Exigences non fonctionnelles

- Responsive design (desktop, tablette, mobile).
- Accessibilité (WCAG AA minimum).
- Performance : chargement différé (lazy loading) des documents lourds (vidéos, PPT).
- Internationalisation (i18n) si besoin multilingue.
- Journalisation persistante et non modifiable (intégrité des logs à des fins d'audit).
- Conformité RGPD (gestion des données personnelles, droit à l'oubli, consentement).

---

## 10. Livrables attendus du développement

1. Architecture technique détaillée (schéma) et choix de stack justifiés.
2. Modèle de données finalisé (schéma relationnel).
3. Maquettes/wireframes des écrans clés (connexion, dashboard, catalogue de formations, lecteur de document, quiz, back-office logs).
4. Spécification des endpoints API (contrats d'entrée/sortie).
5. Application React fonctionnelle avec les modules décrits ci-dessus.
6. Documentation technique (installation, configuration LDAP/API, administration).

---

## 11. Relecture de code, tests, débogage, sécurité et correction

Après chaque module développé (et avant de passer au suivant), applique systématiquement le processus suivant :

### 11.1 Relecture de code (code review)
- Vérifier la cohérence avec l'architecture définie (respect des couches, séparation des responsabilités frontend/backend).
- Contrôler la lisibilité (nommage explicite, typage TypeScript strict, absence de duplication, respect des conventions du projet — ESLint/Prettier configurés).
- Vérifier la gestion des erreurs (try/catch, retours d'erreurs API cohérents, messages utilisateurs clairs sans exposer de détails techniques sensibles).
- Vérifier qu'aucune donnée sensible (mot de passe, token, secret) n'est loggée ou exposée côté client.
- Produire un compte-rendu de relecture listant : points bloquants, points d'amélioration, points conformes.

### 11.2 Tests
- **Tests unitaires** : composants React (Jest + React Testing Library) et fonctions métier backend (services, contrôleurs).
- **Tests d'intégration** : parcours critiques (connexion via les 3 modes, gestion de session/expiration, lecture d'un document avec génération du log, passage d'un quiz avec tirage aléatoire, remontée des logs dans un dashboard).
- **Tests end-to-end (E2E)** : Cypress ou Playwright sur les scénarios utilisateurs complets (apprenant, manager, administrateur).
- **Tests de non-régression** : à chaque évolution, rejouer les suites existantes avant merge.
- Définir un seuil de couverture de code minimal (ex. 80 % sur la logique métier critique : auth, sessions, logs, quiz).
- Fournir un rapport de test (résultats, couverture, cas en échec).

### 11.3 Débogage
- Pour toute anomalie détectée : reproduire le bug, isoler la cause racine (logs, breakpoints, stack trace), corriger, puis ajouter un test de non-régression correspondant.
- Documenter chaque bug corrigé : contexte, cause, correctif, impact.
- Mettre en place une gestion centralisée des erreurs côté backend (middleware d'erreur) et côté frontend (error boundaries React) pour faciliter le diagnostic.

### 11.4 Analyse de sécurité
- Vérifier l'authentification et les sessions : robustesse du hachage des mots de passe, expiration/renouvellement correct des tokens, protection contre le rejeu de session.
- Vérifier les 3 modes de connexion : validation stricte des payloads API externes, protection contre l'injection LDAP, gestion sécurisée des secrets de connexion (variables d'environnement, pas de valeurs en dur).
- Contrôler les protections standards : injection SQL, XSS, CSRF, IDOR (accès à des ressources d'autrui via manipulation d'ID), rate limiting sur les endpoints sensibles (login, quiz).
- Vérifier la gestion des permissions (RBAC) à chaque endpoint API, pas seulement côté UI.
- Vérifier l'intégrité et l'immuabilité des logs (traçabilité fiable à des fins d'audit, horodatage serveur et non client).
- Vérifier la conformité RGPD (minimisation des données, chiffrement des données sensibles au repos et en transit — HTTPS/TLS).
- Utiliser des outils d'analyse statique/dépendances (ex. `npm audit`, Snyk, ESLint security plugin) et consigner les vulnérabilités identifiées avec leur criticité.

### 11.5 Correction
- Prioriser les corrections selon la criticité : sécurité critique > bug bloquant > bug mineur > amélioration.
- Toute correction doit être accompagnée d'un test associé validant la résolution.
- Après correction, rejouer l'ensemble des tests (non-régression) avant de considérer le module comme terminé.
- Tenir un changelog des corrections apportées (version, date, description, module concerné).

---

## 12. Configuration applicative

L'application doit exposer une interface d'administration (ou des fichiers de configuration sécurisés) permettant de paramétrer les éléments suivants sans nécessiter de redéploiement du code :

### 12.1 Paramètres d'envoi de mail
- Configuration d'un serveur **SMTP** générique : host, port, sécurité (SSL/TLS/STARTTLS), identifiant/mot de passe (stockés chiffrés, jamais en clair).
- Alternative : intégration de services d'envoi tiers (ex. SendGrid, Mailgun, Amazon SES) via clé API, au choix de l'administrateur.
- Paramétrage de l'expéditeur (nom affiché, adresse "from", adresse "reply-to").
- Gestion de **modèles d'e-mails (templates)** personnalisables pour les notifications :
  - Création de compte / bienvenue
  - Réinitialisation de mot de passe
  - Rappel de formation à échéance / non commencée
  - Notification de fin de session imminente (optionnel, en complément de l'alerte in-app)
  - Résultat de quiz (réussite/échec)
  - Alertes destinées aux managers (retard de formation d'un membre de l'équipe)
- Mécanisme de test d'envoi (bouton "Envoyer un e-mail de test") depuis l'écran de configuration.
- File d'attente d'envoi (queue) avec gestion des échecs et tentatives de renvoi (retry), et journalisation des envois (succès/échec) — à relier au système de logs (section 5).

### 12.2 Connexion à la base de données
L'application doit supporter, au choix lors de l'installation/configuration, plusieurs SGBD relationnels :
- **MySQL / MariaDB**
- **PostgreSQL**
- **SQL Server (MSSQL)**

Exigences :
- Utiliser une couche d'abstraction (ORM tel que Prisma, TypeORM ou Sequelize) permettant de changer de SGBD sans réécrire la logique métier, via un simple changement de configuration/driver.
- Paramètres de connexion configurables (via interface d'administration et/ou variables d'environnement) : type de SGBD, host, port, nom de la base, utilisateur, mot de passe (chiffré), options SSL, pool de connexions (taille min/max, timeout).
- Bouton de **test de connexion** avant validation de la configuration.
- Gestion des migrations de schéma compatible multi-SGBD (scripts de migration versionnés).
- Stratégie de sauvegarde/restauration documentée (indépendante de l'application, à la charge de l'infrastructure, mais avec recommandations selon le SGBD choisi).
- Aucune information de connexion sensible ne doit apparaître en clair dans les logs ou dans le code source (utilisation d'un coffre-fort de secrets / variables d'environnement).

---

### Instruction finale
En t'appuyant sur ce cahier des charges, propose d'abord une architecture technique et un modèle de données, puis développe l'application module par module en commençant par : authentification & sessions → gestion des formations/documents → moteur de quiz → système de logs → tableaux de bord.

Pour chaque module livré, applique le processus décrit en section 11 (relecture, tests, débogage, analyse de sécurité, correction) avant de passer au module suivant, et fournis un compte-rendu synthétique (relecture, résultats de tests, vulnérabilités trouvées/corrigées). Signale toute ambiguïté ou hypothèse que tu poses avant de coder.
