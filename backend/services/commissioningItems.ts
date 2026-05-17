// ============================================================
// RISO HUB — data/commissioningItems.ts
// Standard commissioning checklist items for ASHP/GSHP installs
// Seeded on project creation alongside MIS 3005 checklist.
// Based on MCS MIS 3005 and BESA commissioning guidance.
// ============================================================

export interface CommissioningItemTemplate {
  key: string;
  section: string;
  name: string;
  ref: string;
  guidance: string;
  required: boolean;
  expectedValue?: string;
}

export const commissioningItems: CommissioningItemTemplate[] = [

  // ── Section C1: Pre-commissioning checks ──────────────────
  {
    key: 'C1.1', section: 'C1', ref: 'C1.1',
    name: 'System flushed and cleaned',
    guidance: 'Confirm the heating system has been power-flushed or chemically cleaned prior to commissioning. Record inhibitor concentration.',
    required: true,
  },
  {
    key: 'C1.2', section: 'C1', ref: 'C1.2',
    name: 'System inhibitor added and concentration checked',
    guidance: 'Verify inhibitor has been added to the system water. Check concentration using test strips or meter. Record result.',
    required: true,
    expectedValue: 'Per manufacturer specification',
  },
  {
    key: 'C1.3', section: 'C1', ref: 'C1.3',
    name: 'System pressure (cold fill)',
    guidance: 'Record the cold fill pressure. Typical range 1.0–1.5 bar. Confirm no leaks present.',
    required: true,
    expectedValue: '1.0–1.5 bar',
  },
  {
    key: 'C1.4', section: 'C1', ref: 'C1.4',
    name: 'Expansion vessel pre-charge pressure correct',
    guidance: 'Check expansion vessel pre-charge pressure matches system static head. Adjust if required.',
    required: true,
  },
  {
    key: 'C1.5', section: 'C1', ref: 'C1.5',
    name: 'All air purged from system',
    guidance: 'Confirm all radiators and underfloor loops have been bled. Auto air vents functioning.',
    required: true,
  },
  {
    key: 'C1.6', section: 'C1', ref: 'C1.6',
    name: 'Electrical supply verified',
    guidance: 'Confirm electrical supply voltage, current draw, and fusing are correct. Earth bonding in place.',
    required: true,
  },

  // ── Section C2: Heat pump operation ───────────────────────
  {
    key: 'C2.1', section: 'C2', ref: 'C2.1',
    name: 'Heat pump starts without fault codes',
    guidance: 'Start heat pump and confirm no fault codes displayed on controller. Record any warnings.',
    required: true,
  },
  {
    key: 'C2.2', section: 'C2', ref: 'C2.2',
    name: 'Flow temperature at design set point',
    guidance: 'Confirm flow temperature reaches the design flow temperature from the heat loss calculation. Record actual value.',
    required: true,
    expectedValue: 'Per heat loss calculation (typically 45–55°C)',
  },
  {
    key: 'C2.3', section: 'C2', ref: 'C2.3',
    name: 'Return temperature differential correct (ΔT)',
    guidance: 'Measure flow and return temperatures. ΔT should be within design parameters (typically 5–10°C).',
    required: true,
    expectedValue: '5–10°C',
  },
  {
    key: 'C2.4', section: 'C2', ref: 'C2.4',
    name: 'Flow rate through heat pump correct',
    guidance: 'Measure flow rate through the heat pump primary circuit. Should match manufacturer minimum and design flow rate.',
    required: true,
    expectedValue: 'Per manufacturer specification',
  },
  {
    key: 'C2.5', section: 'C2', ref: 'C2.5',
    name: 'Coefficient of Performance (COP) measured or calculated',
    guidance: 'Record measured or calculated COP under commissioning conditions. Compare against manufacturer data.',
    required: false,
  },
  {
    key: 'C2.6', section: 'C2', ref: 'C2.6',
    name: 'Defrost cycle tested (ASHP)',
    guidance: 'For air source heat pumps, confirm defrost cycle operates correctly. Not applicable for GSHP.',
    required: false,
    expectedValue: 'Defrost initiates and completes without fault',
  },
  {
    key: 'C2.7', section: 'C2', ref: 'C2.7',
    name: 'Refrigerant circuit pressures within specification',
    guidance: 'Check high and low side refrigerant pressures. Must be within manufacturer specification. F-Gas certified engineer only.',
    required: true,
    expectedValue: 'Per manufacturer service data',
  },
  {
    key: 'C2.8', section: 'C2', ref: 'C2.8',
    name: 'No refrigerant leaks detected',
    guidance: 'Use electronic leak detector or UV dye to confirm no refrigerant leaks at all joints and connections.',
    required: true,
  },

  // ── Section C3: Distribution system ───────────────────────
  {
    key: 'C3.1', section: 'C3', ref: 'C3.1',
    name: 'All radiators / UFH loops balanced',
    guidance: 'Balance the distribution system to achieve design flow rates to each emitter. Record lockshield settings.',
    required: true,
  },
  {
    key: 'C3.2', section: 'C3', ref: 'C3.2',
    name: 'System operating pressure (hot)',
    guidance: 'Record system pressure when at operating temperature. Should remain within design range.',
    required: true,
    expectedValue: '1.5–2.5 bar (hot)',
  },
  {
    key: 'C3.3', section: 'C3', ref: 'C3.3',
    name: 'Zone valves / actuators operating correctly',
    guidance: 'Test each zone valve or actuator opens and closes correctly on demand from controller.',
    required: true,
  },
  {
    key: 'C3.4', section: 'C3', ref: 'C3.4',
    name: 'Bypass valve set correctly (if fitted)',
    guidance: 'If a bypass valve is fitted, confirm it is set to maintain minimum flow through the heat pump.',
    required: false,
  },

  // ── Section C4: Hot water (if applicable) ─────────────────
  {
    key: 'C4.1', section: 'C4', ref: 'C4.1',
    name: 'Cylinder charge temperature achieved',
    guidance: 'Confirm cylinder reaches target temperature (typically 55°C) within reasonable time.',
    required: false,
    expectedValue: '≥55°C',
  },
  {
    key: 'C4.2', section: 'C4', ref: 'C4.2',
    name: 'Legionella pasteurisation cycle set up',
    guidance: 'Confirm weekly pasteurisation cycle is programmed to heat cylinder to ≥60°C for ≥1 hour.',
    required: false,
    expectedValue: '≥60°C for ≥1 hour weekly',
  },
  {
    key: 'C4.3', section: 'C4', ref: 'C4.3',
    name: 'Thermostatic mixing valve (TMV) set correctly',
    guidance: 'If a TMV is fitted to the hot water outlet, confirm it is set to deliver water at ≤48°C at outlets.',
    required: false,
    expectedValue: '≤48°C at outlet',
  },

  // ── Section C5: Controls and handover ─────────────────────
  {
    key: 'C5.1', section: 'C5', ref: 'C5.1',
    name: 'Heating controller / thermostat programmed',
    guidance: 'Programme heating schedule per customer requirements. Confirm weather compensation (if fitted) is set up correctly.',
    required: true,
  },
  {
    key: 'C5.2', section: 'C5', ref: 'C5.2',
    name: 'Smart controls / app connected and working',
    guidance: 'If smart controls are installed, confirm app is set up on customer device and remote control is working.',
    required: false,
  },
  {
    key: 'C5.3', section: 'C5', ref: 'C5.3',
    name: 'Customer demonstration completed',
    guidance: 'Demonstrate system operation to customer. Cover: how to adjust temperature, how to read the controller, what the seasonal settings mean, who to call if there is a problem.',
    required: true,
  },
  {
    key: 'C5.4', section: 'C5', ref: 'C5.4',
    name: 'User manual provided to customer',
    guidance: 'Provide heat pump user manual and any controls documentation to customer. Record that this was done.',
    required: true,
  },
  {
    key: 'C5.5', section: 'C5', ref: 'C5.5',
    name: 'Commissioning sheet completed and signed',
    guidance: 'Complete the manufacturer commissioning sheet. Both installer and customer sign. Upload a copy to RISO HUB.',
    required: true,
  },
  {
    key: 'C5.6', section: 'C5', ref: 'C5.6',
    name: 'MCS registration submitted',
    guidance: 'Confirm MCS certificate number has been registered with MCS and stored on this project.',
    required: true,
  },
];
