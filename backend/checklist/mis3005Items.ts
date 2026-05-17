// MCS 3005 compliance checklist — shared item definitions.
// Each item maps 1:1 to a ChecklistItem row seeded per project.

export type ProjectType = 'ASHP' | 'GSHP';
export type ItemStatus = 'pending' | 'pass' | 'fail' | 'na';

export interface ChecklistItemTemplate {
  key: string;
  section: string;
  name: string;
  ref: string;
  guidance?: string;
  required: boolean;
  appliesToTypes?: ProjectType[];  // if absent, applies to all
}

export const mis3005Items: ChecklistItemTemplate[] = [
  // ── Pre-Installation ──────────────────────────────────────────────────────
  {
    key: 'pre.survey',
    section: 'Pre-Installation',
    name: 'Site survey completed',
    ref: 'MCS 3005 §3.1',
    guidance: 'Full site survey must be conducted and documented before installation commences.',
    required: true,
  },
  {
    key: 'pre.heat_loss',
    section: 'Pre-Installation',
    name: 'Heat loss calculation completed',
    ref: 'MCS 3005 §3.2',
    guidance: 'Heat loss must be calculated using an approved software tool and recorded on file.',
    required: true,
  },
  {
    key: 'pre.hydraulic_design',
    section: 'Pre-Installation',
    name: 'Hydraulic system design completed',
    ref: 'MCS 3005 §3.3',
    guidance: 'Pipe sizing, pump selection and buffer vessel sizing must be documented.',
    required: true,
  },
  {
    key: 'pre.epc',
    section: 'Pre-Installation',
    name: 'EPC obtained and reviewed',
    ref: 'MCS 3005 §3.4',
    guidance: 'A valid EPC for the property must be on file. Rating D or above required for BUS grant.',
    required: true,
  },
  {
    key: 'pre.bus_eligibility',
    section: 'Pre-Installation',
    name: 'BUS eligibility confirmed',
    ref: 'OFGEM BUS §2.3',
    guidance: 'Customer must not have had a fossil fuel boiler installed in the past 12 months.',
    required: false,
  },
  {
    key: 'pre.planning',
    section: 'Pre-Installation',
    name: 'Planning permission obtained (if required)',
    ref: 'MCS 3005 §3.5',
    guidance: 'Check if property is listed or in a conservation area. Permitted development rights confirmed.',
    required: false,
  },
  {
    key: 'pre.part_p',
    section: 'Pre-Installation',
    name: 'Part P notification submitted',
    ref: 'Building Regs Part P',
    guidance: 'Notify building control before commencing electrical work where required.',
    required: true,
  },
  {
    key: 'pre.recc',
    section: 'Pre-Installation',
    name: 'RECC membership and cancellation rights provided',
    ref: 'RECC Code §4',
    guidance: 'Customer must be given written notice of 14-day cancellation rights.',
    required: true,
  },

  // ── Heat Pump Unit Installation ───────────────────────────────────────────
  {
    key: 'unit.location',
    section: 'Heat Pump Unit',
    name: 'Unit sited on stable, level base',
    ref: 'MCS 3005 §4.1',
    guidance: 'Anti-vibration mounts should be used. Base must be capable of supporting the unit weight.',
    required: true,
  },
  {
    key: 'unit.clearances',
    section: 'Heat Pump Unit',
    name: 'Air flow clearances maintained (ASHP)',
    ref: 'MCS 3005 §4.2',
    guidance: 'Minimum clearances as per manufacturer specifications. No obstruction to intake or discharge.',
    required: true,
    appliesToTypes: ['ASHP'],
  },
  {
    key: 'unit.ground_loop',
    section: 'Heat Pump Unit',
    name: 'Ground loop installed and pressure tested',
    ref: 'MCS 3005 §4.3',
    guidance: 'Borehole or horizontal collector installed to design specification. Pressure test certificate required.',
    required: true,
    appliesToTypes: ['GSHP'],
  },
  {
    key: 'unit.ground_loop_inhibitor',
    section: 'Heat Pump Unit',
    name: 'Ground loop inhibitor dosed to correct concentration',
    ref: 'MCS 3005 §4.4',
    guidance: 'Antifreeze/inhibitor dosed to manufacturer and MCS specification. Concentration test certificate on file.',
    required: true,
    appliesToTypes: ['GSHP'],
  },
  {
    key: 'unit.vibration',
    section: 'Heat Pump Unit',
    name: 'Vibration isolation fitted',
    ref: 'MCS 3005 §4.5',
    guidance: 'Anti-vibration mounts or flexible connections fitted at unit connections.',
    required: true,
  },
  {
    key: 'unit.fgas',
    section: 'Heat Pump Unit',
    name: 'F-Gas compliance certificate obtained',
    ref: 'F-Gas Regulation 517/2014',
    guidance: 'Required where refrigerant circuit is opened or charged on site. Engineer must hold F-Gas qualification.',
    required: false,
  },

  // ── Hydraulic Installation ────────────────────────────────────────────────
  {
    key: 'hydro.buffer',
    section: 'Hydraulics',
    name: 'Buffer vessel installed (if required by design)',
    ref: 'MCS 3005 §5.1',
    guidance: 'Buffer vessel sized per hydraulic design. Required when minimum flow rate cannot be guaranteed.',
    required: false,
  },
  {
    key: 'hydro.expansion',
    section: 'Hydraulics',
    name: 'Expansion vessel correctly sized and fitted',
    ref: 'MCS 3005 §5.2',
    guidance: 'Sized to system volume and operating pressure. Pre-charge pressure set before filling.',
    required: true,
  },
  {
    key: 'hydro.prv',
    section: 'Hydraulics',
    name: 'Pressure relief valve fitted and discharged safely',
    ref: 'MCS 3005 §5.3',
    guidance: 'PRV rated to system operating pressure. Discharge pipe run to safe external point.',
    required: true,
  },
  {
    key: 'hydro.inhibitor',
    section: 'Hydraulics',
    name: 'System inhibitor dosed to correct concentration',
    ref: 'MCS 3005 §5.4',
    guidance: 'Inhibitor dosed per manufacturer recommendation. Concentration test completed and documented.',
    required: true,
  },
  {
    key: 'hydro.pressure_test',
    section: 'Hydraulics',
    name: 'Hydraulic pressure test completed',
    ref: 'MCS 3005 §5.5',
    guidance: 'System pressure tested at 1.5× operating pressure for minimum 1 hour with no drop.',
    required: true,
  },
  {
    key: 'hydro.flush',
    section: 'Hydraulics',
    name: 'System flushed and filled',
    ref: 'MCS 3005 §5.6',
    guidance: 'System power-flushed or chemically flushed before filling with treated water.',
    required: true,
  },
  {
    key: 'hydro.flowmeter',
    section: 'Hydraulics',
    name: 'Flow meter or balancing valves fitted',
    ref: 'MCS 3005 §5.7',
    guidance: 'Flow rates to be set and recorded. Required for MCS commissioning data.',
    required: true,
  },

  // ── Hot Water Cylinder ────────────────────────────────────────────────────
  {
    key: 'dhw.cylinder',
    section: 'Hot Water',
    name: 'Dedicated heat pump cylinder installed',
    ref: 'MCS 3005 §6.1',
    guidance: 'Cylinder must be specifically designed for heat pump use with large coil surface area.',
    required: true,
  },
  {
    key: 'dhw.immersion',
    section: 'Hot Water',
    name: 'Immersion heater fitted for Legionella protection',
    ref: 'MCS 3005 §6.2',
    guidance: 'Pasteurisation cycle set to raise cylinder to 60°C at least once per week.',
    required: true,
  },
  {
    key: 'dhw.tprv',
    section: 'Hot Water',
    name: 'Temperature/pressure relief valve fitted',
    ref: 'Building Regs G3',
    guidance: 'TPRV and expansion vessel fitted to unvented cylinder as per manufacturer specification.',
    required: true,
  },

  // ── Controls ──────────────────────────────────────────────────────────────
  {
    key: 'controls.weather_comp',
    section: 'Controls',
    name: 'Weather compensation enabled and set',
    ref: 'MCS 3005 §7.1',
    guidance: 'Weather compensation curve set per heat loss calculation. Verified against outdoor temperature sensor.',
    required: true,
  },
  {
    key: 'controls.flow_temp',
    section: 'Controls',
    name: 'Design flow temperature set correctly',
    ref: 'MCS 3005 §7.2',
    guidance: 'Maximum flow temperature set to design value (typically 45–55°C for low-temperature systems).',
    required: true,
  },
  {
    key: 'controls.room_stat',
    section: 'Controls',
    name: 'Room thermostat/controller installed and programmed',
    ref: 'MCS 3005 §7.3',
    guidance: 'Controls set up and demonstrated to customer. Minimum setback temperature configured.',
    required: true,
  },
  {
    key: 'controls.zones',
    section: 'Controls',
    name: 'Zone controls installed (if applicable)',
    ref: 'MCS 3005 §7.4',
    guidance: 'Zone valves or UFH manifold zone controls tested and operational.',
    required: false,
  },

  // ── Electrical ────────────────────────────────────────────────────────────
  {
    key: 'elec.circuit',
    section: 'Electrical',
    name: 'Dedicated electrical circuit installed',
    ref: 'BS 7671 / MCS 3005 §8.1',
    guidance: 'Dedicated circuit from consumer unit. Correct cable sizing for unit rated current.',
    required: true,
  },
  {
    key: 'elec.rcd',
    section: 'Electrical',
    name: 'RCD/RCBO protection provided',
    ref: 'BS 7671 Reg 411',
    guidance: '30mA RCD protection on all circuits. RCBO preferred for discrimination.',
    required: true,
  },
  {
    key: 'elec.earthing',
    section: 'Electrical',
    name: 'Earthing and bonding verified',
    ref: 'BS 7671 §541',
    guidance: 'Main protective bonding to gas, water and other services verified. Test results on file.',
    required: true,
  },
  {
    key: 'elec.eicr',
    section: 'Electrical',
    name: 'Electrical installation certificate issued',
    ref: 'Building Regs Part P',
    guidance: 'EIC or MEIWC issued to customer. Notified to building control or self-certified.',
    required: true,
  },

  // ── Commissioning ─────────────────────────────────────────────────────────
  {
    key: 'comm.mcs_checklist',
    section: 'Commissioning',
    name: 'MCS commissioning checklist completed',
    ref: 'MCS 3005 §9.1',
    guidance: 'All commissioning measurements recorded on the MCS commissioning checklist.',
    required: true,
  },
  {
    key: 'comm.flow_temp_verified',
    section: 'Commissioning',
    name: 'Flow and return temperatures verified at design condition',
    ref: 'MCS 3005 §9.2',
    guidance: 'Flow/return temperatures and flow rate recorded. ΔT within design tolerance.',
    required: true,
  },
  {
    key: 'comm.cop_check',
    section: 'Commissioning',
    name: 'System COP/SCOP reviewed against design',
    ref: 'MCS 3005 §9.3',
    guidance: 'Operating COP calculated from measured data and compared against MCS design figure.',
    required: true,
  },
  {
    key: 'comm.legionella_cycle',
    section: 'Commissioning',
    name: 'Legionella pasteurisation cycle tested',
    ref: 'MCS 3005 §9.4',
    guidance: 'Pasteurisation cycle run and cylinder temperature verified to reach ≥60°C.',
    required: true,
  },

  // ── Handover & Documentation ──────────────────────────────────────────────
  {
    key: 'doc.mcs_cert',
    section: 'Documentation',
    name: 'MCS certificate issued to customer',
    ref: 'MCS 3005 §10.1',
    guidance: 'MCS certificate generated and provided to customer. Copy retained on file.',
    required: true,
  },
  {
    key: 'doc.handover_pack',
    section: 'Documentation',
    name: 'Handover pack provided to customer',
    ref: 'MCS 3005 §10.2',
    guidance: 'Handover pack including O&M manual, warranties, and contact details provided.',
    required: true,
  },
  {
    key: 'doc.customer_training',
    section: 'Documentation',
    name: 'Customer system training completed',
    ref: 'MCS 3005 §10.3',
    guidance: 'Customer demonstrated how to use controls, adjust settings, and who to contact for support.',
    required: true,
  },
  {
    key: 'doc.warranty_registered',
    section: 'Documentation',
    name: 'Manufacturer warranty registered',
    ref: 'MCS 3005 §10.4',
    guidance: 'Product warranty registered with manufacturer on behalf of customer.',
    required: true,
  },
  {
    key: 'doc.bus_voucher',
    section: 'Documentation',
    name: 'BUS voucher redeemed',
    ref: 'OFGEM BUS §5',
    guidance: 'BUS voucher redemption submitted to OFGEM within 3 months of installation completion.',
    required: false,
  },
];
