import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

// ─── User ──────────────────────────────────────────────────────────────────────

export type UserRole = 'Admin' | 'Surveyor' | 'Installer' | 'Auditor';

export class User extends Model {
  public id!: string;
  public name!: string;
  public email!: string;
  public role!: UserRole;
  public passwordHash!: string;
  public twoFactorEnabled!: boolean;
  public totpSecret!: string | null;
  public active!: boolean;
  public failedLoginAttempts!: number;
  public lockedUntil!: Date | null;
  public lastLoginAt!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    role: { type: DataTypes.ENUM('Admin', 'Surveyor', 'Installer', 'Auditor'), allowNull: false },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    twoFactorEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    totpSecret: { type: DataTypes.STRING, allowNull: true },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    failedLoginAttempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE, allowNull: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'users', timestamps: true }
);

// ─── Project ───────────────────────────────────────────────────────────────────

export type ProjectStatus = 'survey' | 'design' | 'install' | 'commission' | 'audit';
export type ProjectType = 'ASHP' | 'GSHP';

export class Project extends Model {
  public id!: string;
  public customerName!: string;
  public address!: string;
  public postcode!: string;
  public status!: ProjectStatus;
  public assignedTo!: string | null;
  public projectType!: ProjectType;
  public driveFolderId!: string | null;
  public hubspotContactId!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
Project.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customerName: { type: DataTypes.STRING, allowNull: false },
    address: { type: DataTypes.STRING, allowNull: false },
    postcode: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.ENUM('survey', 'design', 'install', 'commission', 'audit'), defaultValue: 'survey' },
    assignedTo: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    projectType: { type: DataTypes.ENUM('ASHP', 'GSHP'), allowNull: false },
    driveFolderId: { type: DataTypes.STRING, allowNull: true },
    hubspotContactId: { type: DataTypes.STRING, allowNull: true },
  },
  { sequelize, tableName: 'projects', timestamps: true }
);

// ─── RefreshToken ──────────────────────────────────────────────────────────────

export class RefreshToken extends Model {
  public id!: string;
  public userId!: string;
  public tokenHash!: string;
  public expiresAt!: Date;
  public revokedAt!: Date | null;
  public ipAddress!: string | null;
  public userAgent!: string | null;
  public readonly createdAt!: Date;
}
RefreshToken.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    ipAddress: { type: DataTypes.STRING, allowNull: true },
    userAgent: { type: DataTypes.STRING, allowNull: true },
  },
  { sequelize, tableName: 'refresh_tokens', timestamps: true, updatedAt: false }
);

// ─── PasswordResetToken ────────────────────────────────────────────────────────

export class PasswordResetToken extends Model {
  public id!: string;
  public userId!: string;
  public tokenHash!: string;
  public expiresAt!: Date;
  public usedAt!: Date | null;
  public readonly createdAt!: Date;
}
PasswordResetToken.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'password_reset_tokens', timestamps: true, updatedAt: false }
);

// ─── FileModel ─────────────────────────────────────────────────────────────────

export class FileModel extends Model {
  public id!: string;
  public projectId!: string;
  public uploadedBy!: string;
  public fileUrl!: string;
  public driveUrl!: string | null;
  public category!: string;
  public stage!: string;
  public uploadedAt!: Date;
}
FileModel.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    uploadedBy: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    fileUrl: { type: DataTypes.STRING, allowNull: false },
    driveUrl: { type: DataTypes.STRING, allowNull: true },
    category: { type: DataTypes.STRING, allowNull: false },
    stage: { type: DataTypes.STRING, allowNull: false },
    uploadedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'files', timestamps: false }
);

// ─── ChecklistItem ─────────────────────────────────────────────────────────────

export type ChecklistStatus = 'pending' | 'complete' | 'noncompliant' | 'na';

export class ChecklistItem extends Model {
  public id!: string;
  public projectId!: string;
  public key!: string;
  public section!: string;
  public name!: string;
  public ref!: string;
  public guidance!: string | null;
  public required!: boolean;
  public status!: ChecklistStatus;
  public notes!: string | null;
  public naReason!: string | null;
  public updatedBy!: string | null;
  public readonly updatedAt!: Date;
}
ChecklistItem.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
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
  },
  { sequelize, tableName: 'checklists', timestamps: true, updatedAt: 'updatedAt', createdAt: false }
);

// ─── Document ──────────────────────────────────────────────────────────────────

export class Document extends Model {
  public id!: string;
  public projectId!: string;
  public docType!: 'handover' | 'commissioning' | 'riskassessment';
  public pdfUrl!: string;
  public driveUrl!: string | null;
  public version!: number;
  public sha256Hash!: string;
  public sizeBytes!: number;
  public sections!: object;
  public generatedBy!: string;
  public generatedAt!: Date;
}
Document.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    docType: { type: DataTypes.ENUM('handover', 'commissioning', 'riskassessment'), allowNull: false },
    pdfUrl: { type: DataTypes.STRING, allowNull: false },
    driveUrl: { type: DataTypes.STRING, allowNull: true },
    version: { type: DataTypes.INTEGER, defaultValue: 1 },
    sha256Hash: { type: DataTypes.STRING, allowNull: false },
    sizeBytes: { type: DataTypes.INTEGER, allowNull: false },
    sections: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    generatedBy: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    generatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'documents', timestamps: false }
);

// ─── Signature ─────────────────────────────────────────────────────────────────

export class Signature extends Model {
  public id!: string;
  public projectId!: string;
  public documentId!: string;
  public requestedBy!: string;
  public signedBy!: string | null;
  public role!: string | null;
  public status!: 'pending' | 'signed' | 'declined';
  public signatureData!: string | null;
  public pdfUrl!: string | null;
  public metadata!: object | null;
  public hash!: string | null;
  public tokenHash!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
Signature.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
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
  },
  { sequelize, tableName: 'signatures', timestamps: true }
);

// ─── Notification ──────────────────────────────────────────────────────────────

export class Notification extends Model {
  public id!: string;
  public userId!: string;
  public type!: string;
  public title!: string;
  public body!: string;
  public read!: boolean;
  public meta!: object | null;
  public readonly createdAt!: Date;
}
Notification.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    type: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    read: { type: DataTypes.BOOLEAN, defaultValue: false },
    meta: { type: DataTypes.JSONB, allowNull: true },
  },
  { sequelize, tableName: 'notifications', timestamps: true, updatedAt: false }
);

// ─── Qualification ─────────────────────────────────────────────────────────────

export class Qualification extends Model {
  public id!: string;
  public staffId!: string;
  public type!: string;
  public category!: string;
  public certNumber!: string | null;
  public issuingBody!: string;
  public issuedAt!: Date;
  public expiresAt!: Date | null;
  public neverExpires!: boolean;
  public fileUrl!: string | null;
  public notes!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
Qualification.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    staffId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    type: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
    certNumber: { type: DataTypes.STRING, allowNull: true },
    issuingBody: { type: DataTypes.STRING, allowNull: false },
    issuedAt: { type: DataTypes.DATEONLY, allowNull: false },
    expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
    neverExpires: { type: DataTypes.BOOLEAN, defaultValue: false },
    fileUrl: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, tableName: 'qualifications', timestamps: true }
);

// ─── Complaint ─────────────────────────────────────────────────────────────────

export class Complaint extends Model {
  public id!: string;
  public ref!: string;
  public projectId!: string | null;
  public customerName!: string;
  public customerEmail!: string | null;
  public customerPhone!: string | null;
  public customerAddress!: string | null;
  public receivedAt!: Date;
  public receivedMethod!: string;
  public category!: string;
  public priority!: 'standard' | 'emergency';
  public description!: string;
  public status!: 'new' | 'in_progress' | 'pending_info' | 'escalated' | 'resolved' | 'closed';
  public assignedTo!: string | null;
  public responseDeadline!: Date;
  public inspectionDeadline!: Date | null;
  public inspectionDate!: Date | null;
  public inspectionNotes!: string | null;
  public escalationStage!: string | null;
  public escalationDate!: Date | null;
  public escalationNotes!: string | null;
  public resolutionDescription!: string | null;
  public customerSatisfied!: boolean | null;
  public closedAt!: Date | null;
  public capaRef!: string | null;
  public reviewedAtMeeting!: boolean;
  public hasRepresentative!: boolean;
  public representativeName!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
Complaint.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ref: { type: DataTypes.STRING, allowNull: false, unique: true },
    projectId: { type: DataTypes.UUID, allowNull: true, references: { model: 'projects', key: 'id' } },
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
  },
  { sequelize, tableName: 'complaints', timestamps: true }
);

// ─── ActionPoint ───────────────────────────────────────────────────────────────

export class ActionPoint extends Model {
  public id!: string;
  public complaintId!: string;
  public description!: string;
  public assignedTo!: string | null;
  public dueDate!: Date | null;
  public completedAt!: Date | null;
  public notes!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
ActionPoint.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    complaintId: { type: DataTypes.UUID, allowNull: false, references: { model: 'complaints', key: 'id' } },
    description: { type: DataTypes.TEXT, allowNull: false },
    assignedTo: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    dueDate: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, tableName: 'action_points', timestamps: true }
);

// ─── ContactLog ────────────────────────────────────────────────────────────────

export class ContactLog extends Model {
  public id!: string;
  public complaintId!: string;
  public date!: Date;
  public method!: string;
  public direction!: 'inbound' | 'outbound';
  public summary!: string;
  public by!: string;
  public readonly createdAt!: Date;
}
ContactLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    complaintId: { type: DataTypes.UUID, allowNull: false, references: { model: 'complaints', key: 'id' } },
    date: { type: DataTypes.DATE, allowNull: false },
    method: { type: DataTypes.STRING, allowNull: false },
    direction: { type: DataTypes.ENUM('inbound', 'outbound'), allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: false },
    by: { type: DataTypes.STRING, allowNull: false },
  },
  { sequelize, tableName: 'contact_logs', timestamps: true, updatedAt: false }
);

// ─── Note ──────────────────────────────────────────────────────────────────────

export type NoteSection = 'general' | 'checklist' | 'documents' | 'files' | 'complaints';

export class Note extends Model {
  public id!: string;
  public projectId!: string;
  public section!: NoteSection;
  public body!: string;
  public mentions!: Array<{ userId: string; name: string }>;
  public authorId!: string;
  public pinned!: boolean;
  public editedAt!: Date | null;
  public readonly createdAt!: Date;
}
Note.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    section: { type: DataTypes.ENUM('general', 'checklist', 'documents', 'files', 'complaints'), allowNull: false, defaultValue: 'general' },
    body: { type: DataTypes.TEXT, allowNull: false },
    mentions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    authorId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    pinned: { type: DataTypes.BOOLEAN, defaultValue: false },
    editedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'notes', timestamps: true, updatedAt: false }
);

// ─── AuditLog ──────────────────────────────────────────────────────────────────

export class AuditLog extends Model {
  public id!: string;
  public timestamp!: Date;
  public userId!: string | null;
  public action!: string;
  public entityType!: string;
  public entityId!: string;
  public oldValue!: object | null;
  public newValue!: object | null;
  public ipAddress!: string | null;
  public metadata!: object | null;
}
AuditLog.init(
  {
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
  },
  { sequelize, tableName: 'audit_logs', timestamps: false }
);

// ─── DriveSync ─────────────────────────────────────────────────────────────────

export class DriveSync extends Model {
  public id!: string;
  public projectId!: string;
  public entityType!: string;
  public entityId!: string;
  public s3Key!: string;
  public fileName!: string;
  public mimeType!: string;
  public stage!: string;
  public driveFileId!: string | null;
  public driveUrl!: string | null;
  public status!: 'pending' | 'synced' | 'failed' | 'skipped';
  public attempts!: number;
  public lastError!: string | null;
  public syncedAt!: Date | null;
  public readonly createdAt!: Date;
}
DriveSync.init(
  {
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
  },
  { sequelize, tableName: 'drive_sync', timestamps: true, updatedAt: false }
);

// ─── Setting ───────────────────────────────────────────────────────────────────

export class Setting extends Model {
  public id!: string;
  public section!: string;
  public key!: string;
  public value!: any;
  public updatedBy!: string | null;
  public readonly updatedAt!: Date;
}
Setting.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    section: { type: DataTypes.STRING, allowNull: false },
    key: { type: DataTypes.STRING, allowNull: false },
    value: { type: DataTypes.JSONB, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, tableName: 'settings', timestamps: true, createdAt: false, indexes: [{ unique: true, fields: ['section', 'key'] }] }
);

// ─── DeviceToken ──────────────────────────────────────────────────────────────

export class DeviceToken extends Model {
  public id!: string;
  public userId!: string;
  public token!: string;
  public platform!: 'ios' | 'android';
  public lastActiveAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
DeviceToken.init(
  {
    id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId:       { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    token:        { type: DataTypes.TEXT, allowNull: false, unique: true },
    platform:     { type: DataTypes.ENUM('ios', 'android'), allowNull: false, defaultValue: 'android' },
    lastActiveAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'device_tokens', timestamps: true }
);

// ─── Invoice ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export class Invoice extends Model {
  public id!: string;
  public projectId!: string;
  public createdBy!: string;
  public stripeCustomerId!: string | null;
  public stripeInvoiceId!: string | null;
  public invoiceUrl!: string | null;
  public amount!: number;
  public currency!: string;
  public status!: InvoiceStatus;
  public description!: string | null;
  public lineItems!: any[];
  public dueDate!: string | null;
  public paidAt!: Date | null;
  public customerEmail!: string | null;
  public customerName!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
Invoice.init(
  {
    id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId:        { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
    createdBy:        { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    stripeCustomerId: { type: DataTypes.STRING, allowNull: true },
    stripeInvoiceId:  { type: DataTypes.STRING, allowNull: true, unique: true },
    invoiceUrl:       { type: DataTypes.TEXT, allowNull: true },
    amount:           { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    currency:         { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'gbp' },
    status:           { type: DataTypes.ENUM('draft', 'open', 'paid', 'void', 'uncollectible'), allowNull: false, defaultValue: 'draft' },
    description:      { type: DataTypes.TEXT, allowNull: true },
    lineItems:        { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    dueDate:          { type: DataTypes.DATEONLY, allowNull: true },
    paidAt:           { type: DataTypes.DATE, allowNull: true },
    customerEmail:    { type: DataTypes.STRING, allowNull: true },
    customerName:     { type: DataTypes.STRING, allowNull: true },
  },
  { sequelize, tableName: 'invoices', timestamps: true }
);

// ─── Tenant ───────────────────────────────────────────────────────────────────

export type TenantPlan = 'starter' | 'pro' | 'enterprise';

export class Tenant extends Model {
  public id!: string;
  public name!: string;
  public slug!: string;
  public planTier!: TenantPlan;
  public settings!: Record<string, any>;
  public active!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}
Tenant.init(
  {
    id:       { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name:     { type: DataTypes.STRING, allowNull: false },
    slug:     { type: DataTypes.STRING(64), allowNull: false, unique: true },
    planTier: { type: DataTypes.ENUM('starter', 'pro', 'enterprise'), allowNull: false, defaultValue: 'starter' },
    settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    active:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, tableName: 'tenants', timestamps: true }
);

// ─── Associations (all defined once, here) ────────────────────────────────────

User.hasMany(Project, { foreignKey: 'assignedTo', as: 'projects' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
User.hasMany(Qualification, { foreignKey: 'staffId', as: 'qualifications' });
User.hasMany(RefreshToken, { foreignKey: 'userId' });
User.hasMany(PasswordResetToken, { foreignKey: 'userId' });
User.hasMany(DeviceToken, { foreignKey: 'userId', as: 'deviceTokens' });
User.hasMany(Invoice, { foreignKey: 'createdBy', as: 'createdInvoices' });

Project.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignee' });
Project.hasMany(FileModel, { foreignKey: 'projectId', as: 'files' });
Project.hasMany(ChecklistItem, { foreignKey: 'projectId', as: 'checklistItems' });
Project.hasMany(Document, { foreignKey: 'projectId', as: 'documents' });
Project.hasMany(Signature, { foreignKey: 'projectId', as: 'signatures' });
Project.hasMany(Complaint, { foreignKey: 'projectId', as: 'complaints' });
Project.hasMany(Note, { foreignKey: 'projectId', as: 'notes' });
Project.hasMany(Invoice, { foreignKey: 'projectId', as: 'invoices' });

Invoice.belongsTo(Project, { foreignKey: 'projectId' });
Invoice.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

DeviceToken.belongsTo(User, { foreignKey: 'userId' });

FileModel.belongsTo(Project, { foreignKey: 'projectId' });
FileModel.belongsTo(User, { foreignKey: 'uploadedBy', as: 'uploader' });

ChecklistItem.belongsTo(Project, { foreignKey: 'projectId' });
ChecklistItem.belongsTo(User, { foreignKey: 'updatedBy', as: 'updatedByUser' });

Document.belongsTo(Project, { foreignKey: 'projectId' });
Document.belongsTo(User, { foreignKey: 'generatedBy', as: 'generator' });
Document.hasMany(Signature, { foreignKey: 'documentId', as: 'signatures' });

Signature.belongsTo(Project, { foreignKey: 'projectId' });
Signature.belongsTo(Document, { foreignKey: 'documentId' });
Signature.belongsTo(User, { foreignKey: 'requestedBy', as: 'requester' });

Notification.belongsTo(User, { foreignKey: 'userId' });
Qualification.belongsTo(User, { foreignKey: 'staffId', as: 'staff' });

Complaint.belongsTo(Project, { foreignKey: 'projectId' });
Complaint.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignee' });
Complaint.hasMany(ActionPoint, { foreignKey: 'complaintId', as: 'actionPoints' });
Complaint.hasMany(ContactLog, { foreignKey: 'complaintId', as: 'contactLogs' });

ActionPoint.belongsTo(Complaint, { foreignKey: 'complaintId' });
ActionPoint.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignee' });

ContactLog.belongsTo(Complaint, { foreignKey: 'complaintId' });

Note.belongsTo(Project, { foreignKey: 'projectId' });
Note.belongsTo(User, { foreignKey: 'authorId', as: 'author' });

RefreshToken.belongsTo(User, { foreignKey: 'userId' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId' });
