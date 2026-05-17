// ============================================================
// RISO HUB — services/heatEngineerService.ts
// Parses HeatEngineer export files (CSV and XML) and extracts
// the key summary figures that RISO HUB stores.
//
// HeatEngineer exports two formats:
//   - CSV summary report (most common)
//   - XML project file (detailed)
//
// We extract and normalise into the HeatLossSummary model fields.
// ============================================================

import { parse as parseCSV } from 'csv-parse/sync';

export interface HeatEngineerSummary {
  designFlowTemp?: number;
  heatDemandKW?: number;
  heatLossKW?: number;
  groundFloorArea?: number;
  fabricLossKW?: number;
  ventilationLossKW?: number;
  softwareUsed: 'HeatEngineer';
  rawFields: Record<string, string>;
}

// ── CSV parser ────────────────────────────────────────────────
// HeatEngineer CSV summary has rows like:
//   "Design flow temperature","55"
//   "Total heat loss (kW)","8.2"
//   etc.

export function parseHeatEngineerCSV(csvContent: string): HeatEngineerSummary {
  let records: string[][];

  try {
    records = parseCSV(csvContent, {
      skip_empty_lines: true,
      relax_column_count: true,
    });
  } catch {
    throw new Error('Could not parse CSV — check the file is a valid HeatEngineer export');
  }

  // Build key→value map (case-insensitive keys, trimmed)
  const fields: Record<string, string> = {};
  for (const row of records) {
    if (row.length >= 2) {
      const key = row[0].trim().toLowerCase();
      const val = row[1].trim();
      fields[key] = val;
    }
  }

  return {
    designFlowTemp: extractNumber(fields, [
      'design flow temperature', 'flow temperature', 'design flow temp', 'flow temp (°c)', 'flow temperature (°c)',
    ]),
    heatDemandKW: extractNumber(fields, [
      'heat demand (kw)', 'space heating demand (kw)', 'total heat demand', 'heat demand', 'space heating demand',
    ]),
    heatLossKW: extractNumber(fields, [
      'total heat loss (kw)', 'heat loss (kw)', 'total heat loss', 'design heat loss',
    ]),
    groundFloorArea: extractNumber(fields, [
      'total floor area (m²)', 'floor area (m2)', 'total floor area', 'floor area',
    ]),
    fabricLossKW: extractNumber(fields, [
      'fabric heat loss (kw)', 'fabric loss (kw)', 'fabric heat loss', 'transmission loss',
    ]),
    ventilationLossKW: extractNumber(fields, [
      'ventilation heat loss (kw)', 'ventilation loss (kw)', 'ventilation heat loss', 'infiltration loss',
    ]),
    softwareUsed: 'HeatEngineer',
    rawFields: fields,
  };
}

// ── XML parser ────────────────────────────────────────────────
// HeatEngineer XML has a <Project> root with child elements.
// We do simple regex extraction to avoid xml2js dependency.

export function parseHeatEngineerXML(xmlContent: string): HeatEngineerSummary {
  function extract(tag: string): string | undefined {
    const match = xmlContent.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i'));
    return match?.[1]?.trim();
  }

  const fields: Record<string, string> = {};
  const tags = [
    'DesignFlowTemperature', 'FlowTemperature', 'TotalHeatLoss', 'HeatDemand',
    'GroundFloorArea', 'FloorArea', 'FabricLoss', 'VentilationLoss',
    'SpaceHeatingDemand', 'DesignHeatLoss',
  ];

  for (const tag of tags) {
    const val = extract(tag);
    if (val) fields[tag.toLowerCase()] = val;
  }

  return {
    designFlowTemp: parseOptFloat(fields['designflowtemperature'] || fields['flowtemperature']),
    heatDemandKW: parseOptFloat(fields['heatdemand'] || fields['spaceheatingdemand']),
    heatLossKW: parseOptFloat(fields['totalheatLoss'] || fields['designheatloss']),
    groundFloorArea: parseOptFloat(fields['groundfloorarea'] || fields['floorarea']),
    fabricLossKW: parseOptFloat(fields['fabricloss']),
    ventilationLossKW: parseOptFloat(fields['ventilationloss']),
    softwareUsed: 'HeatEngineer',
    rawFields: fields,
  };
}

// ── Auto-detect format ────────────────────────────────────────

export function parseHeatEngineerFile(content: string, filename: string): HeatEngineerSummary {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'xml') return parseHeatEngineerXML(content);
  if (ext === 'csv') return parseHeatEngineerCSV(content);
  // Try XML if content starts with <
  if (content.trim().startsWith('<')) return parseHeatEngineerXML(content);
  return parseHeatEngineerCSV(content);
}

// ── Helpers ───────────────────────────────────────────────────

function extractNumber(fields: Record<string, string>, keys: string[]): number | undefined {
  for (const key of keys) {
    const val = fields[key];
    if (val !== undefined) {
      const n = parseOptFloat(val);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

function parseOptFloat(val?: string): number | undefined {
  if (!val) return undefined;
  const n = parseFloat(val.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? undefined : n;
}


// ============================================================
// routes/heatEngineerRoutes.ts
// POST /api/heat-engineer/upload/:projectId
// Accepts a HeatEngineer CSV or XML file upload,
// parses it, and stores the extracted figures as the
// project's HeatLossSummary.
// ============================================================

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../auth/authMiddleware';
import { auditLog } from '../services/auditService';
import { parseHeatEngineerFile } from '../services/heatEngineerService';
import { HeatLossSummary } from '../models';
import AWS from 'aws-sdk';

const router = Router();
const s3 = new AWS.S3();

// In-memory multer — 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xml', '.txt'];
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only CSV and XML files are accepted'));
  },
});

// POST /api/heat-engineer/upload/:projectId
router.post(
  '/upload/:projectId',
  authenticate,
  authorize('Admin', 'Surveyor'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const projectId = parseInt(req.params.projectId);
      const content = req.file.buffer.toString('utf-8');
      const filename = req.file.originalname;

      // Parse the file
      let parsed;
      try {
        parsed = parseHeatEngineerFile(content, filename);
      } catch (parseErr: any) {
        return res.status(422).json({ error: parseErr.message || 'Failed to parse HeatEngineer file' });
      }

      // Upload original file to S3 for reference
      const s3Key = `projects/${projectId}/heat-engineer/${Date.now()}-${filename}`;
      await s3.putObject({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: s3Key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || 'application/octet-stream',
      }).promise();

      const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${s3Key}`;

      // Upsert HeatLossSummary
      const [summary] = await HeatLossSummary.upsert({
        projectId,
        designFlowTemp: parsed.designFlowTemp,
        heatDemandKW: parsed.heatDemandKW,
        heatLossKW: parsed.heatLossKW,
        groundFloorArea: parsed.groundFloorArea,
        fabricLossKW: parsed.fabricLossKW,
        ventilationLossKW: parsed.ventilationLossKW,
        softwareUsed: 'HeatEngineer',
        calculatedBy: req.user!.id,
        calculatedAt: new Date(),
        notes: `Imported from ${filename}`,
      });

      await auditLog({
        userId: req.user!.id,
        action: 'heat_engineer.imported',
        entityType: 'HeatLossSummary',
        entityId: summary.id,
        newValue: { projectId, filename, parsed, fileUrl },
        ipAddress: req.ip,
      });

      res.status(200).json({
        message: 'HeatEngineer file imported successfully',
        summary: summary.toJSON(),
        extracted: parsed,
        fileUrl,
      });
    } catch (err: any) {
      console.error('[HeatEngineer] Import error:', err);
      res.status(500).json({ error: 'Failed to process HeatEngineer file' });
    }
  }
);

// GET /api/heat-engineer/preview — parse without saving (dry run)
router.post(
  '/preview',
  authenticate,
  authorize('Admin', 'Surveyor'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const content = req.file.buffer.toString('utf-8');
      const parsed = parseHeatEngineerFile(content, req.file.originalname);
      res.json({ extracted: parsed, filename: req.file.originalname });
    } catch (err: any) {
      res.status(422).json({ error: err.message || 'Parse failed' });
    }
  }
);

export default router;
