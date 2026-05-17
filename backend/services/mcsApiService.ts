// services/mcsApiService.ts
// Wrapper for the MCS (Microgeneration Certification Scheme) API.
//
// Required env vars:
//   MCS_API_KEY   — API key issued by MCS (mcscertified.com)
//   MCS_API_URL   — defaults to production; set to sandbox URL for testing
//                   Sandbox: https://api-sandbox.mcscertified.com/v1
//                   Production: https://api.mcscertified.com/v1
//
// Obtain credentials: https://mcscertified.com/for-installers/mcs-connect/api/
//
// MCS installer number format: NAP-XXXXX (e.g. NAP-12345)
// Certificate numbers returned: MC-XXXXXX-YYYY

const BASE_URL = (process.env.MCS_API_URL ?? 'https://api.mcscertified.com/v1').replace(/\/$/, '');
const API_KEY  = process.env.MCS_API_KEY ?? '';

const REQUEST_TIMEOUT_MS = 15_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type MCSSystemType =
  | 'ASHP'   // Air Source Heat Pump
  | 'GSHP'   // Ground Source Heat Pump
  | 'WSHP'   // Water Source Heat Pump
  | 'SolarPV'
  | 'SolarThermal'
  | 'Biomass'
  | 'MicroCHP';

export interface MCSInstallationDetails {
  // Installer
  installerMcsNumber: string;    // e.g. 'NAP-12345'

  // Property
  propertyAddressLine1: string;
  propertyAddressLine2?: string;
  propertyTown: string;
  propertyPostcode: string;
  propertyType: 'Domestic' | 'Commercial';
  epcLodgementRef?: string;     // 20-char EPC reference, e.g. '0123-4567-8910-1112-1314'

  // System
  systemType: MCSSystemType;
  systemCapacityKW: number;
  manufacturerName: string;
  modelName: string;
  serialNumber?: string;
  commissioningDate: string;    // ISO date string, e.g. '2026-04-15'
  isReplacement: boolean;       // true if replacing an existing heating system

  // Customer consent
  customerConsentObtained: boolean;
  customerName: string;
  customerEmail?: string;

  // Additional for heat pumps
  heatLossCalculationSoftware?: string;
  designHeatDemandKW?: number;
  scop?: number;                // Seasonal Coefficient of Performance
}

export interface MCSSubmissionResult {
  success: true;
  certificateNumber: string;    // e.g. 'MC-000123-2026'
  registrationDate: string;
  expiryDate: string;           // certificates typically valid for 1 year
  certificateUrl: string;       // PDF download URL from MCS
  mcsRef: string;               // MCS internal reference
}

export interface MCSSubmissionError {
  success: false;
  errorCode: string;
  errorMessage: string;
  fieldErrors?: Record<string, string>;
}

export type MCSSubmissionResponse = MCSSubmissionResult | MCSSubmissionError;

export interface MCSCertificateStatus {
  certificateNumber: string;
  status: 'active' | 'expired' | 'revoked' | 'pending';
  installerMcsNumber: string;
  systemType: MCSSystemType;
  propertyPostcode: string;
  commissioningDate: string;
  expiryDate: string;
  certificateUrl: string;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function mcsRequest<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!API_KEY) {
    throw new Error('MCS_API_KEY is not set. Cannot contact MCS API.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'RisoHub/1.0 (+https://risohome.co.uk)',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = await res.json();

    if (!res.ok) {
      // MCS API returns { code, message, details? } on error
      const err: MCSSubmissionError = {
        success: false,
        errorCode: data.code ?? String(res.status),
        errorMessage: data.message ?? `MCS API error ${res.status}`,
        fieldErrors: data.details ?? undefined,
      };
      return err as T;
    }

    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Submit installation certificate ─────────────────────────────────────────

export async function submitMCSCertificate(
  details: MCSInstallationDetails
): Promise<MCSSubmissionResponse> {
  // Map our internal format to MCS API payload
  const payload = {
    installer: {
      mcsNumber: details.installerMcsNumber,
    },
    property: {
      address: {
        line1:    details.propertyAddressLine1,
        line2:    details.propertyAddressLine2 ?? null,
        town:     details.propertyTown,
        postcode: details.propertyPostcode,
      },
      type:            details.propertyType,
      epcLodgementRef: details.epcLodgementRef ?? null,
    },
    system: {
      type:               details.systemType,
      capacityKW:         details.systemCapacityKW,
      manufacturer:       details.manufacturerName,
      model:              details.modelName,
      serialNumber:       details.serialNumber ?? null,
      commissioningDate:  details.commissioningDate,
      isReplacement:      details.isReplacement,
      heatLoss: details.designHeatDemandKW != null ? {
        software:    details.heatLossCalculationSoftware ?? null,
        heatDemandKW: details.designHeatDemandKW,
        scop:         details.scop ?? null,
      } : null,
    },
    customer: {
      name:                    details.customerName,
      email:                   details.customerEmail ?? null,
      consentToContactByMCS:   details.customerConsentObtained,
    },
  };

  try {
    const result = await mcsRequest<any>('POST', '/certificates/installation', payload);

    if (result.success === false || result.errorCode) {
      return result as MCSSubmissionError;
    }

    return {
      success:           true,
      certificateNumber: result.certificateNumber,
      registrationDate:  result.registrationDate,
      expiryDate:        result.expiryDate,
      certificateUrl:    result.certificateUrl,
      mcsRef:            result.mcsRef ?? result.id,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, errorCode: 'TIMEOUT', errorMessage: 'MCS API request timed out' };
    }
    return { success: false, errorCode: 'NETWORK_ERROR', errorMessage: err.message ?? 'Network error contacting MCS API' };
  }
}

// ─── Look up certificate status ───────────────────────────────────────────────

export async function getMCSCertificateStatus(
  certificateNumber: string
): Promise<MCSCertificateStatus | null> {
  try {
    const result = await mcsRequest<any>('GET', `/certificates/${encodeURIComponent(certificateNumber)}`);
    if (result.errorCode) return null;
    return result as MCSCertificateStatus;
  } catch {
    return null;
  }
}

// ─── Verify installer accreditation ──────────────────────────────────────────
// Useful to confirm an installer number is current before submission.

export async function verifyInstallerAccreditation(
  installerMcsNumber: string
): Promise<{ active: boolean; companyName?: string; technologies?: string[] } | null> {
  try {
    const result = await mcsRequest<any>('GET', `/installers/${encodeURIComponent(installerMcsNumber)}`);
    if (result.errorCode) return null;
    return {
      active:       result.status === 'active',
      companyName:  result.companyName,
      technologies: result.technologies,
    };
  } catch {
    return null;
  }
}
