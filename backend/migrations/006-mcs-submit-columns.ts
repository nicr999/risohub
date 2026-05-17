// migrations/006-mcs-submit-columns.ts
// Adds submitted_to_mcs and submitted_at to mcs_registrations.
// Run automatically on next deploy via scripts/migrate.ts.

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('mcs_registrations', 'submitted_to_mcs', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  await queryInterface.addColumn('mcs_registrations', 'submitted_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('mcs_registrations', 'submitted_at');
  await queryInterface.removeColumn('mcs_registrations', 'submitted_to_mcs');
}
