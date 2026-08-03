# Debug: Selected Questions Not Working - Fixed

## Issues Found and Fixed

### 1. **QuizQuestionSelector - State Management Issue**
**File**: `frontend/src/components/QuizQuestionSelector.tsx`

**Problem**: The `handleRemoveAll()` function was clearing the selected questions array AFTER calling mutations, but the state wasn't being properly synchronized.

**Fix Applied**:
```typescript
// BEFORE: State cleared after mutations (race condition)
const handleRemoveAll = () => {
  selectedQuestions.forEach((id) => {
    removeQuestionMutation.mutate(id);
  });
  setSelectedQuestions([]);  // ❌ Cleared too late
};

// AFTER: State cleared first, then mutations called
const handleRemoveAll = () => {
  const questionsToRemove = [...selectedQuestions];
  setSelectedQuestions([]);  // ✅ Clear immediately
  questionsToRemove.forEach((id) => {
    removeQuestionMutation.mutate(id);
  });
};
```

### 2. **Added Error Logging to Mutations**
**File**: `frontend/src/components/QuizQuestionSelector.tsx`

Added `onError` callbacks to both mutations to log API errors:

```typescript
const addQuestionsMutation = useMutation({
  mutationFn: (questionIds: number[]) =>
    api.post(`/quizzes/${quizId}/add-questions`, { questionIds }),
  onSuccess: () => {
    console.log('Questions added successfully');  // ✅ Log success
    queryClient.invalidateQueries({ queryKey: ['quiz', quizId] });
    queryClient.invalidateQueries({ queryKey: ['available-questions', quizId] });
  },
  onError: (error: any) => {
    console.error('Error adding questions:', error.response?.data || error.message);  // ✅ Log error
  },
});
```

### 3. **Fixed QuizManageQuestionsPage Mutation Signature**
**File**: `frontend/src/pages/QuizManageQuestionsPage.tsx`

**Problem**: The reorder mutation had incorrect TypeScript signature - useMutation only accepts a single parameter.

**Fix Applied**:
```typescript
// BEFORE: ❌ Multiple parameters not allowed
mutationFn: (questionId: number, direction: 'up' | 'down') => 
  api.post(...)

// AFTER: ✅ Single parameter with object destructuring
mutationFn: ({ questionId, direction }: { questionId: number; direction: 'up' | 'down' }) =>
  api.post(...)

// Update calls:
// BEFORE: ❌ reorderQuestionMutation.mutate(questionId, 'up')
// AFTER: ✅ reorderQuestionMutation.mutate({ questionId, direction: 'up' })
```

## How to Test the Fixes

### 1. **Test Adding Questions**
```
1. Go to: /quizzes/:quizId/manage-questions
2. Click "Ajouter des questions"
3. Check the browser console (F12 → Console tab)
4. Click a checkbox to select a question
5. Should see: "Questions added successfully"
6. Question should be added to the quiz immediately
```

### 2. **Test Removing Questions**
```
1. In the same dialog, uncheck a selected question
2. Check the browser console
3. Should see: "Question removed successfully"
4. Question should disappear from the quiz
```

### 3. **Test Add All / Remove All**
```
1. Click "Ajouter tout" to add all questions
2. Check console for success messages
3. Click "Supprimer tout" to remove all
4. Should see multiple "Question removed successfully" messages
```

### 4. **Debug Errors**
If selections don't work:
1. Open Browser DevTools (F12)
2. Go to **Console** tab
3. Look for error messages like:
   - "Error adding questions: ..."
   - "Error removing question: ..."
4. Also check the **Network** tab to see if API calls are being sent:
   - POST `/api/v1/quizzes/:id/add-questions`
   - POST `/api/v1/quizzes/:id/remove-question/:questionId`

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Checkboxes don't toggle | API error (403 Forbidden) | Check user role - must be admin/director/manager |
| Changes disappear after refresh | Questions added but not persisted | Check backend logs |
| Multiple mutations fail | Rate limiting or network issues | Try adding questions one at a time |
| Button text doesn't change | React state not updating | Clear browser cache and hard refresh |

## Files Modified

1. ✅ `frontend/src/components/QuizQuestionSelector.tsx`
   - Fixed `handleRemoveAll()` state timing
   - Added error logging to mutations
   
2. ✅ `frontend/src/pages/QuizManageQuestionsPage.tsx`
   - Fixed `reorderQuestionMutation` function signature
   - Updated handler calls with correct parameter format

## Next Steps

1. **Rebuild the frontend**:
   ```bash
   cd d:\PROJECT\EFORMATION\frontend
   npm run build
   ```

2. **Restart the dev server**:
   ```bash
   npm run dev
   ```

3. **Test the functionality** by selecting/deselecting questions

4. **Check the console** for any error messages (F12 → Console)

5. **If errors persist**, share the error messages from the console and network tab for further debugging

## Status

✅ Code changes applied and compiled successfully
✅ Type safety improved in mutation handlers
✅ Better error logging for debugging
✅ State management fixed

The selected questions should now work correctly. If you still experience issues, check the browser console for error messages.
