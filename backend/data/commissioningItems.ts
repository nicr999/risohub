// MCS 3005 commissioning checklist template items.
// Seeded per-project when /api/commissioning/:projectId/seed is called.

export interface CommissioningItemTemplate {
  key: string;
  section: string;
  name: string;
  ref: string;
  guidance?: string;
  required: boolean;
}

export const commissioningItems: CommissioningItemTemplate[] = [
  // ── System Fill & Pressure ─────────────────────────────────────────────────
  {
    key: 'fill.system_pressure',
    section: 'System Fill & Pressure',
    name: 'System static pressure recorded',
    ref: 'MCS 3005 §9.1',
    guidance: 'Record cold fill pressure (bar). Typical: 1.0–1.5 bar.',
    required: true,
  },
  {
    key: 'fill.expansion_vessel',
    section: 'System Fill & Pressure',
    name: 'Expansion vessel pre-charge pressure verified',
    ref: 'MCS 3005 §9.2',
    guidance: 'Pre-charge should match system static pressure. Record actual value.',
    required: true,
  },
  {
    key: 'fill.inhibitor_concentration',
    section: 'System Fill & Pressure',
    name: 'Inhibitor concentration tested and in range',
    ref: 'MCS 3005 §9.3',
    guidance: 'Use refractometer or test strips. Record concentration (%). Manufacturer recommended range.',
    required: true,
  },
  {
    key: 'fill.no_leaks',
    section: 'System Fill & Pressure',
    name: 'No leaks present after fill',
    ref: 'MCS 3005 §9.4',
    guidance: 'Visual inspection of all joints, connections, and valve glands.',
    required: true,
  },

  // ── Flow Rates ────────────────────────────────────────────────────────────
  {
    key: 'flow.primary_flow_rate',
    section: 'Flow Rates',
    name: 'Primary circuit flow rate verified',
    ref: 'MCS 3005 §9.5',
    guidance: 'Measure using flow meter or balancing valve. Record in L/min. Must meet design value.',
    required: true,
  },
  {
    key: 'flow.dhw_flow_rate',
    section: 'Flow Rates',
    name: 'DHW circuit flow rate verified',
    ref: 'MCS 3005 §9.6',
    guidance: 'Measure flow rate through DHW coil. Record in L/min.',
    required: true,
  },
  {
    key: 'flow.emitter_balance',
    section: 'Flow Rates',
    name: 'Emitters balanced to design flow rates',
    ref: 'MCS 3005 §9.7',
    guidance: 'Each radiator/UFH zone balanced. Lock-shield valve settings recorded.',
    required: true,
  },

  // ── Temperature Checks ────────────────────────────────────────────────────
  {
    key: 'temp.flow_temp',
    section: 'Temperature Checks',
    name: 'Flow temperature at design condition recorded',
    ref: 'MCS 3005 §9.8',
    guidance: 'Measure at heat pump flow header. Record °C. Must match design (typically 35–55°C).',
    required: true,
  },
  {
    key: 'temp.return_temp',
    section: 'Temperature Checks',
    name: 'Return temperature recorded',
    ref: 'MCS 3005 §9.9',
    guidance: 'Measure at heat pump return. ΔT should match design (typically 5–10°C).',
    required: true,
  },
  {
    key: 'temp.delta_t',
    section: 'Temperature Checks',
    name: 'ΔT between flow and return within design tolerance',
    ref: 'MCS 3005 §9.10',
    guidance: 'Calculate ΔT = flow temp − return temp. Must be within ±2°C of design ΔT.',
    required: true,
  },
  {
    key: 'temp.dhw_cylinder',
    section: 'Temperature Checks',
    name: 'DHW cylinder charge temperature verified',
    ref: 'MCS 3005 §9.11',
    guidance: 'Cylinder must reach target temperature (typically 45–50°C) within expected time.',
    required: true,
  },
  {
    key: 'temp.legionella_pasteurisation',
    section: 'Temperature Checks',
    name: 'Legionella pasteurisation cycle completed',
    ref: 'MCS 3005 §9.12',
    guidance: 'Cylinder must reach ≥60°C for ≥1 hour. Record peak temperature achieved.',
    required: true,
  },

  // ── Controls ──────────────────────────────────────────────────────────────
  {
    key: 'controls.weather_comp_curve',
    section: 'Controls',
    name: 'Weather compensation curve set and verified',
    ref: 'MCS 3005 §9.13',
    guidance: 'Check design flow temperature at design outdoor temperature. Adjust curve if needed.',
    required: true,
  },
  {
    key: 'controls.room_temp',
    section: 'Controls',
    name: 'Room thermostat/controller operational',
    ref: 'MCS 3005 §9.14',
    guidance: 'Test call for heat. Check system responds correctly. Record set temperature.',
    required: true,
  },
  {
    key: 'controls.dhw_programme',
    section: 'Controls',
    name: 'DHW schedule programmed and tested',
    ref: 'MCS 3005 §9.15',
    guidance: 'DHW heating schedule configured. Legionella pasteurisation schedule set.',
    required: true,
  },
  {
    key: 'controls.defrost',
    section: 'Controls',
    name: 'Defrost cycle operation verified (ASHP)',
    ref: 'MCS 3005 §9.16',
    guidance: 'Confirm defrost control settings are in accordance with manufacturer specification.',
    required: false,
  },

  // ── Electrical Checks ─────────────────────────────────────────────────────
  {
    key: 'elec.supply_voltage',
    section: 'Electrical',
    name: 'Supply voltage within tolerance',
    ref: 'MCS 3005 §9.17',
    guidance: 'Measure L-N voltage at heat pump. Must be 230V ±10% (207–253V).',
    required: true,
  },
  {
    key: 'elec.running_current',
    section: 'Electrical',
    name: 'Running current within nameplate rating',
    ref: 'MCS 3005 §9.18',
    guidance: 'Measure running current at rated load. Must not exceed nameplate FLA.',
    required: true,
  },
  {
    key: 'elec.earth_continuity',
    section: 'Electrical',
    name: 'Earth continuity verified',
    ref: 'BS 7671 §612.2',
    guidance: 'Test earth continuity between heat pump casing and main earthing terminal.',
    required: true,
  },

  // ── Performance ───────────────────────────────────────────────────────────
  {
    key: 'perf.cop_calculation',
    section: 'Performance',
    name: 'Operating COP calculated and recorded',
    ref: 'MCS 3005 §9.19',
    guidance: 'COP = Heat output (kW) / Electrical input (kW). Record both values and calculated COP.',
    required: true,
  },
  {
    key: 'perf.cop_vs_design',
    section: 'Performance',
    name: 'Achieved COP reviewed against MCS design figure',
    ref: 'MCS 3005 §9.20',
    guidance: 'Note if significantly below design — may indicate flow rate, temperature, or sizing issue.',
    required: true,
  },
  {
    key: 'perf.noise_level',
    section: 'Performance',
    name: 'Noise level assessed and within acceptable limits',
    ref: 'MCS 3005 §9.21',
    guidance: 'No unusual mechanical noise. Check for vibration transmission to structure.',
    required: false,
  },

  // ── Handover ──────────────────────────────────────────────────────────────
  {
    key: 'handover.customer_demo',
    section: 'Handover',
    name: 'Customer demonstrated controls and settings',
    ref: 'MCS 3005 §9.22',
    guidance: 'Walk customer through: setting temperature, adjusting schedule, understanding indicators.',
    required: true,
  },
  {
    key: 'handover.commissioning_sheet',
    section: 'Handover',
    name: 'MCS commissioning data sheet completed and signed',
    ref: 'MCS 3005 §9.23',
    guidance: 'All measured values entered. Engineer and customer signatures obtained.',
    required: true,
  },
];
