/**
 * complaintsService.ts + complaintsRoutes.ts
 *
 * Backend for the MCS/RECC-compliant complaints management module.
 *
 * Key compliance features:
 *   - Auto-generates R06 reference number (COMP-YYYY-NNN)
 *   - Calculates response deadline (7 working days) and inspection deadline
 *     (7 days standard / 24 hours emergency) on creation
 *   - Emits overdue alerts via RabbitMQ → emailWorker
 *   - Tracks full status history in AuditLog
 *   - Stores CAPA reference for corrective action linkage
 *   - Daily cron checks for overdue complaints and emits alerts
 *
 * Mount in app.ts:
 *   app.use("/api/complaints", complaintsRoutes);
 */

import { Router, Request, Response } from "express";
import crypto      from "crypto";
import { Op }      from "sequelize";
import { Complaint, ActionPoint, ContactLog, User, AuditLog, Project } from "../models";
import { authenticate, authorize } from "../auth/authMiddleware";
import { publishEvent }            from "../events/rabbitMQ";

// ════════════════════════════════════════════════════════════════════════════
// SERVICE
// ════════════════════════════════════════════════════════════════════════════

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ip(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress ?? "unknown";
}

async function logAudit(params: {
  userId: string; action: string; entityId: string; ipAddress: string; metadata?: object;
}) {
  await AuditLog.create({ timestamp: new Date(), entityType: "Complaint", ...params });
}

/**
 * Add N working days to a date.
 * Skips Saturdays (6) and Sundays (0).
 */
function addWorkingDays(from: Date, days: number): Date {
  const d   = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

/**
 * Generate next R06 complaint reference.
 * Format: COMP-YYYY-NNN
 */
async function generateRef(): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await Complaint.count({
    where: { ref: { [Op.like]: `COMP-${year}-%` } },
  });
  return `COMP-${year}-${String(count + 1).padStart(3, "0")}`;
}

// ─── Create complaint ─────────────────────────────────────────────────────────

export async function createComplaint(input: any, createdBy: string, ipAddress: string): Promise<any> {
  const ref            = await generateRef();
  const receivedAt     = new Date(input.receivedAt);
  const responseDeadline  = addWorkingDays(receivedAt, 7);
  const isEmergency    = input.priority === "emergency";
  const inspectionDeadline = isEmergency
    ? new Date(receivedAt.getTime() + 24 * 60 * 60 * 1000)   // 24 hours
    : new Date(receivedAt.getTime() + 7  * 24 * 60 * 60 * 1000); // 7 days

  const complaint = await Complaint.create({
    id:                  crypto.randomUUID(),
    ref,
    projectId:           input.projectId || null,
    customerName:        input.customerName,
    customerEmail:       input.customerEmail    ?? "",
    customerPhone:       input.customerPhone    ?? "",
    customerAddress:     input.customerAddress  ?? "",
    receivedAt:          receivedAt,
    receivedMethod:      input.receivedMethod   ?? "email",
    category:            input.category         ?? "other",
    priority:            input.priority         ?? "standard",
    description:         input.description,
    status:              "new",
    assignedTo:          input.assignedTo       ?? "",
    responseDeadline,
    inspectionDeadline,
    inspectionDate:      null,
    inspectionNotes:     "",
    escalationStage:     "none",
    escalationDate:      null,
    escalationNotes:     "",
    resolutionDescription: "",
    customerSatisfied:   null,
    closedAt:            null,
    capaRef:             input.capaRef          ?? "",
    reviewedAtMeeting:   false,
    hasRepresentative:   input.hasRepresentative   ?? false,
    representativeName:  input.representativeName  ?? "",
    createdAt:           new Date(),
    updatedAt:           new Date(),
  });

  await logAudit({
    userId: createdBy, action: "complaint.created",
    entityId: (complaint as any).id, ipAddress,
    metadata: { ref, category: input.category, priority: input.priority },
  });

  await publishEvent("riso.events", "complaint.created", {
    complaintId:      (complaint as any).id,
    ref,
    customerName:     input.customerName,
    priority:         input.priority,
    responseDeadline: responseDeadline.toISOString(),
    isEmergency,
    assignedTo:       input.assignedTo,
  });

  // Immediate alert for emergencies
  if (isEmergency) {
    await publishEvent("riso.events", "complaint.emergency", {
      complaintId:  (complaint as any).id,
      ref,
      customerName: input.customerName,
      address:      input.customerAddress,
      deadline:     inspectionDeadline.toISOString(),
    });
  }

  return complaint;
}

// ─── Update complaint ─────────────────────────────────────────────────────────

export async function updateComplaint(
  id: string, input: any, updatedBy: string, ipAddress: string
): Promise<any> {
  const complaint = await Complaint.findByPk(id);
  if (!complaint) throw new Error("Complaint not found.");

  const before = (complaint as any).toJSON();
  await complaint.update({ ...input, updatedAt: new Date() });

  await logAudit({
    userId: updatedBy, action: "complaint.updated",
    entityId: id, ipAddress,
    metadata: { before: { status: before.status }, after: { status: input.status ?? before.status } },
  });

  return complaint;
}

// ─── Update status ────────────────────────────────────────────────────────────

export async function updateStatus(
  id: string, status: string, extra: any, updatedBy: string, ipAddress: string
): Promise<any> {
  const complaint = await Complaint.findByPk(id);
  if (!complaint) throw new Error("Complaint not found.");

  const before = (complaint as any).status;
  await complaint.update({ status, ...extra, updatedAt: new Date() });

  await logAudit({
    userId: updatedBy, action: "complaint.statusChanged",
    entityId: id, ipAddress,
    metadata: { from: before, to: status, ...extra },
  });

  await publishEvent("riso.events", "complaint.statusChanged", {
    complaintId: id,
    ref:         (complaint as any).ref,
    from:        before,
    to:          status,
    customerSatisfied: extra.customerSatisfied,
  });

  // If escalated — notify admins
  if (status === "escalated") {
    await publishEvent("riso.events", "complaint.escalated", {
      complaintId:     id,
      ref:             (complaint as any).ref,
      customerName:    (complaint as any).customerName,
      escalationStage: extra.escalationStage,
    });
  }

  return complaint;
}

// ─── Add action point ─────────────────────────────────────────────────────────

export async function addActionPoint(
  complaintId: string, input: any, createdBy: string, ipAddress: string
): Promise<any> {
  const ap = await ActionPoint.create({
    id:          crypto.randomUUID(),
    complaintId,
    description: input.description,
    assignedTo:  input.assignedTo  ?? "",
    dueDate:     input.dueDate,
    completedAt: null,
    notes:       input.notes       ?? "",
    createdAt:   new Date(),
  });

  await logAudit({
    userId: createdBy, action: "complaint.actionAdded",
    entityId: complaintId, ipAddress,
    metadata: { description: input.description, dueDate: input.dueDate },
  });

  return ap;
}

// ─── Complete action point ────────────────────────────────────────────────────

export async function completeActionPoint(
  complaintId: string, apId: string, userId: string, ipAddress: string
): Promise<any> {
  const ap = await ActionPoint.findOne({ where: { id: apId, complaintId } });
  if (!ap) throw new Error("Action point not found.");
  await ap.update({ completedAt: new Date() });

  await logAudit({
    userId, action: "complaint.actionCompleted",
    entityId: complaintId, ipAddress,
    metadata: { apId },
  });

  return ap;
}

// ─── Add contact log entry ────────────────────────────────────────────────────

export async function addContactEntry(
  complaintId: string, input: any, createdBy: string, ipAddress: string
): Promise<any> {
  const entry = await ContactLog.create({
    id:          crypto.randomUUID(),
    complaintId,
    date:        input.date      ?? new Date(),
    method:      input.method,
    direction:   input.direction,
    summary:     input.summary,
    by:          input.by        ?? createdBy,
    createdAt:   new Date(),
  });

  await logAudit({
    userId: createdBy, action: "complaint.contactLogged",
    entityId: complaintId, ipAddress,
    metadata: { method: input.method, direction: input.direction },
  });

  return entry;
}

// ─── List complaints ──────────────────────────────────────────────────────────

export async function listComplaints(filters: {
  status?: string; projectId?: string;
}): Promise<any[]> {
  const where: any = {};
  if (filters.status)    where.status    = filters.status;
  if (filters.projectId) where.projectId = filters.projectId;

  const complaints = await Complaint.findAll({
    where,
    order: [
      // Emergencies first, then by response deadline
      ["priority",         "DESC"],
      ["responseDeadline", "ASC"],
    ],
    include: [
      { model: ActionPoint, as: "actionPoints" },
      { model: ContactLog,  as: "contactLog"   },
    ],
  });

  return complaints.map((c: any) => c.toJSON());
}

// ─── Get single complaint ─────────────────────────────────────────────────────

export async function getComplaint(id: string): Promise<any> {
  const complaint = await Complaint.findByPk(id, {
    include: [
      { model: ActionPoint, as: "actionPoints", order: [["createdAt", "ASC"]] },
      { model: ContactLog,  as: "contactLog",   order: [["date", "ASC"]]      },
    ],
  });
  if (!complaint) throw new Error("Complaint not found.");
  return (complaint as any).toJSON();
}

// ─── Daily overdue check (run from cron) ─────────────────────────────────────

export async function checkOverdueComplaints(): Promise<{
  overdueResponse: number; overdueInspection: number; emergenciesOpen: number;
}> {
  const now = new Date();
  const openStatuses = ["new", "in_progress", "pending_info"];

  const overdueResponse = await Complaint.findAll({
    where: {
      status:           { [Op.in]: openStatuses },
      responseDeadline: { [Op.lt]: now },
    },
  });

  const overdueInspection = await Complaint.findAll({
    where: {
      status:              { [Op.in]: openStatuses },
      inspectionDeadline:  { [Op.lt]: now },
      inspectionDate:      null,
    },
  });

  const emergenciesOpen = await Complaint.findAll({
    where: {
      status:   { [Op.in]: openStatuses },
      priority: "emergency",
    },
  });

  if (overdueResponse.length > 0) {
    await publishEvent("riso.events", "complaints.overdueResponse", {
      count:      overdueResponse.length,
      complaints: overdueResponse.map((c: any) => ({ id: c.id, ref: c.ref, customer: c.customerName })),
    });
  }

  if (overdueInspection.length > 0) {
    await publishEvent("riso.events", "complaints.overdueInspection", {
      count:      overdueInspection.length,
      complaints: overdueInspection.map((c: any) => ({ id: c.id, ref: c.ref, customer: c.customerName, priority: c.priority })),
    });
  }

  return {
    overdueResponse:  overdueResponse.length,
    overdueInspection: overdueInspection.length,
    emergenciesOpen:  emergenciesOpen.length,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

const router = Router();

// GET /api/complaints
router.get("/", authenticate, authorize("Admin", "Surveyor", "Auditor"), async (req, res) => {
  try {
    const complaints = await listComplaints({
      status:    req.query.status    as string | undefined,
      projectId: req.query.projectId as string | undefined,
    });
    res.json({ complaints });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/complaints/:id
router.get("/:id", authenticate, authorize("Admin", "Surveyor", "Auditor"), async (req, res) => {
  try {
    res.json(await getComplaint(req.params.id));
  } catch (err: any) { res.status(404).json({ error: err.message }); }
});

// POST /api/complaints
router.post("/", authenticate, authorize("Admin", "Surveyor"), async (req, res) => {
  try {
    if (!req.body.customerName || !req.body.description || !req.body.receivedAt) {
      return res.status(400).json({ error: "customerName, description, and receivedAt are required." });
    }
    const complaint = await createComplaint(req.body, (req as any).user.id, ip(req));
    res.status(201).json(complaint);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// PATCH /api/complaints/:id
router.patch("/:id", authenticate, authorize("Admin", "Surveyor"), async (req, res) => {
  try {
    const c = await updateComplaint(req.params.id, req.body, (req as any).user.id, ip(req));
    res.json(c);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// PATCH /api/complaints/:id/status
router.patch("/:id/status", authenticate, authorize("Admin", "Surveyor"), async (req, res) => {
  try {
    const { status, ...extra } = req.body;
    if (!status) return res.status(400).json({ error: "status required." });
    const c = await updateStatus(req.params.id, status, extra, (req as any).user.id, ip(req));
    res.json(c);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// POST /api/complaints/:id/actions
router.post("/:id/actions", authenticate, authorize("Admin", "Surveyor"), async (req, res) => {
  try {
    if (!req.body.description || !req.body.dueDate) {
      return res.status(400).json({ error: "description and dueDate required." });
    }
    const ap = await addActionPoint(req.params.id, req.body, (req as any).user.id, ip(req));
    res.status(201).json(ap);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// PATCH /api/complaints/:id/actions/:apId/complete
router.patch("/:id/actions/:apId/complete", authenticate, authorize("Admin", "Surveyor"), async (req, res) => {
  try {
    const ap = await completeActionPoint(req.params.id, req.params.apId, (req as any).user.id, ip(req));
    res.json(ap);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// POST /api/complaints/:id/contacts
router.post("/:id/contacts", authenticate, authorize("Admin", "Surveyor"), async (req, res) => {
  try {
    if (!req.body.summary) return res.status(400).json({ error: "summary required." });
    const entry = await addContactEntry(req.params.id, req.body, (req as any).user.id, ip(req));
    res.status(201).json(entry);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// POST /api/complaints/check-overdue  (cron / internal)
router.post("/check-overdue", authenticate, authorize("Admin"), async (_req, res) => {
  try {
    const result = await checkOverdueComplaints();
    res.json({ ok: true, ...result });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;

/*
 * ─── DB Migration ─────────────────────────────────────────────────────────────
 *
 * CREATE TABLE "Complaints" (
 *   id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   ref                    TEXT NOT NULL UNIQUE,
 *   "projectId"            UUID REFERENCES "Projects"(id),
 *   "customerName"         TEXT NOT NULL,
 *   "customerEmail"        TEXT NOT NULL DEFAULT '',
 *   "customerPhone"        TEXT NOT NULL DEFAULT '',
 *   "customerAddress"      TEXT NOT NULL DEFAULT '',
 *   "receivedAt"           TIMESTAMPTZ NOT NULL,
 *   "receivedMethod"       TEXT NOT NULL DEFAULT 'email',
 *   category               TEXT NOT NULL DEFAULT 'other',
 *   priority               TEXT NOT NULL DEFAULT 'standard',
 *   description            TEXT NOT NULL,
 *   status                 TEXT NOT NULL DEFAULT 'new',
 *   "assignedTo"           TEXT NOT NULL DEFAULT '',
 *   "responseDeadline"     TIMESTAMPTZ NOT NULL,
 *   "inspectionDeadline"   TIMESTAMPTZ,
 *   "inspectionDate"       DATE,
 *   "inspectionNotes"      TEXT NOT NULL DEFAULT '',
 *   "escalationStage"      TEXT NOT NULL DEFAULT 'none',
 *   "escalationDate"       TIMESTAMPTZ,
 *   "escalationNotes"      TEXT NOT NULL DEFAULT '',
 *   "resolutionDescription" TEXT NOT NULL DEFAULT '',
 *   "customerSatisfied"    BOOLEAN,
 *   "closedAt"             TIMESTAMPTZ,
 *   "capaRef"              TEXT NOT NULL DEFAULT '',
 *   "reviewedAtMeeting"    BOOLEAN NOT NULL DEFAULT FALSE,
 *   "hasRepresentative"    BOOLEAN NOT NULL DEFAULT FALSE,
 *   "representativeName"   TEXT NOT NULL DEFAULT '',
 *   "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX ON "Complaints"(status);
 * CREATE INDEX ON "Complaints"("responseDeadline");
 * CREATE INDEX ON "Complaints"("projectId");
 *
 * CREATE TABLE "ActionPoints" (
 *   id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   "complaintId" UUID NOT NULL REFERENCES "Complaints"(id) ON DELETE CASCADE,
 *   description   TEXT NOT NULL,
 *   "assignedTo"  TEXT NOT NULL DEFAULT '',
 *   "dueDate"     DATE NOT NULL,
 *   "completedAt" TIMESTAMPTZ,
 *   notes         TEXT NOT NULL DEFAULT '',
 *   "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE TABLE "ContactLogs" (
 *   id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   "complaintId" UUID NOT NULL REFERENCES "Complaints"(id) ON DELETE CASCADE,
 *   date          TIMESTAMPTZ NOT NULL,
 *   method        TEXT NOT NULL,
 *   direction     TEXT NOT NULL,
 *   summary       TEXT NOT NULL,
 *   "by"          TEXT NOT NULL DEFAULT '',
 *   "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- Sequelize associations (add to models/index.ts):
 * Complaint.hasMany(ActionPoint, { foreignKey: 'complaintId', as: 'actionPoints' });
 * ActionPoint.belongsTo(Complaint, { foreignKey: 'complaintId' });
 * Complaint.hasMany(ContactLog, { foreignKey: 'complaintId', as: 'contactLog' });
 * ContactLog.belongsTo(Complaint, { foreignKey: 'complaintId' });
 */
