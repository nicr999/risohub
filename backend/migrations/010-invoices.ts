import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  await qi.createTable('invoices', {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    projectId: {
      type:       DataTypes.UUID,
      allowNull:  false,
      references: { model: 'projects', key: 'id' },
      onDelete:   'CASCADE',
    },
    createdBy: {
      type:       DataTypes.UUID,
      allowNull:  false,
      references: { model: 'users', key: 'id' },
    },
    stripeCustomerId: {
      type:      DataTypes.STRING,
      allowNull: true,
    },
    stripeInvoiceId: {
      type:      DataTypes.STRING,
      allowNull: true,
      unique:    true,
    },
    invoiceUrl: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    amount: {
      type:      DataTypes.INTEGER, // pence
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type:         DataTypes.STRING(3),
      allowNull:    false,
      defaultValue: 'gbp',
    },
    status: {
      type:         DataTypes.ENUM('draft', 'open', 'paid', 'void', 'uncollectible'),
      allowNull:    false,
      defaultValue: 'draft',
    },
    description: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    lineItems: {
      type:         DataTypes.JSONB,
      allowNull:    false,
      defaultValue: [],
    },
    dueDate: {
      type:      DataTypes.DATEONLY,
      allowNull: true,
    },
    paidAt: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    customerEmail: {
      type:      DataTypes.STRING,
      allowNull: true,
    },
    customerName: {
      type:      DataTypes.STRING,
      allowNull: true,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.addIndex('invoices', ['projectId']);
  await qi.addIndex('invoices', ['status']);
  await qi.addIndex('invoices', ['stripeCustomerId']);
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.dropTable('invoices');
}
