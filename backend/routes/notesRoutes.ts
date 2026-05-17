import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authenticate, authorize } from '../auth/authMiddleware';
import { Note, Notification, User, Project } from '../models/index';
import { logAudit } from '../services/auditService';
import { sendMentionEmail } from '../services/emailService';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMentions(body: string): Array<{ userId: string; name: string }> {
  const mentionRegex = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g;
  const mentions: Array<{ userId: string; name: string }> = [];
  const seen = new Set<string>();
  let match;
  while ((match = mentionRegex.exec(body)) !== null) {
    const [, name, userId] = match;
    if (!seen.has(userId)) { seen.add(userId); mentions.push({ userId, name }); }
  }
  return mentions;
}

async function notifyMentions(
  mentions: Array<{ userId: string; name: string }>,
  previousMentions: Array<{ userId: string; name: string }>,
  note: Note,
  authorId: string
): Promise<void> {
  const previousIds = new Set(previousMentions.map(m => m.userId));
  const author = await User.findByPk(authorId, { attributes: ['id', 'name', 'email'] });
  const project = await Project.findByPk(note.projectId, { attributes: ['customerName', 'address', 'postcode'] });
  if (!author || !project) return;

  for (const { userId } of mentions) {
    if (previousIds.has(userId) || userId === authorId) continue;
    try {
      await Notification.create({
        userId, type: 'mention',
        title: `${author.name} mentioned you`,
        body: `In a note on project ${project.customerName}: "${note.body.slice(0, 80)}${note.body.length > 80 ? '…' : ''}"`,
        meta: { projectId: note.projectId, noteId: note.id, section: note.section, authorId },
      });
      const mentioned = await User.findByPk(userId, { attributes: ['email', 'name'] });
      if (mentioned) {
        await sendMentionEmail({
          to: mentioned.email,
          mentionedName: mentioned.name,
          authorName: author.name,
          projectName: project.customerName,
          projectAddress: `${(project as any).address}, ${(project as any).postcode}`,
          noteBody: note.body,
          noteUrl: `${process.env.FRONTEND_URL}/projects/${note.projectId}?section=${note.section}&note=${note.id}`,
        });
      }
    } catch (err) {
      console.error(`notifyMentions: failed for user ${userId}:`, err);
    }
  }
}

// ─── GET /api/notes ───────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId, section, pinned } = req.query as Record<string, string>;
    const user = req.user!;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (user.role === 'Installer' && project.assignedTo !== user.id) return res.status(403).json({ error: 'Access denied' });

    const where: any = { projectId };
    if (section) where.section = section;
    if (pinned === 'true') where.pinned = true;

    const notes = await Note.findAll({
      where,
      include: [{ model: User, as: 'author', attributes: ['id', 'name', 'email', 'role'] }],
      order: [['pinned', 'DESC'], ['createdAt', 'DESC']],
    });
    res.json(notes);
  } catch (err) {
    console.error('GET /api/notes error:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// ─── POST /api/notes ──────────────────────────────────────────────────────────

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId, section = 'general', body } = req.body;
    const user = req.user!;
    if (!projectId || !body?.trim()) return res.status(400).json({ error: 'projectId and body are required' });

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (user.role === 'Installer' && project.assignedTo !== user.id) return res.status(403).json({ error: 'Access denied' });

    const validSections = ['general', 'checklist', 'documents', 'files', 'complaints'];
    if (!validSections.includes(section)) return res.status(400).json({ error: `Invalid section` });

    const mentions = parseMentions(body);
    const note = await Note.create({ projectId, section, body, mentions, authorId: user.id, pinned: false });

    await notifyMentions(mentions, [], note, user.id);
    await logAudit({ userId: user.id, action: 'note.created', entityType: 'Note', entityId: note.id, newValue: { projectId, section, mentionCount: mentions.length }, ipAddress: req.ip });

    const full = await Note.findByPk(note.id, { include: [{ model: User, as: 'author', attributes: ['id', 'name', 'email', 'role'] }] });
    res.status(201).json(full);
  } catch (err) {
    console.error('POST /api/notes error:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// ─── PATCH /api/notes/:id ─────────────────────────────────────────────────────

router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { body } = req.body;
    const user = req.user!;
    if (!body?.trim()) return res.status(400).json({ error: 'body is required' });

    const note = await Note.findByPk(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.authorId !== user.id && user.role !== 'Admin') return res.status(403).json({ error: 'You can only edit your own notes' });

    const previousMentions = note.mentions || [];
    const newMentions = parseMentions(body);
    await note.update({ body, mentions: newMentions, editedAt: new Date() });

    await notifyMentions(newMentions, previousMentions, note, user.id);
    await logAudit({ userId: user.id, action: 'note.updated', entityType: 'Note', entityId: note.id, newValue: { body, mentionCount: newMentions.length }, ipAddress: req.ip });

    const full = await Note.findByPk(note.id, { include: [{ model: User, as: 'author', attributes: ['id', 'name', 'email', 'role'] }] });
    res.json(full);
  } catch (err) {
    console.error('PATCH /api/notes/:id error:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// ─── DELETE /api/notes/:id ────────────────────────────────────────────────────

router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const note = await Note.findByPk(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.authorId !== user.id && user.role !== 'Admin') return res.status(403).json({ error: 'You can only delete your own notes' });

    const oldValue = note.toJSON();
    await note.destroy();
    await logAudit({ userId: user.id, action: 'note.deleted', entityType: 'Note', entityId: req.params.id, oldValue, ipAddress: req.ip });
    res.json({ message: 'Note deleted' });
  } catch (err) {
    console.error('DELETE /api/notes/:id error:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ─── PATCH /api/notes/:id/pin ─────────────────────────────────────────────────

router.patch('/:id/pin', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { pinned } = req.body;
    if (typeof pinned !== 'boolean') return res.status(400).json({ error: 'pinned must be a boolean' });

    const note = await Note.findByPk(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    await note.update({ pinned });
    await logAudit({ userId: req.user!.id, action: pinned ? 'note.pinned' : 'note.unpinned', entityType: 'Note', entityId: note.id, newValue: { pinned }, ipAddress: req.ip });
    res.json({ id: note.id, pinned: note.pinned });
  } catch (err) {
    console.error('PATCH /api/notes/:id/pin error:', err);
    res.status(500).json({ error: 'Failed to update pin status' });
  }
});

// ─── GET /api/notes/mentionable ───────────────────────────────────────────────

router.get('/mentionable', authenticate, async (req: Request, res: Response) => {
  try {
    const { q } = req.query as Record<string, string>;
    const where: any = { active: true };
    if (q) where.name = { [Op.iLike]: `%${q}%` };

    const users = await User.findAll({ where, attributes: ['id', 'name', 'role'], order: [['name', 'ASC']], limit: 10 });
    res.json(users);
  } catch (err) {
    console.error('GET /api/notes/mentionable error:', err);
    res.status(500).json({ error: 'Failed to fetch mentionable users' });
  }
});

export default router;
