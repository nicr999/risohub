// ============================================================
// RISO HUB — services/busEligibilityService.ts
// Boiler Upgrade Scheme eligibility rules engine
//
// Based on Ofgem BUS guidance (updated 2024):
// https://www.ofgem.gov.uk/environmental-and-social-schemes/
//   boiler-upgrade-scheme-bus
//
// Grant amounts (as of 2024):
//   ASHP: £7,500
//   GSHP: £7,500
//
// Key eligibility criteria:
//  1. Property must be in England or Wales
//  2. Property must have a valid EPC (lodged post April 1 2022,
//     or if pre-2022, no outstanding loft/cavity wall insulation recs)
//  3. EPC rating D or above (A–D) — F/G = ineligible
//  4. Property must not be a new build (planning permission pre April 2022)
//  5. Existing fossil fuel heating system (gas/oil/LPG/electric storage)
//  6. System type must be ASHP or GSHP (biomass handled separately)
//  7. No outstanding mandatory insulation recommendations on EPC
//     unless property is a listed building or insulation is not
//     technically feasible
//  8. Property must be owner-occupied or a private rental with
//     landlord applying
// ============================================================

import { EPCRecord } from '../models/EPCAndBUSModels';
import { Project } from '../models';
import { BUSCriterion, BUSVerdict } from '../models/EPCAndBUSModels';

// Grant amounts by system type
const GRANT_AMOUNTS: Record<string, number> = {
  ASHP: 7500,
  GSHP: 7500,
};

// EPC ratings that qualify (D or above)
const QUALIFYING_RATINGS = ['A', 'B', 'C', 'D'];

// Fuels that indicate an existing fossil fuel system
const FOSSIL_FUELS = [
  'mains gas', 'natural gas', 'bulk lpg', 'bottled lpg', 'lpg',
  'oil', 'heating oil', 'coal', 'smokeless fuel', 'electric storage heaters',
  'electricity', 'electric',
];

// EPC recommendations that are mandatory insulation requirements for BUS
const MANDATORY_INSULATION_KEYWORDS = [
  'loft insulation', 'roof insulation', 'cavity wall insulation',
  'solid wall insulation', 'floor insulation', 'flat roof insulation',
];

// ── Main entry point ─────────────────────────────────────────

export interface BUSAssessmentInput {
  project: {
    projectType: 'ASHP' | 'GSHP';
    address: string;
    postcode: string;
  };
  epc: EPCRecord | null;
  // Additional context that may not be in EPC
  overrides?: {
    isNewBuild?: boolean;
    isListedBuilding?: boolean;
    isEnglandOrWales?: boolean;
    ownerOccupied?: boolean;
    insulationNotFeasible?: boolean;
    existingSystemFuel?: string;
  };
}

export interface BUSAssessmentResult {
  verdict: BUSVerdict;
  criteria: BUSCriterion[];
  blockers: string[];
  warnings: string[];
  grantAmount: number | null;
  summary: string;
}

export function assessBUSEligibility(input: BUSAssessmentInput): BUSAssessmentResult {
  const { project, epc, overrides = {} } = input;
  const criteria: BUSCriterion[] = [];
  const warnings: string[] = [];

  // ── Criterion 1: England or Wales ────────────────────────
  const isEnglandOrWales = overrides.isEnglandOrWales !== false; // assume true unless overridden
  criteria.push({
    id: 'location',
    label: 'Property in England or Wales',
    pass: isEnglandOrWales,
    blocker: true,
    detail: isEnglandOrWales
      ? 'Property postcode indicates England or Wales.'
      : 'BUS is only available for properties in England and Wales. Scotland and Northern Ireland have separate schemes.',
    value: project.postcode,
  });

  // ── Criterion 2: Valid EPC exists ─────────────────────────
  const hasEPC = !!epc;
  const epcLodgedAfterApril2022 = epc?.lodgementDate
    ? new Date(epc.lodgementDate) >= new Date('2022-04-01')
    : false;

  // Check for outstanding mandatory insulation recommendations
  const outstandingInsulationRecs = epc?.recommendations
    ? getOutstandingInsulationRecs(epc.recommendations as any[], overrides.insulationNotFeasible, overrides.isListedBuilding)
    : [];

  const epcValid = hasEPC && (epcLodgedAfterApril2022 || outstandingInsulationRecs.length === 0);

  criteria.push({
    id: 'epc_valid',
    label: 'Valid EPC on property',
    pass: epcValid,
    blocker: true,
    detail: !hasEPC
      ? 'No EPC has been fetched for this property. An EPC is required to assess BUS eligibility.'
      : !epcLodgedAfterApril2022 && outstandingInsulationRecs.length > 0
        ? `EPC was lodged before April 2022 and has outstanding insulation recommendations: ${outstandingInsulationRecs.join(', ')}. These must be completed or waived before BUS can be claimed.`
        : `EPC lodged ${epc?.lodgementDate ? new Date(epc.lodgementDate).toLocaleDateString('en-GB') : 'unknown'} — valid for BUS.`,
    value: epc?.lodgementDate?.toString(),
  });

  // ── Criterion 3: EPC rating D or above ───────────────────
  const epcRating = epc?.currentEnergyRating || null;
  const ratingQualifies = epcRating ? QUALIFYING_RATINGS.includes(epcRating.toUpperCase()) : null;

  criteria.push({
    id: 'epc_rating',
    label: 'EPC rating D or above (A–D)',
    pass: ratingQualifies === true,
    blocker: true,
    detail: !epcRating
      ? 'No EPC rating available. Fetch the property EPC to determine eligibility.'
      : ratingQualifies
        ? `Current EPC rating is ${epcRating} (score: ${epc?.currentEnergyEfficiency}) — qualifies.`
        : `Current EPC rating is ${epcRating} (score: ${epc?.currentEnergyEfficiency}). Properties rated E, F or G are not eligible for BUS. The property may need improvement works first.`,
    value: epcRating || undefined,
  });

  // ── Criterion 4: Not a new build ─────────────────────────
  const isNewBuild = overrides.isNewBuild === true;
  criteria.push({
    id: 'not_new_build',
    label: 'Property is not a new build',
    pass: !isNewBuild,
    blocker: true,
    detail: isNewBuild
      ? 'New build properties (planning permission granted on or after 1 April 2022) are not eligible for BUS.'
      : 'Property is not identified as a new build — eligible.',
    value: !isNewBuild,
  });

  // ── Criterion 5: Existing fossil fuel heating system ─────
  const fuelFromEPC = epc?.mainFuel?.toLowerCase() || '';
  const fuelOverride = overrides.existingSystemFuel?.toLowerCase() || '';
  const fuelToCheck = fuelOverride || fuelFromEPC;
  const hasFossilFuel = fuelToCheck
    ? FOSSIL_FUELS.some(f => fuelToCheck.includes(f))
    : null; // unknown

  criteria.push({
    id: 'existing_fossil_fuel',
    label: 'Existing fossil fuel or electric heating system',
    pass: hasFossilFuel === true,
    blocker: true,
    detail: hasFossilFuel === null
      ? 'Existing heating fuel could not be determined from EPC. Please confirm the current heating system.'
      : hasFossilFuel
        ? `Existing heating system uses ${fuelToCheck} — qualifies.`
        : `Existing system (${fuelToCheck}) does not appear to be a fossil fuel or electric storage heater system. Heat pumps replacing other heat pumps or biomass boilers may not qualify.`,
    value: fuelToCheck || undefined,
  });

  // ── Criterion 6: System type is ASHP or GSHP ─────────────
  const validSystemType = ['ASHP', 'GSHP'].includes(project.projectType);
  criteria.push({
    id: 'system_type',
    label: 'System type is ASHP or GSHP',
    pass: validSystemType,
    blocker: true,
    detail: validSystemType
      ? `${project.projectType} is an eligible system type under BUS.`
      : `${project.projectType} is not eligible under BUS. Eligible types are Air Source Heat Pump (ASHP) and Ground Source Heat Pump (GSHP).`,
    value: project.projectType,
  });

  // ── Criterion 7: No outstanding mandatory insulation recs ─
  const noBlockingInsulation = outstandingInsulationRecs.length === 0
    || overrides.insulationNotFeasible === true
    || overrides.isListedBuilding === true;

  criteria.push({
    id: 'insulation',
    label: 'No outstanding mandatory insulation recommendations',
    pass: noBlockingInsulation,
    blocker: false, // warning rather than hard block — installer must confirm
    detail: outstandingInsulationRecs.length === 0
      ? 'No mandatory insulation recommendations outstanding on EPC.'
      : overrides.insulationNotFeasible || overrides.isListedBuilding
        ? `Outstanding insulation recommendations exist (${outstandingInsulationRecs.join(', ')}) but exemption applies (listed building or insulation not technically feasible).`
        : `Outstanding insulation recommendations: ${outstandingInsulationRecs.join(', ')}. These must be completed or an exemption confirmed before BUS can be claimed.`,
    value: outstandingInsulationRecs.join(', ') || 'none',
  });

  if (!noBlockingInsulation) {
    warnings.push(`Outstanding insulation recommendations may block BUS claim: ${outstandingInsulationRecs.join(', ')}`);
  }

  // ── Criterion 8: Owner-occupied or private rental ─────────
  const ownerOccupied = overrides.ownerOccupied !== false; // assume true unless overridden
  criteria.push({
    id: 'ownership',
    label: 'Owner-occupied or eligible private rental',
    pass: ownerOccupied,
    blocker: false,
    detail: ownerOccupied
      ? 'Property is owner-occupied or a qualifying private rental.'
      : 'Social housing landlords cannot apply for BUS. Local authority and social housing properties are not eligible.',
    value: ownerOccupied,
  });

  if (!ownerOccupied) {
    warnings.push('Social housing properties are not eligible for BUS.');
  }

  // ── Criterion 9: Listed building check ───────────────────
  if (overrides.isListedBuilding) {
    warnings.push('Listed buildings may face restrictions on certain installation types. Confirm with local planning authority if required.');
    criteria.push({
      id: 'listed_building',
      label: 'Listed building — additional checks required',
      pass: true,
      blocker: false,
      detail: 'Property is a listed building. Insulation exemptions may apply. Planning authority confirmation may be required for external works.',
      value: true,
    });
  }

  // ── Determine verdict ─────────────────────────────────────
  const blockerIds = criteria
    .filter(c => c.blocker && !c.pass)
    .map(c => c.id);

  const unknownBlockers = criteria
    .filter(c => c.blocker && c.pass === false && c.value === undefined)
    .map(c => c.id);

  let verdict: BUSVerdict;
  if (blockerIds.length > 0) {
    verdict = 'ineligible';
  } else if (unknownBlockers.length > 0 || hasFossilFuel === null) {
    verdict = 'requires_review';
  } else if (warnings.length > 0) {
    verdict = 'likely_eligible';
  } else {
    verdict = 'eligible';
  }

  const grantAmount = verdict === 'eligible' || verdict === 'likely_eligible'
    ? (GRANT_AMOUNTS[project.projectType] || null)
    : null;

  const summary = buildSummary(verdict, blockerIds, warnings, grantAmount, project.projectType);

  return { verdict, criteria, blockers: blockerIds, warnings, grantAmount, summary };
}

// ── Helpers ───────────────────────────────────────────────────

function getOutstandingInsulationRecs(
  recommendations: { improvement: string }[],
  insulationNotFeasible?: boolean,
  isListedBuilding?: boolean
): string[] {
  if (insulationNotFeasible || isListedBuilding) return [];
  return recommendations
    .filter(r => MANDATORY_INSULATION_KEYWORDS.some(k => r.improvement.toLowerCase().includes(k)))
    .map(r => r.improvement);
}

function buildSummary(
  verdict: BUSVerdict,
  blockerIds: string[],
  warnings: string[],
  grantAmount: number | null,
  systemType: string
): string {
  switch (verdict) {
    case 'eligible':
      return `This property appears eligible for the Boiler Upgrade Scheme. The ${systemType} installation may qualify for a grant of £${grantAmount?.toLocaleString()}. All criteria pass.`;
    case 'likely_eligible':
      return `This property is likely eligible for BUS, however ${warnings.length} item${warnings.length > 1 ? 's' : ''} require${warnings.length === 1 ? 's' : ''} confirmation before the grant can be claimed. Potential grant: £${grantAmount?.toLocaleString()}.`;
    case 'requires_review':
      return `Eligibility cannot be confirmed automatically — additional information is needed on ${blockerIds.join(', ')}. Please review manually before advising the customer.`;
    case 'ineligible':
      return `This property does not appear to be eligible for BUS based on the information available. Blocking criteria: ${blockerIds.join(', ')}. Review each failed criterion for potential remediation steps.`;
  }
}
