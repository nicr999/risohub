// migrations/008-webhooks.ts
import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface) {
  await queryInterface.createTable('webhook_endpoints', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    url: { type: DataTypes.TEXT, allowNull: false },
    secret: { type: DataTypes.TEXT, allowNull: false },
    events: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    description: { type: DataTypes.TEXT, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'users', key: 'id' }, onDelete: 'CASCADE',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.createTable('webhook_deliveries', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    endpointId: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'webhook_endpoints', key: 'id' }, onDelete: 'CASCADE',
    },
    event: { type: DataTypes.STRING(100), allowNull: false },
    payload: { type: DataTypes.TEXT, allowNull: false },
    attempt: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    responseStatus: { type: DataTypes.INTEGER, allowNull: true },
    success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
    deliveredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('webhook_deliveries', ['endpointId']);
  await queryInterface.addIndex('webhook_deliveries', ['event']);
  await queryInterface.addIndex('webhook_deliveries', ['deliveredAt']);
}

export async function down(queryInterface: QueryInterface) {
  await queryInterface.dropTable('webhook_deliveries');
  await queryInterface.dropTable('webhook_endpoints');
}
