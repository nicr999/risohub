// ============================================================
// RISO HUB — New Models (v5 additions)
// All new Sequelize models for features added in Phase 5
// ============================================================

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// ─────────────────────────────────────────────
// COMPANIES (tenant scaffold — single-tenant for now)
// ─────────────────────────────────────────────

interface CompanyAttributes {
  id: number;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColour?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
interface CompanyCreationAttributes extends Optional<CompanyAttributes, 'id' | 'logoUrl' | 'primaryColour'> {}

export class Company extends Model<CompanyAttributes, CompanyCreationAttributes> implements CompanyAttributes {
  public id!: number;
  public name!: string;
  public slug!: string;
  public logoUrl?: string;
  public primaryColour?: string;
  public active!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Company.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  logoUrl: { type: DataTypes.STRING },
  primaryColour: { type: DataTypes.STRING(7) },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize, modelName: 'Company', tableName: 'companies', underscored: true });

// ─────────────────────────────────────────────
// HEAT LOSS SUMMARY
// ─────────────────────────────────────────────

interface HeatLossSummaryAttributes {
  id: number;
  projectId: number;
  designFlowTemp?: number;
  heatDemandKW?: number;
  heatLossKW?: number;
  groundFloorArea?: number;
  fabricLossKW?: number;
  ventilationLossKW?: number;
  uploadedFileId?: number;
  softwareUsed?: string;
  calculatedBy?: number;
  calculatedAt?: Date;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
interface HeatLossSummaryCreationAttributes extends Optional<HeatLossSummaryAttributes, 'id'> {}

export class HeatLossSummary extends Model<HeatLossSummaryAttributes, HeatLossSummaryCreationAttributes> implements HeatLossSummaryAttributes {
  public id!: number;
  public projectId!: number;
  public designFlowTemp?: number;
  public heatDemandKW?: number;
  public heatLossKW?: number;
  public groundFloorArea?: number;
  public fabricLossKW?: number;
  public ventilationLossKW?: number;
  public uploadedFileId?: number;
  public softwareUsed?: string;
  public calculatedBy?: number;
  public calculatedAt?: Date;
  public notes?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

HeatLossSummary.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' } },
  designFlowTemp: { type: DataTypes.FLOAT, comment: 'Degrees Celsius' },
  heatDemandKW: { type: DataTypes.FLOAT },
  heatLossKW: { type: DataTypes.FLOAT },
  groundFloorArea: { type: DataTypes.FLOAT, comment: 'Square metres' },
  fabricLossKW: { type: DataTypes.FLOAT },
  ventilationLossKW: { type: DataTypes.FLOAT },
  uploadedFileId: { type: DataTypes.INTEGER, references: { model: 'files', key: 'id' } },
  softwareUsed: { type: DataTypes.STRING, comment: 'e.g. HeatEngineer, CoolCalc' },
  calculatedBy: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
  calculatedAt: { type: DataTypes.DATE },
  notes: { type: DataTypes.TEXT },
}, { sequelize, modelName: 'HeatLossSummary', tableName: 'heat_loss_summaries', underscored: true });

// ─────────────────────────────────────────────
// MCS REGISTRATION
// ─────────────────────────────────────────────

interface MCSRegistrationAttributes {
  id: number;
  projectId: number;
  mcsNumber: string;
  registeredAt?: Date;
  registeredBy?: number;
  certificateUrl?: string;
  notes?: string;
  submittedToMCS?: boolean;
  submittedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
interface MCSRegistrationCreationAttributes extends Optional<MCSRegistrationAttributes, 'id'> {}

export class MCSRegistration extends Model<MCSRegistrationAttributes, MCSRegistrationCreationAttributes> implements MCSRegistrationAttributes {
  public id!: number;
  public projectId!: number;
  public mcsNumber!: string;
  public registeredAt?: Date;
  public registeredBy?: number;
  public certificateUrl?: string;
  public notes?: string;
  public submittedToMCS?: boolean;
  public submittedAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MCSRegistration.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  projectId: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: 'projects', key: 'id' } },
  mcsNumber: { type: DataTypes.STRING, allowNull: false },
  registeredAt: { type: DataTypes.DATE },
  registeredBy: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
  certificateUrl: { type: DataTypes.STRING },
  notes: { type: DataTypes.TEXT },
  submittedToMCS: { type: DataTypes.BOOLEAN, defaultValue: false },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
}, { sequelize, modelName: 'MCSRegistration', tableName: 'mcs_registrations', underscored: true });

// ─────────────────────────────────────────────
// SCHEDULE
// ─────────────────────────────────────────────

export type ScheduleType = 'survey' | 'design' | 'install' | 'commission' | 'audit' | 'other';

interface ScheduleAttributes {
  id: number;
  projectId: number;
  userId: number;
  type: ScheduleType;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  notes?: string;
  createdBy: number;
  createdAt?: Date;
  updatedAt?: Date;
}
interface ScheduleCreationAttributes extends Optional<ScheduleAttributes, 'id' | 'allDay'> {}

export class Schedule extends Model<ScheduleAttributes, ScheduleCreationAttributes> implements ScheduleAttributes {
  public id!: number;
  public projectId!: number;
  public userId!: number;
  public type!: ScheduleType;
  public startAt!: Date;
  public endAt!: Date;
  public allDay!: boolean;
  public notes?: string;
  public createdBy!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Schedule.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' } },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  type: { type: DataTypes.ENUM('survey', 'design', 'install', 'commission', 'audit', 'other'), allowNull: false },
  startAt: { type: DataTypes.DATE, allowNull: false },
  endAt: { type: DataTypes.DATE, allowNull: false },
  allDay: { type: DataTypes.BOOLEAN, defaultValue: false },
  notes: { type: DataTypes.TEXT },
  createdBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
}, { sequelize, modelName: 'Schedule', tableName: 'schedules', underscored: true });

// ─────────────────────────────────────────────
// SUBCONTRACTORS
// ─────────────────────────────────────────────

interface SubcontractorAttributes {
  id: number;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  trades: string[];
  notes?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
interface SubcontractorCreationAttributes extends Optional<SubcontractorAttributes, 'id' | 'company' | 'email' | 'phone' | 'notes'> {}

export class Subcontractor extends Model<SubcontractorAttributes, SubcontractorCreationAttributes> implements SubcontractorAttributes {
  public id!: number;
  public name!: string;
  public company?: string;
  public email?: string;
  public phone?: string;
  public trades!: string[];
  public notes?: string;
  public active!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Subcontractor.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  company: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  trades: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
  notes: { type: DataTypes.TEXT },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize, modelName: 'Subcontractor', tableName: 'subcontractors', underscored: true });

// ─────────────────────────────────────────────
// SUBCONTRACTOR QUALIFICATIONS
// ─────────────────────────────────────────────

interface SubcontractorQualificationAttributes {
  id: number;
  subcontractorId: number;
  type: string;
  category?: string;
  certNumber?: string;
  issuingBody?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  neverExpires: boolean;
  fileUrl?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
interface SubcontractorQualificationCreationAttributes extends Optional<SubcontractorQualificationAttributes, 'id' | 'category' | 'certNumber' | 'issuingBody' | 'issuedAt' | 'expiresAt' | 'fileUrl' | 'notes'> {}

export class SubcontractorQualification extends Model<SubcontractorQualificationAttributes, SubcontractorQualificationCreationAttributes> implements SubcontractorQualificationAttributes {
  public id!: number;
  public subcontractorId!: number;
  public type!: string;
  public category?: string;
  public certNumber?: string;
  public issuingBody?: string;
  public issuedAt?: Date;
  public expiresAt?: Date;
  public neverExpires!: boolean;
  public fileUrl?: string;
  public notes?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SubcontractorQualification.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  subcontractorId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'subcontractors', key: 'id' } },
  type: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING },
  certNumber: { type: DataTypes.STRING },
  issuingBody: { type: DataTypes.STRING },
  issuedAt: { type: DataTypes.DATEONLY },
  expiresAt: { type: DataTypes.DATEONLY },
  neverExpires: { type: DataTypes.BOOLEAN, defaultValue: false },
  fileUrl: { type: DataTypes.STRING },
  notes: { type: DataTypes.TEXT },
}, { sequelize, modelName: 'SubcontractorQualification', tableName: 'subcontractor_qualifications', underscored: true });

// ─────────────────────────────────────────────
// SUBCONTRACTOR ASSIGNMENTS
// ─────────────────────────────────────────────

interface SubcontractorAssignmentAttributes {
  id: number;
  projectId: number;
  subcontractorId: number;
  role?: string;
  assignedBy: number;
  assignedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
interface SubcontractorAssignmentCreationAttributes extends Optional<SubcontractorAssignmentAttributes, 'id' | 'role' | 'assignedAt'> {}

export class SubcontractorAssignment extends Model<SubcontractorAssignmentAttributes, SubcontractorAssignmentCreationAttributes> implements SubcontractorAssignmentAttributes {
  public id!: number;
  public projectId!: number;
  public subcontractorId!: number;
  public role?: string;
  public assignedBy!: number;
  public assignedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SubcontractorAssignment.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' } },
  subcontractorId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'subcontractors', key: 'id' } },
  role: { type: DataTypes.STRING },
  assignedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  assignedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { sequelize, modelName: 'SubcontractorAssignment', tableName: 'subcontractor_assignments', underscored: true });

// ─────────────────────────────────────────────
// CHECKLIST EVIDENCE (photo/file attached to a checklist item)
// ─────────────────────────────────────────────

interface ChecklistEvidenceAttributes {
  id: number;
  checklistItemId: number;
  fileId: number;
  note?: string;
  uploadedBy: number;
  uploadedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
interface ChecklistEvidenceCreationAttributes extends Optional<ChecklistEvidenceAttributes, 'id' | 'note' | 'uploadedAt'> {}

export class ChecklistEvidence extends Model<ChecklistEvidenceAttributes, ChecklistEvidenceCreationAttributes> implements ChecklistEvidenceAttributes {
  public id!: number;
  public checklistItemId!: number;
  public fileId!: number;
  public note?: string;
  public uploadedBy!: number;
  public uploadedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ChecklistEvidence.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  checklistItemId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'checklists', key: 'id' } },
  fileId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'files', key: 'id' } },
  note: { type: DataTypes.TEXT },
  uploadedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  uploadedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { sequelize, modelName: 'ChecklistEvidence', tableName: 'checklist_evidence', underscored: true });

// ─────────────────────────────────────────────
// SATISFACTION SURVEYS
// ─────────────────────────────────────────────

export type SurveyStatus = 'pending' | 'sent' | 'completed' | 'expired';

interface SatisfactionSurveyAttributes {
  id: number;
  projectId: number;
  tokenHash: string;
  status: SurveyStatus;
  sentAt?: Date;
  completedAt?: Date;
  rating?: number;
  comments?: string;
  wouldRecommend?: boolean;
  npsScore?: number;
  sentBy: number;
  createdAt?: Date;
  updatedAt?: Date;
}
interface SatisfactionSurveyCreationAttributes extends Optional<SatisfactionSurveyAttributes, 'id' | 'sentAt' | 'completedAt' | 'rating' | 'comments' | 'wouldRecommend' | 'npsScore'> {}

export class SatisfactionSurvey extends Model<SatisfactionSurveyAttributes, SatisfactionSurveyCreationAttributes> implements SatisfactionSurveyAttributes {
  public id!: number;
  public projectId!: number;
  public tokenHash!: string;
  public status!: SurveyStatus;
  public sentAt?: Date;
  public completedAt?: Date;
  public rating?: number;
  public comments?: string;
  public wouldRecommend?: boolean;
  public npsScore?: number;
  public sentBy!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SatisfactionSurvey.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' } },
  tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true, comment: 'SHA256 of one-time survey token' },
  status: { type: DataTypes.ENUM('pending', 'sent', 'completed', 'expired'), defaultValue: 'pending' },
  sentAt: { type: DataTypes.DATE },
  completedAt: { type: DataTypes.DATE },
  rating: { type: DataTypes.INTEGER, validate: { min: 1, max: 5 } },
  comments: { type: DataTypes.TEXT },
  wouldRecommend: { type: DataTypes.BOOLEAN },
  npsScore: { type: DataTypes.INTEGER, validate: { min: 0, max: 10 } },
  sentBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
}, { sequelize, modelName: 'SatisfactionSurvey', tableName: 'satisfaction_surveys', underscored: true });

// ─────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────

export type ReportType = 'monthly_compliance' | 'quarterly_compliance' | 'complaints_summary' | 'qualifications_audit' | 'project_pipeline' | 'custom';

interface ReportAttributes {
  id: number;
  type: ReportType;
  title: string;
  periodStart?: Date;
  periodEnd?: Date;
  generatedBy: number;
  generatedAt: Date;
  pdfUrl?: string;
  filters?: object;
  summary?: object;
  createdAt?: Date;
  updatedAt?: Date;
}
interface ReportCreationAttributes extends Optional<ReportAttributes, 'id' | 'periodStart' | 'periodEnd' | 'pdfUrl' | 'filters' | 'summary' | 'generatedAt'> {}

export class Report extends Model<ReportAttributes, ReportCreationAttributes> implements ReportAttributes {
  public id!: number;
  public type!: ReportType;
  public title!: string;
  public periodStart?: Date;
  public periodEnd?: Date;
  public generatedBy!: number;
  public generatedAt!: Date;
  public pdfUrl?: string;
  public filters?: object;
  public summary?: object;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Report.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  type: {
    type: DataTypes.ENUM('monthly_compliance', 'quarterly_compliance', 'complaints_summary', 'qualifications_audit', 'project_pipeline', 'custom'),
    allowNull: false,
  },
  title: { type: DataTypes.STRING, allowNull: false },
  periodStart: { type: DataTypes.DATEONLY },
  periodEnd: { type: DataTypes.DATEONLY },
  generatedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  generatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  pdfUrl: { type: DataTypes.STRING },
  filters: { type: DataTypes.JSONB },
  summary: { type: DataTypes.JSONB },
}, { sequelize, modelName: 'Report', tableName: 'reports', underscored: true });
