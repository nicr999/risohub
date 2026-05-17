'use strict';

const bcrypt = require('bcrypt');

// Seed three E2E test accounts (admin, surveyor, installer).
// Passwords come from env vars so CI secrets are not hardcoded here.
// The matching env vars are set as GitHub secrets in the e2e.yml workflow.

module.exports = {
  async up(queryInterface) {
    const hash = (pw) => bcrypt.hash(pw, 10);

    const adminPw     = process.env.E2E_ADMIN_PASSWORD     ?? 'AdminPass1!';
    const surveyorPw  = process.env.E2E_SURVEYOR_PASSWORD  ?? 'SurveyorPass1!';
    const installerPw = process.env.E2E_INSTALLER_PASSWORD ?? 'InstallerPass1!';

    const [adminHash, surveyorHash, installerHash] = await Promise.all([
      hash(adminPw),
      hash(surveyorPw),
      hash(installerPw),
    ]);

    await queryInterface.bulkInsert('Users', [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'E2E Admin',
        email: process.env.E2E_ADMIN_EMAIL ?? 'admin@risohome.co.uk',
        passwordHash: adminHash,
        role: 'Admin',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'E2E Surveyor',
        email: process.env.E2E_SURVEYOR_EMAIL ?? 'surveyor@risohome.co.uk',
        passwordHash: surveyorHash,
        role: 'Surveyor',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'E2E Installer',
        email: process.env.E2E_INSTALLER_EMAIL ?? 'installer@risohome.co.uk',
        passwordHash: installerHash,
        role: 'Installer',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {
      ignoreDuplicates: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('Users', {
      email: [
        process.env.E2E_ADMIN_EMAIL     ?? 'admin@risohome.co.uk',
        process.env.E2E_SURVEYOR_EMAIL  ?? 'surveyor@risohome.co.uk',
        process.env.E2E_INSTALLER_EMAIL ?? 'installer@risohome.co.uk',
      ],
    });
  },
};
