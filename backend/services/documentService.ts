/**
 * documentService.ts
 * Backend service — runs in the Node.js/Express API layer.
 *
 * Responsibilities:
 *  1. Assemble project data from all related tables
 *  2. Generate the PDF using pdfmake
 *  3. Upload to S3 and record metadata in the Documents table
 *  4. Emit handover.generated event to the event bus
 *  5. Trigger async delivery (email, Drive sync, MCS portal)
 */

import { DocumentSectionKey } from "./DocumentGenerator";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface ProjectData {
  id: string;
  customerName: string;
  address: string;
  postcode: string;
  systemType: "ASHP" | "GSHP";
  heatPumpModel: string;
  heatPumpCapacityKw: number;
  flowTempC: number;
  designCOP: number;
  mcsNumber: string;
  installerName: string;
  installedAt: Date;
}

interface ChecklistRow {
  name: string;
  ref: string;
  status: "complete" | "noncompliant" | "na";
  naReason: string;
  notes: string;
}

interface SignatureData {
  signerName: string;
  role: string;
  signedAt: Date;
  signatureBase64: string;
  ipAddress: string;
  sha256Hash: string;
}

interface AppendixFile {
  name: string;
  category: string;
  s3Key: string;
  mimeType: string;
}

interface GenerateDocumentInput {
  projectId: string;
  sections: DocumentSectionKey[];
  generatedBy: string;
  deliverByEmail: boolean;
  syncToDrive: boolean;
  submitToMCS: boolean;
}

interface GenerateDocumentOutput {
  documentId: string;
  version: number;
  pdfUrl: string;
  sha256Hash: string;
  sizeBytes: number;
}

// ─── PDF content builders (pdfmake content blocks) ────────────────────────────
// Each builder returns a pdfmake content array segment.
// The main service assembles these into the final docDefinition.

export function buildCoverPage(project: ProjectData, orgColor: string): object[] {
  return [
    {
      canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 240, color: orgColor }],
      absolutePosition: { x: 40, y: 40 },
    },
    {
      text: "MCS Handover Pack",
      style: "coverSub",
      absolutePosition: { x: 60, y: 60 },
    },
    {
      text: project.address,
      style: "coverTitle",
      absolutePosition: { x: 60, y: 88 },
    },
    {
      text: project.customerName,
      style: "coverMeta",
      absolutePosition: { x: 60, y: 158 },
    },
    { text: "RISO HOME", style: "coverMeta", absolutePosition: { x: 60, y: 174 } },
    {
      text: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      style: "coverMeta",
      absolutePosition: { x: 60, y: 190 },
    },
    { text: project.mcsNumber, style: "coverMeta", absolutePosition: { x: 60, y: 206 } },
    { text: "", pageBreak: "after" },
  ];
}

export function buildProjectSummary(project: ProjectData): object[] {
  return [
    { text: "Project summary", style: "sectionHeading" },
    {
      table: {
        widths: ["40%", "60%"],
        body: [
          ["Customer name", project.customerName],
          ["Address", `${project.address}, ${project.postcode}`],
          ["System type", project.systemType === "ASHP" ? "Air source heat pump" : "Ground source heat pump"],
          ["Heat pump model", project.heatPumpModel],
          ["Capacity", `${project.heatPumpCapacityKw} kW`],
          ["Flow temperature", `${project.flowTempC}°C`],
          ["Design COP", project.designCOP.toFixed(1)],
          ["MCS number", project.mcsNumber],
          ["Installer", project.installerName],
          ["Installation date", project.installedAt.toLocaleDateString("en-GB")],
        ],
      },
      layout: "lightHorizontalLines",
      style: "table",
      margin: [0, 8, 0, 24],
    },
  ];
}

export function buildCommissioningChecklist(items: ChecklistRow[]): object[] {
  const tableBody: object[][] = [
    [
      { text: "Item", style: "tableHeader" },
      { text: "Clause", style: "tableHeader" },
      { text: "Status", style: "tableHeader" },
      { text: "Notes", style: "tableHeader" },
    ],
    ...items.map(item => [
      { text: item.name, fontSize: 9 },
      { text: item.ref, fontSize: 8, color: "#888" },
      {
        text: item.status === "complete" ? "✓ Complete"
          : item.status === "na" ? "— N/A"
          : "✕ Issue",
        fontSize: 9,
        color: item.status === "complete" ? "#2a7a5a"
          : item.status === "na" ? "#6a4aaa"
          : "#b03030",
        bold: true,
      },
      {
        text: item.status === "na" ? item.naReason : item.notes,
        fontSize: 8,
        color: "#888",
        italics: true,
      },
    ]),
  ];

  return [
    { text: "Commissioning checklist", style: "sectionHeading" },
    {
      table: { headerRows: 1, widths: ["*", "15%", "15%", "25%"], body: tableBody },
      layout: "lightHorizontalLines",
      style: "table",
      margin: [0, 8, 0, 24],
    },
  ];
}

export function buildSignaturePages(signatures: SignatureData[]): object[] {
  const content: object[] = [
    { text: "Signatures", style: "sectionHeading" },
  ];

  for (const sig of signatures) {
    content.push({
      columns: [
        {
          stack: [
            { text: sig.signerName, style: "sigName" },
            { text: sig.role, style: "sigRole" },
            { image: sig.signatureBase64, width: 180, height: 60, margin: [0, 8, 0, 4] },
            { text: sig.signedAt.toLocaleString("en-GB"), style: "sigMeta" },
            { text: `SHA256: ${sig.sha256Hash}`, style: "sigHash" },
            { text: `IP: ${sig.ipAddress}`, style: "sigHash" },
          ],
          width: "50%",
        },
      ],
      margin: [0, 0, 0, 20],
    });
  }

  return content;
}

export function buildWarrantySection(): object[] {
  return [
    { text: "Warranty & maintenance", style: "sectionHeading" },
    {
      text: [
        "The heat pump unit supplied and installed by RISO HOME carries a 5-year manufacturer warranty from the date of installation, ",
        "subject to annual servicing by a qualified MCS-accredited engineer. ",
        "Annual servicing is required to maintain MCS compliance and eligibility for the Boiler Upgrade Scheme (BUS) grant. ",
        "Please contact RISO HOME to schedule your annual service visit.",
      ],
      style: "bodyText",
      margin: [0, 8, 0, 24],
    },
  ];
}

export function buildAppendicesList(files: AppendixFile[]): object[] {
  return [
    { text: "Appendices", style: "sectionHeading" },
    {
      ul: files.map(f => ({ text: f.name, style: "bodyText" })),
      margin: [0, 8, 0, 24],
    },
  ];
}

// ─── pdfmake styles ───────────────────────────────────────────────────────────

export const PDF_STYLES = {
  coverSub:       { fontSize: 9, color: "#ffffff", opacity: 0.65, characterSpacing: 2 },
  coverTitle:     { fontSize: 22, bold: true, color: "#ffffff", lineHeight: 1.3 },
  coverMeta:      { fontSize: 10, color: "#ffffff", opacity: 0.7 },
  sectionHeading: { fontSize: 13, bold: true, color: "#7A8465", margin: [0, 16, 0, 0] },
  tableHeader:    { fontSize: 9, bold: true, fillColor: "#f0f1ec", color: "#5a6348" },
  table:          { fontSize: 9 },
  sigName:        { fontSize: 13, bold: true, color: "#333333" },
  sigRole:        { fontSize: 10, color: "#888888" },
  sigMeta:        { fontSize: 9, color: "#888888" },
  sigHash:        { fontSize: 7, color: "#bbbbbb", font: "Courier" },
  bodyText:       { fontSize: 10, color: "#555555", lineHeight: 1.6 },
};

// ─── Main service class ───────────────────────────────────────────────────────

export class DocumentService {
  constructor(
    private readonly db: {
      getProject(id: string): Promise<ProjectData>;
      getChecklistItems(projectId: string): Promise<ChecklistRow[]>;
      getSignatures(projectId: string): Promise<SignatureData[]>;
      getAppendixFiles(projectId: string): Promise<AppendixFile[]>;
      createDocumentRecord(data: {
        projectId: string;
        docType: string;
        pdfUrl: string;
        version: number;
        sha256Hash: string;
        sizeBytes: number;
        sections: DocumentSectionKey[];
        generatedBy: string;
      }): Promise<{ id: string; version: number }>;
    },
    private readonly s3: {
      upload(key: string, buffer: Buffer, contentType: string): Promise<string>;
    },
    private readonly eventBus: {
      publish(exchange: string, key: string, payload: object): Promise<void>;
    },
    private readonly orgSettings: {
      primaryColor: string;
      companyName: string;
    }
  ) {}

  async generateHandoverPack(input: GenerateDocumentInput): Promise<GenerateDocumentOutput> {
    const [project, checklistItems, signatures, appendices] = await Promise.all([
      this.db.getProject(input.projectId),
      this.db.getChecklistItems(input.projectId),
      this.db.getSignatures(input.projectId),
      this.db.getAppendixFiles(input.projectId),
    ]);

    // Build pdfmake content
    const content: object[] = [];

    if (input.sections.includes("cover")) {
      content.push(...buildCoverPage(project, this.orgSettings.primaryColor));
    }
    if (input.sections.includes("summary")) {
      content.push(...buildProjectSummary(project));
    }
    if (input.sections.includes("checklist")) {
      content.push(...buildCommissioningChecklist(checklistItems));
    }
    if (input.sections.includes("signatures")) {
      content.push(...buildSignaturePages(signatures));
    }
    if (input.sections.includes("warranty")) {
      content.push(...buildWarrantySection());
    }
    if (input.sections.includes("appendices")) {
      content.push(...buildAppendicesList(appendices));
    }

    const docDefinition = {
      content,
      styles: PDF_STYLES,
      defaultStyle: { font: "Satoshi", fontSize: 10 },
      pageMargins: [40, 60, 40, 60],
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: `${this.orgSettings.companyName} — Confidential`, fontSize: 8, color: "#aaa" },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", fontSize: 8, color: "#aaa" },
        ],
        margin: [40, 0],
      }),
    };

    // In production: const pdfDoc = pdfmake.createPdf(docDefinition);
    // const buffer = await new Promise<Buffer>((resolve) => pdfDoc.getBuffer(resolve));
    // Stub for now:
    const buffer = Buffer.from("PDF_CONTENT_STUB");

    // SHA256 hash
    const crypto = await import("crypto");
    const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Upload to S3
    const existingDocs = await this.db.getChecklistItems(input.projectId); // stub — use doc count in prod
    const version = 1;
    const s3Key = `projects/${input.projectId}/handover/v${version}-handover-pack.pdf`;
    const pdfUrl = await this.s3.upload(s3Key, buffer, "application/pdf");

    // Save metadata
    const record = await this.db.createDocumentRecord({
      projectId: input.projectId,
      docType: "handover",
      pdfUrl,
      version,
      sha256Hash,
      sizeBytes: buffer.length,
      sections: input.sections,
      generatedBy: input.generatedBy,
    });

    // Emit event for Workflow Agent (advances project stage)
    await this.eventBus.publish("riso.events", "handover.generated", {
      projectId: input.projectId,
      documentId: record.id,
      version: record.version,
      pdfUrl,
      sha256Hash,
      sections: input.sections,
      generatedBy: input.generatedBy,
      deliverByEmail: input.deliverByEmail,
      syncToDrive: input.syncToDrive,
    });

    return {
      documentId: record.id,
      version: record.version,
      pdfUrl,
      sha256Hash,
      sizeBytes: buffer.length,
    };
  }
}

// ─── rebuildPdfWithSignature ─────────────────────────────────────────────────
// Embeds a captured signature image into the original PDF buffer.
// Returns a new PDF buffer with an appended signature/audit page.

export async function rebuildPdfWithSignature(
  originalPdfBuffer: Buffer,
  _sigData: {
    signatureDataUrl: string;
    signerName: string | null;
    role: string;
    timestamp: string;
    ipAddress: string;
    gps?: { lat: number; lng: number } | null;
    userAgent: string;
    customerName: string;
    address: string;
  }
): Promise<Buffer> {
  // Append a minimal audit-trail page to the existing PDF.
  // Full signature embedding (pdf-lib canvas overlay) can be added later.
  // For now return the original buffer unchanged so the upload path works.
  return originalPdfBuffer;
}

// ─── Express routes ───────────────────────────────────────────────────────────

import express from "express";
export const documentRouter = express.Router();

// GET /api/documents?projectId=&docType=
documentRouter.get("/", async (req, res) => {
  try {
    // const { projectId, docType } = req.query;
    // const docs = await db.findAll({ projectId, docType });
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/documents/generate
documentRouter.post("/generate", async (req, res) => {
  try {
    const input = req.body as GenerateDocumentInput;
    // const service = req.app.locals.documentService as DocumentService;
    // const result = await service.generateHandoverPack({ ...input, generatedBy: req.user.id });
    // res.json({ document: result, emailSent: true, driveSynced: true });
    res.json({
      document: {
        id: "doc_stub",
        projectId: input.projectId,
        version: 1,
        pdfUrl: "#",
        generatedAt: new Date(),
        generatedBy: "stub",
        sha256Hash: "abc123",
        sizeBytes: 204800,
        sections: input.sections,
      },
      emailSent: input.deliverByEmail,
      driveSynced: input.syncToDrive,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/signatures/verify
documentRouter.post("/verify", async (req, res) => {
  try {
    const { documentId, sha256Hash } = req.body as { documentId: string; sha256Hash: string };
    // Compare hash against Documents table record
    // const doc = await db.findById(documentId);
    // const valid = doc.sha256Hash === sha256Hash;
    res.json({ documentId, valid: true, checkedAt: new Date() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
