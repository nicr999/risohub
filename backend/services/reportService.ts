// ============================================================
// RISO HUB — services/reportService.ts
// Generates PDF reports using pdfmake and uploads to S3
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfMake = require('pdfmake/build/pdfmake') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfFonts = require('pdfmake/build/vfs_fonts') as any;
import AWS from 'aws-sdk';
import { Report } from '../models';

// vfs_fonts export structure varies by pdfmake version — handle both
pdfMake.vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts ?? {};

const s3 = new AWS.S3();

const BRAND = {
  olive: '#7A8465',
  lightOlive: '#f0f1ec',
  cream: '#F5F5F2',
  neutral1: '#DBD2C4',
  dark: '#333333',
};

// ── Main entry point ─────────────────────────────────────────

export async function generateReportPdf(
  reportId: number,
  title: string,
  data: any,
  type: string
): Promise<void> {
  const docDefinition = buildDocDefinition(title, data, type);

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const pdfDoc = pdfMake.createPdf(docDefinition);
    pdfDoc.getBuffer((buffer: Buffer) => {
      if (buffer) resolve(buffer);
      else reject(new Error('Failed to generate PDF buffer'));
    });
  });

  const key = `reports/${reportId}-${Date.now()}.pdf`;
  await s3.putObject({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
  }).promise();

  const pdfUrl = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;

  await Report.update({ pdfUrl }, { where: { id: reportId } });
}

// ── Document definition builder ───────────────────────────────

function buildDocDefinition(title: string, data: any, type: string): any {
  const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: BRAND.dark },
    styles: {
      header: { fontSize: 20, bold: true, color: BRAND.olive, margin: [0, 0, 0, 4] },
      subheader: { fontSize: 13, bold: true, color: BRAND.dark, margin: [0, 16, 0, 8] },
      sectionTitle: { fontSize: 11, bold: true, color: BRAND.olive, margin: [0, 12, 0, 4] },
      tableHeader: { bold: true, fillColor: BRAND.olive, color: '#ffffff', fontSize: 9 },
      label: { bold: true, fontSize: 9 },
      small: { fontSize: 8, color: '#888888' },
    },
    header: (currentPage: number, pageCount: number) => ({
      margin: [40, 16, 40, 0],
      columns: [
        { text: 'RISO HUB', style: 'label', color: BRAND.olive },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', style: 'small' },
      ],
    }),
    footer: {
      margin: [40, 0, 40, 16],
      columns: [
        { text: `Generated ${now} — RISO HOME Compliance Platform`, style: 'small' },
        { text: 'CONFIDENTIAL', alignment: 'right', style: 'small' },
      ],
    },
    content: [
      // ── Cover ──────────────────────────────────────────────
      {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 4, color: BRAND.olive }],
        margin: [0, 0, 0, 16],
      },
      { text: 'RISO HOME', style: 'small', color: BRAND.olive },
      { text: title, style: 'header' },
      { text: `Generated ${now}`, style: 'small', margin: [0, 4, 0, 24] },

      // ── Body: type-specific content ────────────────────────
      ...buildBody(data, type),
    ],
  };
}

function buildBody(data: any, type: string): any[] {
  switch (type) {
    case 'monthly_compliance':
    case 'quarterly_compliance':
      return buildComplianceBody(data);
    case 'complaints_summary':
      return buildComplaintsBody(data);
    case 'qualifications_audit':
      return buildQualificationsBody(data);
    case 'project_pipeline':
      return buildPipelineBody(data);
    default:
      return [{ text: JSON.stringify(data, null, 2), style: 'small' }];
  }
}

function buildComplianceBody(data: any): any[] {
  const sections: any[] = [
    { text: 'Project Overview', style: 'sectionTitle' },
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'Metric', style: 'tableHeader' }, { text: 'Value', style: 'tableHeader' }],
          ['Total Projects', { text: String(data.totalProjects), bold: true }],
          ...Object.entries(data.byStatus || {}).map(([k, v]) => [`Stage: ${k}`, String(v)]),
          ...Object.entries(data.byType || {}).map(([k, v]) => [`Type: ${k}`, String(v)]),
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 16],
    },
  ];

  if (data.nonCompliantItems?.length > 0) {
    sections.push(
      { text: 'Non-Compliant Checklist Items', style: 'sectionTitle' },
      {
        table: {
          widths: ['auto', '*', 'auto'],
          body: [
            [
              { text: 'Project ID', style: 'tableHeader' },
              { text: 'Item', style: 'tableHeader' },
              { text: 'Status', style: 'tableHeader' },
            ],
            ...data.nonCompliantItems.map((item: any) => [
              String(item.projectId), item.name || item.key, item.status,
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      }
    );
  }

  return sections;
}

function buildComplaintsBody(data: any): any[] {
  return [
    { text: 'Summary', style: 'sectionTitle' },
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'Metric', style: 'tableHeader' }, { text: 'Value', style: 'tableHeader' }],
          ['Total Complaints', String(data.total)],
          ['Average Resolution (days)', data.avgResolutionDays != null ? String(data.avgResolutionDays) : 'N/A'],
          ['Escalated', String(data.escalated?.length || 0)],
          ...Object.entries(data.byStatus || {}).map(([k, v]) => [`Status: ${k}`, String(v)]),
          ...Object.entries(data.byPriority || {}).map(([k, v]) => [`Priority: ${k}`, String(v)]),
          ...Object.entries(data.byCategory || {}).map(([k, v]) => [`Category: ${k}`, String(v)]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
  ];
}

function buildQualificationsBody(data: any): any[] {
  const sections: any[] = [
    { text: 'Qualification Status', style: 'sectionTitle' },
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'Category', style: 'tableHeader' }, { text: 'Count', style: 'tableHeader' }],
          ['Total Qualifications', String(data.total)],
          ['Valid', String(data.valid)],
          ['Expiring within 60 days', String(data.expiringSoon?.length || 0)],
          ['Expired', String(data.expired?.length || 0)],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 16],
    },
  ];

  if (data.expired?.length > 0) {
    sections.push(
      { text: 'Expired Qualifications — Action Required', style: 'sectionTitle', color: '#cc0000' },
      {
        table: {
          widths: ['*', '*', 'auto'],
          body: [
            [
              { text: 'Staff Member', style: 'tableHeader' },
              { text: 'Qualification', style: 'tableHeader' },
              { text: 'Expired', style: 'tableHeader' },
            ],
            ...data.expired.map((q: any) => [
              q.staff?.name || 'Unknown',
              q.type,
              q.expiresAt ? new Date(q.expiresAt).toLocaleDateString('en-GB') : 'N/A',
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      }
    );
  }

  return sections;
}

function buildPipelineBody(data: any): any[] {
  return [
    { text: 'Pipeline Summary', style: 'sectionTitle' },
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'Stage', style: 'tableHeader' }, { text: 'Count', style: 'tableHeader' }],
          ...Object.entries(data.byStage || {}).map(([k, v]) => [k, String(v)]),
          [{ text: 'Total', bold: true }, { text: String(data.total), bold: true }],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 16],
    },
    { text: 'Project List', style: 'sectionTitle' },
    {
      table: {
        widths: ['auto', '*', '*', 'auto', 'auto'],
        body: [
          [
            { text: 'ID', style: 'tableHeader' },
            { text: 'Customer', style: 'tableHeader' },
            { text: 'Address', style: 'tableHeader' },
            { text: 'Stage', style: 'tableHeader' },
            { text: 'Assignee', style: 'tableHeader' },
          ],
          ...(data.projects || []).map((p: any) => [
            String(p.id), p.customerName, p.address, p.status, p.assignee || '—',
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 8,
    },
  ];
}
