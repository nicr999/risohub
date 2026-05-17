// MCS 3005 checklist types and metadata — shared between MCSChecklist and seeds.

export type ProjectType = 'ASHP' | 'GSHP';

export type ItemStatus = 'pending' | 'complete' | 'noncompliant' | 'na';

export type ChecklistSection =
  | 'System Fill & Pressure'
  | 'Flow Rates'
  | 'Temperature Checks'
  | 'Controls'
  | 'Electrical'
  | 'Performance'
  | 'Handover';

export interface SectionMeta {
  label: string;
  icon: string;
  description: string;
}

export const SECTION_META: Record<ChecklistSection, SectionMeta> = {
  'System Fill & Pressure': {
    label: 'System Fill & Pressure',
    icon: '💧',
    description: 'Static pressure, expansion vessel, inhibitor, leak check',
  },
  'Flow Rates': {
    label: 'Flow Rates',
    icon: '🌊',
    description: 'Primary circuit, DHW, and emitter balance flow rates',
  },
  'Temperature Checks': {
    label: 'Temperature Checks',
    icon: '🌡️',
    description: 'Flow/return temps, delta-T, DHW, legionella pasteurisation',
  },
  'Controls': {
    label: 'Controls',
    icon: '🎛️',
    description: 'Weather compensation, room thermostat, DHW programme, defrost',
  },
  'Electrical': {
    label: 'Electrical',
    icon: '⚡',
    description: 'Supply voltage, running current, earth continuity',
  },
  'Performance': {
    label: 'Performance',
    icon: '📊',
    description: 'COP calculation, design COP comparison, noise level',
  },
  'Handover': {
    label: 'Handover',
    icon: '📋',
    description: 'Customer demonstration, documentation, warranty registration',
  },
};

export const COMMON_NA_REASONS: Record<string, string[]> = {
  'fill.expansion_vessel': ['Pressurised system — no expansion vessel fitted'],
  'flow.dhw_flow_rate': ['DHW not included in scope — no cylinder fitted'],
  'flow.emitter_balance': ['Single zone — no balancing required'],
  'temp.legionella_pasteurisation': ['Combi unit — no hot water cylinder'],
  'controls.weather_comp_curve': ['Weather compensation not fitted to this model'],
  'controls.defrost': ['Test conditions not met — ambient too warm for defrost cycle'],
  'elec.earth_continuity': ['Part P contractor responsible — certificate obtained separately'],
  'perf.noise_level': ['Noise assessment deferred — occupied premises'],
};
