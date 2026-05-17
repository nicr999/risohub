/**
 * MIS 3005 — Heat pump installation standard checklist items.
 * Source: MCS MIS 3005 Issue 6.0 (Heat Pump Systems)
 *
 * Each item maps to a clause reference, section, and whether it is
 * mandatory (required: true) or advisory (required: false).
 *
 * These definitions are the "template" — when a project is created,
 * the backend copies these into the Checklists table with status: "pending".
 * The projectType discriminator allows different item sets for ASHP vs GSHP.
 */

export type ProjectType = "ASHP" | "GSHP"; // Air source | Ground source
export type ChecklistSection = "S1" | "S2" | "S3" | "S4" | "S5";
export type ItemStatus = "pending" | "complete" | "noncompliant" | "na";

export interface ChecklistItemTemplate {
  /** Stable slug used as DB seed key — never change after seeding */
  key: string;
  section: ChecklistSection;
  /** Display name shown in UI */
  name: string;
  /** MIS 3005 clause reference */
  ref: string;
  /** Short guidance text shown as hint below the item name */
  guidance: string;
  /** Whether failing this item blocks handover pack generation */
  required: boolean;
  /** null = applies to all project types */
  appliesTo: ProjectType[] | null;
}

// ─── Section S1 — Survey & assessment ────────────────────────────────────────

const S1: ChecklistItemTemplate[] = [
  {
    key: "s1_site_survey",
    section: "S1",
    name: "Site survey completed and documented",
    ref: "MIS 3005 §4.1",
    guidance: "Full site survey carried out by a qualified MCS installer. Survey notes uploaded as evidence.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s1_heat_loss",
    section: "S1",
    name: "Property heat loss calculation performed",
    ref: "MIS 3005 §4.2",
    guidance: "Heat loss calculated to BS EN 12831. Output from approved software (e.g. HeatEngineer) uploaded.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s1_existing_system",
    section: "S1",
    name: "Existing heating system assessed",
    ref: "MIS 3005 §4.3",
    guidance: "Condition of existing pipework, emitters, and controls assessed and documented.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s1_customer_consent",
    section: "S1",
    name: "Customer consent and pre-installation checklist signed",
    ref: "MIS 3005 §4.4",
    guidance: "Pre-installation form reviewed and signed by customer before any work commences.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s1_epc_reviewed",
    section: "S1",
    name: "EPC reviewed and fabric improvements considered",
    ref: "MIS 3005 §4.5",
    guidance: "Current EPC rating reviewed. Any recommended fabric improvements discussed with customer.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s1_groundwork_survey",
    section: "S1",
    name: "Ground survey and bore/trench feasibility assessed",
    ref: "MIS 3005 §4.6",
    guidance: "Ground conditions, available land area, and geology assessed for GSHP suitability.",
    required: true,
    appliesTo: ["GSHP"],
  },
];

// ─── Section S2 — System design ───────────────────────────────────────────────

const S2: ChecklistItemTemplate[] = [
  {
    key: "s2_design_matches_heat_loss",
    section: "S2",
    name: "System design matches heat loss output",
    ref: "MIS 3005 §5.1",
    guidance: "Selected heat pump capacity ≤ 110% of calculated heat loss at design outdoor temperature.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s2_emitter_sizing",
    section: "S2",
    name: "Emitter sizing calculations completed",
    ref: "MIS 3005 §5.2",
    guidance: "Radiators or underfloor heating sized to achieve design flow temperature ≤55°C.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s2_buffer_vessel",
    section: "S2",
    name: "Buffer vessel / hydraulic separation assessed",
    ref: "MIS 3005 §5.3",
    guidance: "Buffer vessel requirement assessed per manufacturer guidance. Document outcome even if not fitted.",
    required: false,
    appliesTo: null,
  },
  {
    key: "s2_dhw_cylinder",
    section: "S2",
    name: "Hot water cylinder specification confirmed",
    ref: "MIS 3005 §5.4",
    guidance: "Cylinder volume and coil sizing suitable for heat pump output. Legionella protection strategy confirmed.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s2_controls_specified",
    section: "S2",
    name: "Controls and weather compensation specified",
    ref: "MIS 3005 §5.5",
    guidance: "Weather compensation or load compensation controls specified in design. Smart controls documented.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s2_ground_collector",
    section: "S2",
    name: "Ground collector design completed",
    ref: "MIS 3005 §5.6",
    guidance: "Bore depth / trench length calculated. Ground collector sizing confirmed by specialist designer.",
    required: true,
    appliesTo: ["GSHP"],
  },
];

// ─── Section S3 — Installation ────────────────────────────────────────────────

const S3: ChecklistItemTemplate[] = [
  {
    key: "s3_unit_installed",
    section: "S3",
    name: "Heat pump unit installed per manufacturer specification",
    ref: "MIS 3005 §6.1",
    guidance: "Unit positioned, vibration-isolated, and installed per manufacturer IOM. Photos uploaded.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s3_refrigerant_pipework",
    section: "S3",
    name: "Refrigerant pipework installed and pressure tested",
    ref: "MIS 3005 §6.2",
    guidance: "Pipework installed, leak-tested, and pressure test certificate uploaded. F-Gas regulations observed.",
    required: true,
    appliesTo: ["ASHP"],
  },
  {
    key: "s3_fgas",
    section: "S3",
    name: "F-Gas regulations complied with",
    ref: "MIS 3005 §6.3",
    guidance: "F-Gas certificate from qualified engineer obtained and uploaded. Refrigerant type and charge logged.",
    required: true,
    appliesTo: ["ASHP"],
  },
  {
    key: "s3_electrical",
    section: "S3",
    name: "Electrical installation certified (Part P / BS 7671)",
    ref: "MIS 3005 §6.4",
    guidance: "Electrical installation by registered electrician. EIC or MWC uploaded.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s3_controls_configured",
    section: "S3",
    name: "Controls and thermostat configured",
    ref: "MIS 3005 §6.5",
    guidance: "Programmer, room thermostat, and weather compensation set up. Setpoints documented.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s3_ground_collector_installed",
    section: "S3",
    name: "Ground collector installed and pressure tested",
    ref: "MIS 3005 §6.6",
    guidance: "Bore or trench collector installed, antifreeze checked, and pressure test certificate uploaded.",
    required: true,
    appliesTo: ["GSHP"],
  },
  {
    key: "s3_noise_check",
    section: "S3",
    name: "External unit noise assessment completed",
    ref: "MIS 3005 §6.7",
    guidance: "Noise levels assessed. Permitted development limits confirmed or planning permission obtained.",
    required: false,
    appliesTo: ["ASHP"],
  },
];

// ─── Section S4 — Commissioning ───────────────────────────────────────────────

const S4: ChecklistItemTemplate[] = [
  {
    key: "s4_flow_temp",
    section: "S4",
    name: "System flow temperature set to ≤55°C",
    ref: "MIS 3005 §7.1",
    guidance: "Flow temperature verified at design outdoor temperature. Measured value recorded.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s4_flush_inhibitor",
    section: "S4",
    name: "System flushed and inhibitor dosed",
    ref: "MIS 3005 §7.2",
    guidance: "System power-flushed or chemically cleaned. Inhibitor dosed to manufacturer recommendation. Brand and volume recorded.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s4_commissioning_checklist",
    section: "S4",
    name: "Commissioning checklist completed and signed by installer",
    ref: "MIS 3005 §7.3",
    guidance: "MCS commissioning checklist fully completed, signed by MCS-certified installer, and uploaded.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s4_cop_verified",
    section: "S4",
    name: "COP performance verified against design",
    ref: "MIS 3005 §7.4",
    guidance: "In-situ COP measured or calculated. Result compared to design COP. Any variance documented.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s4_dhw_legionella",
    section: "S4",
    name: "DHW legionella pasteurisation cycle confirmed",
    ref: "MIS 3005 §7.5",
    guidance: "Cylinder pasteurisation cycle (≥60°C) verified operational. Schedule set and documented.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s4_smart_meter",
    section: "S4",
    name: "Smart meter / metering confirmed (BUS requirement)",
    ref: "MIS 3005 §7.6",
    guidance: "Heat meter or smart meter present for BUS grant eligibility. Serial number recorded.",
    required: false,
    appliesTo: null,
  },
];

// ─── Section S5 — Handover ────────────────────────────────────────────────────

const S5: ChecklistItemTemplate[] = [
  {
    key: "s5_handover_pack",
    section: "S5",
    name: "Customer handover pack prepared",
    ref: "MIS 3005 §8.1",
    guidance: "Handover pack generated in RISO HUB containing all required sections per MIS 3005 §8.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s5_customer_instructions",
    section: "S5",
    name: "Customer given instructions on system operation",
    ref: "MIS 3005 §8.2",
    guidance: "Customer walked through system controls, setback schedules, and maintenance requirements.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s5_mcs_certificate",
    section: "S5",
    name: "MCS certificate issued to customer",
    ref: "MIS 3005 §8.3",
    guidance: "MCS certificate generated via Gemserv portal and provided to customer in handover pack.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s5_warranty_registered",
    section: "S5",
    name: "Product warranties registered with manufacturers",
    ref: "MIS 3005 §8.4",
    guidance: "Heat pump, cylinder, and controls warranties registered. Confirmation emails uploaded.",
    required: true,
    appliesTo: null,
  },
  {
    key: "s5_customer_signed",
    section: "S5",
    name: "Customer satisfaction signature captured",
    ref: "MIS 3005 §8.5",
    guidance: "Digital signature captured from customer confirming satisfactory completion of installation.",
    required: true,
    appliesTo: null,
  },
];

// ─── Combined export ──────────────────────────────────────────────────────────

export const MIS_3005_ITEMS: ChecklistItemTemplate[] = [
  ...S1, ...S2, ...S3, ...S4, ...S5,
];

/** Filter items applicable to a given project type */
export function getItemsForProjectType(type: ProjectType): ChecklistItemTemplate[] {
  return MIS_3005_ITEMS.filter(
    (item) => item.appliesTo === null || item.appliesTo.includes(type)
  );
}

export const SECTION_META: Record<ChecklistSection, { label: string; description: string }> = {
  S1: { label: "Survey & assessment", description: "Pre-installation checks and site survey documentation" },
  S2: { label: "System design", description: "Heat pump and system design calculations" },
  S3: { label: "Installation", description: "Physical installation evidence and certificates" },
  S4: { label: "Commissioning", description: "System commissioning and performance verification" },
  S5: { label: "Handover", description: "Customer handover documentation and signatures" },
};

/**
 * Items that are commonly marked N/A depending on install context.
 * Used to pre-populate the N/A reason dropdown with sensible suggestions.
 */
export const COMMON_NA_REASONS: Record<string, string[]> = {
  s2_buffer_vessel: [
    "Low-loss header fitted — buffer not required",
    "Manufacturer confirms buffer not required for this model",
    "Existing system volume sufficient",
  ],
  s3_refrigerant_pipework: [
    "Pre-charged split system — no site pipework required",
    "Monoblock unit — no refrigerant pipework",
  ],
  s3_fgas: [
    "Monoblock unit — F-Gas not applicable",
    "Pre-charged system — no site F-Gas work",
    "R-290 propane system — handled under separate ATEX regulations",
  ],
  s3_ground_collector_installed: [
    "ASHP — ground collector not applicable",
  ],
  s3_noise_check: [
    "Semi-detached — permitted development rules confirmed applicable",
    "Detached property — noise assessment not required",
    "Planning permission obtained — noise condition addressed",
  ],
  s4_smart_meter: [
    "Customer not applying for BUS grant",
    "Smart meter already installed by energy supplier",
    "Commercial install — BUS not applicable",
  ],
  s2_ground_collector: [
    "ASHP — ground collector design not applicable",
  ],
  s1_groundwork_survey: [
    "ASHP — groundwork survey not applicable",
  ],
};
