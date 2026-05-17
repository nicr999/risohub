import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database';
import {
  User, Project, ChecklistItem, Note, Complaint, Qualification, Notification,
} from '../models/index';
import { mis3005Items } from '../checklist/mis3005Items';

const HASH_ROUNDS = 12;

async function seedDemo(): Promise<void> {
  await sequelize.authenticate();
  console.log('✅ Database connected');

  const existing = await Project.findOne();
  if (existing) {
    console.log('ℹ️  Demo data already present — skipping.');
    process.exit(0);
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  const demoPassword = await bcrypt.hash('Demo1234!', HASH_ROUNDS);

  const sarah = await User.create({
    id: uuidv4(),
    name: 'Sarah Watkins',
    email: 'sarah@risohome.co.uk',
    role: 'Surveyor',
    passwordHash: demoPassword,
    twoFactorEnabled: false,
    active: true,
    failedLoginAttempts: 0,
  });

  const ian = await User.create({
    id: uuidv4(),
    name: 'Ian Fletcher',
    email: 'ian@risohome.co.uk',
    role: 'Installer',
    passwordHash: demoPassword,
    twoFactorEnabled: false,
    active: true,
    failedLoginAttempts: 0,
  });

  const alex = await User.create({
    id: uuidv4(),
    name: 'Alex Drummond',
    email: 'alex@risohome.co.uk',
    role: 'Auditor',
    passwordHash: demoPassword,
    twoFactorEnabled: false,
    active: true,
    failedLoginAttempts: 0,
  });

  console.log('✅ Demo users created (password: Demo1234!)');

  // ── Projects ───────────────────────────────────────────────────────────────

  // Project 1 — audit stage (nearly complete)
  const p1 = await Project.create({
    id: uuidv4(),
    customerName: 'Margaret Thompson',
    address: '14 Birchwood Lane',
    postcode: 'LS6 2RT',
    status: 'audit',
    projectType: 'ASHP',
    assignedTo: ian.id,
  });

  // Project 2 — install stage (mid-project)
  const p2 = await Project.create({
    id: uuidv4(),
    customerName: 'Robert Clarke',
    address: '8 Maple Avenue',
    postcode: 'M21 9LK',
    status: 'install',
    projectType: 'ASHP',
    assignedTo: ian.id,
  });

  // Project 3 — survey stage (just started)
  const p3 = await Project.create({
    id: uuidv4(),
    customerName: 'Patricia Walsh',
    address: '22 Ferndale Road',
    postcode: 'BS7 8NP',
    status: 'survey',
    projectType: 'GSHP',
    assignedTo: sarah.id,
  });

  console.log('✅ 3 demo projects created');

  // ── Checklist items ────────────────────────────────────────────────────────

  // Project 1 (audit): most items complete
  for (const item of mis3005Items) {
    const isEarlySection = ['Pre-Installation', 'Heat Pump Unit', 'Hydraulics', 'Hot Water', 'Controls', 'Electrical'].includes(item.section);
    await ChecklistItem.create({
      id: uuidv4(),
      projectId: p1.id,
      key: item.key,
      section: item.section,
      name: item.name,
      ref: item.ref ?? '',
      guidance: item.guidance ?? null,
      required: item.required,
      status: isEarlySection ? 'complete' : 'pending',
      updatedBy: isEarlySection ? ian.id : null,
    });
  }

  // Project 2 (install): first two sections complete
  for (const item of mis3005Items) {
    const isDone = item.section === 'Pre-Installation';
    await ChecklistItem.create({
      id: uuidv4(),
      projectId: p2.id,
      key: item.key,
      section: item.section,
      name: item.name,
      ref: item.ref ?? '',
      guidance: item.guidance ?? null,
      required: item.required,
      status: isDone ? 'complete' : 'pending',
      updatedBy: isDone ? ian.id : null,
    });
  }

  // Project 3 (survey): all pending
  for (const item of mis3005Items) {
    await ChecklistItem.create({
      id: uuidv4(),
      projectId: p3.id,
      key: item.key,
      section: item.section,
      name: item.name,
      ref: item.ref ?? '',
      guidance: item.guidance ?? null,
      required: item.required,
      status: 'pending',
      updatedBy: null,
    });
  }

  console.log('✅ Checklist items seeded for all 3 projects');

  // ── Notes ──────────────────────────────────────────────────────────────────

  await Note.create({
    id: uuidv4(),
    projectId: p1.id,
    section: 'general',
    body: 'Site visit completed. Samsung 8kW ASHP installed in rear garden. Customer happy with positioning. Commissioning scheduled for next week.',
    mentions: [],
    authorId: ian.id,
    pinned: true,
  });
  await Note.create({
    id: uuidv4(),
    projectId: p1.id,
    section: 'checklist',
    body: 'All hydraulic sections signed off. Inhibitor concentration at 28% — within range. System pressure holding at 1.2 bar.',
    mentions: [],
    authorId: ian.id,
    pinned: false,
  });
  await Note.create({
    id: uuidv4(),
    projectId: p1.id,
    section: 'general',
    body: 'MCS documentation pack ready for submission. Awaiting customer signature on handover certificate.',
    mentions: [],
    authorId: alex.id,
    pinned: false,
  });

  await Note.create({
    id: uuidv4(),
    projectId: p2.id,
    section: 'general',
    body: 'Pre-installation survey complete. Heat loss calculated at 6.2 kW. Recommending 8kW unit. UFH downstairs, rads upstairs — all confirmed compatible at 45°C flow temp.',
    mentions: [],
    authorId: sarah.id,
    pinned: true,
  });
  await Note.create({
    id: uuidv4(),
    projectId: p2.id,
    section: 'general',
    body: 'Scaffolding booked for 24th. Customer requested morning start. Access via side gate — key held by neighbour.',
    mentions: [],
    authorId: ian.id,
    pinned: false,
  });

  await Note.create({
    id: uuidv4(),
    projectId: p3.id,
    section: 'general',
    body: 'Initial survey booked. GSHP feasibility — garden is large enough for horizontal ground loop (approx 400m²). Ground survey required before design can proceed.',
    mentions: [],
    authorId: sarah.id,
    pinned: true,
  });

  console.log('✅ Notes seeded');

  // ── Complaints ─────────────────────────────────────────────────────────────

  const c1 = await Complaint.create({
    id: uuidv4(),
    ref: 'CMP-2026-001',
    projectId: p1.id,
    customerName: 'Margaret Thompson',
    customerEmail: 'margaret.thompson@email.com',
    customerPhone: '07712 345678',
    customerAddress: '14 Birchwood Lane, Leeds, LS6 2RT',
    receivedAt: new Date('2026-04-10T10:00:00Z'),
    receivedMethod: 'phone',
    category: 'Installation quality',
    priority: 'standard',
    description: 'Customer reported a small water leak from the primary circuit valve 3 days after installation. Engineer attended same day and reseated the olive — no further issues reported.',
    status: 'closed',
    assignedTo: ian.id,
    responseDeadline: new Date('2026-04-13T10:00:00Z'),
    resolutionDescription: 'Engineer attended within 4 hours. Compression fitting reseated. System re-pressurised and leak-tested for 30 minutes. No further issues.',
    customerSatisfied: true,
    closedAt: new Date('2026-04-10T16:30:00Z'),
    reviewedAtMeeting: true,
    hasRepresentative: false,
  });

  await Complaint.create({
    id: uuidv4(),
    ref: 'CMP-2026-002',
    projectId: p2.id,
    customerName: 'Robert Clarke',
    customerEmail: 'robert.clarke@email.com',
    customerPhone: '07823 456789',
    customerAddress: '8 Maple Avenue, Manchester, M21 9LK',
    receivedAt: new Date('2026-05-12T14:00:00Z'),
    receivedMethod: 'email',
    category: 'System performance',
    priority: 'standard',
    description: 'Customer says the heat pump is running but radiators in the upstairs bedrooms are not getting warm enough. Suspects a balancing issue.',
    status: 'in_progress',
    assignedTo: ian.id,
    responseDeadline: new Date('2026-05-15T14:00:00Z'),
    reviewedAtMeeting: false,
    hasRepresentative: false,
  });

  console.log('✅ Complaints seeded');

  // ── Qualifications ─────────────────────────────────────────────────────────

  await Qualification.create({
    id: uuidv4(),
    staffId: ian.id,
    type: 'MCS Heat Pump Installer',
    category: 'Installation',
    certNumber: 'MCS-HP-2024-04821',
    issuingBody: 'MCS Certified',
    issuedAt: '2024-03-15',
    expiresAt: '2027-03-14',
    neverExpires: false,
  });

  await Qualification.create({
    id: uuidv4(),
    staffId: ian.id,
    type: 'F-Gas Handling',
    category: 'Refrigerants',
    certNumber: 'FGAS-2022-19234',
    issuingBody: 'REFCOM',
    issuedAt: '2022-06-01',
    expiresAt: null,
    neverExpires: true,
  });

  await Qualification.create({
    id: uuidv4(),
    staffId: sarah.id,
    type: 'Level 5 Diploma in Heat Pump Systems Design',
    category: 'Design',
    certNumber: 'CIBSE-HPS-2023-0341',
    issuingBody: 'CIBSE',
    issuedAt: '2023-09-01',
    expiresAt: '2026-08-31',
    neverExpires: false,
  });

  await Qualification.create({
    id: uuidv4(),
    staffId: alex.id,
    type: 'MCS Audit Inspector',
    category: 'Auditing',
    certNumber: 'MCS-AUD-2023-00892',
    issuingBody: 'MCS Certified',
    issuedAt: '2023-01-10',
    expiresAt: null,
    neverExpires: true,
  });

  console.log('✅ Qualifications seeded');

  // ── Notifications ──────────────────────────────────────────────────────────

  const admin = await User.findOne({ where: { email: 'admin@risohome.co.uk' } });
  if (admin) {
    await Notification.create({
      id: uuidv4(),
      userId: admin.id,
      type: 'complaint_new',
      title: 'New complaint received',
      body: 'CMP-2026-002 — Robert Clarke reported a heating performance issue. Response due 15 May.',
      read: false,
    });
    await Notification.create({
      id: uuidv4(),
      userId: admin.id,
      type: 'project_ready',
      title: 'Project ready for audit',
      body: 'Margaret Thompson (LS6 2RT) — checklist 85% complete. Audit can be booked.',
      read: false,
    });
    await Notification.create({
      id: uuidv4(),
      userId: admin.id,
      type: 'qualification_expiring',
      title: 'Qualification expiring soon',
      body: "Sarah Watkins' Level 5 Diploma expires 31 Aug 2026 — renewal due.",
      read: true,
    });
  }

  console.log('✅ Notifications seeded');
  console.log('\n🎉 Demo data ready!');
  console.log('   Projects: Margaret Thompson (audit), Robert Clarke (install), Patricia Walsh (survey)');
  console.log('   Staff logins: sarah@risohome.co.uk, ian@risohome.co.uk, alex@risohome.co.uk (all: Demo1234!)');
  process.exit(0);
}

seedDemo().catch(err => {
  console.error('❌ Demo seed failed:', err);
  process.exit(1);
});
