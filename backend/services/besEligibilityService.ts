// services/besEligibilityService.ts
// BES / Ofgem grant scheme eligibility checker
// Grant amounts last updated: May 2026
// Sources: Ofgem BUS scheme, ECO4, Great British Insulation Scheme (GBIS)

export type InstallType =
  | 'Air Source Heat Pump'
  | 'Ground Source Heat Pump'
  | 'Solar PV'
  | 'Solar PV + Battery'
  | 'Battery Storage'
  | 'Biomass Boiler'
  | 'Solar Water Heating'
  | 'Flat Plate Solar Thermal'
  | 'Cavity Wall Insulation'
  | 'Solid Wall Insulation (External)'
  | 'Solid Wall Insulation (Internal)'
  | 'Loft Insulation'
  | 'Underfloor Insulation'
  | 'Double Glazing';

export type PropertyType = 'Detached' | 'Semi-Detached' | 'Terraced' | 'Flat' | 'Bungalow' | 'End of Terrace';
export type TenureType = 'Owner Occupier' | 'Private Rented' | 'Social Housing';
export type EpcRating = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export type Region = 'England' | 'Wales' | 'Scotland';

export interface EligibilityInput {
  installType: InstallType;
  propertyType: PropertyType;
  tenure: TenureType;
  epcRating: EpcRating;
  householdIncomeBand: 'under_31k' | '31k_to_50k' | 'over_50k' | 'unknown';
  onBenefits: boolean;
  isRural: boolean;
  /** Defaults to 'England' when not provided — affects BUS eligibility and regional scheme availability */
  region?: Region;
  heatingSystemAge?: number; // years
  currentHeatingFuel?: 'Gas' | 'Oil' | 'Electric' | 'Solid Fuel' | 'LPG' | 'None';
}

export interface GrantResult {
  schemeName: string;
  schemeRef: string;
  eligible: boolean;
  grantAmount: number | null; // GBP — null if variable / TBC
  grantDescription: string;
  conditions: string[];
  incompatibilities: string[];
  notes?: string;
  lastUpdated: string;
}

export interface EligibilityReport {
  installType: InstallType;
  totalPotentialGrant: number;
  grants: GrantResult[];
  summary: string;
  warnings: string[];
  assessedAt: string;
}

// ─── BUS (Boiler Upgrade Scheme) ─────────────────────────────────────────────
// Rates: £7,500 ASHP / £7,500 GSHP / £5,000 Biomass (2024/25 rates, England & Wales only)
function assessBUS(input: EligibilityInput): GrantResult {
  const region = input.region ?? 'England';
  const eligible = (
    ['Air Source Heat Pump', 'Ground Source Heat Pump', 'Biomass Boiler'].includes(input.installType) &&
    input.tenure !== 'Social Housing' &&
    ['E', 'F', 'G', 'D', 'C', 'B', 'A'].includes(input.epcRating) &&
    region !== 'Scotland' // Scotland uses Home Energy Scotland instead
  );

  const amountMap: Partial<Record<InstallType, number>> = {
    'Air Source Heat Pump': 7500,
    'Ground Source Heat Pump': 7500,
    'Biomass Boiler': 5000,
  };

  return {
    schemeName: 'Boiler Upgrade Scheme (BUS)',
    schemeRef: 'BUS-2024',
    eligible,
    grantAmount: eligible ? (amountMap[input.installType] ?? null) : null,
    grantDescription: 'Government grant toward cost of low-carbon heating system',
    conditions: [
      'Property must be in England or Wales',
      'Existing fossil-fuel heating system must be replaced',
      'MCS certified installer required',
      'EPC with no outstanding recommendations for loft/cavity wall insulation',
    ],
    incompatibilities: ['ECO4 cannot be claimed simultaneously for same measure'],
    lastUpdated: '2024-10-01',
  };
}

// ─── ECO4 ────────────────────────────────────────────────────────────────────
function assessECO4(input: EligibilityInput): GrantResult {
  const incomeEligible = input.onBenefits || input.householdIncomeBand === 'under_31k';
  const epcEligible = ['D', 'E', 'F', 'G'].includes(input.epcRating);

  const eligible = incomeEligible && epcEligible && (
    ['Air Source Heat Pump', 'Solar PV', 'Cavity Wall Insulation',
     'Solid Wall Insulation (External)', 'Solid Wall Insulation (Internal)',
     'Loft Insulation', 'Underfloor Insulation'].includes(input.installType)
  );

  return {
    schemeName: 'Energy Company Obligation 4 (ECO4)',
    schemeRef: 'ECO4',
    eligible,
    grantAmount: eligible ? null : null, // ECO4 grants are variable — subject to energy company assessment
    grantDescription: 'Fully or partially funded energy efficiency measures via energy supplier obligation. Grant amount assessed by supplier.',
    conditions: [
      'Must receive qualifying benefits OR household income under £31,000',
      'Property EPC rating D, E, F or G',
      'Funded through energy supplier — apply via supplier or local authority',
    ],
    incompatibilities: [],
    notes: 'ECO4 runs to March 2026. Successor scheme (ECO5) expected from April 2026 — check Ofgem for latest.',
    lastUpdated: '2024-04-01',
  };
}

// ─── GBIS (Great British Insulation Scheme) ───────────────────────────────────
function assessGBIS(input: EligibilityInput): GrantResult {
  const isInsulation = ['Cavity Wall Insulation', 'Solid Wall Insulation (External)',
    'Solid Wall Insulation (Internal)', 'Loft Insulation', 'Underfloor Insulation'].includes(input.installType);

  const eligible = isInsulation && (
    ['E', 'F', 'G'].includes(input.epcRating) ||
    (input.householdIncomeBand === 'under_31k' || input.onBenefits)
  );

  return {
    schemeName: 'Great British Insulation Scheme (GBIS)',
    schemeRef: 'GBIS',
    eligible,
    grantAmount: eligible ? null : null, // Variable by measure and property
    grantDescription: 'Partially or fully funded insulation via energy supplier obligation.',
    conditions: [
      'Single insulation measure per household',
      'EPC E, F, G (group A) or means-tested (group B)',
      'Scheme runs to March 2026',
    ],
    incompatibilities: ['Cannot combine with ECO4 for the same measure at the same property'],
    lastUpdated: '2024-04-01',
  };
}

// ─── Smart Export Guarantee (SEG) ─────────────────────────────────────────────
function assessSEG(input: EligibilityInput): GrantResult {
  const eligible = ['Solar PV', 'Solar PV + Battery'].includes(input.installType);

  return {
    schemeName: 'Smart Export Guarantee (SEG)',
    schemeRef: 'SEG',
    eligible,
    grantAmount: null, // Not a lump sum — ongoing tariff
    grantDescription: 'Ongoing export tariff for electricity exported to grid. Rate set by licensed electricity supplier (typically 4–15p/kWh).',
    conditions: [
      'MCS certified installation',
      'Smart meter required',
      'Register with your electricity supplier',
    ],
    incompatibilities: [],
    notes: 'Not a capital grant — an ongoing income stream. Factor into financial model.',
    lastUpdated: '2024-01-01',
  };
}

// ─── Home Energy Scotland ─────────────────────────────────────────────────────
// Scotland-only equivalent of BUS. Administered by Home Energy Scotland (HES).
// Grants up to £7,500 for heat pumps, up to £9,000 with rural uplift.
// Interest-free loans available alongside grants (up to £15,000).
function assessHomeEnergyScotland(input: EligibilityInput): GrantResult {
  const isScotland = input.region === 'Scotland';
  const supportedMeasures: InstallType[] = [
    'Air Source Heat Pump', 'Ground Source Heat Pump',
    'Solar PV', 'Solar PV + Battery', 'Biomass Boiler',
    'Cavity Wall Insulation', 'Solid Wall Insulation (External)',
    'Solid Wall Insulation (Internal)', 'Loft Insulation',
  ];
  const eligible = isScotland && supportedMeasures.includes(input.installType);

  const heatPumpGrant = input.installType === 'Ground Source Heat Pump' ? 9000 : 7500;
  const grantAmount = eligible && ['Air Source Heat Pump', 'Ground Source Heat Pump'].includes(input.installType)
    ? heatPumpGrant
    : null;

  return {
    schemeName: 'Home Energy Scotland Grant',
    schemeRef: 'HES-GRANT',
    eligible,
    grantAmount,
    grantDescription: 'Scottish Government grant for low-carbon heat and insulation. Administered by Home Energy Scotland. Interest-free loans also available.',
    conditions: [
      'Property must be in Scotland',
      'Owner occupiers and private landlords eligible',
      'MCS certified installer required',
      'Apply via Home Energy Scotland (0808 808 2282)',
    ],
    incompatibilities: ['Cannot combine with BUS (Boiler Upgrade Scheme) for same measure'],
    notes: `Interest-free loan of up to £15,000 available alongside grant. Rural uplift: GSHP grant increased to £9,000. Visit homeenergyscotland.org.`,
    lastUpdated: '2024-04-01',
  };
}

// ─── Nest (Wales) ─────────────────────────────────────────────────────────────
// Welsh Government's free energy efficiency scheme for low-income households.
// Managed by Nest (contracted to Warmworks Wales).
// Also includes THRIVE loan scheme for non-income-eligible households.
function assessNestWales(input: EligibilityInput): GrantResult {
  const isWales = input.region === 'Wales';
  const incomeEligible = input.onBenefits || input.householdIncomeBand === 'under_31k';
  const epcEligible = ['D', 'E', 'F', 'G'].includes(input.epcRating);

  const supportedMeasures: InstallType[] = [
    'Air Source Heat Pump', 'Cavity Wall Insulation',
    'Solid Wall Insulation (External)', 'Solid Wall Insulation (Internal)',
    'Loft Insulation', 'Underfloor Insulation',
  ];

  const eligible = isWales && incomeEligible && epcEligible && supportedMeasures.includes(input.installType);

  return {
    schemeName: 'Nest (Wales)',
    schemeRef: 'NEST-WALES',
    eligible,
    grantAmount: null, // fully funded for eligible households — amount variable
    grantDescription: 'Free energy efficiency improvements for low-income households in Wales. Fully funded for eligible applicants. Non-eligible households may access THRIVE interest-free loans.',
    conditions: [
      'Property must be in Wales',
      'Household must receive a qualifying benefit OR have income below £31,000',
      'EPC D, E, F or G required for most measures',
      'Apply via nestwales.org.uk or call 0808 808 2244',
    ],
    incompatibilities: [],
    notes: 'THRIVE loan scheme available for Welsh households not eligible for free Nest measures. Up to £25,000 at 0% interest.',
    lastUpdated: '2024-04-01',
  };
}

// ─── Rural Off-Gas-Grid Payment ───────────────────────────────────────────────
function assessRuralPayment(input: EligibilityInput): GrantResult {
  const eligible = input.isRural &&
    input.currentHeatingFuel !== 'Gas' &&
    ['Air Source Heat Pump', 'Ground Source Heat Pump', 'Biomass Boiler', 'Solar Thermal'].includes(input.installType);

  return {
    schemeName: 'Off-Gas Grid Rural Top-Up',
    schemeRef: 'BUS-RURAL',
    eligible,
    grantAmount: null,
    grantDescription: 'Additional rural uplift for off-gas-grid properties switching to low-carbon heat via BUS scheme.',
    conditions: ['Off-gas-grid property', 'Rural classification confirmed', 'BUS eligibility required'],
    incompatibilities: [],
    notes: 'Confirm rural uplift rates with Ofgem — these vary and are subject to annual review.',
    lastUpdated: '2024-10-01',
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function assessEligibility(input: EligibilityInput): EligibilityReport {
  const region = input.region ?? 'England';
  const grants: GrantResult[] = [
    assessBUS(input),
    assessECO4(input),
    assessGBIS(input),
    assessSEG(input),
    assessRuralPayment(input),
    // Regional schemes — only shown when relevant region selected
    assessHomeEnergyScotland(input),
    assessNestWales(input),
  ].filter(g => {
    // Suppress Scotland-specific scheme for non-Scotland properties and vice-versa
    if (g.schemeRef === 'HES-GRANT' && region !== 'Scotland') return false;
    if (g.schemeRef === 'NEST-WALES' && region !== 'Wales') return false;
    return true;
  });

  const eligible = grants.filter(g => g.eligible);
  const totalKnown = eligible.reduce((sum, g) => sum + (g.grantAmount ?? 0), 0);

  const warnings: string[] = [];
  if (grants.some(g => g.eligible && g.grantAmount === null)) {
    warnings.push('Some eligible grants have variable amounts — contact the relevant scheme for a quote.');
  }
  if (input.epcRating && ['A', 'B', 'C'].includes(input.epcRating) && input.installType.includes('Insulation')) {
    warnings.push('High EPC rating may reduce eligibility for ECO4/GBIS insulation grants.');
  }
  if (!input.onBenefits && input.householdIncomeBand === 'over_50k') {
    warnings.push('Higher-income households have limited access to ECO4/GBIS — BUS is the primary option.');
  }

  const eligibleNames = eligible.map(g => g.schemeName).join(', ');
  const summary = eligible.length === 0
    ? 'No standard grant schemes appear to apply based on the information provided. Local authority schemes may still be available.'
    : `Potentially eligible for: ${eligibleNames}. ${totalKnown > 0 ? `Confirmed grant value: £${totalKnown.toLocaleString()}.` : 'Variable grants also available — assessment required.'}`;

  return {
    installType: input.installType,
    totalPotentialGrant: totalKnown,
    grants,
    summary,
    warnings,
    assessedAt: new Date().toISOString(),
  };
}

// ─── Grant amount lookup table (for display) ──────────────────────────────────
export const GRANT_REFERENCE_TABLE: Array<{
  scheme: string;
  measure: string;
  amount: string;
  lastReviewDate: string;
  notes: string;
}> = [
  { scheme: 'BUS', measure: 'Air Source Heat Pump', amount: '£7,500', lastReviewDate: '2024-10-01', notes: 'England & Wales. Scottish equivalent via Home Energy Scotland.' },
  { scheme: 'BUS', measure: 'Ground Source Heat Pump', amount: '£7,500', lastReviewDate: '2024-10-01', notes: 'England & Wales.' },
  { scheme: 'BUS', measure: 'Biomass Boiler', amount: '£5,000', lastReviewDate: '2024-10-01', notes: 'Only in rural properties off gas grid.' },
  { scheme: 'ECO4', measure: 'Various (heat pumps, insulation, solar)', amount: 'Variable', lastReviewDate: '2024-04-01', notes: 'Up to 100% funded for eligible households. Ends March 2026.' },
  { scheme: 'GBIS', measure: 'Insulation measures', amount: 'Variable', lastReviewDate: '2024-04-01', notes: 'Ends March 2026.' },
  { scheme: 'SEG', measure: 'Solar PV export', amount: '4–15p/kWh', lastReviewDate: '2024-01-01', notes: 'Ongoing tariff — not a capital grant. Varies by supplier.' },
  { scheme: 'Home Energy Scotland', measure: 'Air Source Heat Pump', amount: '£7,500', lastReviewDate: '2024-04-01', notes: 'Scotland only. Apply via homeenergyscotland.org. Interest-free loan up to £15,000 also available.' },
  { scheme: 'Home Energy Scotland', measure: 'Ground Source Heat Pump', amount: '£9,000', lastReviewDate: '2024-04-01', notes: 'Scotland only. Higher grant for GSHP. Rural uplift included.' },
  { scheme: 'Nest (Wales)', measure: 'Insulation, heating', amount: 'Variable (fully funded)', lastReviewDate: '2024-04-01', notes: 'Wales only. Low-income households. THRIVE loan (0%, up to £25k) for non-eligible households.' },
];
