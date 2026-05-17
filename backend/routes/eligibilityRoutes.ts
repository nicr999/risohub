// routes/eligibilityRoutes.ts
import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/authMiddleware';
import { assessEligibility, GRANT_REFERENCE_TABLE, EligibilityInput } from '../services/besEligibilityService';

const router = Router();

// POST /api/eligibility/assess — assess grant eligibility for a project
router.post('/assess', authenticate, async (req: Request, res: Response) => {
  const input = req.body as EligibilityInput;
  if (!input.installType || !input.propertyType || !input.tenure) {
    return res.status(400).json({ error: 'installType, propertyType, and tenure are required' });
  }
  const report = assessEligibility(input);
  return res.json(report);
});

// GET /api/eligibility/grants — reference table
router.get('/grants', authenticate, async (_req: Request, res: Response) => {
  return res.json({
    lastUpdated: '2024-10-01',
    disclaimer: 'Grant amounts are indicative and subject to change. Always verify with Ofgem and scheme administrators before advising customers.',
    grants: GRANT_REFERENCE_TABLE,
  });
});

export default router;
