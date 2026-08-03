# Fonctionnalité: Sélection de Questions pour les Quizzes

## Vue d'ensemble
Permet aux administrateurs et gestionnaires de sélectionner les questions spécifiques qui constitueront un quiz, avec support complet pour:
- Création de nouveaux quizzes avec sélection de questions
- Gestion des questions existantes d'un quiz
- Réorganisation (déplacement haut/bas) des questions
- Suppression de questions d'un quiz
- Recherche de questions

## Modifications du Backend

### Routes API (backend/src/routes/quiz.routes.ts)

#### 1. GET `/api/v1/quizzes/:id/available-questions`
- **Description**: Récupère les questions disponibles pour sélection
- **Auth**: Required (admin, director, manager)
- **Réponse**: Array de questions avec id, type, prompt, choice_count

#### 2. POST `/api/v1/quizzes/:id/add-questions`
- **Description**: Ajoute une ou plusieurs questions à un quiz
- **Body**: `{ questionIds: number[] }`
- **Auth**: Required (admin, director, manager)
- **Réponse**: Quiz mis à jour avec questions

#### 3. POST `/api/v1/quizzes/:id/remove-question/:questionId`
- **Description**: Retire une question d'un quiz et réordonne les positions
- **Auth**: Required (admin, director, manager)

#### 4. POST `/api/v1/quizzes/:id/reorder-question`
- **Description**: Déplace une question vers le haut ou le bas
- **Body**: `{ questionId: number, direction: 'up' | 'down' }`
- **Auth**: Required (admin, director, manager)

## Modifications du Frontend

### Composants

#### QuizQuestionSelector.tsx
- Composant réutilisable pour sélectionner des questions
- Features:
  - Recherche de questions en temps réel
  - Checkbox pour sélectionner/désélectionner
  - Boutons "Ajouter tout" / "Supprimer tout"
  - Affiche type de question et nombre de choix
  - Max-height avec scroll

#### checkbox.tsx
- Nouveau composant UI Checkbox
- Support de `onCheckedChange` callback

### Pages

#### QuizCreatePage.tsx
- Crée un nouveau quiz avec formulaire
- Champs: titre, description, instructions, score min, limite temps, randomized
- Après création, affiche le sélecteur de questions
- Redirection vers la page de gestion après fermeture

#### QuizManageQuestionsPage.tsx
- Gère les questions d'un quiz existant
- Features:
  - Affiche toutes les questions du quiz
  - Boutons pour déplacer haut/bas
  - Bouton pour supprimer
  - Affiche les choix et réponses correctes
  - Bouton pour ajouter/masquer le sélecteur

#### LessonQuizzesPage.tsx
- Liste tous les quizzes d'une leçon
- Affiche nb questions et score de passage
- Bouton pour créer un nouveau quiz
- Bouton pour gérer les questions
- Bouton pour supprimer

## Flux d'utilisation

### Créer un nouveau quiz avec questions
1. Cliquer sur "Créer un quiz"
2. Remplir le formulaire (titre, description, etc.)
3. Le quiz est créé
4. Le sélecteur de questions s'affiche automatiquement
5. Sélectionner les questions désirées
6. Fermer le sélecteur

### Gérer les questions d'un quiz existant
1. Aller à la page des quizzes de la leçon
2. Cliquer sur "Gérer" pour le quiz
3. Voir toutes les questions avec leurs positions
4. Déplacer les questions avec les flèches haut/bas
5. Supprimer des questions
6. Ajouter de nouvelles questions avec le bouton "+ Ajouter des questions"

## Notes technique

- Les questions peuvent être réutilisées dans plusieurs quizzes
- Chaque question dans un quiz a une position qui détermine l'ordre
- Les questions supprimées d'un quiz ne sont pas supprimées de la base de données
- Les choix et réponses sont affichés lors de la gestion
- Support multi-tenant intégré

## Fichiers créés/modifiés

**Créés:**
- `frontend/src/components/QuizQuestionSelector.tsx`
- `frontend/src/components/ui/checkbox.tsx`
- `frontend/src/pages/QuizCreatePage.tsx`
- `frontend/src/pages/QuizManageQuestionsPage.tsx`
- `frontend/src/pages/LessonQuizzesPage.tsx`

**Modifiés:**
- `backend/src/routes/quiz.routes.ts` - Ajout des 4 nouvelles routes

## Intégration requise
- Ajouter les routes au router principal:
  - `/lessons/:lessonId/quizzes`
  - `/lessons/:lessonId/quiz/create`
  - `/quizzes/:quizId/manage-questions`

