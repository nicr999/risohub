// ============================================================
// RISO HUB — routes/mcsRoutes.ts
// GET/POST/PATCH /api/mcs/:projectId
// ============================================================

import { Router, Request, Response } from 'express';
import { MCSRegistration, User, Project } from '../models';
import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import { eventBus } from '../services/eventBus';
import {
  submitMCSCertificate,
  getMCSCertificateStatus,
  verifyInstallerAccreditation,
  MCSInstallationDetails,
} from '../services/mcsApiService';

const router = Router();

// GET /api/mcs/:projectId
router.get('/:projectId', authenticate, async (req: Request, res: Response) => {
  try {
    const reg = await MCSRegistration.findOne({
      where: { projectId: req.params.projectId },
      include: [{ model: User, as: 'registrar', attributes: ['id', 'name'] }],
    });

    if (!reg) return res.status(404).json({ error: 'No MCS registration found for this project' });
    res.json(reg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch MCS registration' });
  }
});

// POST /api/mcs/:projectId — create registration
router.post('/:projectId', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { mcsNumber, registeredAt, certificateUrl, notes } = req.body;

    if (!mcsNumber) return res.status(400).json({ error: 'mcsNumber is required' });

    const existing = await MCSRegistration.findOne({ where: { projectId } });
    if (existing) return res.status(409).json({ error: 'MCS registration already exists for this project. Use PATCH to update.' });

    const reg = await MCSRegistration.create({
      projectId,
      mcsNumber,
      registeredAt: registeredAt ? new Date(registeredAt) : new Date(),
      registeredBy: req.user!.id,
      certificateUrl,
      notes,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'mcs.registered',
      entityType: 'MCSRegistration',
      entityId: reg.id,
      newValue: reg.toJSON(),
      ipAddress: req.ip,
    });

    eventBus.publish('mcs.registered', { projectId, mcsNumber, registrationId: reg.id });

    res.status(201).json(reg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create MCS registration' });
  }
});

// PATCH /api/mcs/:projectId — update
router.patch('/:projectId', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const reg = await MCSRegistration.findOne({ where: { projectId: req.params.projectId } });
    if (!reg) return res.status(404).json({ error: 'MCS registration not found' });

    const oldValue = reg.toJSON();
    await reg.update(req.body);

    await logAudit({
      userId: req.user!.id,
      action: 'mcs.updated',
      entityType: 'MCSRegistration',
      entityId: reg.id,
      oldValue,
      newValue: reg.toJSON(),
      ipAddress: req.ip,
    });

    res.json(reg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update MCS registration' });
  }
});

// ─── POST /api/mcs/:projectId/submit — submit to MCS API ─────────────────────
// Sends installation details to the MCS API and records the returned
// certificate number against the project registration.
// Requires MCS_API_KEY env var to be set.

router.post('/:projectId/submit', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);

    const reg = await MCSRegistration.findOne({ where: { projectId } });
    if (!reg) return res.status(404).json({ error: 'No MCS registration found. Create one first via POST /api/mcs/:projectId.' });

    if (reg.submittedToMCS) {
      return res.status(409).json({
        error: 'Already submitted to MCS.',
        certificateNumber: reg.mcsNumber,
      });
    }

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Build submission payload from request body merged with project data
    const {
      installerMcsNumber,
      manufacturerName,
      modelName,
      serialNumber,
      systemCapacityKW,
      commissioningDate,
      isReplacement = true,
      customerConsentObtained = true,
      epcLodgementRef,
      heatLossCalculationSoftware,
      designHeatDemandKW,
      scop,
    } = req.body;

    if (!installerMcsNumber || !manufacturerName || !modelName || !systemCapacityKW || !commissioningDate) {
      return res.status(400).json({
        error: 'installerMcsNumber, manufacturerName, modelName, systemCapacityKW and commissioningDate are required',
      });
    }

    // Parse address: assumes project.address is "12 Street Name, Town"
    const addressParts = (project.address ?? '').split(',').map((p: string) => p.trim());
    const propertyAddressLine1 = addressParts[0] ?? project.address;
    const propertyTown = addressParts[1] ?? 'Unknown';

    const details: MCSInstallationDetails = {
      installerMcsNumber,
      propertyAddressLine1,
      propertyTown,
      propertyPostcode:          project.postcode,
      propertyType:              'Domestic',
      epcLodgementRef:           epcLodgementRef ?? undefined,
      systemType:                project.projectType === 'ASHP' ? 'ASHP' : 'GSHP',
      systemCapacityKW:          Number(systemCapacityKW),
      manufacturerName,
      modelName,
      serialNumber:              serialNumber ?? undefined,
      commissioningDate,
      isReplacement:             Boolean(isReplacement),
      customerConsentObtained:   Boolean(customerConsentObtained),
      customerName:              project.customerName,
      customerEmail:             project.customerEmail ?? undefined,
      heatLossCalculationSoftware: heatLossCalculationSoftware ?? undefined,
      designHeatDemandKW:        designHeatDemandKW ? Number(designHeatDemandKW) : undefined,
      scop:                      scop ? Number(scop) : undefined,
    };

    const result = await submitMCSCertificate(details);

    if (!result.success) {
      return res.status(502).json({
        error: 'MCS API rejected the submission',
        mcsError: result.errorMessage,
        errorCode: result.errorCode,
        fieldErrors: result.fieldErrors ?? null,
      });
    }

    // Update registration with returned certificate number and URL
    const oldValue = reg.toJSON();
    await reg.update({
      mcsNumber:       result.certificateNumber,
      certificateUrl:  result.certificateUrl,
      submittedToMCS:  true,
      submittedAt:     new Date(),
      notes:           `${reg.notes ?? ''}\nMCS submission ref: ${result.mcsRef}`.trim(),
    });

    await logAudit({
      userId:     req.user!.id,
      action:     'mcs.submitted',
      entityType: 'MCSRegistration',
      entityId:   reg.id,
      oldValue,
      newValue:   reg.toJSON(),
      ipAddress:  req.ip,
    });

    eventBus.publish('mcs.submitted', {
      projectId,
      certificateNumber: result.certificateNumber,
      mcsRef: result.mcsRef,
    });

    return res.json({
      certificateNumber: result.certificateNumber,
      registrationDate:  result.registrationDate,
      expiryDate:        result.expiryDate,
      certificateUrl:    result.certificateUrl,
      message:           'Successfully submitted to MCS API.',
    });
  } catch (err) {
    console.error('[mcsRoutes] submit error:', err);
    return res.status(500).json({ error: 'Failed to submit to MCS API' });
  }
});

// ─── GET /api/mcs/:projectId/certificate-status ───────────────────────────────
// Polls MCS API for current certificate status (active / expired / revoked).

router.get('/:projectId/certificate-status', authenticate, async (req: Request, res: Response) => {
  try {
    const reg = await MCSRegistration.findOne({ where: { projectId: req.params.projectId } });
    if (!reg || !reg.mcsNumber) {
      return res.status(404).json({ error: 'No MCS certificate number on record' });
    }

    const status = await getMCSCertificateStatus(reg.mcsNumber);
    if (!status) {
      return res.status(502).json({ error: 'Could not retrieve certificate status from MCS API' });
    }

    return res.json(status);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check certificate status' });
  }
});

// ─── GET /api/mcs/verify-installer/:mcsNumber ─────────────────────────────────
// Verify an installer's MCS accreditation status before submission.

router.get('/verify-installer/:mcsNumber', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const result = await verifyInstallerAccreditation(req.params.mcsNumber);
    if (!result) {
      return res.status(404).json({ error: 'Installer not found in MCS register' });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify installer accreditation' });
  }
});

export default router;
