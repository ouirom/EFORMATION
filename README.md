# E-Formation - Plateforme de Formation en Ligne

Une plateforme complète de e-learning multi-tenant pour entreprises, avec IA pédagogique, visioconférence, chat, gamification et notifications multicanales.

## 🚀 Fonctionnalités

### 📚 Gestion des Formations
- Création et organisation de cours, modules et leçons
- Contenus multimédias (vidéo, PDF, SCORM, H5P)
- Quiz et évaluations avec auto-correction
- Parcours de formation personnalisés

### 🤖 Intelligence Artificielle
- Génération automatique de contenu pédagogique
- Assistant IA pour les apprenants
- Recommandations personnalisées
- Création automatique de quiz

### 💬 Communication
- Chat intégré en temps réel (avec pièces jointes)
- Visioconférence intégrée via LiveKit (jetons signés côté serveur, config par tenant), avec enregistrement de session
- Tableaux blancs collaboratifs
- Salles de sous-groupes (breakout rooms)

### 🏆 Gamification
- Badges et récompenses
- Certificats avec QR code, filigrane et templates personnalisables
- Classements et leaderboards
- Points d'expérience (XP)

### 👥 Organisation
- Équipes (teams) transverses, indépendantes de la hiérarchie organisationnelle
- Libellés de poste personnalisables (CRUD), distincts du rôle applicatif

### 📢 Notifications Multicanales
- Email
- SMS (Twilio)
- WhatsApp (Twilio)
- Push notifications (Firebase/VAPID)

### 🔐 Sécurité & Administration
- Multi-tenant avec hiérarchie organisationnelle
- RBAC (8 rôles : super_admin, admin, director, manager, supervisor, agent, externe, stagiaire)
- SSO (Azure AD, Google) et LDAP/Active Directory
- Conformité RGPD
- Journalisation et audit

### 📊 Analytics & Rapports
- Tableaux de bord interactifs
- Rapports personnalisables
- Export PDF, Excel, CSV
- Rapports planifiés

## 🛠️ Technologies

### Backend
- **Runtime**: Node.js avec TypeScript
- **Framework**: Express.js
- **Base de données**: PostgreSQL (via Knex) — SQL Server pris en charge en fallback pour les instances en authentification Windows uniquement (voir `DB_CLIENT` dans `.env.example`)
- **Cache**: Redis
- **File Storage**: disque local (`UPLOAD_DIR`)
- **Real-time**: Socket.IO
- **Video**: LiveKit (auto-hébergé ou LiveKit Cloud)
- **AI**: OpenAI GPT-4
- **Monitoring**: Sentry (optionnel, activé via `SENTRY_DSN`)

### Frontend
- **Framework**: React 18 avec TypeScript
- **Build**: Vite
- **Styling**: TailwindCSS
- **UI Components**: Radix UI
- **State**: Zustand + TanStack Query
- **Routing**: React Router v6

## 📋 Prérequis

- Node.js 18+
- PostgreSQL 14+ (ou SQL Server 2019+ en fallback, voir `DB_CLIENT`)
- Redis (optionnel, pour le cache)
- Compte OpenAI (pour les fonctionnalités IA)
- Compte Twilio (pour SMS/WhatsApp)
- Compte Firebase (pour les notifications push)
- Projet LiveKit (Cloud ou auto-hébergé, pour la visioconférence)

## 🚀 Installation

### 1. Cloner le repository

```bash
git clone https://github.com/votre-org/e-formation.git
cd e-formation
```

### 2. Installer les dépendances

```bash
# Installation des dépendances (backend + frontend)
npm install
```

### 3. Configuration

Copier le fichier `.env.example` et le renommer en `.env` :

```bash
cd backend
cp .env.example .env
```

Configurer les variables d'environnement :

Le fichier `.env.example` documente l'intégralité des variables (LDAP, LiveKit, Sentry, etc.) avec leur valeur par défaut et une explication en commentaire — voici les plus importantes pour un premier démarrage :

```env
# Application
NODE_ENV=development
PORT=3001

# Database — 'pg' (défaut) route via Knex vers PostgreSQL ; 'mssql' reste disponible
# en fallback pour les instances SQL Server en authentification Windows uniquement.
DB_CLIENT=pg
DB_HOST=localhost
DB_PORT=5432
DB_NAME=db_eformation
DB_USER=postgres
DB_PASSWORD=

# JWT — valeurs uniques et non par défaut obligatoires hors développement/test
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@eformation.com

# Twilio (SMS/WhatsApp)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=+1234567890

# Firebase (Push Notifications)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase@your-project.iam.gserviceaccount.com
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# LiveKit (visioconférence)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
```

### 4. Initialiser la base de données

```bash
# Créer la base puis charger le schéma de référence (PostgreSQL)
psql -U postgres -c "CREATE DATABASE db_eformation"
psql -U postgres -d db_eformation -f db/bci_lms_schema_postgres.sql

# Appliquer ensuite les migrations incrémentales, dans l'ordre numérique
# (pas de runner automatique — chaque fichier de db/migrations/*.sql
# s'applique manuellement, par exemple via un script node ponctuel utilisant `pg`)
```

### 5. Lancer l'application

```bash
# Mode développement (backend + frontend)
npm run dev

# Ou séparément :
npm run dev:backend  # Backend sur http://localhost:3001
npm run dev:frontend # Frontend sur http://localhost:3000
```

## 📁 Structure du Projet

```
e-formation/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration
│   │   ├── middleware/      # Middlewares Express
│   │   ├── routes/          # Routes API
│   │   ├── services/        # Services métier
│   │   ├── socket/          # Socket.IO handlers
│   │   ├── types/           # Types TypeScript
│   │   └── utils/           # Utilitaires
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Composants React
│   │   ├── contexts/        # Contextes React
│   │   ├── layouts/         # Layouts de page
│   │   ├── lib/             # Utilitaires
│   │   ├── pages/           # Pages de l'application
│   │   └── services/        # Services API
│   ├── package.json
│   └── vite.config.ts
├── db/
│   └── bci_lms_schema_sqlserver.sql
└── package.json
```

## 🔌 API Endpoints

### Authentification
```
POST   /api/v1/auth/register          # Inscription
POST   /api/v1/auth/login             # Connexion
POST   /api/v1/auth/logout            # Déconnexion
POST   /api/v1/auth/refresh           # Rafraîchir le token
POST   /api/v1/auth/forgot-password   # Mot de passe oublié
POST   /api/v1/auth/reset-password    # Réinitialiser le mot de passe
```

### Cours
```
GET    /api/v1/courses                # Liste des cours
POST   /api/v1/courses                # Créer un cours
GET    /api/v1/courses/:id            # Détails d'un cours
PUT    /api/v1/courses/:id            # Modifier un cours
DELETE /api/v1/courses/:id            # Supprimer un cours
POST   /api/v1/courses/:id/enroll     # S'inscrire à un cours
```

### Modules & Leçons
```
GET    /api/v1/modules/:courseId      # Modules d'un cours
POST   /api/v1/modules                # Créer un module
GET    /api/v1/lessons/:moduleId      # Leçons d'un module
POST   /api/v1/lessons                # Créer une leçon
```

### Quiz
```
GET    /api/v1/quizzes/:lessonId      # Quiz d'une leçon
POST   /api/v1/quizzes                # Créer un quiz
POST   /api/v1/attempts               # Soumettre une tentative
GET    /api/v1/attempts/:id           # Résultat d'une tentative
```

### Chat
```
GET    /api/v1/chat/conversations     # Liste des conversations
POST   /api/v1/chat/conversations     # Créer une conversation
GET    /api/v1/chat/messages/:convId  # Messages d'une conversation
POST   /api/v1/chat/messages          # Envoyer un message
```

### Sessions Live
```
GET    /api/v1/live-sessions          # Liste des sessions
POST   /api/v1/live-sessions          # Créer une session
POST   /api/v1/live-sessions/:id/join # Rejoindre une session
```

### Notifications
```
GET    /api/v1/notifications          # Liste des notifications
PUT    /api/v1/notifications/:id/read # Marquer comme lu
POST   /api/v1/notifications/push/subscribe # S'abonner aux push
```

### IA
```
POST   /api/v1/ai/generate-outline    # Générer un plan de cours
POST   /api/v1/ai/generate-content    # Générer du contenu
POST   /api/v1/ai/generate-quiz       # Générer un quiz
POST   /api/v1/ai/tutor               # Assistant IA
```

### Analytics
```
GET    /api/v1/analytics/dashboard    # Tableau de bord
GET    /api/v1/analytics/users        # Analytics utilisateurs
GET    /api/v1/analytics/courses      # Analytics cours
```

## 🔒 Rôles et Permissions

| Rôle       | Description                              |
|------------|------------------------------------------|
| admin      | Accès complet à toutes les fonctionnalités |
| director   | Gestion d'une Direction et ses Services  |
| manager    | Gestion d'un Service                     |
| supervisor | Supervision d'une équipe                 |
| agent      | Utilisateur standard (apprenant)         |

## 📱 WebSocket Events

### Chat
- `chat:join` - Rejoindre une conversation
- `chat:message` - Nouveau message
- `chat:typing` - Indicateur de frappe

### Live Session
- `live:join` - Rejoindre une session
- `live:signal` - Signaux WebRTC
- `live:whiteboard` - Actions tableau blanc

### Notifications
- `notification:new` - Nouvelle notification

## 🧪 Tests

```bash
# Tests backend
cd backend
npm test

# Tests frontend
cd frontend
npm test
```

## 🚀 Déploiement

### Docker

```bash
docker-compose up -d
```

### Production

```bash
# Build
npm run build

# Start
npm start
```

## 📝 License

MIT © 2025 E-Formation
# EFORMATION
