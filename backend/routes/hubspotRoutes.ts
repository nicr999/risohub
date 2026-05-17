import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../auth/authMiddleware';
import {
  searchContacts,
  getContact,
  mapContactToProjectFields,
  verifyHubSpotConnection,
} from '../services/hubspotService';
import { logAudit } from '../services/auditService';

const router = Router();

// ─── GET /api/integrations/hubspot/health ─────────────────────────────────────
// Verifies the Private App token is valid and returns the connected portal ID.

router.get('/health', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const result = await verifyHubSpotConnection();
    res.json(result);
  } catch (err) {
    console.error('GET /api/integrations/hubspot/health error:', err);
    res.status(500).json({ error: 'Failed to check HubSpot connection' });
  }
});

// ─── GET /api/integrations/hubspot/contacts/search?q=Smith ───────────────────
// Live contact search — called as the user types in the project creation form.
// Debounce on the frontend; minimum 2 chars recommended.

router.get('/contacts/search', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { q, limit = '10' } = req.query as Record<string, string>;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const results = await searchContacts(q.trim(), Math.min(parseInt(limit), 20));

    res.json(results);
  } catch (err: any) {
    console.error('GET /api/integrations/hubspot/contacts/search error:', err);

    // Surface HubSpot-specific errors clearly to the client
    if (err.message?.includes('HUBSPOT_ACCESS_TOKEN')) {
      return res.status(503).json({ error: 'HubSpot integration is not configured. Add HUBSPOT_ACCESS_TOKEN to your environment.' });
    }

    res.status(500).json({ error: 'Failed to search HubSpot contacts' });
  }
});

// ─── GET /api/integrations/hubspot/contacts/:id ───────────────────────────────
// Fetch a single contact by HubSpot ID.

router.get('/contacts/:id', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const contact = await getContact(req.params.id);
    res.json(contact);
  } catch (err: any) {
    console.error('GET /api/integrations/hubspot/contacts/:id error:', err);
    if (err.message?.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Failed to fetch HubSpot contact' });
  }
});

// ─── GET /api/integrations/hubspot/contacts/:id/prefill ──────────────────────
// Returns the contact's details already mapped to RISO HUB project field names.
// The frontend calls this when the user selects a contact from the search dropdown,
// then merges the response into the new project form.

router.get('/contacts/:id/prefill', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const contact = await getContact(req.params.id);
    const prefill = mapContactToProjectFields(contact);

    await logAudit({
      userId: req.user!.id,
      action: 'hubspot.contactPrefilled',
      entityType: 'HubSpotContact',
      entityId: contact.id,
      newValue: { contactName: contact.fullName, email: contact.email },
      ipAddress: req.ip,
    });

    res.json({
      contact,   // full contact for display
      prefill,   // mapped fields ready to drop into the form
    });
  } catch (err: any) {
    console.error('GET /api/integrations/hubspot/contacts/:id/prefill error:', err);
    if (err.message?.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Failed to prefill from HubSpot contact' });
  }
});

export default router;
