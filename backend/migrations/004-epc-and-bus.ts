// ============================================================
// RISO HUB — migrations/004-epc-and-bus.ts
// Adds epc_records and bus_eligibility tables
// ============================================================

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {

  // ── epc_records ────────────────────────────────────────────
  await queryInterface.createTable('epc_records', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    project_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
    },
    lmk_key: { type: DataTypes.STRING, allowNull: false },
    certificate_ref: { type: DataTypes.STRING },
    address: { type: DataTypes.STRING, allowNull: false },
    postcode: { type: DataTypes.STRING, allowNull: false },
    property_type: { type: DataTypes.STRING },
    built_form: { type: DataTypes.STRING },
    construction_age_band: { type: DataTypes.STRING },
    total_floor_area: { type: DataTypes.FLOAT },
    current_energy_rating: { type: DataTypes.STRING(2), allowNull: false },
    current_energy_efficiency: { type: DataTypes.INTEGER, allowNull: false },
    potential_energy_rating: { type: DataTypes.STRING(2) },
    potential_energy_efficiency: { type: DataTypes.INTEGER },
    main_heating_description: { type: DataTypes.STRING },
    main_fuel: { type: DataTypes.STRING },
    roof_description: { type: DataTypes.TEXT },
    roof_energy_eff: { type: DataTypes.STRING },
    wall_description: { type: DataTypes.TEXT },
    wall_energy_eff: { type: DataTypes.STRING },
    hot_water_description: { type: DataTypes.STRING },
    recommendations: { type: DataTypes.JSONB },
    lodgement_date: { type: DataTypes.DATEONLY },
    inspection_date: { type: DataTypes.DATEONLY },
    fetched_by: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT',
    },
    fetched_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    raw: { type: DataTypes.JSONB },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('epc_records', ['project_id']);
  await queryInterface.addIndex('epc_records', ['postcode']);
  await queryInterface.addIndex('epc_records', ['lmk_key']);

  // ── bus_eligibility ────────────────────────────────────────
  await queryInterface.createTable('bus_eligibility', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    project_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
    },
    epc_record_id: {
      type: DataTypes.INTEGER,
      references: { model: 'epc_records', key: 'id' }, onDelete: 'SET NULL',
    },
    verdict: {
      type: DataTypes.ENUM('eligible', 'ineligible', 'likely_eligible', 'requires_review'),
      allowNull: false,
    },
    criteria: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    blockers: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    warnings: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    grant_amount: { type: DataTypes.INTEGER },
    assessed_by: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT',
    },
    assessed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('bus_eligibility', ['project_id']);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('bus_eligibility');
  await queryInterface.dropTable('epc_records');
}
