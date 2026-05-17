import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Run this migration if you already have a deployed database from migration 001.
 * If you're starting fresh, 001-create-all-tables.ts already includes this column.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('projects', 'hubspotContactId', {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    comment: 'HubSpot contact ID — used to link project to CRM record',
  });

  // Index for fast lookups by HubSpot ID (e.g. "has this contact already got a project?")
  await queryInterface.addIndex('projects', ['hubspotContactId'], {
    name: 'projects_hubspot_contact_id_idx',
    where: { hubspotContactId: { [Symbol.for('ne')]: null } }, // partial index — only indexed rows
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('projects', 'projects_hubspot_contact_id_idx');
  await queryInterface.removeColumn('projects', 'hubspotContactId');
}
