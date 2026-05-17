// ============================================================
// RISO HUB — routes/surveyRoutes.ts
// Customer satisfaction surveys (post-install, RECC compliance)
// ============================================================

import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import crypto from 'crypto';
import { Project, User } from '../models';
import { SatisfactionSurvey } from '../models/newModels';
import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import { sendSatisfactionSurvey } from '../services/emailService';
import { eventBus } from '../services/eventBus';

const router = Router();

// ─────────────────────────────────────────────
// ADMIN — send survey
// ─────────────────────────────────────────────

// POST /api/surveys/send — send survey to customer
router.post('/send', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check if a pending/sent survey already exists
    const existing = await SatisfactionSurvey.findOne({
      where: { projectId, status: { [Op.in]: ['pending', 'sent'] } },
    });
    if (existing) return res.status(409).json({ error: 'A survey is already pending or sent for this project' });

    // Generate one-time token
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const survey = await SatisfactionSurvey.create({
      projectId,
      tokenHash,
      status: 'sent',
      sentAt: new Date(),
      sentBy: req.user!.id,
    });

    // Send email to customer
    await sendSatisfactionSurvey({
      to: project.customerEmail,
      customerName: project.customerName,
      surveyUrl: `${process.env.FRONTEND_URL}/survey?token=${rawToken}`,
      projectAddress: project.address,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'survey.sent',
      entityType: 'SatisfactionSurvey',
      entityId: survey.id,
      newValue: { projectId, sentTo: project.customerEmail },
      ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Survey sent', surveyId: survey.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send survey' });
  }
});

// GET /api/surveys — list all surveys (admin view)
router.get('/', authenticate, authorize('Admin', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const { status, projectId } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;

    const surveys = await SatisfactionSurvey.findAll({
      where,
      include: [
        { model: Project, attributes: ['id', 'customerName', 'address', 'postcode'] },
        { model: User, as: 'sender', attributes: ['id', 'name'] },
      ],
      order: [['sentAt', 'DESC']],
    });

    res.json(surveys);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch surveys' });
  }
});

// GET /api/surveys/results — aggregate results
router.get('/results', authenticate, authorize('Admin', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const surveys = await SatisfactionSurvey.findAll({
      where: { status: 'completed' },
      attributes: ['rating', 'wouldRecommend', 'npsScore'],
    });

    if (!surveys.length) return res.json({ totalCompleted: 0, averageRating: null, npsScore: null, recommendRate: null });

    const ratings = surveys.filter(s => s.rating).map(s => s.rating!);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    const npsScores = surveys.filter(s => s.npsScore !== null && s.npsScore !== undefined).map(s => s.npsScore!);
    const promoters = npsScores.filter(n => n >= 9).length;
    const detractors = npsScores.filter(n => n <= 6).length;
    const nps = npsScores.length ? Math.round(((promoters - detractors) / npsScores.length) * 100) : null;

    const recommendCount = surveys.filter(s => s.wouldRecommend === true).length;
    const recommendRate = surveys.filter(s => s.wouldRecommend !== null).length > 0
      ? Math.round((recommendCount / surveys.filter(s => s.wouldRecommend !== null).length) * 100)
      : null;

    res.json({
      totalCompleted: surveys.length,
      averageRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      npsScore: nps,
      recommendRate,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate results' });
  }
});

// ─────────────────────────────────────────────
// PUBLIC — customer-facing (no auth)
// ─────────────────────────────────────────────

// GET /api/surveys/public/:token — get survey info before submitting
router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const survey = await SatisfactionSurvey.findOne({
      where: { tokenHash },
      include: [{ model: Project, attributes: ['customerName', 'address', 'postcode', 'projectType'] }],
    });

    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    if (survey.status === 'completed') return res.status(410).json({ error: 'Survey already completed' });
    if (survey.status === 'expired') return res.status(410).json({ error: 'Survey link has expired' });

    // Return project info for display — no sensitive data
    res.json({
      customerName: (survey as any).Project?.customerName,
      address: `${(survey as any).Project?.address}, ${(survey as any).Project?.postcode}`,
      projectType: (survey as any).Project?.projectType,
      status: survey.status,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load survey' });
  }
});

// POST /api/surveys/public/:token — submit survey response
router.post('/public/:token', async (req: Request, res: Response) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const survey = await SatisfactionSurvey.findOne({ where: { tokenHash } });

    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    if (survey.status === 'completed') return res.status(410).json({ error: 'Survey already completed' });
    if (survey.status === 'expired') return res.status(410).json({ error: 'Survey link has expired' });

    const { rating, comments, wouldRecommend, npsScore } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }

    await survey.update({
      status: 'completed',
      completedAt: new Date(),
      rating,
      comments,
      wouldRecommend: wouldRecommend ?? null,
      npsScore: npsScore ?? null,
    });

    eventBus.publish('survey.completed', { projectId: survey.projectId, surveyId: survey.id, rating });

    res.json({ message: 'Thank you for your feedback!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit survey' });
  }
});

export default router;
