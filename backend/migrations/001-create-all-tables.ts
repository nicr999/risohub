import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ── Users ──────────────────────────────────────────────────────────────────
  await queryInterface.createTable('users', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    role: { type: DataTypes.ENUM('Admin', 'Surveyor', 'Installer', 'Auditor'), allowNull: false },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    twoFactorEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    totpSecret: { type: DataTypes.STRING, allowNull: true },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    failedLoginAttempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE, allowNull: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Projects ───────────────────────────────────────────────────────────────
  await queryInterface.createTable('projects', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customerName: { type: DataTypes.STRING, allowNull: false },
    address: { type: DataTypes.STRING, allowNull: false },
    postcode: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.ENUM('survey', 'design', 'install', 'commission', 'audit'), defaultValue: 'survey' },
    assignedTo: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    projectType: { type: DataTypes.ENUM('ASHP', 'GSHP'), allowNull: false },
    driveFolderId: { type: DataTypes.STRING, allowNull: true },
    hubspotContactId: { type: DataTypes.STRING, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Refresh tokens ─────────────────────────────────────────────────────────
  await queryInterface.createTable('refresh_tokens', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    ipAddress: { type: DataTypes.STRING, allowNull: true },
    userAgent: { type: DataTypes.STRING, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Password reset tokens ──────────────────────────────────────────────────
  await queryInterface.createTable('password_reset_tokens', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Files ──────────────────────────────────────────────────────────────────
  await queryInterface.createTable('files', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
    uploadedBy: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    fileUrl: { type: DataTypes.STRING, allowNull: false },
    driveUrl: { type: DataTypes.STRING, allowNull: true },
    category: { type: DataTypes.STRING, allowNull: false },
    stage: { type: DataTypes.STRING, allowNull: false },
    uploadedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  // ── Checklists ─────────────────────────────────────────────────────────────
  await queryInterface.createTable('checklists', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
    key: { type: DataTypes.STRING, allowNull: false },
    section: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    ref: { type: DataTypes.STRING, allowNull: false },
    guidance: { type: DataTypes.TEXT, allowNull: true },
    required: { type: DataTypes.BOOLEAN, defaultValue: true },
    status: { type: DataTypes.ENUM('pending', 'complete', 'noncompliant', 'na'), defaultValue: 'pending' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    naReason: { type: DataTypes.TEXT, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  });

  // ── Documents ──────────────────────────────────────────────────────────────
  await queryInterface.createTable('documents', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
    docType: { type: DataTypes.ENUM('handover', 'commissioning', 'riskassessment'), allowNull: false },
    pdfUrl: { type: DataTypes.STRING, allowNull: false },
    driveUrl: { type: DataTypes.STRING, allowNull: true },
    version: { type: DataTypes.INTEGER, defaultValue: 1 },
    sha256Hash: { type: DataTypes.STRING, allowNull: false },
    sizeBytes: { type: DataTypes.INTEGER, allowNull: false },
    sections: { type: DataTypes.JSONB, defaultValue: [] },
    generatedBy: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    generatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  // ── Signatures ─────────────────────────────────────────────────────────────
  await queryInterface.createTable('signatures', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
    documentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'documents', key: 'id' } },
    requestedBy: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    signedBy: { type: DataTypes.STRING, allowNull: true },
    role: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'signed', 'declined'), defaultValue: 'pending' },
    signatureData: { type: DataTypes.TEXT, allowNull: true },
    pdfUrl: { type: DataTypes.STRING, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    hash: { type: DataTypes.STRING, allowNull: true },
    tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Notifications ──────────────────────────────────────────────────────────
  await queryInterface.createTable('notifications', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    type: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    read: { type: DataTypes.BOOLEAN, defaultValue: false },
    meta: { type: DataTypes.JSONB, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Qualifications ─────────────────────────────────────────────────────────
  await queryInterface.createTable('qualifications', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    staffId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    type: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
    certNumber: { type: DataTypes.STRING, allowNull: true },
    issuingBody: { type: DataTypes.STRING, allowNull: false },
    issuedAt: { type: DataTypes.DATEONLY, allowNull: false },
    expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
    neverExpires: { type: DataTypes.BOOLEAN, defaultValue: false },
    fileUrl: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Complaints ─────────────────────────────────────────────────────────────
  await queryInterface.createTable('complaints', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ref: { type: DataTypes.STRING, allowNull: false, unique: true },
    projectId: { type: DataTypes.UUID, allowNull: true, references: { model: 'projects', key: 'id' }, onDelete: 'SET NULL' },
    customerName: { type: DataTypes.STRING, allowNull: false },
    customerEmail: { type: DataTypes.STRING, allowNull: true },
    customerPhone: { type: DataTypes.STRING, allowNull: true },
    customerAddress: { type: DataTypes.STRING, allowNull: true },
    receivedAt: { type: DataTypes.DATE, allowNull: false },
    receivedMethod: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
    priority: { type: DataTypes.ENUM('standard', 'emergency'), defaultValue: 'standard' },
    description: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.ENUM('new', 'in_progress', 'pending_info', 'escalated', 'resolved', 'closed'), defaultValue: 'new' },
    assignedTo: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    responseDeadline: { type: DataTypes.DATE, allowNull: false },
    inspectionDeadline: { type: DataTypes.DATE, allowNull: true },
    inspectionDate: { type: DataTypes.DATE, allowNull: true },
    inspectionNotes: { type: DataTypes.TEXT, allowNull: true },
    escalationStage: { type: DataTypes.STRING, allowNull: true },
    escalationDate: { type: DataTypes.DATE, allowNull: true },
    escalationNotes: { type: DataTypes.TEXT, allowNull: true },
    resolutionDescription: { type: DataTypes.TEXT, allowNull: true },
    customerSatisfied: { type: DataTypes.BOOLEAN, allowNull: true },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    capaRef: { type: DataTypes.STRING, allowNull: true },
    reviewedAtMeeting: { type: DataTypes.BOOLEAN, defaultValue: false },
    hasRepresentative: { type: DataTypes.BOOLEAN, defaultValue: false },
    representativeName: { type: DataTypes.STRING, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Action points ──────────────────────────────────────────────────────────
  await queryInterface.createTable('action_points', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    complaintId: { type: DataTypes.UUID, allowNull: false, references: { model: 'complaints', key: 'id' }, onDelete: 'CASCADE' },
    description: { type: DataTypes.TEXT, allowNull: false },
    assignedTo: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    dueDate: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Contact logs ───────────────────────────────────────────────────────────
  await queryInterface.createTable('contact_logs', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    complaintId: { type: DataTypes.UUID, allowNull: false, references: { model: 'complaints', key: 'id' }, onDelete: 'CASCADE' },
    date: { type: DataTypes.DATE, allowNull: false },
    method: { type: DataTypes.STRING, allowNull: false },
    direction: { type: DataTypes.ENUM('inbound', 'outbound'), allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: false },
    by: { type: DataTypes.STRING, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Notes ──────────────────────────────────────────────────────────────────
  await queryInterface.createTable('notes', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
    section: { type: DataTypes.ENUM('general', 'checklist', 'documents', 'files', 'complaints'), defaultValue: 'general' },
    body: { type: DataTypes.TEXT, allowNull: false },
    mentions: { type: DataTypes.JSONB, defaultValue: [] },
    authorId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    pinned: { type: DataTypes.BOOLEAN, defaultValue: false },
    editedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Audit log ──────────────────────────────────────────────────────────────
  await queryInterface.createTable('audit_logs', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    userId: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING, allowNull: false },
    entityType: { type: DataTypes.STRING, allowNull: false },
    entityId: { type: DataTypes.STRING, allowNull: false },
    oldValue: { type: DataTypes.JSONB, allowNull: true },
    newValue: { type: DataTypes.JSONB, allowNull: true },
    ipAddress: { type: DataTypes.STRING, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  });

  // ── Drive sync ─────────────────────────────────────────────────────────────
  await queryInterface.createTable('drive_sync', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    entityType: { type: DataTypes.STRING, allowNull: false },
    entityId: { type: DataTypes.UUID, allowNull: false },
    s3Key: { type: DataTypes.STRING, allowNull: false },
    fileName: { type: DataTypes.STRING, allowNull: false },
    mimeType: { type: DataTypes.STRING, allowNull: false },
    stage: { type: DataTypes.STRING, allowNull: false },
    driveFileId: { type: DataTypes.STRING, allowNull: true },
    driveUrl: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'synced', 'failed', 'skipped'), defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastError: { type: DataTypes.TEXT, allowNull: true },
    syncedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  });

  // ── Settings ───────────────────────────────────────────────────────────────
  await queryInterface.createTable('settings', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    section: { type: DataTypes.STRING, allowNull: false },
    key: { type: DataTypes.STRING, allowNull: false },
    value: { type: DataTypes.JSONB, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('settings', ['section', 'key'], { unique: true });

  // ── Indexes for common queries ─────────────────────────────────────────────
  await queryInterface.addIndex('projects', ['status']);
  await queryInterface.addIndex('projects', ['assignedTo']);
  await queryInterface.addIndex('checklists', ['projectId']);
  await queryInterface.addIndex('checklists', ['projectId', 'status']);
  await queryInterface.addIndex('notifications', ['userId', 'read']);
  await queryInterface.addIndex('complaints', ['status']);
  await queryInterface.addIndex('complaints', ['responseDeadline']);
  await queryInterface.addIndex('audit_logs', ['entityType', 'entityId']);
  await queryInterface.addIndex('audit_logs', ['userId']);
  await queryInterface.addIndex('drive_sync', ['projectId', 'status']);
  await queryInterface.addIndex('qualifications', ['staffId']);
  await queryInterface.addIndex('qualifications', ['expiresAt']);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop in reverse dependency order
  const tables = [
    'settings', 'drive_sync', 'audit_logs', 'notes', 'contact_logs',
    'action_points', 'complaints', 'qualifications', 'notifications',
    'signatures', 'documents', 'checklists', 'files',
    'password_reset_tokens', 'refresh_tokens', 'projects', 'users',
  ];
  for (const table of tables) {
    await queryInterface.dropTable(table, { cascade: true });
  }
}
