// e2e/tests/compliance.spec.ts
import { test, expect } from '../fixtures/auth';

test.describe('Compliance checklist', () => {
  test('compliance tab loads for admin', async ({ adminPage: page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('[data-testid="project-row"]').first();
    if (await firstProject.count() === 0) { test.skip(); return; }
    await firstProject.click();

    const compTab = page.getByRole('tab', { name: /compliance|checklist/i });
    await expect(compTab).toBeVisible();
    await compTab.click();

    await expect(page.getByText(/MCS|compliance score|checklist/i)).toBeVisible({ timeout: 8000 });
  });

  test('compliance score is displayed', async ({ adminPage: page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('[data-testid="project-row"]').first();
    if (await firstProject.count() === 0) { test.skip(); return; }
    await firstProject.click();
    await page.getByRole('tab', { name: /compliance|checklist/i }).click();

    // Score should be a percentage
    const scoreEl = page.locator('[data-testid="compliance-score"]');
    if (await scoreEl.count() > 0) {
      const text = await scoreEl.textContent();
      expect(text).toMatch(/\d+%/);
    }
  });

  test('surveyor can tick checklist items', async ({ surveyorPage: page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('[data-testid="project-row"]').first();
    if (await firstProject.count() === 0) { test.skip(); return; }
    await firstProject.click();
    await page.getByRole('tab', { name: /compliance|checklist/i }).click();

    const firstItem = page.locator('[data-testid="checklist-item"]').first();
    if (await firstItem.count() === 0) { test.skip(); return; }
    const checkbox = firstItem.getByRole('checkbox');
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });
});
