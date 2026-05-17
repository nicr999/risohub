/**
 * checklistService.ts
 * Backend service — runs in the Node.js/Express API layer.
 *
 * Responsibilities:
 *  1. Seed a fresh checklist when a project is created
 *  2. Validate item status transitions
 *  3. Compute compliance summary for a project
 *  4. Emit RabbitMQ events that the Compliance Agent and Workflow Agent consume
 */

import { MIS_3005_ITEMS, getItemsForProjectType, ProjectType, ItemStatus } from "./mis3005Items";

// ─── DB model interfaces (map to Sequelize models in production) ──────────────

interface DBChecklistItem {
  id: string;
  projectId: string;
  key: string;
  section: string;
  name: string;
  ref: string;
  guidance: string;
  required: boolean;
  status: ItemStatus;
  notes: string;
  naReason: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

interface ComplianceSummary {
  projectId: string;
  total: number;
  complete: number;
  nonCompliant: number;
  pending: number;
  percentComplete: number;
  /** true when all required items are complete and none are non-compliant */
  readyForHandover: boolean;
  /** keys of non-compliant required items */
  blockingIssues: string[];
}

// ─── Event bus interface (swap for actual RabbitMQ publish in production) ─────

interface EventBus {
  publish(exchange: string, routingKey: string, payload: object): Promise<void>;
}

// ─── Checklist service ────────────────────────────────────────────────────────

export class ChecklistService {
  constructor(
    /** Sequelize ChecklistItem model or equivalent */
    private readonly db: {
      findAll(where: Partial<DBChecklistItem>): Promise<DBChecklistItem[]>;
      create(data: Omit<DBChecklistItem, "id">): Promise<DBChecklistItem>;
      update(id: string, patch: Partial<DBChecklistItem>): Promise<DBChecklistItem>;
    },
    private readonly eventBus: EventBus
  ) {}

  /**
   * Called when a new project is created.
   * Seeds one DBChecklistItem per applicable MIS 3005 template item.
   */
  async seedChecklist(projectId: string, projectType: ProjectType): Promise<DBChecklistItem[]> {
    const templates = getItemsForProjectType(projectType);
    const created: DBChecklistItem[] = [];

    for (const template of templates) {
      const item = await this.db.create({
        projectId,
        key: template.key,
        section: template.section,
        name: template.name,
        ref: template.ref,
        guidance: template.guidance,
        required: template.required,
        status: "pending",
        notes: "",
        updatedAt: null,
        updatedBy: null,
      });
      created.push(item);
    }

    await this.eventBus.publish("riso.events", "checklist.seeded", {
      projectId,
      projectType,
      itemCount: created.length,
    });

    return created;
  }

  /**
   * Fetch all checklist items for a project.
   */
  async getChecklist(projectId: string): Promise<DBChecklistItem[]> {
    return this.db.findAll({ projectId });
  }

  /**
   * Update a single checklist item's status and/or notes.
   * Validates the transition, saves, emits events.
   */
  async updateItem(
    itemId: string,
    patch: { status?: ItemStatus; notes?: string; naReason?: string },
    updatedByUserId: string,
    updatedByName: string
  ): Promise<DBChecklistItem> {
    const [existing] = await this.db.findAll({ id: itemId } as Partial<DBChecklistItem>);
    if (!existing) throw new Error(`Checklist item ${itemId} not found`);

    // Validate status transition
    if (patch.status) {
      this.assertValidTransition(existing.status, patch.status);
    }

    const updated = await this.db.update(itemId, {
      ...patch,
      updatedAt: new Date(),
      updatedBy: updatedByName,
    });

    // Emit event for Compliance Agent and Workflow Agent
    await this.eventBus.publish("riso.events", "checklist.updated", {
      projectId: existing.projectId,
      itemId,
      itemKey: existing.key,
      section: existing.section,
      required: existing.required,
      previousStatus: existing.status,
      newStatus: updated.status,
      updatedBy: updatedByUserId,
    });

    // If non-compliant, emit reminder event for Compliance Agent
    if (updated.status === "noncompliant") {
      await this.eventBus.publish("riso.events", "reminder.nonCompliant", {
        projectId: existing.projectId,
        itemId,
        itemKey: existing.key,
        itemName: existing.name,
        ref: existing.ref,
        required: existing.required,
        updatedBy: updatedByUserId,
      });
    }

    return updated;
  }

  /**
   * Compute compliance summary for a project.
   * Used by GET /api/compliance/summary and the Dashboard stat cards.
   */
  async getComplianceSummary(projectId: string): Promise<ComplianceSummary> {
    const items = await this.getChecklist(projectId);
    const total = items.length;
    const complete = items.filter((i) => i.status === "complete").length;
    const nonCompliant = items.filter((i) => i.status === "noncompliant").length;
    const pending = items.filter((i) => i.status === "pending").length;
    const percentComplete = total === 0 ? 0 : Math.round((complete / total) * 100);

    const blockingIssues = items
      .filter((i) => i.required && i.status === "noncompliant")
      .map((i) => i.key);

    const requiredItems = items.filter((i) => i.required);
    const readyForHandover =
      requiredItems.length > 0 &&
      requiredItems.every((i) => i.status === "complete") &&
      nonCompliant === 0;

    return {
      projectId,
      total,
      complete,
      nonCompliant,
      pending,
      percentComplete,
      readyForHandover,
      blockingIssues,
    };
  }

  /**
   * Validate that a status transition is legal.
   * All transitions are permitted — this is a hook for future
   * business rules (e.g. preventing un-completing a signed-off item).
   */
  private assertValidTransition(from: ItemStatus, to: ItemStatus): void {
    // Currently all transitions are allowed.
    // Future rules example:
    //   if (from === "complete" && someCondition) throw new Error("Cannot revert after handover signed");
    void from;
    void to;
  }
}

// ─── Express route handlers ───────────────────────────────────────────────────
// Mount these in your Express app: app.use("/api/checklist", checklistRouter)

import express from "express";
export const checklistRouter = express.Router();

// GET /api/checklist/:projectId
checklistRouter.get("/:projectId", async (req, res) => {
  try {
    // const service = req.app.locals.checklistService as ChecklistService;
    // const items = await service.getChecklist(req.params.projectId);
    // res.json(items);
    res.json([]); // stub
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/checklist/item/:itemId
checklistRouter.patch("/item/:itemId", async (req, res) => {
  try {
    const { status, notes } = req.body as { status?: ItemStatus; notes?: string };
    // const service = req.app.locals.checklistService as ChecklistService;
    // const userId = (req as any).user.id;
    // const userName = (req as any).user.name;
    // const updated = await service.updateItem(req.params.itemId, { status, notes }, userId, userName);
    // res.json(updated);
    res.json({ id: req.params.itemId, status, notes }); // stub
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// GET /api/compliance/summary/:projectId
checklistRouter.get("/summary/:projectId", async (req, res) => {
  try {
    // const service = req.app.locals.checklistService as ChecklistService;
    // const summary = await service.getComplianceSummary(req.params.projectId);
    // res.json(summary);
    res.json({}); // stub
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/checklist/seed  (called internally on project creation)
checklistRouter.post("/seed", async (req, res) => {
  try {
    const { projectId, projectType } = req.body as { projectId: string; projectType: ProjectType };
    // const service = req.app.locals.checklistService as ChecklistService;
    // const items = await service.seedChecklist(projectId, projectType);
    // res.json({ seeded: items.length });
    res.json({ seeded: getItemsForProjectType(projectType).length }); // stub
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
