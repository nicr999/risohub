import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database';
import { User } from '../models/index';

import { mis3005Items } from '../checklist/mis3005Items';

const BCRYPT_ROUNDS = 12;

async function seed(): Promise<void> {
  await sequelize.authenticate();
  console.log('✅ Database connected');

  // ── Seed admin user ────────────────────────────────────────────────────────

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@risohome.co.uk';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

  const existing = await User.findOne({ where: { email: adminEmail } });

  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
    await User.create({
      id: uuidv4(),
      name: 'RISO Admin',
      email: adminEmail,
      role: 'Admin',
      passwordHash,
      twoFactorEnabled: false, // Admin must set up 2FA on first login
      active: true,
      failedLoginAttempts: 0,
    });
    console.log(`✅ Admin user created: ${adminEmail}`);
    console.log(`   ⚠️  Default password: ${adminPassword} — change immediately after first login`);
  } else {
    console.log(`ℹ️  Admin user already exists: ${adminEmail}`);
  }

  // ── Seed demo users (development only) ────────────────────────────────────

  if (process.env.NODE_ENV === 'development') {
    const demoUsers = [
      { name: 'Sarah Surveyor', email: 'surveyor@risohome.co.uk', role: 'Surveyor' as const },
      { name: 'Ian Installer', email: 'installer@risohome.co.uk', role: 'Installer' as const },
      { name: 'Alex Auditor', email: 'auditor@risohome.co.uk', role: 'Auditor' as const },
    ];

    for (const demo of demoUsers) {
      const exists = await User.findOne({ where: { email: demo.email } });
      if (!exists) {
        const passwordHash = await bcrypt.hash('Demo1234!', BCRYPT_ROUNDS);
        await User.create({
          id: uuidv4(),
          ...demo,
          passwordHash,
          twoFactorEnabled: false,
          active: true,
          failedLoginAttempts: 0,
        });
        console.log(`✅ Demo user created: ${demo.email} (Demo1234!)`);
      }
    }
  }

  // ── Log MIS 3005 checklist items available ─────────────────────────────────
  // (Items are seeded per-project on creation — this just validates the source)

  console.log(`✅ MIS 3005 checklist: ${mis3005Items.length} items ready to seed per project`);

  const sections = [...new Set(mis3005Items.map(i => i.section))];
  for (const section of sections) {
    const count = mis3005Items.filter(i => i.section === section).length;
    console.log(`   ${section}: ${count} items`);
  }

  console.log('\n🚀 Seed complete. Start the server with: npm run dev');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
