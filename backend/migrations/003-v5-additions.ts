// ============================================================
// RISO HUB — migrations/003-v5-additions.ts
// Adds all Phase 5 tables + companyId column to users
// ============================================================

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ── companies ──────────────────────────────────────────────
  await queryInterface.createTable('companies', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    logoUrl: { type: DataTypes.STRING, field: 'logo_url' },
    primaryColour: { type: DataTypes.STRING(7), field: 'primary_colour' },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'updated_at' },
  });

  // Add companyId to users (nullable — single-tenant safe)
  await queryInterface.addColumn('users', 'company_id', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'companies', key: 'id' },
    onDelete: 'SET NULL',
  });

  // ── heat_loss_summaries ────────────────────────────────────
  await queryInterface.createTable('heat_loss_summaries', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    project_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
    },
    design_flow_temp: { type: DataTypes.FLOAT },
    heat_demand_kw: { type: DataTypes.FLOAT },
    heat_loss_kw: { type: DataTypes.FLOAT },
    ground_floor_area: { type: DataTypes.FLOAT },
    fabric_loss_kw: { type: DataTypes.FLOAT },
    ventilation_loss_kw: { type: DataTypes.FLOAT },
    uploaded_file_id: { type: DataTypes.INTEGER, references: { model: 'files', key: 'id' }, onDelete: 'SET NULL' },
    software_used: { type: DataTypes.STRING },
    calculated_by: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    calculated_at: { type: DataTypes.DATE },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('heat_loss_summaries', ['project_id'], { unique: true });

  // ── mcs_registrations ──────────────────────────────────────
  await queryInterface.createTable('mcs_registrations', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    project_id: {
      type: DataTypes.INTEGER, allowNull: false, unique: true,
      references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
    },
    mcs_number: { type: DataTypes.STRING, allowNull: false },
    registered_at: { type: DataTypes.DATE },
    registered_by: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    certificate_url: { type: DataTypes.STRING },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  // ── schedules ──────────────────────────────────────────────
  await queryInterface.createTable('schedules', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    project_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
    },
    user_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'users', key: 'id' }, onDelete: 'CASCADE',
    },
    type: {
      type: DataTypes.ENUM('survey', 'design', 'install', 'commission', 'audit', 'other'),
      allowNull: false,
    },
    start_at: { type: DataTypes.DATE, allowNull: false },
    end_at: { type: DataTypes.DATE, allowNull: false },
    all_day: { type: DataTypes.BOOLEAN, defaultValue: false },
    notes: { type: DataTypes.TEXT },
    created_by: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT',
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('schedules', ['user_id', 'start_at']);
  await queryInterface.addIndex('schedules', ['project_id']);

  // ── subcontractors ─────────────────────────────────────────
  await queryInterface.createTable('subcontractors', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    company: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    trades: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    notes: { type: DataTypes.TEXT },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  // ── subcontractor_qualifications ───────────────────────────
  await queryInterface.createTable('subcontractor_qualifications', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    subcontractor_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'subcontractors', key: 'id' }, onDelete: 'CASCADE',
    },
    type: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING },
    cert_number: { type: DataTypes.STRING },
    issuing_body: { type: DataTypes.STRING },
    issued_at: { type: DataTypes.DATEONLY },
    expires_at: { type: DataTypes.DATEONLY },
    never_expires: { type: DataTypes.BOOLEAN, defaultValue: false },
    file_url: { type: DataTypes.STRING },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  // ── subcontractor_assignments ──────────────────────────────
  await queryInterface.createTable('subcontractor_assignments', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    project_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
    },
    subcontractor_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'subcontractors', key: 'id' }, onDelete: 'CASCADE',
    },
    role: { type: DataTypes.STRING },
    assigned_by: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT',
    },
    assigned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('subcontractor_assignments', ['project_id', 'subcontractor_id'], { unique: true });

  // ── checklist_evidence ─────────────────────────────────────
  await queryInterface.createTable('checklist_evidence', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    checklist_item_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'checklists', key: 'id' }, onDelete: 'CASCADE',
    },
    file_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'files', key: 'id' }, onDelete: 'CASCADE',
    },
    note: { type: DataTypes.TEXT },
    uploaded_by: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT',
    },
    uploaded_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('checklist_evidence', ['checklist_item_id']);

  // ── satisfaction_surveys ───────────────────────────────────
  await queryInterface.createTable('satisfaction_surveys', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    project_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
    },
    token_hash: { type: DataTypes.STRING, allowNull: false, unique: true },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'completed', 'expired'),
      defaultValue: 'pending',
    },
    sent_at: { type: DataTypes.DATE },
    completed_at: { type: DataTypes.DATE },
    rating: { type: DataTypes.INTEGER },
    comments: { type: DataTypes.TEXT },
    would_recommend: { type: DataTypes.BOOLEAN },
    nps_score: { type: DataTypes.INTEGER },
    sent_by: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT',
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('satisfaction_surveys', ['project_id']);

  // ── reports ────────────────────────────────────────────────
  await queryInterface.createTable('reports', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    type: {
      type: DataTypes.ENUM(
        'monthly_compliance', 'quarterly_compliance', 'complaints_summary',
        'qualifications_audit', 'project_pipeline', 'custom'
      ),
      allowNull: false,
    },
    title: { type: DataTypes.STRING, allowNull: false },
    period_start: { type: DataTypes.DATEONLY },
    period_end: { type: DataTypes.DATEONLY },
    generated_by: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT',
    },
    generated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    pdf_url: { type: DataTypes.STRING },
    filters: { type: DataTypes.JSONB },
    summary: { type: DataTypes.JSONB },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('reports', ['type', 'generated_at']);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop in reverse dependency order
  await queryInterface.dropTable('reports');
  await queryInterface.dropTable('satisfaction_surveys');
  await queryInterface.dropTable('checklist_evidence');
  await queryInterface.dropTable('subcontractor_assignments');
  await queryInterface.dropTable('subcontractor_qualifications');
  await queryInterface.dropTable('subcontractors');
  await queryInterface.dropTable('schedules');
  await queryInterface.dropTable('mcs_registrations');
  await queryInterface.dropTable('heat_loss_summaries');
  await queryInterface.removeColumn('users', 'company_id');
  await queryInterface.dropTable('companies');
}
