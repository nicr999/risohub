/**
 * notesService.ts + notificationsService.ts + routes
 *
 * Backend for project notes (@mentions) and the notification centre.
 *
 * Mount in app.ts:
 *   app.use("/api/notes",         notesRoutes);
 *   app.use("/api/notifications", notificationsRoutes);
 */

import { Router, Request, Response } from "express";
import crypto   from "crypto";
import { Op }   from "sequelize";
import { Note, Notification, User, Project, AuditLog } from "../models";
import { authenticate, authorize } from "../auth/authMiddleware";
import { publishEvent }            from "../events/rabbitMQ";
import { sendMentionEmail }        from "../email/emailService"; // add this function (template below)

// ════════════════════════════════════════════════════════════════════════════
// NOTES SERVICE
// ════════════════════════════════════════════════════════════════════════════

function ip(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress ?? "unknown";
}

export async function createNote(input: {
  projectId: string;
  section:   string;
  body:      string;
  mentions:  { userId: string; name: string }[];
}, authorId: string, ipAddress: string): Promise<any> {
  const project = await Project.findByPk(input.projectId);
  if (!project) throw new Error("Project not found.");

  const note = await Note.create({
    id:         crypto.randomUUID(),
    projectId:  input.projectId,
    section:    input.section,
    body:       input.body,
    mentions:   JSON.stringify(input.mentions),
    authorId,
    pinned:     false,
    editedAt:   null,
    createdAt:  new Date(),
  });

  // Resolve author name
  const author = await User.findByPk(authorId);
  const authorName = (author as any)?.name ?? "Someone";

  // Create a notification + email for each unique mention
  for (const mention of input.mentions) {
    if (mention.userId === authorId) continue; // don't notify yourself

    await createNotification({
      userId:  mention.userId,
      type:    "mention",
      title:   `${authorName} mentioned you`,
      body:    `In ${(project as any).customerName} — ${input.section}: "${input.body.slice(0, 80)}${input.body.length > 80 ? "…" : ""}"`,
      meta: {
        projectId: input.projectId,
        noteId:    (note as any).id,
        view:      "projects",
        section:   input.section,
      },
    });

    // Email the mentioned user
    const mentionedUser = await User.findByPk(mention.userId);
    if (mentionedUser && (mentionedUser as any).email) {
      await sendMentionEmail({
        to:           (mentionedUser as any).email,
        recipientName: mention.name,
        authorName,
        projectName:  `${(project as any).customerName} — ${(project as any).address}`,
        section:      input.section,
        noteExcerpt:  input.body.slice(0, 200),
        projectUrl:   `${process.env.APP_URL}/projects/${input.projectId}`,
      }).catch(() => {}); // email failure must not block note creation
    }
  }

  await AuditLog.create({
    timestamp:  new Date(),
    userId:     authorId,
    action:     "note.created",
    entityType: "Note",
    entityId:   (note as any).id,
    ipAddress,
    metadata:   { projectId: input.projectId, section: input.section, mentionCount: input.mentions.length },
  });

  await publishEvent("riso.events", "note.created", {
    noteId:    (note as any).id,
    projectId: input.projectId,
    section:   input.section,
    authorId,
    mentions:  input.mentions.map(m => m.userId),
  });

  return note;
}

export async function updateNote(
  id: string, body: string, userId: string, ipAddress: string
): Promise<any> {
  const note = await Note.findByPk(id);
  if (!note) throw new Error("Note not found.");
  if ((note as any).authorId !== userId) throw new Error("Not your note.");
  await note.update({ body, editedAt: new Date() });

  await AuditLog.create({
    timestamp: new Date(), userId, action: "note.edited",
    entityType: "Note", entityId: id, ipAddress, metadata: {},
  });

  return note;
}

export async function deleteNote(id: string, userId: string, userRole: string, ipAddress: string): Promise<void> {
  const note = await Note.findByPk(id);
  if (!note) throw new Error("Note not found.");
  if ((note as any).authorId !== userId && userRole !== "Admin") throw new Error("Not authorised.");
  await note.destroy();

  await AuditLog.create({
    timestamp: new Date(), userId, action: "note.deleted",
    entityType: "Note", entityId: id, ipAddress, metadata: {},
  });
}

export async function pinNote(id: string, pinned: boolean, userRole: string): Promise<any> {
  if (userRole !== "Admin") throw new Error("Only admins can pin notes.");
  const note = await Note.findByPk(id);
  if (!note) throw new Error("Note not found.");
  await note.update({ pinned });
  return note;
}

export async function listNotes(projectId: string, section?: string): Promise<any[]> {
  const where: any = { projectId };
  if (section) where.section = section;
  const notes = await Note.findAll({ where, order: [["createdAt", "DESC"]] });
  return notes.map((n: any) => ({
    ...n.toJSON(),
    mentions: JSON.parse(n.mentions ?? "[]"),
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS SERVICE
// ════════════════════════════════════════════════════════════════════════════

export async function createNotification(input: {
  userId: string;
  type:   string;
  title:  string;
  body:   string;
  meta:   Record<string, string>;
}): Promise<any> {
  return Notification.create({
    id:        crypto.randomUUID(),
    userId:    input.userId,
    type:      input.type,
    title:     input.title,
    body:      input.body,
    read:      false,
    meta:      JSON.stringify(input.meta),
    createdAt: new Date(),
  });
}

export async function listNotifications(userId: string, limit = 60): Promise<any[]> {
  const notifs = await Notification.findAll({
    where:  { userId },
    order:  [["createdAt", "DESC"]],
    limit,
  });
  return notifs.map((n: any) => ({
    ...n.toJSON(),
    meta: JSON.parse(n.meta ?? "{}"),
  }));
}

export async function markRead(id: string, userId: string): Promise<void> {
  await Notification.update({ read: true }, { where: { id, userId } });
}

export async function markAllRead(userId: string): Promise<void> {
  await Notification.update({ read: true }, { where: { userId, read: false } });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return Notification.count({ where: { userId, read: false } });
}

// ════════════════════════════════════════════════════════════════════════════
// NOTES ROUTES
// ════════════════════════════════════════════════════════════════════════════

const notesRouter = Router();

notesRouter.get("/", authenticate, async (req, res) => {
  try {
    const { projectId, section } = req.query as { projectId?: string; section?: string };
    if (!projectId) return res.status(400).json({ error: "projectId required." });
    const notes = await listNotes(projectId, section);
    res.json({ notes });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

notesRouter.post("/", authenticate, async (req, res) => {
  try {
    const { projectId, section, body, mentions } = req.body;
    if (!projectId || !body) return res.status(400).json({ error: "projectId and body required." });
    const note = await createNote(
      { projectId, section: section ?? "general", body, mentions: mentions ?? [] },
      (req as any).user.id, ip(req)
    );
    res.status(201).json(note);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

notesRouter.patch("/:id", authenticate, async (req, res) => {
  try {
    const note = await updateNote(req.params.id, req.body.body, (req as any).user.id, ip(req));
    res.json(note);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

notesRouter.delete("/:id", authenticate, async (req, res) => {
  try {
    await deleteNote(req.params.id, (req as any).user.id, (req as any).user.role, ip(req));
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

notesRouter.patch("/:id/pin", authenticate, authorize("Admin"), async (req, res) => {
  try {
    const note = await pinNote(req.params.id, req.body.pinned, (req as any).user.role);
    res.json(note);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export { notesRouter };

// ════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS ROUTES
// ════════════════════════════════════════════════════════════════════════════

const notificationsRouter = Router();

notificationsRouter.get("/", authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string ?? "60");
    const notifs = await listNotifications((req as any).user.id, limit);
    res.json({ notifications: notifs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

notificationsRouter.get("/unread-count", authenticate, async (req, res) => {
  try {
    const count = await getUnreadCount((req as any).user.id);
    res.json({ count });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

notificationsRouter.patch("/:id/read", authenticate, async (req, res) => {
  try {
    await markRead(req.params.id, (req as any).user.id);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

notificationsRouter.patch("/read-all", authenticate, async (req, res) => {
  try {
    await markAllRead((req as any).user.id);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export { notificationsRouter };

/*
 * ─── DB Migration ─────────────────────────────────────────────────────────────
 *
 * CREATE TABLE "Notes" (
 *   id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   "projectId"  UUID NOT NULL REFERENCES "Projects"(id) ON DELETE CASCADE,
 *   section      TEXT NOT NULL DEFAULT 'general',
 *   body         TEXT NOT NULL,
 *   mentions     JSONB NOT NULL DEFAULT '[]',
 *   "authorId"   UUID NOT NULL REFERENCES "Users"(id),
 *   pinned       BOOLEAN NOT NULL DEFAULT FALSE,
 *   "editedAt"   TIMESTAMPTZ,
 *   "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 * CREATE INDEX ON "Notes"("projectId");
 * CREATE INDEX ON "Notes"("authorId");
 *
 * CREATE TABLE "Notifications" (
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   "userId"    UUID NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
 *   type        TEXT NOT NULL,
 *   title       TEXT NOT NULL,
 *   body        TEXT NOT NULL,
 *   read        BOOLEAN NOT NULL DEFAULT FALSE,
 *   meta        JSONB NOT NULL DEFAULT '{}',
 *   "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 * CREATE INDEX ON "Notifications"("userId");
 * CREATE INDEX ON "Notifications"("userId", read);
 *
 * ─── sendMentionEmail — add to emailService.ts ───────────────────────────────
 *
 * export async function sendMentionEmail(p: {
 *   to: string; recipientName: string; authorName: string;
 *   projectName: string; section: string; noteExcerpt: string; projectUrl: string;
 * }): Promise<SendResult> {
 *   const html = layout(`
 *     <h1>You were mentioned in a note</h1>
 *     <p>Hi ${p.recipientName},</p>
 *     <p><strong>${p.authorName}</strong> mentioned you in a note on
 *     <strong>${p.projectName}</strong> (${p.section}):</p>
 *     <div class="info-box"><p style="font-style:italic">"${p.noteExcerpt}"</p></div>
 *     <a href="${p.projectUrl}" class="btn">View note →</a>
 *   `, `${p.authorName} mentioned you in ${p.projectName}`);
 *   const text = `Hi ${p.recipientName},\n\n${p.authorName} mentioned you:\n"${p.noteExcerpt}"\n\nView: ${p.projectUrl}`;
 *   return send(
 *     { to: p.to, subject: `${p.authorName} mentioned you in ${p.projectName}`, html, text },
 *     { action: "email.mention" }
 *   );
 * }
 *
 * ─── app.ts mounts ───────────────────────────────────────────────────────────
 *
 * import { notesRouter }         from "./notes/notesService";
 * import { notificationsRouter } from "./notes/notesService";
 * app.use("/api/notes",          notesRouter);
 * app.use("/api/notifications",  notificationsRouter);
 *
 * ─── emailWorker.ts additions ────────────────────────────────────────────────
 *
 * // Add to ROUTING_KEYS: "note.created"
 * // Add to handleMessage:
 * case "note.created":
 *   // mentions are handled inline in createNote — no extra worker action needed
 *   break;
 */
