// ============================================================
// RISO HUB — migrations/005-phase7-additions.ts
// Adds:
//   - document_templates table
//   - commissioning_checklist table
//   - commissioning_checklist_evidence table
//   - customer_comms_log table
//   - Projects: partPNotified, partPRef, partPDate,
//               reccCancellationSent, reccCancellationDate,
//               reccCancellationMethod
// ============================================================

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {

  // ── document_templates ─────────────────────────────────────
  await queryInterface.createTable('document_templates', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    doc_type: {
      type: DataTypes.ENUM('handover', 'commissioning', 'riskassessment', 'final_pack', 'job_sheet', 'recc_notice'),
      allowNull: false, unique: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    // Cover page
    cover_tagline: { type: DataTypes.STRING },
    cover_bg_colour: { type: DataTypes.STRING(7) },
    cover_show_logo: { type: DataTypes.BOOLEAN, defaultValue: true },
    // Sections — JSONB array of { id, label, enabled, customText, order }
    sections: { type: DataTypes.JSONB, defaultValue: [] },
    // Footer
    footer_company_name: { type: DataTypes.STRING },
    footer_address: { type: DataTypes.STRING },
    footer_phone: { type: DataTypes.STRING },
    footer_email: { type: DataTypes.STRING },
    footer_mcs_number: { type: DataTypes.STRING },
    footer_recc_number: { type: DataTypes.STRING },
    footer_custom_text: { type: DataTypes.TEXT },
    // Content toggles
    include_heat_loss: { type: DataTypes.BOOLEAN, defaultValue: true },
    include_epc: { type: DataTypes.BOOLEAN, defaultValue: true },
    include_mcs_registration: { type: DataTypes.BOOLEAN, defaultValue: true },
    include_recommendations: { type: DataTypes.BOOLEAN, defaultValue: false },
    include_photos: { type: DataTypes.BOOLEAN, defaultValue: false },
    // Typography
    font_size_body: { type: DataTypes.INTEGER, defaultValue: 10 },
    font_size_heading: { type: DataTypes.INTEGER, defaultValue: 14 },
    // Meta
    updated_by: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  // ── commissioning_checklist ────────────────────────────────
  await queryInterface.createTable('commissioning_checklist', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    project_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
    },
    key: { type: DataTypes.STRING, allowNull: false },
    section: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    ref: { type: DataTypes.STRING },
    guidance: { type: DataTypes.TEXT },
    required: { type: DataTypes.BOOLEAN, defaultValue: true },
    status: {
      type: DataTypes.ENUM('pending', 'pass', 'fail', 'na'),
      defaultValue: 'pending',
    },
    measured_value: { type: DataTypes.STRING },  // e.g. "55°C", "1.5 bar"
    expected_value: { type: DataTypes.STRING },  // e.g. ">50°C", "1.0–1.5 bar"
    notes: { type: DataTypes.TEXT },
    na_reason: { type: DataTypes.TEXT },
    updated_by: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
    updated_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('commissioning_checklist', ['project_id']);
  await queryInterface.addIndex('commissioning_checklist', ['project_id', 'key'], { unique: true });

  // ── commissioning_checklist_evidence ───────────────────────
  await queryInterface.createTable('commissioning_checklist_evidence', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    commissioning_item_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'commissioning_checklist', key: 'id' }, onDelete: 'CASCADE',
    },
    file_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'files', key: 'id' }, onDelete: 'CASCADE',
    },
    note: { type: DataTypes.TEXT },
    uploaded_by: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    uploaded_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  // ── customer_comms_log ─────────────────────────────────────
  await queryInterface.createTable('customer_comms_log', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    project_id: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
    },
    date: { type: DataTypes.DATE, allowNull: false },
    method: {
      type: DataTypes.ENUM('phone', 'email', 'sms', 'site_visit', 'letter', 'portal', 'other'),
      allowNull: false,
    },
    direction: { type: DataTypes.ENUM('inbound', 'outbound'), allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: false },
    logged_by: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('customer_comms_log', ['project_id', 'date']);

  // ── Projects: compliance tracking fields ───────────────────
  await queryInterface.addColumn('projects', 'part_p_notified', {
    type: DataTypes.BOOLEAN, defaultValue: false,
  });
  await queryInterface.addColumn('projects', 'part_p_ref', {
    type: DataTypes.STRING,
  });
  await queryInterface.addColumn('projects', 'part_p_date', {
    type: DataTypes.DATEONLY,
  });
  await queryInterface.addColumn('projects', 'recc_cancellation_sent', {
    type: DataTypes.BOOLEAN, defaultValue: false,
  });
  await queryInterface.addColumn('projects', 'recc_cancellation_date', {
    type: DataTypes.DATEONLY,
  });
  await queryInterface.addColumn('projects', 'recc_cancellation_method', {
    type: DataTypes.STRING,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('projects', 'recc_cancellation_method');
  await queryInterface.removeColumn('projects', 'recc_cancellation_date');
  await queryInterface.removeColumn('projects', 'recc_cancellation_sent');
  await queryInterface.removeColumn('projects', 'part_p_date');
  await queryInterface.removeColumn('projects', 'part_p_ref');
  await queryInterface.removeColumn('projects', 'part_p_notified');
  await queryInterface.dropTable('customer_comms_log');
  await queryInterface.dropTable('commissioning_checklist_evidence');
  await queryInterface.dropTable('commissioning_checklist');
  await queryInterface.dropTable('document_templates');
}
