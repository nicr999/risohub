import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  await qi.createTable('device_tokens', {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    userId: {
      type:       DataTypes.UUID,
      allowNull:  false,
      references: { model: 'users', key: 'id' },
      onDelete:   'CASCADE',
    },
    token: {
      type:      DataTypes.TEXT,
      allowNull: false,
    },
    platform: {
      type:         DataTypes.ENUM('ios', 'android'),
      allowNull:    false,
      defaultValue: 'android',
    },
    lastActiveAt: {
      type:         DataTypes.DATE,
      allowNull:    false,
      defaultValue: DataTypes.NOW,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('device_tokens', ['userId']);
  await qi.addIndex('device_tokens', ['token'], { unique: true });
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.dropTable('device_tokens');
}
