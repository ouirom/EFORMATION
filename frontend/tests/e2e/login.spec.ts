import { test, expect } from '@playwright/test';

// Smoke test for the local-account login flow: fill the form with a seeded demo
// account (see HANDOFF.md's demo accounts table), submit, and confirm the app
// redirects to /dashboard (AuthContext.applySession navigates there on success).
test.describe('Login', () => {
  test('logs in with a demo account and reaches the dashboard', async ({ page }) => {
    await page.goto('/login');

    // LoginPage.tsx renders three tabs (Local/SSO/LDAP); "Local" is the default
    // active tab, whose fields are labelled via <Label htmlFor> in French
    // (src/i18n/locales/fr/auth.json: login.email / login.password / login.submit).
    await page.getByLabel('Email').fill('director@demo.local');
    await page.getByLabel('Mot de passe').fill('Admin123!');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });
});
