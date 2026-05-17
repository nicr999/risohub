// ============================================================
// RISO HUB — models/EPCRecord.ts + BUSEligibility.ts
// ============================================================

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// ─────────────────────────────────────────────
// EPC RECORD
// Stores fetched EPC certificate data per project
// ─────────────────────────────────────────────

export interface EPCRecordAttributes {
  id: number;
  projectId: number;
  // Certificate identifiers
  lmkKey: string;              // EPC register unique key
  certificateRef?: string;
  // Property details
  address: string;
  postcode: string;
  propertyType?: string;       // House / Flat / Bungalow / Maisonette / Park home
  builtForm?: string;          // Detached / Semi-Detached / End-Terrace / Mid-Terrace / Enclosed End-Terrace / Enclosed Mid-Terrace
  constructionAgeBand?: string;
  totalFloorArea?: number;     // m²
  // EPC ratings
  currentEnergyRating: string; // A–G
  currentEnergyEfficiency: number; // 1–100
  potentialEnergyRating?: string;
  potentialEnergyEfficiency?: number;
  // Heating
  mainHeatingDescription?: string;
  mainFuel?: string;
  // Insulation flags (critical for BUS)
  roofDescription?: string;
  roofEnergyEff?: string;      // Very Good / Good / Average / Poor / Very Poor
  wallDescription?: string;
  wallEnergyEff?: string;
  hotWaterDescription?: string;
  // Recommendations (JSON array of {improvement, indicativeCost, typicalSaving})
  recommendations?: object;
  // Lodgement date — must be post April 2022 for BUS
  lodgementDate?: Date;
  inspectionDate?: Date;
  // Meta
  fetchedBy: number;
  fetchedAt: Date;
  raw?: object;                // full API response for reference
  createdAt?: Date;
  updatedAt?: Date;
}

interface EPCRecordCreationAttributes extends Optional<EPCRecordAttributes, 'id' | 'fetchedAt'> {}

export class EPCRecord extends Model<EPCRecordAttributes, EPCRecordCreationAttributes>
  implements EPCRecordAttributes {
  public id!: number;
  public projectId!: number;
  public lmkKey!: string;
  public certificateRef?: string;
  public address!: string;
  public postcode!: string;
  public propertyType?: string;
  public builtForm?: string;
  public constructionAgeBand?: string;
  public totalFloorArea?: number;
  public currentEnergyRating!: string;
  public currentEnergyEfficiency!: number;
  public potentialEnergyRating?: string;
  public potentialEnergyEfficiency?: number;
  public mainHeatingDescription?: string;
  public mainFuel?: string;
  public roofDescription?: string;
  public roofEnergyEff?: string;
  public wallDescription?: string;
  public wallEnergyEff?: string;
  public hotWaterDescription?: string;
  public recommendations?: object;
  public lodgementDate?: Date;
  public inspectionDate?: Date;
  public fetchedBy!: number;
  public fetchedAt!: Date;
  public raw?: object;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

EPCRecord.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
  lmkKey: { type: DataTypes.STRING, allowNull: false },
  certificateRef: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING, allowNull: false },
  postcode: { type: DataTypes.STRING, allowNull: false },
  propertyType: { type: DataTypes.STRING },
  builtForm: { type: DataTypes.STRING },
  constructionAgeBand: { type: DataTypes.STRING },
  totalFloorArea: { type: DataTypes.FLOAT },
  currentEnergyRating: { type: DataTypes.STRING(2), allowNull: false },
  currentEnergyEfficiency: { type: DataTypes.INTEGER, allowNull: false },
  potentialEnergyRating: { type: DataTypes.STRING(2) },
  potentialEnergyEfficiency: { type: DataTypes.INTEGER },
  mainHeatingDescription: { type: DataTypes.STRING },
  mainFuel: { type: DataTypes.STRING },
  roofDescription: { type: DataTypes.TEXT },
  roofEnergyEff: { type: DataTypes.STRING },
  wallDescription: { type: DataTypes.TEXT },
  wallEnergyEff: { type: DataTypes.STRING },
  hotWaterDescription: { type: DataTypes.STRING },
  recommendations: { type: DataTypes.JSONB },
  lodgementDate: { type: DataTypes.DATEONLY },
  inspectionDate: { type: DataTypes.DATEONLY },
  fetchedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  fetchedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  raw: { type: DataTypes.JSONB },
}, { sequelize, modelName: 'EPCRecord', tableName: 'epc_records', underscored: true });

// ─────────────────────────────────────────────
// BUS ELIGIBILITY
// Stores eligibility assessment result per project
// ─────────────────────────────────────────────

export type BUSVerdict = 'eligible' | 'ineligible' | 'likely_eligible' | 'requires_review';

export interface BUSCriterion {
  id: string;
  label: string;
  pass: boolean;
  blocker: boolean;       // if true, a fail here = ineligible regardless of other criteria
  detail: string;
  value?: string | number | boolean;
}

export interface BUSEligibilityAttributes {
  id: number;
  projectId: number;
  epcRecordId?: number;
  verdict: BUSVerdict;
  criteria: BUSCriterion[];
  blockers: string[];           // ids of failed blocker criteria
  warnings: string[];           // non-blocking issues
  grantAmount?: number;         // £ — 7500 for ASHP, 7500 for GSHP (as of 2024)
  assessedBy: number;
  assessedAt: Date;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface BUSEligibilityCreationAttributes extends Optional<BUSEligibilityAttributes, 'id' | 'assessedAt'> {}

export class BUSEligibility extends Model<BUSEligibilityAttributes, BUSEligibilityCreationAttributes>
  implements BUSEligibilityAttributes {
  public id!: number;
  public projectId!: number;
  public epcRecordId?: number;
  public verdict!: BUSVerdict;
  public criteria!: BUSCriterion[];
  public blockers!: string[];
  public warnings!: string[];
  public grantAmount?: number;
  public assessedBy!: number;
  public assessedAt!: Date;
  public notes?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

BUSEligibility.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
  epcRecordId: { type: DataTypes.INTEGER, references: { model: 'epc_records', key: 'id' }, onDelete: 'SET NULL' },
  verdict: { type: DataTypes.ENUM('eligible', 'ineligible', 'likely_eligible', 'requires_review'), allowNull: false },
  criteria: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  blockers: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
  warnings: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
  grantAmount: { type: DataTypes.INTEGER },
  assessedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  assessedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  notes: { type: DataTypes.TEXT },
}, { sequelize, modelName: 'BUSEligibility', tableName: 'bus_eligibility', underscored: true });
