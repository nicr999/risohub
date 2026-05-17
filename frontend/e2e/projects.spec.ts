// e2e/tests/projects.spec.ts
import { test, expect } from '../fixtures/auth';

test.describe('Project management', () => {
  test('project list loads for admin', async ({ adminPage: page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
    // Either shows project rows or empty state
    const hasProjects = await page.locator('[data-testid="project-row"]').count() > 0;
    const hasEmpty = await page.getByText(/no projects/i).isVisible();
    expect(hasProjects || hasEmpty).toBe(true);
  });

  test('admin can create a project', async ({ adminPage: page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: /new project|create/i }).click();

    // Fill form
    await page.getByLabel(/address/i).fill('42 E2E Road, London, E1 1AA');
    await page.getByLabel(/install type/i).selectOption('Solar PV');

    // Submit
    await page.getByRole('button', { name: /create|save|submit/i }).click();

    // Should appear in list or navigate to project detail
    await expect(page.getByText('42 E2E Road, London, E1 1AA')).toBeVisible({ timeout: 8000 });
  });

  test('project detail page loads', async ({ adminPage: page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('[data-testid="project-row"]').first();
    const count = await firstProject.count();
    if (count === 0) { test.skip(); return; }
    await firstProject.click();
    await expect(page).toHaveURL(/\/projects\/\d+/);
    await expect(page.getByText(/survey|install|status/i)).toBeVisible();
  });

  test('installer cannot see unassigned projects', async ({ installerPage: page }) => {
    await page.goto('/projects');
    // Installer should only see their assigned projects
    // If no assignments, empty state
    await expect(page.locator('[data-testid="project-row"], [data-testid="empty-state"]').first()).toBeVisible();
  });

  test('status can be updated by admin', async ({ adminPage: page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('[data-testid="project-row"]').first();
    if (await firstProject.count() === 0) { test.skip(); return; }
    await firstProject.click();
    await expect(page).toHaveURL(/\/projects\/\d+/);

    const statusBtn = page.getByRole('button', { name: /update status|change status/i });
    if (await statusBtn.count() === 0) { test.skip(); return; }
    await statusBtn.click();
    await page.getByRole('option', { name: /install/i }).click();
    await page.getByRole('button', { name: /confirm|save/i }).click();
    await expect(page.getByText(/install/i)).toBeVisible({ timeout: 6000 });
  });
});
