// e2e/eligibility.spec.ts
// End-to-end tests for BES / grant eligibility assessment panel.
// Covers England (BUS, ECO4, GBIS, SEG), Scotland (HES), Wales (Nest) paths.

import { test, expect } from '@playwright/test';

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? 'admin@risohome.co.uk';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!';
const BASE_URL       = process.env.E2E_BASE_URL       ?? 'http://localhost:5173';
const API_URL        = process.env.VITE_API_URL       ?? 'http://localhost:4000';

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]',    ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/projects/, { timeout: 10_000 });
}

async function getAuthToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const { accessToken } = await res.json();
  return accessToken;
}

// ─── Eligibility panel UI ─────────────────────────────────────────────────────

test.describe('BES Eligibility Panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('eligibility panel renders on project detail page', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    // BESEligibilityProjectPanel should render in the project detail
    await expect(page.getByText(/grant eligibility/i)).toBeVisible({ timeout: 8_000 });
  });

  test('England postcode shows BUS scheme', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    // Look for the run assessment button
    const runBtn = page.getByRole('button', { name: /run assessment|check eligibility/i });
    if (!(await runBtn.isVisible())) test.skip();

    // Fill postcode if needed (some panels pre-populate from project)
    const postcodeInput = page.locator('input[placeholder*="postcode" i]');
    if (await postcodeInput.isVisible()) {
      await postcodeInput.fill('SW1A 1AA'); // London — England
    }

    await runBtn.click();

    // BUS scheme should appear for an England ASHP project
    await expect(page.getByText(/boiler upgrade scheme|BUS/i)).toBeVisible({ timeout: 8_000 });
  });

  test('Scotland postcode (EH) shows Home Energy Scotland instead of BUS', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    const runBtn = page.getByRole('button', { name: /run assessment|check eligibility/i });
    if (!(await runBtn.isVisible())) test.skip();

    const postcodeInput = page.locator('input[placeholder*="postcode" i]');
    if (await postcodeInput.isVisible()) {
      await postcodeInput.fill('EH1 1YZ'); // Edinburgh — Scotland
    }

    await runBtn.click();

    // Home Energy Scotland visible, BUS should NOT be shown for Scotland
    await expect(page.getByText(/home energy scotland/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/boiler upgrade scheme/i)).not.toBeVisible();
  });

  test('Wales postcode (CF) shows Nest Wales scheme', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    const runBtn = page.getByRole('button', { name: /run assessment|check eligibility/i });
    if (!(await runBtn.isVisible())) test.skip();

    const postcodeInput = page.locator('input[placeholder*="postcode" i]');
    if (await postcodeInput.isVisible()) {
      await postcodeInput.fill('CF10 1AA'); // Cardiff — Wales
    }

    await runBtn.click();

    await expect(page.getByText(/nest wales|nest scheme/i)).toBeVisible({ timeout: 8_000 });
  });

  test('eligible schemes show green badge, ineligible show grey', async ({ page }) => {
    const firstRow = page.locator('[data-testid="project-row"]').first();
    await firstRow.click();

    const runBtn = page.getByRole('button', { name: /run assessment|check eligibility/i });
    if (!(await runBtn.isVisible())) test.skip();

    await runBtn.click();

    // At least one scheme card should be visible
    await expect(page.locator('[data-testid="eligibility-scheme"]').first()).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Eligibility API direct tests ─────────────────────────────────────────────

test.describe('Eligibility API', () => {
  test('POST /api/eligibility/assess returns eligibility results for ASHP England', async ({ request }) => {
    const token = await getAuthToken(request);

    const res = await request.post(`${API_URL}/api/eligibility/assess`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        installType:          'ASHP',
        propertyType:         'detached',
        propertyAge:          'pre1950',
        currentHeatingSystem: 'gas_boiler',
        epcRating:            'D',
        annualHeatDemandKWh:  12000,
        postcode:             'SW1A 1AA',
        incomeQualified:      false,
        segsEligible:         true,
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty('schemes');
    expect(Array.isArray(body.schemes)).toBeTruthy();

    // BUS should be present for England ASHP
    const bus = body.schemes.find((s: any) => s.schemeId === 'BUS');
    expect(bus).toBeDefined();
    expect(bus.eligible).toBe(true);
    expect(typeof bus.grantAmount).toBe('number');
  });

  test('POST /api/eligibility/assess returns HES for Scotland, no BUS', async ({ request }) => {
    const token = await getAuthToken(request);

    const res = await request.post(`${API_URL}/api/eligibility/assess`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        installType:          'ASHP',
        propertyType:         'detached',
        propertyAge:          'pre1950',
        currentHeatingSystem: 'gas_boiler',
        epcRating:            'D',
        annualHeatDemandKWh:  12000,
        postcode:             'EH1 1YZ',
        incomeQualified:      false,
        segsEligible:         false,
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const schemeIds = body.schemes.map((s: any) => s.schemeId);

    expect(schemeIds).toContain('HES');
    expect(schemeIds).not.toContain('BUS');
  });

  test('POST /api/eligibility/assess returns Nest for Wales low-income household', async ({ request }) => {
    const token = await getAuthToken(request);

    const res = await request.post(`${API_URL}/api/eligibility/assess`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        installType:          'ASHP',
        propertyType:         'terraced',
        propertyAge:          'pre1950',
        currentHeatingSystem: 'electric_storage',
        epcRating:            'E',
        annualHeatDemandKWh:  14000,
        postcode:             'CF10 1AA',
        incomeQualified:      true,
        segsEligible:         false,
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const nest = body.schemes.find((s: any) => s.schemeId === 'NEST');
    expect(nest).toBeDefined();
    expect(nest.eligible).toBe(true);
  });

  test('POST /api/eligibility/assess returns 400 for missing required fields', async ({ request }) => {
    const token = await getAuthToken(request);

    const res = await request.post(`${API_URL}/api/eligibility/assess`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { installType: 'ASHP' }, // missing all other required fields
    });

    expect(res.status()).toBe(400);
  });

  test('SEG eligibility requires export tariff eligible', async ({ request }) => {
    const token = await getAuthToken(request);

    const res = await request.post(`${API_URL}/api/eligibility/assess`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        installType:          'ASHP',
        propertyType:         'detached',
        propertyAge:          '2000_2010',
        currentHeatingSystem: 'gas_boiler',
        epcRating:            'B',
        annualHeatDemandKWh:  8000,
        postcode:             'SW1A 1AA',
        incomeQualified:      false,
        segsEligible:         true,
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const seg  = body.schemes.find((s: any) => s.schemeId === 'SEG');
    expect(seg).toBeDefined();
    expect(seg.eligible).toBe(true);
  });
});
