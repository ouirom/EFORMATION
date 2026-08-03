# Correction: Sélection de Questions pour les Quizzes - Issue Resolved

## 🔴 Problème Identifié
Les utilisateurs ne pouvaient pas sélectionner les questions lors de la création/gestion d'un quiz. Le formulaire de sélection de questions n'affichait aucune question disponible ou affichait une erreur silencieuse.

## ✅ Analyse et Corrections

### **1. Backend - Endpoint `/api/v1/quizzes/:id/available-questions`**

#### Problème Principal
L'endpoint n'effectuait pas les vérifications suivantes:
- Ne vérifiait pas que le quiz appartient au tenant de l'utilisateur
- La requête SQL recherchait les questions où `quiz_id IS NULL` au lieu d'exclure le quiz actuel

#### Corrections Apportées
**Fichier**: `backend/src/routes/quiz.routes.ts` (lignes 144-168)

```typescript
// AVANT: Recherche de questions non assignées (quiz_id IS NULL)
// APRÈS: Récupération de toutes les questions sauf celles du quiz actuel
AND (q.quiz_id IS NULL OR q.quiz_id != @quizId)

// AVANT: Pas de vérification du quiz
// APRÈS: Vérification que le quiz appartient au tenant
const quizzes = await DatabaseService.query<any>(
  'SELECT id FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
  { quizId, tenantId: req.user!.tenantId }
);
if (quizzes.length === 0) {
  throw NotFoundError('Quiz');
}
```

### **2. Backend - Endpoints de Gestion des Questions**

Vérifications similaires ajoutées aux endpoints:
- **POST** `/api/v1/quizzes/:id/add-questions` (ligne 176-180)
- **POST** `/api/v1/quizzes/:id/remove-question/:questionId` (ligne 239-245)
- **POST** `/api/v1/quizzes/:id/reorder-question` (ligne 294-300)

Chaque endpoint vérifie maintenant:
```typescript
// Verify quiz exists and belongs to tenant
const quizzes = await DatabaseService.query<any>(
  'SELECT id FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
  { quizId, tenantId: req.user!.tenantId }
);
if (quizzes.length === 0) {
  throw NotFoundError('Quiz');
}
```

### **3. Frontend - Composant `QuizQuestionSelector.tsx`**

#### Problèmes
- Pas de gestion des erreurs lors du chargement
- Pas d'affichage d'erreurs 403 (Forbidden) lorsque l'utilisateur n'avait pas les permissions
- Messages d'erreur silencieux causant la confusion

#### Corrections Apportées
**Fichier**: `frontend/src/components/QuizQuestionSelector.tsx`

1. **Capture des Erreurs**
   ```typescript
   const { data: availableData, isLoading: availableLoading, error: availableError } = useQuery({
     queryKey: ['available-questions', quizId],
     queryFn: async () => {
       const response = await api.get(`/quizzes/${quizId}/available-questions`);
       return response.data;
     },
     retry: 1,  // Réessayer une fois en cas d'erreur
   });
   ```

2. **Détection des Erreurs de Permission**
   ```typescript
   const isPermissionError = 
     (availableError as any)?.response?.status === 403 ||
     (quizError as any)?.response?.status === 403;
   ```

3. **Affichage des Messages d'Erreur Utiles**
   - Message spécifique pour les erreurs 403 (Forbidden)
   - Message générique pour les autres erreurs
   - Icône AlertTriangle pour attirer l'attention

4. **Interface Améliorée**
   - Désactivation des champs lors du chargement
   - Messages contextuels clairs (ex: "Aucune question disponible" vs "Aucun résultat pour votre recherche")
   - Gestion gracieuse des cas limites

## 🔧 Détails Techniques

### Hiérarchie des Rôles
L'endpoint `/available-questions` nécessite les rôles:
- `admin` (niveau 5)
- `director` (niveau 4)
- `manager` (niveau 3)

Les rôles inférieurs (supervisor, agent) recevront une erreur **403 Forbidden** avec le message:
> "Vous n'avez pas les permissions nécessaires pour gérer les questions de ce quiz. Seuls les administrateurs, directeurs et responsables peuvent effectuer cette action."

### Données Retournées

**Requête successful (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "mcq",
      "prompt": "Quelle est la capitale de la France?",
      "choice_count": 4
    }
  ]
}
```

**Erreur 403**:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions"
  }
}
```

**Erreur 404 (Quiz not found)**:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Quiz not found"
  }
}
```

## 🧪 Tests Recommandés

1. **Test avec Admin** ✓
   - Créer un quiz
   - Accéder à la page de sélection des questions
   - Vérifier que les questions non sélectionnées s'affichent

2. **Test avec Rôle Insuffisant**
   - Se connecter avec un utilisateur ayant le rôle `agent` ou `supervisor`
   - Tentér d'accéder à la page de sélection
   - Vérifier le message d'erreur 403

3. **Test d'Ajout/Suppression**
   - Cocher une question
   - Vérifier que la mutation POST est appelée
   - Vérifier que la question disparaît de la liste

4. **Test de Recherche**
   - Entrer un texte de recherche
   - Vérifier le filtrage en temps réel

## 📝 Fichiers Modifiés

| Fichier | Lignes | Type | Description |
|---------|--------|------|-------------|
| `backend/src/routes/quiz.routes.ts` | 144-168 | Route GET | Endpoint /available-questions |
| `backend/src/routes/quiz.routes.ts` | 176-180 | Route POST | Endpoint /add-questions |
| `backend/src/routes/quiz.routes.ts` | 239-245 | Route POST | Endpoint /remove-question |
| `backend/src/routes/quiz.routes.ts` | 294-300 | Route POST | Endpoint /reorder-question |
| `frontend/src/components/QuizQuestionSelector.tsx` | 1-197 | Component | Gestion complète + UI |

## ✨ Améliorations Supplémentaires

- Ajout du hook `retry: 1` pour les requêtes
- Amélioration de l'UX avec des messages clairs
- Vérifications de sécurité au niveau du backend
- Gestion cohérente des états de chargement et d'erreur

## 🚀 Status

- ✅ Backend: Correctif appliqué et compilé avec succès
- ✅ Frontend: Composant mis à jour avec gestion d'erreurs
- ✅ Sécurité: Vérifications d'autorisation renforcées
- ✅ UX: Messages d'erreur clairs et utiles
