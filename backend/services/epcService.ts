// ============================================================
// RISO HUB — services/epcService.ts
// Wrapper for the UK EPC Open Data Communities API
// Docs: https://epc.opendatacommunities.org/docs/api
//
// Auth: Basic auth using API key registered at
//       https://epc.opendatacommunities.org/login
// Env vars required:
//   EPC_API_EMAIL  — registered email address
//   EPC_API_KEY    — API key from the EPC portal
// ============================================================

import axios from 'axios';
import { EPCRecord } from '../models/EPCAndBUSModels';

const EPC_BASE = 'https://epc.opendatacommunities.org/api/v1';

// Basic auth header — base64(email:key)
function authHeader(): string {
  const creds = Buffer.from(`${process.env.EPC_API_EMAIL}:${process.env.EPC_API_KEY}`).toString('base64');
  return `Basic ${creds}`;
}

const epcClient = axios.create({
  baseURL: EPC_BASE,
  headers: {
    Authorization: authHeader(),
    Accept: 'application/json',
  },
  timeout: 10_000,
});

// ── Types ─────────────────────────────────────────────────────

export interface EPCSearchResult {
  lmkKey: string;
  address1: string;
  address2?: string;
  address3?: string;
  posttown?: string;
  postcode: string;
  currentEnergyRating: string;
  currentEnergyEfficiency: number;
  lodgementDate: string;
  propertyType: string;
  builtForm?: string;
}

export interface EPCDetail extends EPCSearchResult {
  certificateRef?: string;
  constructionAgeBand?: string;
  totalFloorArea?: number;
  potentialEnergyRating?: string;
  potentialEnergyEfficiency?: number;
  mainHeatingDescription?: string;
  mainFuel?: string;
  roofDescription?: string;
  roofEnergyEff?: string;
  wallDescription?: string;
  wallEnergyEff?: string;
  hotWaterDescription?: string;
  inspectionDate?: string;
  recommendations?: EPCRecommendation[];
  raw: object;
}

export interface EPCRecommendation {
  improvement: string;
  indicativeCost?: string;
  typicalSaving?: string;
}

// ── Search by postcode ────────────────────────────────────────

export async function searchEPCByPostcode(postcode: string, address?: string): Promise<EPCSearchResult[]> {
  const clean = postcode.replace(/\s+/g, '').toUpperCase();

  const params: any = {
    postcode: clean,
    size: 10,
    from: 0,
  };

  // Optionally filter by address fragment
  if (address) {
    params.address = address;
  }

  const res = await epcClient.get('/domestic/search', { params });
  const rows: any[] = res.data?.rows || [];

  return rows.map(mapSearchResult);
}

// ── Fetch full certificate by LMK key ────────────────────────

export async function fetchEPCByLmkKey(lmkKey: string): Promise<EPCDetail> {
  const res = await epcClient.get(`/domestic/certificate/${lmkKey}`);
  const row = res.data?.rows?.[0];
  if (!row) throw new Error('EPC certificate not found');

  // Fetch recommendations separately
  let recommendations: EPCRecommendation[] = [];
  try {
    const recRes = await epcClient.get(`/domestic/recommendations/${lmkKey}`);
    recommendations = (recRes.data?.rows || []).map((r: any) => ({
      improvement: r['improvement-summary'] || r['improvement-description'] || '',
      indicativeCost: r['indicative-cost'],
      typicalSaving: r['typical-saving'],
    }));
  } catch {
    // Recommendations are optional — don't fail if unavailable
  }

  return {
    ...mapSearchResult(row),
    certificateRef: row['certificate-hash'],
    constructionAgeBand: row['construction-age-band'],
    totalFloorArea: row['total-floor-area'] ? parseFloat(row['total-floor-area']) : undefined,
    potentialEnergyRating: row['potential-energy-rating'],
    potentialEnergyEfficiency: row['potential-energy-efficiency'] ? parseInt(row['potential-energy-efficiency']) : undefined,
    mainHeatingDescription: row['main-heating-description'],
    mainFuel: row['main-fuel'],
    roofDescription: row['roof-description'],
    roofEnergyEff: row['roof-energy-eff'],
    wallDescription: row['walls-description'],
    wallEnergyEff: row['walls-energy-eff'],
    hotWaterDescription: row['hot-water-description'],
    inspectionDate: row['inspection-date'],
    recommendations,
    raw: row,
  };
}

// ── Store EPC against a project ───────────────────────────────

export async function storeEPCForProject(
  projectId: number,
  lmkKey: string,
  fetchedBy: number
): Promise<EPCRecord> {
  const detail = await fetchEPCByLmkKey(lmkKey);

  // Upsert — one EPC per project (replace if re-fetching)
  const existing = await EPCRecord.findOne({ where: { projectId } });
  if (existing) {
    await existing.update(mapDetailToModel(detail, projectId, fetchedBy));
    return existing;
  }

  return EPCRecord.create({
    projectId,
    lmkKey: detail.lmkKey,
    certificateRef: detail.certificateRef,
    address: [detail.address1, detail.address2, detail.address3].filter(Boolean).join(', '),
    postcode: detail.postcode,
    propertyType: detail.propertyType,
    builtForm: detail.builtForm,
    constructionAgeBand: detail.constructionAgeBand,
    totalFloorArea: detail.totalFloorArea,
    currentEnergyRating: detail.currentEnergyRating,
    currentEnergyEfficiency: detail.currentEnergyEfficiency,
    potentialEnergyRating: detail.potentialEnergyRating,
    potentialEnergyEfficiency: detail.potentialEnergyEfficiency,
    mainHeatingDescription: detail.mainHeatingDescription,
    mainFuel: detail.mainFuel,
    roofDescription: detail.roofDescription,
    roofEnergyEff: detail.roofEnergyEff,
    wallDescription: detail.wallDescription,
    wallEnergyEff: detail.wallEnergyEff,
    hotWaterDescription: detail.hotWaterDescription,
    recommendations: detail.recommendations,
    lodgementDate: detail.lodgementDate ? new Date(detail.lodgementDate) : undefined,
    inspectionDate: detail.inspectionDate ? new Date(detail.inspectionDate) : undefined,
    fetchedBy,
    fetchedAt: new Date(),
    raw: detail.raw,
  });
}

// ── Health check ──────────────────────────────────────────────

export async function checkEPCHealth(): Promise<{ ok: boolean; message: string }> {
  try {
    // Lightweight test — search a known postcode
    await epcClient.get('/domestic/search', { params: { postcode: 'SW1A1AA', size: 1 } });
    return { ok: true, message: 'EPC API reachable' };
  } catch (err: any) {
    return { ok: false, message: err.message || 'EPC API unreachable' };
  }
}

// ── Mappers ───────────────────────────────────────────────────

function mapSearchResult(row: any): EPCSearchResult {
  return {
    lmkKey: row['lmk-key'],
    address1: row['address1'] || row['address'],
    address2: row['address2'],
    address3: row['address3'],
    posttown: row['post-town'],
    postcode: row['postcode'],
    currentEnergyRating: row['current-energy-rating'],
    currentEnergyEfficiency: parseInt(row['current-energy-efficiency'] || '0'),
    lodgementDate: row['lodgement-date'],
    propertyType: row['property-type'],
    builtForm: row['built-form'],
  };
}

function mapDetailToModel(detail: EPCDetail, projectId: number, fetchedBy: number) {
  return {
    projectId,
    lmkKey: detail.lmkKey,
    certificateRef: detail.certificateRef,
    address: [detail.address1, detail.address2, detail.address3].filter(Boolean).join(', '),
    postcode: detail.postcode,
    propertyType: detail.propertyType,
    builtForm: detail.builtForm,
    constructionAgeBand: detail.constructionAgeBand,
    totalFloorArea: detail.totalFloorArea,
    currentEnergyRating: detail.currentEnergyRating,
    currentEnergyEfficiency: detail.currentEnergyEfficiency,
    potentialEnergyRating: detail.potentialEnergyRating,
    potentialEnergyEfficiency: detail.potentialEnergyEfficiency,
    mainHeatingDescription: detail.mainHeatingDescription,
    mainFuel: detail.mainFuel,
    roofDescription: detail.roofDescription,
    roofEnergyEff: detail.roofEnergyEff,
    wallDescription: detail.wallDescription,
    wallEnergyEff: detail.wallEnergyEff,
    hotWaterDescription: detail.hotWaterDescription,
    recommendations: detail.recommendations,
    lodgementDate: detail.lodgementDate ? new Date(detail.lodgementDate) : undefined,
    inspectionDate: detail.inspectionDate ? new Date(detail.inspectionDate) : undefined,
    fetchedBy,
    fetchedAt: new Date(),
    raw: detail.raw,
  };
}
