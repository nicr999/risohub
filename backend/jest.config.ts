// ============================================================
// RISO HUB — jest.config.ts
// Jest configuration for the backend test suite.
// Place in backend/ alongside package.json.
// ============================================================

import type { Config } from 'jest';

const config: Config = {
  preset:              'ts-jest',
  testEnvironment:     'node',
  roots:               ['<rootDir>/tests'],
  testMatch:           ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig:    'tsconfig.json',
      diagnostics: false,  // suppress TS errors during test run
    }],
  },
  moduleNameMapper: {
    // If you use path aliases in tsconfig, map them here
  },
  setupFilesAfterFramework: ['<rootDir>/tests/setup.ts'],
  coverageDirectory:   'coverage',
  collectCoverageFrom: [
    'routes/**/*.ts',
    'services/**/*.ts',
    'auth/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches:   50,
      functions:  60,
      lines:      60,
      statements: 60,
    },
  },
  // Run tests serially to avoid DB connection conflicts
  maxWorkers: 1,
  // Verbose output
  verbose: true,
  // Timeout per test (ms)
  testTimeout: 30_000,
};

export default config;


// ============================================================
// RISO HUB — tests/setup.ts
// Global test setup — runs before each test file.
// Place in backend/tests/setup.ts
// ============================================================

// ---- tests/setup.ts ----
//
// import sequelize from '../config/database';
//
// // Ensure we're using the test database
// beforeAll(async () => {
//   if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL?.includes('test')) {
//     throw new Error(
//       'Tests must run against a test database.\n' +
//       'Set TEST_DATABASE_URL or ensure DATABASE_URL contains "test".'
//     );
//   }
//   await sequelize.authenticate();
// });
//
// afterAll(async () => {
//   await sequelize.close();
// });


// ============================================================
// package.json additions — merge into backend/package.json
// ============================================================

// {
//   "scripts": {
//     "test":          "jest --runInBand --forceExit",
//     "test:watch":    "jest --watch",
//     "test:coverage": "jest --coverage --runInBand --forceExit",
//     "test:ci":       "jest --runInBand --forceExit --ci --coverage"
//   },
//   "devDependencies": {
//     "jest":             "^29.7.0",
//     "@types/jest":      "^29.5.12",
//     "supertest":        "^7.0.0",
//     "@types/supertest": "^6.0.2",
//     "ts-jest":          "^29.2.3"
//   }
// }
