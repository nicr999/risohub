// ============================================================
// RISO HUB — models/phase7Models.ts
// DocumentTemplate, CommissioningChecklist,
// CommissioningChecklistEvidence, CustomerCommsLog
// ============================================================

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// ─────────────────────────────────────────────
// DOCUMENT TEMPLATE
// ─────────────────────────────────────────────

export type DocTemplateType =
  | 'handover' | 'commissioning' | 'riskassessment'
  | 'final_pack' | 'job_sheet' | 'recc_notice';

export interface TemplateSection {
  id: string;
  label: string;
  enabled: boolean;
  customText?: string;
  order: number;
}

interface DocumentTemplateAttributes {
  id: number;
  docType: DocTemplateType;
  name: string;
  // Cover
  coverTagline?: string;
  coverBgColour?: string;
  coverShowLogo: boolean;
  // Sections
  sections: TemplateSection[];
  // Footer
  footerCompanyName?: string;
  footerAddress?: string;
  footerPhone?: string;
  footerEmail?: string;
  footerMcsNumber?: string;
  footerReccNumber?: string;
  footerCustomText?: string;
  // Toggles
  includeHeatLoss: boolean;
  includeEpc: boolean;
  includeMcsRegistration: boolean;
  includeRecommendations: boolean;
  includePhotos: boolean;
  // Typography
  fontSizeBody: number;
  fontSizeHeading: number;
  // Meta
  updatedBy?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface DocumentTemplateCreationAttributes
  extends Optional<DocumentTemplateAttributes, 'id' | 'coverTagline' | 'coverBgColour' | 'footerCompanyName' | 'footerAddress' | 'footerPhone' | 'footerEmail' | 'footerMcsNumber' | 'footerReccNumber' | 'footerCustomText' | 'updatedBy'> {}

export class DocumentTemplate extends Model<DocumentTemplateAttributes, DocumentTemplateCreationAttributes>
  implements DocumentTemplateAttributes {
  public id!: number;
  public docType!: DocTemplateType;
  public name!: string;
  public coverTagline?: string;
  public coverBgColour?: string;
  public coverShowLogo!: boolean;
  public sections!: TemplateSection[];
  public footerCompanyName?: string;
  public footerAddress?: string;
  public footerPhone?: string;
  public footerEmail?: string;
  public footerMcsNumber?: string;
  public footerReccNumber?: string;
  public footerCustomText?: string;
  public includeHeatLoss!: boolean;
  public includeEpc!: boolean;
  public includeMcsRegistration!: boolean;
  public includeRecommendations!: boolean;
  public includePhotos!: boolean;
  public fontSizeBody!: number;
  public fontSizeHeading!: number;
  public updatedBy?: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

DocumentTemplate.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  docType: { type: DataTypes.ENUM('handover', 'commissioning', 'riskassessment', 'final_pack', 'job_sheet', 'recc_notice'), allowNull: false, unique: true, field: 'doc_type' },
  name: { type: DataTypes.STRING, allowNull: false },
  coverTagline: { type: DataTypes.STRING, field: 'cover_tagline' },
  coverBgColour: { type: DataTypes.STRING(7), field: 'cover_bg_colour' },
  coverShowLogo: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'cover_show_logo' },
  sections: { type: DataTypes.JSONB, defaultValue: [] },
  footerCompanyName: { type: DataTypes.STRING, field: 'footer_company_name' },
  footerAddress: { type: DataTypes.STRING, field: 'footer_address' },
  footerPhone: { type: DataTypes.STRING, field: 'footer_phone' },
  footerEmail: { type: DataTypes.STRING, field: 'footer_email' },
  footerMcsNumber: { type: DataTypes.STRING, field: 'footer_mcs_number' },
  footerReccNumber: { type: DataTypes.STRING, field: 'footer_recc_number' },
  footerCustomText: { type: DataTypes.TEXT, field: 'footer_custom_text' },
  includeHeatLoss: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'include_heat_loss' },
  includeEpc: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'include_epc' },
  includeMcsRegistration: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'include_mcs_registration' },
  includeRecommendations: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'include_recommendations' },
  includePhotos: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'include_photos' },
  fontSizeBody: { type: DataTypes.INTEGER, defaultValue: 10, field: 'font_size_body' },
  fontSizeHeading: { type: DataTypes.INTEGER, defaultValue: 14, field: 'font_size_heading' },
  updatedBy: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' }, field: 'updated_by' },
}, { sequelize, modelName: 'DocumentTemplate', tableName: 'document_templates' });

// ─────────────────────────────────────────────
// COMMISSIONING CHECKLIST
// ─────────────────────────────────────────────

export type CommissioningStatus = 'pending' | 'pass' | 'fail' | 'na';

interface CommissioningChecklistAttributes {
  id: number;
  projectId: number;
  key: string;
  section: string;
  name: string;
  ref?: string;
  guidance?: string;
  required: boolean;
  status: CommissioningStatus;
  measuredValue?: string;
  expectedValue?: string;
  notes?: string;
  naReason?: string;
  updatedBy?: number;
  updatedAt?: Date;
  createdAt?: Date;
}

interface CommissioningChecklistCreationAttributes
  extends Optional<CommissioningChecklistAttributes, 'id' | 'ref' | 'guidance' | 'measuredValue' | 'expectedValue' | 'notes' | 'naReason' | 'updatedBy' | 'updatedAt'> {}

export class CommissioningChecklist extends Model<CommissioningChecklistAttributes, CommissioningChecklistCreationAttributes>
  implements CommissioningChecklistAttributes {
  public id!: number;
  public projectId!: number;
  public key!: string;
  public section!: string;
  public name!: string;
  public ref?: string;
  public guidance?: string;
  public required!: boolean;
  public status!: CommissioningStatus;
  public measuredValue?: string;
  public expectedValue?: string;
  public notes?: string;
  public naReason?: string;
  public updatedBy?: number;
  public readonly updatedAt!: Date;
  public readonly createdAt!: Date;
}

CommissioningChecklist.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE', field: 'project_id' },
  key: { type: DataTypes.STRING, allowNull: false },
  section: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  ref: { type: DataTypes.STRING },
  guidance: { type: DataTypes.TEXT },
  required: { type: DataTypes.BOOLEAN, defaultValue: true },
  status: { type: DataTypes.ENUM('pending', 'pass', 'fail', 'na'), defaultValue: 'pending' },
  measuredValue: { type: DataTypes.STRING, field: 'measured_value' },
  expectedValue: { type: DataTypes.STRING, field: 'expected_value' },
  notes: { type: DataTypes.TEXT },
  naReason: { type: DataTypes.TEXT, field: 'na_reason' },
  updatedBy: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' }, field: 'updated_by' },
  updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
}, { sequelize, modelName: 'CommissioningChecklist', tableName: 'commissioning_checklist' });

// ─────────────────────────────────────────────
// COMMISSIONING CHECKLIST EVIDENCE
// ─────────────────────────────────────────────

interface CommissioningEvidenceAttributes {
  id: number;
  commissioningItemId: number;
  fileId: number;
  note?: string;
  uploadedBy: number;
  uploadedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CommissioningEvidenceCreationAttributes
  extends Optional<CommissioningEvidenceAttributes, 'id' | 'note' | 'uploadedAt'> {}

export class CommissioningChecklistEvidence extends Model<CommissioningEvidenceAttributes, CommissioningEvidenceCreationAttributes>
  implements CommissioningEvidenceAttributes {
  public id!: number;
  public commissioningItemId!: number;
  public fileId!: number;
  public note?: string;
  public uploadedBy!: number;
  public uploadedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

CommissioningChecklistEvidence.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  commissioningItemId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'commissioning_checklist', key: 'id' }, onDelete: 'CASCADE', field: 'commissioning_item_id' },
  fileId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'files', key: 'id' }, onDelete: 'CASCADE', field: 'file_id' },
  note: { type: DataTypes.TEXT },
  uploadedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, field: 'uploaded_by' },
  uploadedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'uploaded_at' },
}, { sequelize, modelName: 'CommissioningChecklistEvidence', tableName: 'commissioning_checklist_evidence' });

// ─────────────────────────────────────────────
// CUSTOMER COMMS LOG
// ─────────────────────────────────────────────

export type CommsMethod = 'phone' | 'email' | 'sms' | 'site_visit' | 'letter' | 'portal' | 'other';
export type CommsDirection = 'inbound' | 'outbound';

interface CustomerCommsLogAttributes {
  id: number;
  projectId: number;
  date: Date;
  method: CommsMethod;
  direction: CommsDirection;
  summary: string;
  loggedBy: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CustomerCommsLogCreationAttributes extends Optional<CustomerCommsLogAttributes, 'id'> {}

export class CustomerCommsLog extends Model<CustomerCommsLogAttributes, CustomerCommsLogCreationAttributes>
  implements CustomerCommsLogAttributes {
  public id!: number;
  public projectId!: number;
  public date!: Date;
  public method!: CommsMethod;
  public direction!: CommsDirection;
  public summary!: string;
  public loggedBy!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

CustomerCommsLog.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE', field: 'project_id' },
  date: { type: DataTypes.DATE, allowNull: false },
  method: { type: DataTypes.ENUM('phone', 'email', 'sms', 'site_visit', 'letter', 'portal', 'other'), allowNull: false },
  direction: { type: DataTypes.ENUM('inbound', 'outbound'), allowNull: false },
  summary: { type: DataTypes.TEXT, allowNull: false },
  loggedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, field: 'logged_by' },
}, { sequelize, modelName: 'CustomerCommsLog', tableName: 'customer_comms_log' });
