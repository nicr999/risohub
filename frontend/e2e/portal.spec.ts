// e2e/portal.spec.ts
import { test, expect, Page } from '@playwright/test';
import { test as authTest } from './fixtures/auth';

// ─── Basic portal UI tests ─────────────────────────────────────────────────────

authTest.describe('Customer portal', () => {
  authTest('portal tab visible on project for surveyor', async ({ surveyorPage: page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('[data-testid="project-row"]').first();
    if (await firstProject.count() === 0) { authTest.skip(); return; }
    await firstProject.click();

    const portalTab = page.getByRole('tab', { name: /portal/i });
    await expect(portalTab).toBeVisible();
  });

  authTest('can generate portal invite link', async ({ adminPage: page }) => {
    await page.goto('/projects');
    const firstProject = page.locator('[data-testid="project-row"]').first();
    if (await firstProject.count() === 0) { authTest.skip(); return; }
    await firstProject.click();

    await page.getByRole('tab', { name: /portal/i }).click();
    const inviteBtn = page.getByRole('button', { name: /invite customer|generate link/i });
    if (await inviteBtn.count() === 0) { authTest.skip(); return; }
    await inviteBtn.click();

    await page.getByLabel(/email/i).fill('customer@e2etest.com');
    await page.getByRole('button', { name: /send|generate/i }).click();

    await expect(page.getByText(/link sent|portal link|invite sent/i)).toBeVisible({ timeout: 8000 });
  });

  authTest('portal view shows expired message for bad token', async ({ page }) => {
    await page.goto('/portal/view/bad-token-xyz');
    await expect(page.getByText(/expired|invalid|not found/i)).toBeVisible({ timeout: 8000 });
  });
});

// ─── WebSocket live-update tests ───────────────────────────────────────────────

/** Mint a portal token via the API and return it (or null if unavailable). */
async function createPortalToken(adminPage: Page, projectId: string): Promise<string | null> {
  return adminPage.evaluate(async (pid) => {
    const at = localStorage.getItem('riso_access_token') ?? '';
    try {
      const res = await fetch('/api/portal/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
        body: JSON.stringify({ projectId: pid, customerEmail: 'ws-test@e2etest.com' }),
      });
      if (!res.ok) return null;
      const d = await res.json();
      return (d.token ?? d.portalToken ?? null) as string | null;
    } catch {
      return null;
    }
  }, projectId);
}

/** Return the first project ID visible in the list, or null. */
async function firstProjectId(page: Page): Promise<string | null> {
  await page.goto('/projects');
  const row = page.locator('[data-testid="project-row"]').first();
  if (await row.count() === 0) return null;
  return row.getAttribute('data-project-id');
}

authTest.describe('Portal WebSocket', () => {
  authTest('portal page opens a WebSocket connection to /ws/portal', async ({ browser, adminPage }) => {
    const projectId = await firstProjectId(adminPage);
    if (!projectId) { authTest.skip(); return; }

    const token = await createPortalToken(adminPage, projectId);
    if (!token) { authTest.skip(); return; }

    const customerCtx = await browser.newContext();
    const portalPage  = await customerCtx.newPage();

    let wsUrl: string | null = null;
    portalPage.on('websocket', ws => { wsUrl = ws.url(); });

    await portalPage.goto(`/portal/view/${token}`);
    await portalPage.waitForLoadState('networkidle');

    expect(wsUrl).toMatch(/\/ws\/portal/);
    await customerCtx.close();
  });

  authTest('portal receives document.added frame when document is generated', async ({ browser, adminPage }) => {
    const projectId = await firstProjectId(adminPage);
    if (!projectId) { authTest.skip(); return; }

    const token = await createPortalToken(adminPage, projectId);
    if (!token) { authTest.skip(); return; }

    const customerCtx = await browser.newContext();
    const portalPage  = await customerCtx.newPage();

    // Collect all incoming WS frame payloads
    const frames: string[] = [];
    portalPage.on('websocket', ws => {
      ws.on('framereceived', ({ payload }) => frames.push(String(payload)));
    });

    await portalPage.goto(`/portal/view/${token}`);
    await portalPage.waitForLoadState('networkidle');

    // Trigger document generation as admin (checklist may not be ready; ignore errors)
    await adminPage.evaluate(async (pid) => {
      const at = localStorage.getItem('riso_access_token') ?? '';
      await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
        body: JSON.stringify({ projectId: pid, docType: 'handover' }),
      }).catch(() => {});
    }, projectId);

    // Wait up to 6 s for a document.added frame
    await expect.poll(() =>
      frames.some(f => {
        try { return JSON.parse(f).type === 'document.added'; } catch { return false; }
      }),
      { timeout: 6000, message: 'Expected document.added frame on portal WebSocket' }
    ).toBe(true);

    await customerCtx.close();
  });

  authTest('portal shows live status badge when WebSocket connects', async ({ browser, adminPage }) => {
    const projectId = await firstProjectId(adminPage);
    if (!projectId) { authTest.skip(); return; }

    const token = await createPortalToken(adminPage, projectId);
    if (!token) { authTest.skip(); return; }

    const customerCtx = await browser.newContext();
    const portalPage  = await customerCtx.newPage();

    await portalPage.goto(`/portal/view/${token}`);
    await portalPage.waitForLoadState('networkidle');

    // The portal UI should show a live indicator once the WS handshake completes
    await expect(
      portalPage.locator('[data-testid="portal-live-badge"], [aria-label*="live"], text=/live|connected/i')
    ).toBeVisible({ timeout: 5000 });

    await customerCtx.close();
  });
});
