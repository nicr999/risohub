// fixtures/auth.ts
// Playwright fixtures that provide pre-authenticated pages for each role.
// Reads credentials from env vars set in the CI workflow or a local .env.test file.
import { test as base, expect, Page } from '@playwright/test';

type AuthFixtures = {
  adminPage:     Page;
  surveyorPage:  Page;
  installerPage: Page;
};

async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  // Wait until redirected away from login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15_000 });
}

export const test = base.extend<AuthFixtures>({
  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(
      page,
      process.env.E2E_ADMIN_EMAIL    ?? 'admin@risohome.co.uk',
      process.env.E2E_ADMIN_PASSWORD ?? 'AdminPass1!',
    );
    await use(page);
    await ctx.close();
  },

  surveyorPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(
      page,
      process.env.E2E_SURVEYOR_EMAIL    ?? 'surveyor@risohome.co.uk',
      process.env.E2E_SURVEYOR_PASSWORD ?? 'SurveyorPass1!',
    );
    await use(page);
    await ctx.close();
  },

  installerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(
      page,
      process.env.E2E_INSTALLER_EMAIL    ?? 'installer@risohome.co.uk',
      process.env.E2E_INSTALLER_PASSWORD ?? 'InstallerPass1!',
    );
    await use(page);
    await ctx.close();
  },
});

export { expect };
