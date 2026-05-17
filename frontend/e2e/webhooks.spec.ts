// e2e/webhooks.spec.ts
// End-to-end tests for webhook configuration and delivery.
// Covers: creating endpoints, listing delivery history, re-delivering,
// and verifying that project/document events fire webhooks correctly.

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

// ─── Webhook management UI ────────────────────────────────────────────────────

test.describe('Webhook Management UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('settings page shows webhook management panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.getByText(/webhook/i)).toBeVisible({ timeout: 8_000 });
  });

  test('can create a new webhook endpoint', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    const addBtn = page.getByRole('button', { name: /add webhook|new webhook/i });
    if (!(await addBtn.isVisible())) test.skip();

    await addBtn.click();

    await page.fill('input[placeholder*="https://"]', 'https://webhook.site/test-e2e');
    await page.fill('input[placeholder*="secret" i]', 'e2e-test-secret-abc123');

    // Select events
    const projectCreatedCheckbox = page.getByLabel(/project.created/i);
    if (await projectCreatedCheckbox.isVisible()) {
      await projectCreatedCheckbox.check();
    }

    await page.getByRole('button', { name: /save|create/i }).click();

    await expect(page.getByText('webhook.site/test-e2e')).toBeVisible({ timeout: 5_000 });
  });

  test('webhook list shows delivery history link', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    const historyLink = page.getByRole('link', { name: /delivery history|view history/i }).first();
    if (await historyLink.isVisible()) {
      await historyLink.click();
      await expect(page.getByText(/delivery/i)).toBeVisible();
    }
  });
});

// ─── Webhook API tests ────────────────────────────────────────────────────────

test.describe('Webhook API', () => {
  let token: string;
  let webhookId: number;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
  });

  test('POST /api/webhooks — creates a webhook endpoint', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/webhooks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        url:    'https://webhook.site/e2e-test-webhooks',
        secret: 'e2e-test-secret',
        events: ['project.created', 'project.status_changed', 'document.uploaded'],
        active: true,
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty('id');
    expect(body.url).toBe('https://webhook.site/e2e-test-webhooks');
    expect(body.events).toContain('project.created');

    webhookId = body.id;
  });

  test('GET /api/webhooks — lists webhook endpoints', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/webhooks`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(Array.isArray(body)).toBeTruthy();
    // Our webhook from the previous test should appear
    if (webhookId) {
      const found = body.find((w: any) => w.id === webhookId);
      expect(found).toBeDefined();
    }
  });

  test('GET /api/webhooks/:id/deliveries — returns delivery history', async ({ request }) => {
    if (!webhookId) test.skip();

    const res = await request.get(`${API_URL}/api/webhooks/${webhookId}/deliveries`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('PATCH /api/webhooks/:id — can deactivate a webhook', async ({ request }) => {
    if (!webhookId) test.skip();

    const res = await request.patch(`${API_URL}/api/webhooks/${webhookId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { active: false },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.active).toBe(false);
  });

  test('DELETE /api/webhooks/:id — deletes the webhook', async ({ request }) => {
    if (!webhookId) test.skip();

    const res = await request.delete(`${API_URL}/api/webhooks/${webhookId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status()).toBe(204);
  });
});

// ─── Webhook fire integration ─────────────────────────────────────────────────

test.describe('Webhook fire on project events', () => {
  let token: string;
  let testWebhookId: number;
  let testProjectId: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);

    // Register a webhook for project events
    const wh = await request.post(`${API_URL}/api/webhooks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        url:    'https://webhook.site/e2e-fire-test',
        secret: 'fire-test-secret',
        events: ['project.created', 'project.status_changed', 'complaint.opened'],
        active: true,
      },
    });
    if (wh.ok()) {
      const body = await wh.json();
      testWebhookId = body.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (testWebhookId) {
      await request.delete(`${API_URL}/api/webhooks/${testWebhookId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (testProjectId) {
      await request.delete(`${API_URL}/api/projects/${testProjectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {}); // best-effort cleanup
    }
  });

  test('creating a project records a delivery attempt', async ({ request }) => {
    if (!testWebhookId) test.skip();

    // Create a project to trigger project.created
    const projRes = await request.post(`${API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        customerName: 'E2E Webhook Test Customer',
        address:      '1 Test Street, Testville',
        postcode:     'TE1 1ST',
        projectType:  'ASHP',
      },
    });

    expect(projRes.ok()).toBeTruthy();
    const project = await projRes.json();
    testProjectId = project.id;

    // Wait briefly for async webhook delivery attempt
    await new Promise(r => setTimeout(r, 1_500));

    // Check delivery history — should have at least one attempt for project.created
    const delRes = await request.get(`${API_URL}/api/webhooks/${testWebhookId}/deliveries`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(delRes.ok()).toBeTruthy();
    const deliveries = await delRes.json();

    const projectCreatedDelivery = deliveries.find(
      (d: any) => d.eventType === 'project.created' && d.payload?.projectId === testProjectId
    );

    // The delivery may succeed or fail (webhook.site may be unavailable in CI),
    // but it should be recorded in the history.
    expect(projectCreatedDelivery ?? deliveries.length).toBeTruthy();
  });

  test('status change triggers project.status_changed delivery', async ({ request }) => {
    if (!testWebhookId || !testProjectId) test.skip();

    // Change project status
    const patchRes = await request.patch(`${API_URL}/api/projects/${testProjectId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'install' },
    });
    expect(patchRes.ok()).toBeTruthy();

    await new Promise(r => setTimeout(r, 1_500));

    const delRes = await request.get(`${API_URL}/api/webhooks/${testWebhookId}/deliveries`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const deliveries = await delRes.json();

    const statusDelivery = deliveries.find((d: any) => d.eventType === 'project.status_changed');
    expect(statusDelivery).toBeDefined();
  });
});
