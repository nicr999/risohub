// ============================================================
// RISO HUB — services/hubspotSyncService.ts
// Pushes project data back to HubSpot when key milestones
// are reached. Uses the same Private App token as the
// existing pull-only hubspotService.ts.
//
// Properties written to HubSpot contact:
//   risohub_project_id        — RISO HUB project ID
//   risohub_project_status    — current stage
//   risohub_mcs_number        — MCS certificate number
//   risohub_install_date      — date project reached 'commission'
//   risohub_system_type       — ASHP or GSHP
//   risohub_handover_date     — date handover document generated
//
// These are custom contact properties — create them in HubSpot:
// Settings → Properties → Contact properties → Create property
// ============================================================

import axios from 'axios';

const HUBSPOT_BASE = 'https://api.hubapi.com';

function headers() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// ── Push project status to HubSpot contact ────────────────────

export async function pushProjectStatusToHubSpot(
  hubspotContactId: string,
  data: {
    projectId: number;
    status: string;
    projectType?: string;
    mcsNumber?: string;
    installDate?: Date;
    handoverDate?: Date;
  }
): Promise<void> {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    console.log('[HubSpot Sync] No token configured — skipping push');
    return;
  }
  if (!hubspotContactId) return;

  const properties: Record<string, string> = {
    risohub_project_id: String(data.projectId),
    risohub_project_status: data.status,
  };

  if (data.projectType) properties.risohub_system_type = data.projectType;
  if (data.mcsNumber) properties.risohub_mcs_number = data.mcsNumber;
  if (data.installDate) properties.risohub_install_date = data.installDate.toISOString().split('T')[0];
  if (data.handoverDate) properties.risohub_handover_date = data.handoverDate.toISOString().split('T')[0];

  try {
    await axios.patch(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts/${hubspotContactId}`,
      { properties },
      { headers: headers() }
    );
    console.log(`[HubSpot Sync] Updated contact ${hubspotContactId}: status=${data.status}`);
  } catch (err: any) {
    // Log but never throw — CRM sync failure must not break main flow
    console.error(`[HubSpot Sync] Failed to update contact ${hubspotContactId}:`,
      err.response?.data?.message || err.message);
  }
}

// ── Create a HubSpot note on the contact ─────────────────────
// Useful for logging key milestones as activity in the CRM

export async function createHubSpotNote(
  hubspotContactId: string,
  body: string
): Promise<void> {
  if (!process.env.HUBSPOT_ACCESS_TOKEN || !hubspotContactId) return;

  try {
    // Create engagement (note)
    const noteRes = await axios.post(
      `${HUBSPOT_BASE}/crm/v3/objects/notes`,
      {
        properties: {
          hs_note_body: body,
          hs_timestamp: new Date().toISOString(),
        },
      },
      { headers: headers() }
    );

    const noteId = noteRes.data.id;

    // Associate note with contact
    await axios.put(
      `${HUBSPOT_BASE}/crm/v3/objects/notes/${noteId}/associations/contacts/${hubspotContactId}/note_to_contact`,
      {},
      { headers: headers() }
    );

    console.log(`[HubSpot Sync] Note created on contact ${hubspotContactId}`);
  } catch (err: any) {
    console.error('[HubSpot Sync] Failed to create note:', err.response?.data?.message || err.message);
  }
}

// ── Convenience wrappers called from workflowAgent / routes ───

export async function onProjectStatusChanged(
  hubspotContactId: string | undefined,
  projectId: number,
  newStatus: string,
  projectType: string
): Promise<void> {
  if (!hubspotContactId) return;
  await pushProjectStatusToHubSpot(hubspotContactId, { projectId, status: newStatus, projectType });

  const statusLabels: Record<string, string> = {
    design: 'Survey completed — project moved to design stage',
    install: 'Design approved — installation started',
    commission: 'Installation complete — commissioning in progress',
    audit: 'Commissioning complete — project in audit/handover stage',
    complete: 'Project complete — all documentation signed off',
  };

  if (statusLabels[newStatus]) {
    await createHubSpotNote(hubspotContactId, `RISO HUB: ${statusLabels[newStatus]} (Project #${projectId})`);
  }
}

export async function onMCSRegistered(
  hubspotContactId: string | undefined,
  projectId: number,
  mcsNumber: string
): Promise<void> {
  if (!hubspotContactId) return;
  await pushProjectStatusToHubSpot(hubspotContactId, { projectId, status: 'complete', mcsNumber });
  await createHubSpotNote(hubspotContactId,
    `RISO HUB: MCS certificate registered — ${mcsNumber} (Project #${projectId})`
  );
}

export async function onHandoverGenerated(
  hubspotContactId: string | undefined,
  projectId: number
): Promise<void> {
  if (!hubspotContactId) return;
  await pushProjectStatusToHubSpot(hubspotContactId, {
    projectId, status: 'audit', handoverDate: new Date(),
  });
  await createHubSpotNote(hubspotContactId,
    `RISO HUB: Handover document generated and sent for customer signature (Project #${projectId})`
  );
}
