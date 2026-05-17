import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database';
import { Project, User, Qualification } from '../models/index';
import { HeatLossSummary, MCSRegistration, Schedule, SatisfactionSurvey, Subcontractor, SubcontractorQualification, SubcontractorAssignment } from '../models/newModels';
import { EPCRecord, BUSEligibility } from '../models/EPCAndBUSModels';
import { CommissioningChecklist, CustomerCommsLog } from '../models/phase7Models';
import { commissioningItems } from '../data/commissioningItems';

async function seedAuditDemo(): Promise<void> {
  await sequelize.authenticate();
  console.log('✅ Database connected');

  // ── Look up existing demo data ─────────────────────────────────────────────

  const [admin, sarah, ian, alex] = await Promise.all([
    User.findOne({ where: { email: 'admin@risohome.co.uk' } }),
    User.findOne({ where: { email: 'sarah@risohome.co.uk' } }),
    User.findOne({ where: { email: 'ian@risohome.co.uk' } }),
    User.findOne({ where: { email: 'alex@risohome.co.uk' } }),
  ]);

  if (!ian || !sarah || !alex || !admin) {
    console.error('❌ Demo users not found — run npm run seed:demo first');
    process.exit(1);
  }

  const [p1, p2, p3] = await Promise.all([
    Project.findOne({ where: { customerName: 'Margaret Thompson' } }),
    Project.findOne({ where: { customerName: 'Robert Clarke' } }),
    Project.findOne({ where: { customerName: 'Patricia Walsh' } }),
  ]);

  if (!p1 || !p2 || !p3) {
    console.error('❌ Demo projects not found — run npm run seed:demo first');
    process.exit(1);
  }

  // ── Heat Loss Summaries ────────────────────────────────────────────────────

  await HeatLossSummary.create({
    projectId: p1.id,
    designFlowTemp: 45,
    heatDemandKW: 7.2,
    heatLossKW: 6.8,
    groundFloorArea: 82,
    fabricLossKW: 5.1,
    ventilationLossKW: 1.7,
    softwareUsed: 'HeatEngineer',
    calculatedBy: sarah.id,
    calculatedAt: new Date('2026-01-15T10:00:00Z'),
    notes: 'Semi-detached 1960s construction. Cavity wall insulation present. Loft insulated to 270mm. Design flow temp 45°C achievable with existing radiator sizing.',
  });

  await HeatLossSummary.create({
    projectId: p2.id,
    designFlowTemp: 45,
    heatDemandKW: 6.2,
    heatLossKW: 5.9,
    groundFloorArea: 74,
    fabricLossKW: 4.3,
    ventilationLossKW: 1.6,
    softwareUsed: 'HeatEngineer',
    calculatedBy: sarah.id,
    calculatedAt: new Date('2026-03-20T14:00:00Z'),
    notes: 'Detached 1980s build. UFH downstairs, radiators upstairs. All rads confirmed oversized for 45°C operation. 8kW unit selected with 20% headroom.',
  });

  await HeatLossSummary.create({
    projectId: p3.id,
    designFlowTemp: 35,
    heatDemandKW: 9.1,
    heatLossKW: 8.7,
    groundFloorArea: 140,
    fabricLossKW: 6.2,
    ventilationLossKW: 2.5,
    softwareUsed: 'HeatEngineer',
    calculatedBy: sarah.id,
    calculatedAt: new Date('2026-05-05T11:00:00Z'),
    notes: 'Large detached farmhouse. Solid stone walls — high fabric loss. GSHP horizontal loop suitable given 1,200m² garden. 12kW unit recommended. UFH throughout ground floor. Design flow temp 35°C.',
  });

  console.log('✅ Heat loss summaries seeded');

  // ── EPC Records ────────────────────────────────────────────────────────────

  await EPCRecord.create({
    projectId: p1.id,
    lmkKey: 'LMK-000001-TEST-MARGARET',
    certificateRef: 'EPC-2023-0041823',
    address: '14 Birchwood Lane',
    postcode: 'LS6 2RT',
    propertyType: 'House',
    builtForm: 'Semi-Detached',
    constructionAgeBand: '1950-1966',
    totalFloorArea: 92,
    currentEnergyRating: 'D',
    currentEnergyEfficiency: 62,
    potentialEnergyRating: 'B',
    potentialEnergyEfficiency: 84,
    mainHeatingDescription: 'Boiler and radiators, mains gas',
    mainFuel: 'Natural Gas',
    wallDescription: 'Cavity wall, as built, no insulation (assumed)',
    wallEnergyEff: 'Poor',
    roofDescription: 'Pitched, 270 mm loft insulation',
    roofEnergyEff: 'Good',
    lodgementDate: new Date('2023-06-12'),
    inspectionDate: new Date('2023-06-10'),
    fetchedBy: admin.id,
  });

  await EPCRecord.create({
    projectId: p2.id,
    lmkKey: 'LMK-000002-TEST-ROBERT',
    certificateRef: 'EPC-2022-0098341',
    address: '8 Maple Avenue',
    postcode: 'M21 9LK',
    propertyType: 'House',
    builtForm: 'Detached',
    constructionAgeBand: '1967-1975',
    totalFloorArea: 118,
    currentEnergyRating: 'D',
    currentEnergyEfficiency: 59,
    potentialEnergyRating: 'B',
    potentialEnergyEfficiency: 81,
    mainHeatingDescription: 'Boiler and underfloor heating, mains gas',
    mainFuel: 'Natural Gas',
    wallDescription: 'Cavity wall, filled cavity',
    wallEnergyEff: 'Average',
    roofDescription: 'Pitched, 200 mm loft insulation',
    roofEnergyEff: 'Average',
    lodgementDate: new Date('2022-11-03'),
    inspectionDate: new Date('2022-11-01'),
    fetchedBy: admin.id,
  });

  await EPCRecord.create({
    projectId: p3.id,
    lmkKey: 'LMK-000003-TEST-PATRICIA',
    certificateRef: 'EPC-2024-0012987',
    address: '22 Ferndale Road',
    postcode: 'BS7 8NP',
    propertyType: 'House',
    builtForm: 'Detached',
    constructionAgeBand: '1900-1929',
    totalFloorArea: 210,
    currentEnergyRating: 'E',
    currentEnergyEfficiency: 44,
    potentialEnergyRating: 'C',
    potentialEnergyEfficiency: 74,
    mainHeatingDescription: 'Boiler and radiators, oil',
    mainFuel: 'Oil',
    wallDescription: 'Solid stone, as built',
    wallEnergyEff: 'Very Poor',
    roofDescription: 'Pitched, 100 mm loft insulation',
    roofEnergyEff: 'Poor',
    lodgementDate: new Date('2024-02-19'),
    inspectionDate: new Date('2024-02-17'),
    fetchedBy: sarah.id,
  });

  console.log('✅ EPC records seeded');

  // ── BUS Eligibility ────────────────────────────────────────────────────────

  await BUSEligibility.create({
    projectId: p1.id,
    verdict: 'eligible',
    criteria: [
      { id: 'epc_rating', label: 'EPC rating D or below', pass: true, blocker: true, detail: 'Current rating D (62) — meets requirement', value: 'D' },
      { id: 'epc_date', label: 'EPC lodged after April 2022', pass: true, blocker: true, detail: 'Lodged June 2023', value: '2023-06-12' },
      { id: 'property_type', label: 'Eligible property type', pass: true, blocker: true, detail: 'House — eligible', value: 'House' },
      { id: 'existing_heating', label: 'Not replacing another heat pump', pass: true, blocker: true, detail: 'Replacing gas boiler', value: true },
      { id: 'insulation', label: 'Loft insulation present', pass: true, blocker: false, detail: '270mm loft insulation — good', value: true },
    ],
    blockers: [],
    warnings: ['Cavity wall insulation noted as absent on EPC — installer to confirm current state before installation'],
    grantAmount: 7500,
    assessedBy: admin.id,
  });

  await BUSEligibility.create({
    projectId: p2.id,
    verdict: 'eligible',
    criteria: [
      { id: 'epc_rating', label: 'EPC rating D or below', pass: true, blocker: true, detail: 'Current rating D (59) — meets requirement', value: 'D' },
      { id: 'epc_date', label: 'EPC lodged after April 2022', pass: true, blocker: true, detail: 'Lodged November 2022', value: '2022-11-03' },
      { id: 'property_type', label: 'Eligible property type', pass: true, blocker: true, detail: 'House — eligible', value: 'House' },
      { id: 'existing_heating', label: 'Not replacing another heat pump', pass: true, blocker: true, detail: 'Replacing gas boiler', value: true },
      { id: 'insulation', label: 'Loft insulation present', pass: true, blocker: false, detail: '200mm loft insulation — adequate', value: true },
    ],
    blockers: [],
    warnings: [],
    grantAmount: 7500,
    assessedBy: admin.id,
  });

  await BUSEligibility.create({
    projectId: p3.id,
    verdict: 'eligible',
    criteria: [
      { id: 'epc_rating', label: 'EPC rating D or below', pass: true, blocker: true, detail: 'Current rating E (44) — meets requirement', value: 'E' },
      { id: 'epc_date', label: 'EPC lodged after April 2022', pass: true, blocker: true, detail: 'Lodged February 2024', value: '2024-02-19' },
      { id: 'property_type', label: 'Eligible property type', pass: true, blocker: true, detail: 'House — eligible', value: 'House' },
      { id: 'existing_heating', label: 'Not replacing another heat pump', pass: true, blocker: true, detail: 'Replacing oil boiler', value: true },
      { id: 'insulation', label: 'Loft insulation present', pass: false, blocker: false, detail: 'Only 100mm — below recommended 270mm', value: false },
    ],
    blockers: [],
    warnings: ['Loft insulation below recommended level — customer should be advised to upgrade before or alongside installation'],
    grantAmount: 7500,
    assessedBy: sarah.id,
  });

  console.log('✅ BUS eligibility records seeded');

  // ── MCS Registration ───────────────────────────────────────────────────────

  await MCSRegistration.create({
    projectId: p1.id,
    mcsNumber: 'MCS-2026-HP-041923',
    registeredAt: new Date('2026-04-28T09:00:00Z'),
    registeredBy: ian.id,
    submittedToMCS: true,
    submittedAt: new Date('2026-04-28T09:15:00Z'),
    notes: 'Registration submitted via MCS portal. Certificate issued same day. Samsung 8kW ASHP — unit serial R8A-2026-04-00921.',
  });

  console.log('✅ MCS registration seeded');

  // ── Commissioning Checklist (Project 1 — nearly complete) ──────────────────

  for (const item of commissioningItems) {
    const isComplete = item.section !== 'Handover';
    await CommissioningChecklist.create({
      projectId: p1.id,
      key: item.key,
      section: item.section,
      name: item.name,
      ref: item.ref,
      guidance: item.guidance,
      required: item.required,
      status: isComplete ? 'pass' : 'pending',
      measuredValue: isComplete ? getMeasuredValue(item.key) : undefined,
      expectedValue: isComplete ? getExpectedValue(item.key) : undefined,
      updatedBy: isComplete ? ian.id : undefined,
    });
  }

  // Project 2 — first two sections done
  for (const item of commissioningItems) {
    const isDone = ['System Fill & Pressure'].includes(item.section);
    await CommissioningChecklist.create({
      projectId: p2.id,
      key: item.key,
      section: item.section,
      name: item.name,
      ref: item.ref,
      guidance: item.guidance,
      required: item.required,
      status: isDone ? 'pass' : 'pending',
      measuredValue: isDone ? getMeasuredValue(item.key) : undefined,
      expectedValue: isDone ? getExpectedValue(item.key) : undefined,
      updatedBy: isDone ? ian.id : undefined,
    });
  }

  console.log('✅ Commissioning checklists seeded');

  // ── Schedules ──────────────────────────────────────────────────────────────

  // Project 1 — past events (audit stage)
  await Schedule.create({
    projectId: p1.id, userId: sarah.id, type: 'survey',
    startAt: new Date('2026-01-14T09:00:00Z'), endAt: new Date('2026-01-14T12:00:00Z'),
    allDay: false, createdBy: admin.id, notes: 'Initial survey and heat loss assessment',
  });
  await Schedule.create({
    projectId: p1.id, userId: ian.id, type: 'install',
    startAt: new Date('2026-02-10T08:00:00Z'), endAt: new Date('2026-02-11T17:00:00Z'),
    allDay: false, createdBy: admin.id, notes: 'Two-day installation — Samsung 8kW ASHP + 250L cylinder',
  });
  await Schedule.create({
    projectId: p1.id, userId: ian.id, type: 'commission',
    startAt: new Date('2026-02-18T09:00:00Z'), endAt: new Date('2026-02-18T16:00:00Z'),
    allDay: false, createdBy: admin.id, notes: 'Full commissioning to MCS 3005 standard',
  });
  await Schedule.create({
    projectId: p1.id, userId: alex.id, type: 'audit',
    startAt: new Date('2026-05-22T10:00:00Z'), endAt: new Date('2026-05-22T13:00:00Z'),
    allDay: false, createdBy: admin.id, notes: 'Final compliance audit before MCS submission',
  });

  // Project 2 — past survey, upcoming install
  await Schedule.create({
    projectId: p2.id, userId: sarah.id, type: 'survey',
    startAt: new Date('2026-03-19T10:00:00Z'), endAt: new Date('2026-03-19T13:00:00Z'),
    allDay: false, createdBy: admin.id, notes: 'Survey and heat loss — UFH zones mapped',
  });
  await Schedule.create({
    projectId: p2.id, userId: ian.id, type: 'install',
    startAt: new Date('2026-05-24T08:00:00Z'), endAt: new Date('2026-05-25T17:00:00Z'),
    allDay: false, createdBy: admin.id, notes: 'Installation day 1 & 2 — scaffold access for unit mounting',
  });

  // Project 3 — upcoming survey
  await Schedule.create({
    projectId: p3.id, userId: sarah.id, type: 'survey',
    startAt: new Date('2026-05-28T09:00:00Z'), endAt: new Date('2026-05-28T12:00:00Z'),
    allDay: false, createdBy: admin.id, notes: 'Full survey inc. ground loop feasibility assessment',
  });

  console.log('✅ Schedule entries seeded');

  // ── Satisfaction Survey ────────────────────────────────────────────────────

  await SatisfactionSurvey.create({
    projectId: p1.id,
    tokenHash: 'demo-completed-token-hash-margaret-2026',
    status: 'completed',
    sentAt: new Date('2026-03-01T09:00:00Z'),
    completedAt: new Date('2026-03-02T14:23:00Z'),
    rating: 5,
    npsScore: 9,
    wouldRecommend: true,
    comments: 'Very professional team. Ian was knowledgeable and took time to explain how to use the system. The installation was tidy and completed on time. Heating bills already noticeably lower.',
    sentBy: admin.id,
  });

  await SatisfactionSurvey.create({
    projectId: p2.id,
    tokenHash: 'demo-pending-token-hash-robert-2026',
    status: 'sent',
    sentAt: new Date('2026-05-13T09:00:00Z'),
    sentBy: admin.id,
  });

  console.log('✅ Satisfaction surveys seeded');

  // ── Customer Comms Log ─────────────────────────────────────────────────────

  // Project 1
  await CustomerCommsLog.create({ projectId: p1.id, date: new Date('2026-01-08T10:30:00Z'), method: 'phone', direction: 'inbound', summary: 'Customer called to enquire about heat pump suitability and BUS grant eligibility. Explained process, confirmed EPC rating qualifies. Survey booked for 14th Jan.', loggedBy: admin.id });
  await CustomerCommsLog.create({ projectId: p1.id, date: new Date('2026-01-14T12:30:00Z'), method: 'site_visit', direction: 'outbound', summary: 'Survey completed. Customer present throughout. Heat loss results discussed. Customer confirmed happy to proceed with 8kW Samsung unit. Quote sent by email.', loggedBy: sarah.id });
  await CustomerCommsLog.create({ projectId: p1.id, date: new Date('2026-01-21T09:00:00Z'), method: 'email', direction: 'inbound', summary: 'Customer emailed to confirm acceptance of quote and sign off design. BUS grant application submitted on their behalf.', loggedBy: admin.id });
  await CustomerCommsLog.create({ projectId: p1.id, date: new Date('2026-02-18T16:30:00Z'), method: 'phone', direction: 'outbound', summary: 'Post-commissioning call. Walked customer through controls, schedule settings, and legionella cycle. Customer confident using the system.', loggedBy: ian.id });
  await CustomerCommsLog.create({ projectId: p1.id, date: new Date('2026-03-15T11:00:00Z'), method: 'email', direction: 'inbound', summary: 'Customer reported system running well. Electricity usage as expected per design estimates. Very happy with outcome.', loggedBy: admin.id });

  // Project 2
  await CustomerCommsLog.create({ projectId: p2.id, date: new Date('2026-03-10T14:00:00Z'), method: 'email', direction: 'inbound', summary: 'Initial enquiry via website contact form. Customer interested in replacing gas boiler. Replied with information pack and survey booking link.', loggedBy: admin.id });
  await CustomerCommsLog.create({ projectId: p2.id, date: new Date('2026-03-19T13:30:00Z'), method: 'site_visit', direction: 'outbound', summary: 'Survey completed. Property well suited to ASHP. Reviewed UFH zones — all compatible at 45°C. Customer keen to proceed quickly.', loggedBy: sarah.id });
  await CustomerCommsLog.create({ projectId: p2.id, date: new Date('2026-05-12T15:00:00Z'), method: 'email', direction: 'inbound', summary: 'Complaint received about uneven heating in upstairs bedrooms. Acknowledged within 1 hour. Engineer visit scheduled.', loggedBy: admin.id });

  // Project 3
  await CustomerCommsLog.create({ projectId: p3.id, date: new Date('2026-04-28T10:00:00Z'), method: 'phone', direction: 'inbound', summary: 'Customer enquired about GSHP options for large farmhouse. Currently on oil — keen to move away. Discussed ground loop options and grant eligibility. Survey booked.', loggedBy: admin.id });
  await CustomerCommsLog.create({ projectId: p3.id, date: new Date('2026-05-10T09:30:00Z'), method: 'email', direction: 'outbound', summary: 'Sent pre-survey questionnaire and information on BUS eligibility. Confirmed survey appointment for 28th May.', loggedBy: sarah.id });

  console.log('✅ Customer comms log seeded');

  // ── Subcontractors ─────────────────────────────────────────────────────────

  const elec = await Subcontractor.create({
    name: 'Dave Norris',
    company: 'Norris Electrical Services',
    email: 'dave@norriselectrical.co.uk',
    phone: '07934 112233',
    trades: ['Electrical', 'Part P'],
    notes: 'Reliable Part P contractor. Available most weekdays. Prefers 48hr notice.',
    active: true,
  });

  const plumb = await Subcontractor.create({
    name: 'Terry Walsh',
    company: 'TW Plumbing & Heating',
    email: 'terry@twplumbing.co.uk',
    phone: '07712 998877',
    trades: ['Plumbing', 'Heating'],
    notes: 'Good for secondary circuit work and cylinder installs.',
    active: true,
  });

  await SubcontractorQualification.create({
    subcontractorId: elec.id,
    type: 'Part P Electrical Competency',
    category: 'Electrical',
    certNumber: 'NICEIC-2023-04412',
    issuingBody: 'NICEIC',
    issuedAt: '2023-04-01',
    expiresAt: '2026-03-31',
    neverExpires: false,
  });

  await SubcontractorQualification.create({
    subcontractorId: plumb.id,
    type: 'Unvented Hot Water Systems',
    category: 'Plumbing',
    certNumber: 'G3-2022-11923',
    issuingBody: 'APHC',
    issuedAt: '2022-09-01',
    expiresAt: null,
    neverExpires: true,
  });

  await SubcontractorAssignment.create({
    projectId: p1.id, subcontractorId: elec.id,
    role: 'Electrical connection and Part P sign-off', assignedBy: ian.id,
  });
  await SubcontractorAssignment.create({
    projectId: p2.id, subcontractorId: elec.id,
    role: 'Electrical connection', assignedBy: ian.id,
  });
  await SubcontractorAssignment.create({
    projectId: p1.id, subcontractorId: plumb.id,
    role: 'Cylinder installation and primary pipework', assignedBy: ian.id,
  });

  console.log('✅ Subcontractors seeded');

  console.log('\n🎉 Audit demo data complete!');
  console.log('   Heat loss summaries, EPC records, BUS eligibility, MCS registration,');
  console.log('   commissioning checklists, schedules, satisfaction surveys,');
  console.log('   customer comms logs and subcontractors all seeded.');
  process.exit(0);
}

// ── Helper: realistic measured values for commissioning items ──────────────

function getMeasuredValue(key: string): string {
  const values: Record<string, string> = {
    'fill.system_pressure': '1.2 bar',
    'fill.expansion_vessel': '1.2 bar',
    'fill.inhibitor_concentration': '28%',
    'fill.no_leaks': 'Pass — no leaks observed',
    'flow.primary_flow_rate': '14.8 L/min',
    'flow.dhw_flow_rate': '8.2 L/min',
    'flow.emitter_balance': 'All zones balanced — lock-shield settings recorded',
    'temp.flow_temp': '46.2°C',
    'temp.return_temp': '40.8°C',
    'temp.delta_t': '5.4°C',
    'temp.dhw_cylinder': '48°C reached in 42 min',
    'temp.legionella_pasteurisation': '62°C held for 65 min',
    'controls.weather_comp_curve': 'Set: -3°C outdoor → 50°C flow, 20°C outdoor → 35°C flow',
    'controls.room_temp': '21°C setpoint — system responds correctly',
    'controls.dhw_programme': '06:00 and 14:00 daily — legionella Tue 03:00',
    'controls.defrost': 'Defrost cycle confirmed per manufacturer spec',
    'elec.supply_voltage': '237V L-N',
    'elec.running_current': '14.2A (nameplate: 18.5A FLA)',
    'elec.earth_continuity': '0.18Ω',
    'perf.cop_calculation': 'Heat output: 7.8kW / Electrical input: 2.1kW = COP 3.71',
    'perf.cop_vs_design': 'Design COP 3.5 @ A7/W45 — achieved 3.71, within acceptable range',
    'perf.noise_level': '42dB at 1m — within permitted limits',
  };
  return values[key] ?? 'Pass';
}

function getExpectedValue(key: string): string {
  const values: Record<string, string> = {
    'fill.system_pressure': '1.0–1.5 bar',
    'fill.expansion_vessel': 'Match system pressure',
    'fill.inhibitor_concentration': '25–30%',
    'fill.no_leaks': 'No leaks',
    'flow.primary_flow_rate': '14–16 L/min (design)',
    'flow.dhw_flow_rate': '7–10 L/min',
    'flow.emitter_balance': 'Design flow per zone',
    'temp.flow_temp': '45°C (design)',
    'temp.return_temp': '40°C (design)',
    'temp.delta_t': '5°C (design)',
    'temp.dhw_cylinder': '≥45°C',
    'temp.legionella_pasteurisation': '≥60°C for ≥60 min',
    'controls.weather_comp_curve': 'Per MCS design',
    'controls.room_temp': 'Correct response to demand',
    'controls.dhw_programme': 'Schedule set and tested',
    'controls.defrost': 'Per manufacturer spec',
    'elec.supply_voltage': '230V ±10% (207–253V)',
    'elec.running_current': '≤18.5A FLA',
    'elec.earth_continuity': '<1Ω',
    'perf.cop_calculation': 'Record values',
    'perf.cop_vs_design': '≥3.5 design COP',
    'perf.noise_level': 'No unusual noise',
  };
  return values[key] ?? 'Pass';
}

seedAuditDemo().catch(err => {
  console.error('❌ Audit demo seed failed:', err);
  process.exit(1);
});
