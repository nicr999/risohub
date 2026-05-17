import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  // Create tenants table
  await qi.createTable('tenants', {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    name: {
      type:      DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type:      DataTypes.STRING(64),
      allowNull: false,
      unique:    true,
    },
    planTier: {
      type:         DataTypes.ENUM('starter', 'pro', 'enterprise'),
      allowNull:    false,
      defaultValue: 'starter',
    },
    settings: {
      type:         DataTypes.JSONB,
      allowNull:    false,
      defaultValue: {},
    },
    active: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: true,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  // Add tenantId to users
  await qi.addColumn('users', 'tenantId', {
    type:      DataTypes.UUID,
    allowNull: true, // nullable for migration — tighten after backfill
    references: { model: 'tenants', key: 'id' },
  });

  // Add tenantId to projects
  await qi.addColumn('projects', 'tenantId', {
    type:      DataTypes.UUID,
    allowNull: true,
    references: { model: 'tenants', key: 'id' },
  });

  await qi.addIndex('users',    ['tenantId']);
  await qi.addIndex('projects', ['tenantId']);
  await qi.addIndex('tenants',  ['slug']);
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.removeColumn('projects', 'tenantId');
  await qi.removeColumn('users',    'tenantId');
  await qi.dropTable('tenants');
}
