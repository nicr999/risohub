// e2e/tests/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows error for wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@test.com');
    await page.getByLabel('Password').fill('WrongPass123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|unauthori/i)).toBeVisible({ timeout: 8000 });
  });

  test('admin can log in and reach dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@risohome.co.uk');
    await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
    await expect(page.getByText(/dashboard|projects|overview/i)).toBeVisible();
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout clears session', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@risohome.co.uk');
    await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });

    // Logout
    await page.getByRole('button', { name: /logout|sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // Confirm session gone
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });
});
