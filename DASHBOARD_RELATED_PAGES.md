# Pages Liées au Tableau de Bord (Dashboard) - http://localhost:3000/dashboard

## 📊 Vue d'ensemble du Dashboard

Le Dashboard est la page d'accueil principale de l'application. Elle affiche un résumé personnalisé de la progression de l'utilisateur.

---

## 🔗 Pages Directement Liées

### 1. **Courses / Formations** 
- **URL**: `/courses`
- **Accès depuis le dashboard**: Bouton "Voir tout" dans la section "Continuer l'apprentissage"
- **Fichier**: `frontend/src/pages/CoursesPage.tsx`
- **Description**: Liste complète de tous les cours disponibles avec filtrage et recherche
- **Lien dans le dashboard**:
  ```
  - "Voir tout" button dans le header "Continuer l'apprentissage"
  - "Découvrir les formations" si aucun cours en cours
  - Clic sur une carte de cours redirige vers /courses/{id}
  ```

### 2. **Détail d'un Cours**
- **URL**: `/courses/{courseId}`
- **Accès depuis le dashboard**: Clic sur une carte de cours
- **Fichier**: `frontend/src/pages/CourseDetailPage.tsx`
- **Description**: Page détaillée d'un cours avec modules, leçons et quiz
- **Type de navigation**: Depuis les cartes de cours du dashboard

### 3. **Sessions en Direct (Live Sessions)**
- **URL**: `/live`
- **Accès depuis le dashboard**: "Voir toutes les sessions" dans la section "Sessions à venir"
- **Fichier**: `frontend/src/pages/LiveSessionsPage.tsx`
- **Description**: Liste des sessions en direct avec instructeurs
- **Données affichées sur le dashboard**: 2 sessions à venir avec titre, date, heure et instructeur

### 4. **Badges et Récompenses**
- **URL**: `/badges`
- **Accès depuis le dashboard**: Bouton "Voir tous les badges" dans la section "Mes Badges Obtenus"
- **Fichier**: `frontend/src/pages/BadgesPage.tsx`
- **Description**: Page complète des badges disponibles et gagnés
- **Affichage sur le dashboard**: 
  - Grille des badges gagnés (2 colonnes)
  - Compteur du nombre total de badges
  - Emoji animé pour chaque type de badge (🏆 🎓 ⭐ 🎖️)

---

## 📈 Données Affichées sur le Dashboard

### Section Statistiques (Haut de page)
```
- Formations inscrites
- Formations complétées
- Leçons démarrées
- Leçons complétées
- Temps total d'apprentissage (en heures et minutes)
- Nombre de badges obtenus
```

### Section Principale - Continuer l'apprentissage
```
- Cartes des 4 derniers cours inscrits
- Chaque carte affiche:
  - Catégorie du cours
  - Badge "Terminé" si complété
  - Titre du cours
  - Instructeur
  - Barre de progression
  - Nombre de leçons complétées
  - Durée du cours
  - Bouton "Continuer" ou "Revoir"
```

### Section Latérale Droite
```
1. Sessions à venir (2 affichées)
   - Titre de la session
   - Date et heure
   - Nom de l'instructeur
   - Bouton "Voir toutes les sessions"

2. Mes Badges Obtenus
   - Grille de badges avec animation
   - Nombre total de badges
   - Type de badge (Trophy, Quiz, Course, etc.)
   - Date d'attribution
   - Bouton "Voir tous les badges"

3. Classement (Leaderboard)
   - Top 3 utilisateurs
   - Rang (1er, 2e, 3e)
   - Nom
   - Points XP
   - Avatar
   - Indication si c'est vous
```

---

## 🌐 Routes et Navigation

### Depuis App.tsx
```typescript
<Route path="/" element={<Navigate to="/dashboard" replace />} />
<Route path="/dashboard" element={<DashboardPage />} />
```

### Navigation principale (MainLayout)
```
Navigation sidebar avec lien vers:
- Tableau de bord (Icône: LayoutDashboard)
- Formations
- Leçons
- Quizzes
- Sessions en direct
- Messages
- Notifications
- Badges
- Blog
- Recherche
```

---

## 🔄 Rafraîchissement des Données

Le dashboard utilise React Query avec les configurations suivantes:

### 1. **Statistiques du Dashboard**
- **QueryKey**: `['dashboard-stats']`
- **API**: `GET /api/v1/analytics/my-stats`
- **Intervalle**: Rafraîchissement toutes les 30 secondes
- **Durée de cache**: 10 secondes
- **Rafraîchissement au focus**: OUI

### 2. **Mes Cours**
- **QueryKey**: `['my-courses']`
- **API**: `GET /api/v1/courses?enrolled=true&limit=4`
- **Données enrichies**: 
  - Progression calculée (pourcentage)
  - Nombre de leçons complétées
  - Meilleur score
  - Statut de complétion
- **Intervalle**: Rafraîchissement toutes les 30 secondes
- **Durée de cache**: 10 secondes
- **Endpoint de progression**: `GET /api/v1/users/{userId}/progress`

### 3. **Badges de l'Utilisateur**
- **QueryKey**: `['my-badges-dashboard']`
- **API**: `GET /api/v1/users/me/badges`
- **Durée de cache**: 60 secondes

---

## 🎯 Pages Associées (Non directement liées mais thématiquement liées)

### Pages de Contenu
- **LessonPage** (`/lessons/{lessonId}`) - Invalide 'dashboard-stats' après complétion
- **QuizPage** (`/quizzes/{quizId}`) - Invalide 'dashboard-stats' après soumission
- **ChatPage** (`/chat`) - Chat avec instructeurs
- **NotificationsPage** (`/notifications`) - Notifications utilisateur
- **BlogPage** (`/blog`) - Articles de blog

### Pages Admin
- **AdminCourseEditPage** (`/admin/courses/{courseId}/edit`) - Gestion des cours (admin seulement)
- **AdminDashboard** - Tableau de bord admin avec analytics globales

---

## 📱 Responsive Design

Le dashboard est responsive avec:
- **Mobile**: Vue en colonne (1 colonne)
- **Tablet**: Vue hybride (2 colonnes)
- **Desktop**: Grille 3 colonnes (2 colonnes principal + 1 colonne latérale)

```css
Grid Layout:
- lg:grid-cols-3 (Desktop)
- lg:col-span-2 pour la section "Continuer l'apprentissage"
- col-span-1 pour le sidebar
```

---

## 🔐 Authentification et Permissions

Le dashboard est:
- ✅ **Protégé par authentification** - Requiert d'être connecté
- ✅ **Redirect par défaut** - "/" redirige vers "/dashboard"
- ✅ **Pour tous les rôles** - Admin, Director, Manager, Supervisor, Agent

Les pages admin (comme AdminCourseEditPage) requièrent les rôles: admin, director, manager

---

## 📊 APIs Utilisées par le Dashboard

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/v1/analytics/my-stats` | GET | Statistiques personnelles de l'utilisateur |
| `/api/v1/courses` | GET | Liste des cours (avec filtrage enrolled=true) |
| `/api/v1/users/{userId}/progress` | GET | Progression détaillée par cours |
| `/api/v1/users/me/badges` | GET | Badges de l'utilisateur connecté |

---

## 🎨 Composants Utilisés

- **Card**: Affichage des statistiques et sections
- **Progress**: Barres de progression des cours
- **Badge**: Catégories de cours, statut "Terminé"
- **Button**: Actions (Continuer, Voir tout, etc.)
- **Avatar**: Photos de profil dans le leaderboard
- **PageLoading**: Écran de chargement pendant l'initialisation
- **Icons** (Lucide): BookOpen, Clock, Award, Trophy, etc.

---

## 🚀 Utilisation

### Accès au Dashboard
```
1. URL directe: http://localhost:3000/dashboard
2. Après connexion (redirection automatique)
3. Clic sur "Tableau de bord" dans la navigation
```

### Actions depuis le Dashboard
```
✅ Consulter les statistiques personnelles
✅ Voir les cours en cours
✅ Continuer un cours
✅ Voir les sessions en direct
✅ Consulter les badges gagnés
✅ Voir le classement
✅ Accéder aux autres sections (Formations, Leçons, etc.)
```

---

## 📋 Fichiers Importants

| Fichier | Description |
|---------|-------------|
| `frontend/src/pages/DashboardPage.tsx` | Page principale du dashboard |
| `frontend/src/layouts/MainLayout.tsx` | Layout avec navigation |
| `frontend/src/App.tsx` | Routes et redirection |
| `frontend/src/services/api.ts` | Configuration des requêtes API |
| `frontend/src/contexts/AuthContext.tsx` | Context d'authentification |

