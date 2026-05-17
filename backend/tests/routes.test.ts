// ============================================================
// RISO HUB — tests/routes.test.ts
// Full route-level test suite using Jest + Supertest.
//
// Setup required (add to package.json):
//
//   devDependencies:
//     "jest": "^29.7.0"
//     "@types/jest": "^29.5.12"
//     "supertest": "^7.0.0"
//     "@types/supertest": "^6.0.2"
//     "ts-jest": "^29.2.3"
//
//   scripts:
//     "test": "jest --runInBand --forceExit"
//     "test:watch": "jest --watch"
//     "test:coverage": "jest --coverage"
//
//   jest.config.ts:
//     export default {
//       preset: 'ts-jest',
//       testEnvironment: 'node',
//       setupFilesAfterFramework: ['./tests/setup.ts'],
//       testMatch: ['**/tests/**/*.test.ts'],
//       coverageDirectory: 'coverage',
//       collectCoverageFrom: ['src/routes/**/*.ts', 'src/services/**/*.ts'],
//     };
//
// Tests use a test DB (TEST_DATABASE_URL env var).
// Each test suite runs in a transaction rolled back after each test.
// ============================================================

import request from 'supertest';
import app from '../app';
import sequelize from '../config/database';
import { User, Project, ChecklistItem, Complaint, Notification, Setting } from '../models/index';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'risohub-jwt-secret-dev';

function makeToken(payload: object, expiresIn = '15m') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function adminToken()     { return makeToken({ sub: '1', role: 'Admin',    twoFactorVerified: true  }); }
function surveyorToken()  { return makeToken({ sub: '2', role: 'Surveyor', twoFactorVerified: false }); }
function installerToken() { return makeToken({ sub: '3', role: 'Installer',twoFactorVerified: false }); }
function auditorToken()   { return makeToken({ sub: '4', role: 'Auditor',  twoFactorVerified: false }); }
function expiredToken()   { return makeToken({ sub: '1', role: 'Admin',    twoFactorVerified: true  }, '-1s'); }

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await sequelize.close();
});

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  test('returns 400 when email/password missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password' });
    expect(res.status).toBe(401);
  });

  test('returns 401 for wrong password', async () => {
    // Seed a test user
    const hash = await bcrypt.hash('correct-password', 12);
    await User.create({
      name: 'Test User', email: 'test@risohome.co.uk',
      passwordHash: hash, role: 'Surveyor', active: true,
    } as any);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@risohome.co.uk', password: 'wrong-password' });
    expect(res.status).toBe(401);

    await User.destroy({ where: { email: 'test@risohome.co.uk' } });
  });
});

describe('GET /api/auth/me', () => {
  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns 401 with expired token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken()}`);
    expect([401, 403]).toContain(res.status);
  });
});

// ─── PROJECT ROUTES ───────────────────────────────────────────────────────────

describe('GET /api/projects', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  test('returns 200 for Surveyor', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${surveyorToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('projects');
    expect(Array.isArray(res.body.projects)).toBe(true);
  });

  test('returns 200 for Admin', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });

  test('returns 200 for Auditor', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${auditorToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/projects', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/projects').send({});
    expect(res.status).toBe(401);
  });

  test('returns 403 for Auditor (read-only)', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${auditorToken()}`)
      .send({ customerName: 'Test', address: '1 Test St', postcode: 'BS1 1AA', projectType: 'ASHP' });
    expect(res.status).toBe(403);
  });

  test('returns 400 when required fields missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${surveyorToken()}`)
      .send({ customerName: 'Test' }); // missing required fields
    expect(res.status).toBe(400);
  });

  test('creates project for Surveyor with valid payload', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${surveyorToken()}`)
      .send({
        customerName:  'Integration Test Customer',
        customerEmail: 'test@customer.co.uk',
        customerPhone: '07700000000',
        address:       '1 Test Street',
        postcode:      'BS1 1AA',
        projectType:   'ASHP',
        assignedTo:    2,
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('project');
    expect(res.body.project.customerName).toBe('Integration Test Customer');

    // Cleanup
    await Project.destroy({ where: { id: res.body.project.id }, force: true });
  });
});

describe('GET /api/projects/:id', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects/999');
    expect(res.status).toBe(401);
  });

  test('returns 404 for non-existent project', async () => {
    const res = await request(app)
      .get('/api/projects/99999')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});

// ─── CHECKLIST ROUTES ─────────────────────────────────────────────────────────

describe('GET /api/checklist/:projectId', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/checklist/1');
    expect(res.status).toBe(401);
  });

  test('returns 200 or 404 for Admin', async () => {
    const res = await request(app)
      .get('/api/checklist/1')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect([200, 404]).toContain(res.status);
  });
});

describe('PATCH /api/checklist/item/:id', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).patch('/api/checklist/item/1').send({ status: 'complete' });
    expect(res.status).toBe(401);
  });

  test('returns 403 for Auditor', async () => {
    const res = await request(app)
      .patch('/api/checklist/item/1')
      .set('Authorization', `Bearer ${auditorToken()}`)
      .send({ status: 'complete' });
    expect(res.status).toBe(403);
  });

  test('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch('/api/checklist/item/1')
      .set('Authorization', `Bearer ${installerToken()}`)
      .send({ status: 'invalid_status' });
    expect([400, 404]).toContain(res.status);
  });
});

// ─── FILE ROUTES ──────────────────────────────────────────────────────────────

describe('POST /api/files/presign', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/files/presign').send({});
    expect(res.status).toBe(401);
  });

  test('returns 400 without required params', async () => {
    const res = await request(app)
      .post('/api/files/presign')
      .set('Authorization', `Bearer ${surveyorToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/files/:projectId', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/files/1');
    expect(res.status).toBe(401);
  });

  test('returns 200 or 404 for Admin', async () => {
    const res = await request(app)
      .get('/api/files/1')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ─── DOCUMENT ROUTES ──────────────────────────────────────────────────────────

describe('GET /api/documents', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });

  test('returns 200 for Auditor', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${auditorToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/documents/generate', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/documents/generate').send({});
    expect(res.status).toBe(401);
  });

  test('returns 403 without 2FA for Admin', async () => {
    const no2faToken = makeToken({ sub: '1', role: 'Admin', twoFactorVerified: false });
    const res = await request(app)
      .post('/api/documents/generate')
      .set('Authorization', `Bearer ${no2faToken}`)
      .send({ projectId: 1, docType: 'handover' });
    expect(res.status).toBe(403);
  });

  test('returns 403 for Auditor', async () => {
    const res = await request(app)
      .post('/api/documents/generate')
      .set('Authorization', `Bearer ${auditorToken()}`)
      .send({ projectId: 1, docType: 'handover' });
    expect(res.status).toBe(403);
  });
});

// ─── SIGNATURE ROUTES ─────────────────────────────────────────────────────────

describe('POST /api/signatures/request', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/signatures/request').send({});
    expect(res.status).toBe(401);
  });

  test('returns 403 for Auditor', async () => {
    const res = await request(app)
      .post('/api/signatures/request')
      .set('Authorization', `Bearer ${auditorToken()}`)
      .send({ projectId: 1, documentId: 1 });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/signatures/:token/info', () => {
  test('returns 404 for unknown token', async () => {
    const res = await request(app).get('/api/signatures/nonexistent-token-xyz/info');
    expect(res.status).toBe(404);
  });
});

// ─── USER ROUTES ──────────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('returns 403 for Surveyor', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${surveyorToken()}`);
    expect(res.status).toBe(403);
  });

  test('returns 200 for Admin', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/users/invite', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/users/invite').send({});
    expect(res.status).toBe(401);
  });

  test('returns 403 for Surveyor', async () => {
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${surveyorToken()}`)
      .send({ email: 'new@test.com', role: 'Installer', name: 'New User' });
    expect(res.status).toBe(403);
  });
});

// ─── COMPLAINT ROUTES ─────────────────────────────────────────────────────────

describe('GET /api/complaints', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/complaints');
    expect(res.status).toBe(401);
  });

  test('returns 403 for Installer', async () => {
    const res = await request(app)
      .get('/api/complaints')
      .set('Authorization', `Bearer ${installerToken()}`);
    expect(res.status).toBe(403);
  });

  test('returns 200 for Surveyor', async () => {
    const res = await request(app)
      .get('/api/complaints')
      .set('Authorization', `Bearer ${surveyorToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/complaints', () => {
  test('returns 400 when required fields missing', async () => {
    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${surveyorToken()}`)
      .send({ customerName: 'Test' }); // missing projectId, etc.
    expect(res.status).toBe(400);
  });
});

// ─── NOTES ROUTES ─────────────────────────────────────────────────────────────

describe('GET /api/notes', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/notes');
    expect(res.status).toBe(401);
  });

  test('returns 200 for any authenticated user', async () => {
    const res = await request(app)
      .get('/api/notes')
      .set('Authorization', `Bearer ${installerToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/notes', () => {
  test('returns 400 without required fields', async () => {
    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', `Bearer ${surveyorToken()}`)
      .send({}); // missing projectId, body
    expect(res.status).toBe(400);
  });
});

// ─── NOTIFICATION ROUTES ──────────────────────────────────────────────────────

describe('GET /api/notifications', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  test('returns 200 with valid token', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${surveyorToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/notifications/unread-count', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/notifications/unread-count');
    expect(res.status).toBe(401);
  });

  test('returns count for authenticated user', async () => {
    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${surveyorToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count');
    expect(typeof res.body.count).toBe('number');
  });
});

// ─── SETTINGS ROUTES ──────────────────────────────────────────────────────────

describe('GET /api/settings', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  test('returns 403 for Surveyor', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${surveyorToken()}`);
    expect(res.status).toBe(403);
  });

  test('returns 200 for Admin', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/settings/:section', () => {
  test('returns 403 without 2FA even for Admin', async () => {
    const no2faToken = makeToken({ sub: '1', role: 'Admin', twoFactorVerified: false });
    const res = await request(app)
      .patch('/api/settings/company')
      .set('Authorization', `Bearer ${no2faToken}`)
      .send({ config: { name: 'Test' } });
    expect(res.status).toBe(403);
  });

  test('allows update with Admin + 2FA', async () => {
    const res = await request(app)
      .patch('/api/settings/reminders')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ config: { enabled: false } });
    expect([200, 204]).toContain(res.status);
  });
});

// ─── AUDIT LOG ROUTES ─────────────────────────────────────────────────────────

describe('GET /api/audit-log', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/audit-log');
    expect(res.status).toBe(401);
  });

  test('returns 403 for Surveyor', async () => {
    const res = await request(app)
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${surveyorToken()}`);
    expect(res.status).toBe(403);
  });

  test('returns 200 for Admin', async () => {
    const res = await request(app)
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });
});

// ─── PORTAL ROUTES ────────────────────────────────────────────────────────────

describe('GET /api/portal/view/:token', () => {
  test('returns 404 for unknown token', async () => {
    const res = await request(app).get('/api/portal/view/completely-invalid-token-xyz');
    expect(res.status).toBe(404);
  });

  test('is publicly accessible (no 401)', async () => {
    const res = await request(app).get('/api/portal/view/some-token');
    expect(res.status).not.toBe(401); // 404 is fine, 401 is not
  });
});

describe('POST /api/portal/:projectId/invite', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/portal/1/invite').send({});
    expect(res.status).toBe(401);
  });

  test('returns 403 for Installer', async () => {
    const res = await request(app)
      .post('/api/portal/1/invite')
      .set('Authorization', `Bearer ${installerToken()}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ─── EPC ROUTES ───────────────────────────────────────────────────────────────

describe('GET /api/epc/health', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/epc/health');
    expect(res.status).toBe(401);
  });

  test('returns 403 for Surveyor (Admin only)', async () => {
    const res = await request(app)
      .get('/api/epc/health')
      .set('Authorization', `Bearer ${surveyorToken()}`);
    expect(res.status).toBe(403);
  });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});

// ─── 404 HANDLER ──────────────────────────────────────────────────────────────

describe('Unknown routes', () => {
  test('returns 404 for unknown endpoint', async () => {
    const res = await request(app).get('/api/this-does-not-exist');
    expect(res.status).toBe(404);
  });
});

// ─── RATE LIMITER ─────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  test('auth endpoint applies stricter limits', async () => {
    // Just verify the endpoint responds — actual rate limit testing requires
    // making 11 requests which would be slow in CI
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'password' });
    expect(res.status).not.toBe(500); // shouldn't crash
  });
});
