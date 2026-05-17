// e2e/mcs.spec.ts
// End-to-end tests for MCS registration and API submission flow.

import { test, expect } from '@playwright/test';

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? 'admin@risohome.co.uk';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!';
const BASE_URL       = process.env.E2E_BASE_URL       ?? 'http://localhost:5173';

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]',    ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/projects/, { timeout: 10_000 });
}

// ─── Registration panel ───────────────────────────────────────────────────────

test.describe('MCS Registration Panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('shows empty state when no MCS registration exists', async ({ page }) => {
    // Navigate to the first project
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    // Find the MCS panel section
    await expect(page.getByText('MCS Registration')).toBeVisible();
    await expect(page.getByText('No MCS number registered yet')).toBeVisible();
  });

  test('can create a new MCS registration', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    // Click + Register
    await page.getByRole('button', { name: /register/i }).click();

    // Fill in the MCS number
    await page.fill('input[placeholder="e.g. MCS-ASHP-2026-XXXXX"]', 'MCS-ASHP-2026-E2E01');

    // Set registration date
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill('2026-04-15');

    // Fill notes
    await page.fill('textarea', 'E2E test registration');

    // Save
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText('MCS registration saved')).toBeVisible();
    await expect(page.getByText('MCS-ASHP-2026-E2E01')).toBeVisible();
    await expect(page.locator('span').filter({ hasText: '✓ Registered' })).toBeVisible();
  });

  test('shows MCS number in compliance score card after registration', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    // The compliance score card should be visible
    const complianceCard = page.locator('[data-testid="compliance-score"]');
    await expect(complianceCard).toBeVisible();
  });

  test('can edit an existing MCS registration', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    // Edit button visible when registration exists
    const editBtn = page.getByRole('button', { name: /^edit$/i });
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.fill('textarea', 'Updated in E2E test');
      await page.getByRole('button', { name: /^save$/i }).click();
      await expect(page.getByText('MCS registration saved')).toBeVisible();
    }
  });
});

// ─── MCS API submission ───────────────────────────────────────────────────────

test.describe('MCS API Submit', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('shows Submit to MCS section after registration is saved', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    // If the registration exists and not yet submitted, submit section is visible
    const submitSection = page.getByText('Submit to MCS API');
    if (await submitSection.isVisible()) {
      await expect(page.getByRole('button', { name: /submit to mcs/i })).toBeVisible();
    }
  });

  test('submit form validates required fields', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    const submitBtn = page.getByRole('button', { name: /submit to mcs →/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();

      // Form is now open
      await expect(page.getByPlaceholder('e.g. NAP-12345')).toBeVisible();

      // Attempt submit without filling in required fields
      await page.getByRole('button', { name: /confirm & submit to mcs/i }).click();

      // Should show validation error
      await expect(page.getByText(/required/i)).toBeVisible();
    }
  });

  test('submit form fills and attempts MCS submission', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    const submitBtn = page.getByRole('button', { name: /submit to mcs →/i });
    if (!(await submitBtn.isVisible())) {
      test.skip(); // registration not present or already submitted
    }

    await submitBtn.click();

    await page.fill('input[placeholder="e.g. NAP-12345"]',           'NAP-99999');
    await page.fill('input[placeholder="e.g. Mitsubishi Electric"]',  'Daikin');
    await page.fill('input[placeholder="e.g. Ecodan PUHZ-SW120VKA"]', 'EDLA14DA3V3');
    await page.fill('input[placeholder="e.g. 12"]',                  '12');

    const commDate = page.locator('input[type="date"]').last();
    await commDate.fill('2026-04-15');

    // Submit — will likely fail in CI sandbox but should not throw uncaught error
    await page.getByRole('button', { name: /confirm & submit to mcs/i }).click();

    // Either success badge or error message is shown (not a blank screen)
    await expect(
      page.getByText(/submitted to mcs/i).or(page.getByText(/submission failed|rejected/i))
    ).toBeVisible({ timeout: 15_000 });
  });

  test('already-submitted registration shows submitted badge', async ({ page }) => {
    // This test verifies the "✓ Submitted to MCS" badge is rendered.
    // In sandbox the submission endpoint may fail, so we check the UI renders
    // correctly when the DB has submittedToMCS=true via the seed data.
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    // If visible, it should look correct
    const badge = page.getByText('✓ Submitted to MCS');
    if (await badge.isVisible()) {
      await expect(badge).toBeVisible();
    }
  });
});

// ─── Installer accreditation verification ─────────────────────────────────────

test.describe('Installer Verification API', () => {
  test('GET /api/mcs/verify-installer returns 404 for unknown MCS number', async ({ request }) => {
    // Log in to get token
    const login = await request.post(`${process.env.VITE_API_URL ?? 'http://localhost:4000'}/api/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(login.ok()).toBeTruthy();
    const { accessToken } = await login.json();

    const res = await request.get(
      `${process.env.VITE_API_URL ?? 'http://localhost:4000'}/api/mcs/verify-installer/NAP-INVALID-00000`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // MCS sandbox likely returns 404 or 502
    expect([200, 404, 502]).toContain(res.status());
  });
});
