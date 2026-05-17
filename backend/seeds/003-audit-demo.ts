import sequelize from '../config/database';
import { Project, User } from '../models/index';
import { commissioningItems } from '../data/commissioningItems';

// Uses raw SQL throughout to avoid camelCase↔snake_case model mapping issues.

async function q(sql: string, replacements: any[] = []): Promise<any> {
  const [results] = await sequelize.query(sql, { bind: replacements });
  return results;
}

async function seedAuditDemo(): Promise<void> {
  await sequelize.authenticate();
  console.log('✅ Database connected');

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

  await q(`INSERT INTO heat_loss_summaries
    (project_id, design_flow_temp, heat_demand_kw, heat_loss_kw, ground_floor_area, fabric_loss_kw, ventilation_loss_kw, software_used, calculated_by, calculated_at, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [p1.id, 45, 7.2, 6.8, 82, 5.1, 1.7, 'HeatEngineer', ian.id, '2026-01-15',
      'Semi-detached 1960s construction. Cavity wall insulation present. Loft insulated to 270mm. Design flow temp 45°C achievable with existing radiator sizing.']);

  await q(`INSERT INTO heat_loss_summaries
    (project_id, design_flow_temp, heat_demand_kw, heat_loss_kw, ground_floor_area, fabric_loss_kw, ventilation_loss_kw, software_used, calculated_by, calculated_at, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [p2.id, 45, 6.2, 5.9, 74, 4.3, 1.6, 'HeatEngineer', sarah.id, '2026-03-20',
      'Detached 1980s build. UFH downstairs, radiators upstairs. All rads confirmed oversized for 45°C. 8kW unit selected.']);

  await q(`INSERT INTO heat_loss_summaries
    (project_id, design_flow_temp, heat_demand_kw, heat_loss_kw, ground_floor_area, fabric_loss_kw, ventilation_loss_kw, software_used, calculated_by, calculated_at, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [p3.id, 35, 9.1, 8.7, 140, 6.2, 2.5, 'HeatEngineer', sarah.id, '2026-05-05',
      'Large detached farmhouse. Solid stone walls — high fabric loss. GSHP horizontal loop suitable given 1,200m² garden. 12kW unit recommended.']);

  console.log('✅ Heat loss summaries seeded');

  // ── EPC Records ────────────────────────────────────────────────────────────

  await q(`INSERT INTO epc_records
    (project_id, lmk_key, certificate_ref, address, postcode, property_type, built_form, construction_age_band,
     total_floor_area, current_energy_rating, current_energy_efficiency, potential_energy_rating, potential_energy_efficiency,
     main_heating_description, main_fuel, wall_description, wall_energy_eff, roof_description, roof_energy_eff,
     lodgement_date, inspection_date, fetched_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [p1.id, 'LMK-000001-MARGARET', 'EPC-2023-0041823', '14 Birchwood Lane', 'LS6 2RT',
      'House', 'Semi-Detached', '1950-1966', 92, 'D', 62, 'B', 84,
      'Boiler and radiators, mains gas', 'Natural Gas',
      'Cavity wall, as built, no insulation (assumed)', 'Poor',
      'Pitched, 270mm loft insulation', 'Good',
      '2023-06-12', '2023-06-10', admin.id]);

  await q(`INSERT INTO epc_records
    (project_id, lmk_key, certificate_ref, address, postcode, property_type, built_form, construction_age_band,
     total_floor_area, current_energy_rating, current_energy_efficiency, potential_energy_rating, potential_energy_efficiency,
     main_heating_description, main_fuel, wall_description, wall_energy_eff, roof_description, roof_energy_eff,
     lodgement_date, inspection_date, fetched_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [p2.id, 'LMK-000002-ROBERT', 'EPC-2022-0098341', '8 Maple Avenue', 'M21 9LK',
      'House', 'Detached', '1967-1975', 118, 'D', 59, 'B', 81,
      'Boiler and underfloor heating, mains gas', 'Natural Gas',
      'Cavity wall, filled cavity', 'Average',
      'Pitched, 200mm loft insulation', 'Average',
      '2022-11-03', '2022-11-01', admin.id]);

  await q(`INSERT INTO epc_records
    (project_id, lmk_key, certificate_ref, address, postcode, property_type, built_form, construction_age_band,
     total_floor_area, current_energy_rating, current_energy_efficiency, potential_energy_rating, potential_energy_efficiency,
     main_heating_description, main_fuel, wall_description, wall_energy_eff, roof_description, roof_energy_eff,
     lodgement_date, inspection_date, fetched_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [p3.id, 'LMK-000003-PATRICIA', 'EPC-2024-0012987', '22 Ferndale Road', 'BS7 8NP',
      'House', 'Detached', '1900-1929', 210, 'E', 44, 'C', 74,
      'Boiler and radiators, oil', 'Oil',
      'Solid stone, as built', 'Very Poor',
      'Pitched, 100mm loft insulation', 'Poor',
      '2024-02-19', '2024-02-17', sarah.id]);

  console.log('✅ EPC records seeded');

  // ── BUS Eligibility ────────────────────────────────────────────────────────

  const busInsert = `INSERT INTO bus_eligibility (project_id, verdict, criteria, blockers, warnings, grant_amount, assessed_by)
    VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)`;

  await q(busInsert, [p1.id, 'eligible',
    JSON.stringify([
      { id: 'epc_rating', label: 'EPC rating D or below', pass: true, blocker: true, detail: 'Current rating D (62)', value: 'D' },
      { id: 'epc_date', label: 'EPC lodged after April 2022', pass: true, blocker: true, detail: 'Lodged June 2023', value: '2023-06-12' },
      { id: 'property_type', label: 'Eligible property type', pass: true, blocker: true, detail: 'House — eligible', value: 'House' },
      { id: 'existing_heating', label: 'Not replacing another heat pump', pass: true, blocker: true, detail: 'Replacing gas boiler', value: true },
    ]),
    '{}', '{Cavity wall insulation noted as absent on EPC — confirm current state before installation}', 7500, admin.id]);

  await q(busInsert, [p2.id, 'eligible',
    JSON.stringify([
      { id: 'epc_rating', label: 'EPC rating D or below', pass: true, blocker: true, detail: 'Current rating D (59)', value: 'D' },
      { id: 'epc_date', label: 'EPC lodged after April 2022', pass: true, blocker: true, detail: 'Lodged November 2022', value: '2022-11-03' },
      { id: 'property_type', label: 'Eligible property type', pass: true, blocker: true, detail: 'House — eligible', value: 'House' },
      { id: 'existing_heating', label: 'Not replacing another heat pump', pass: true, blocker: true, detail: 'Replacing gas boiler', value: true },
    ]),
    '{}', '{}', 7500, admin.id]);

  await q(busInsert, [p3.id, 'eligible',
    JSON.stringify([
      { id: 'epc_rating', label: 'EPC rating D or below', pass: true, blocker: true, detail: 'Current rating E (44)', value: 'E' },
      { id: 'epc_date', label: 'EPC lodged after April 2022', pass: true, blocker: true, detail: 'Lodged February 2024', value: '2024-02-19' },
      { id: 'property_type', label: 'Eligible property type', pass: true, blocker: true, detail: 'House — eligible', value: 'House' },
      { id: 'existing_heating', label: 'Not replacing another heat pump', pass: true, blocker: true, detail: 'Replacing oil boiler', value: true },
      { id: 'insulation', label: 'Loft insulation present', pass: false, blocker: false, detail: 'Only 100mm — below recommended 270mm', value: false },
    ]),
    '{}', '{Loft insulation below recommended — customer should be advised to upgrade}', 7500, sarah.id]);

  console.log('✅ BUS eligibility records seeded');

  // ── MCS Registration ───────────────────────────────────────────────────────

  await q(`INSERT INTO mcs_registrations (project_id, mcs_number, registered_at, registered_by, notes)
    VALUES ($1,$2,$3,$4,$5)`,
    [p1.id, 'MCS-2026-HP-041923', '2026-04-28', ian.id,
      'Registration submitted via MCS portal. Samsung 8kW ASHP — unit serial R8A-2026-04-00921.']);

  console.log('✅ MCS registration seeded');

  // ── Commissioning Checklist ────────────────────────────────────────────────

  for (const item of commissioningItems) {
    const isComplete = item.section !== 'Handover';
    await q(`INSERT INTO commissioning_checklist
      (project_id, key, section, name, ref, guidance, required, status, measured_value, expected_value, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [p1.id, item.key, item.section, item.name, item.ref, item.guidance ?? null, item.required,
        isComplete ? 'pass' : 'pending',
        isComplete ? getMeasuredValue(item.key) : null,
        isComplete ? getExpectedValue(item.key) : null,
        isComplete ? ian.id : null]);
  }

  for (const item of commissioningItems) {
    const isDone = item.section === 'System Fill & Pressure';
    await q(`INSERT INTO commissioning_checklist
      (project_id, key, section, name, ref, guidance, required, status, measured_value, expected_value, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [p2.id, item.key, item.section, item.name, item.ref, item.guidance ?? null, item.required,
        isDone ? 'pass' : 'pending',
        isDone ? getMeasuredValue(item.key) : null,
        isDone ? getExpectedValue(item.key) : null,
        isDone ? ian.id : null]);
  }

  console.log('✅ Commissioning checklists seeded');

  // ── Schedules ──────────────────────────────────────────────────────────────

  const sched = `INSERT INTO schedules (project_id, user_id, type, start_at, end_at, all_day, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;

  await q(sched, [p1.id, sarah.id, 'survey',  '2026-01-14 09:00', '2026-01-14 12:00', false, 'Initial survey and heat loss assessment', admin.id]);
  await q(sched, [p1.id, ian.id,   'install',  '2026-02-10 08:00', '2026-02-11 17:00', false, 'Two-day installation — Samsung 8kW ASHP + 250L cylinder', admin.id]);
  await q(sched, [p1.id, ian.id,   'commission','2026-02-18 09:00', '2026-02-18 16:00', false, 'Full commissioning to MCS 3005 standard', admin.id]);
  await q(sched, [p1.id, alex.id,  'audit',    '2026-05-22 10:00', '2026-05-22 13:00', false, 'Final compliance audit before MCS submission', admin.id]);
  await q(sched, [p2.id, sarah.id, 'survey',   '2026-03-19 10:00', '2026-03-19 13:00', false, 'Survey and heat loss — UFH zones mapped', admin.id]);
  await q(sched, [p2.id, ian.id,   'install',  '2026-05-24 08:00', '2026-05-25 17:00', false, 'Installation days 1 & 2 — scaffold access for unit mounting', admin.id]);
  await q(sched, [p3.id, sarah.id, 'survey',   '2026-05-28 09:00', '2026-05-28 12:00', false, 'Full survey inc. ground loop feasibility assessment', admin.id]);

  console.log('✅ Schedules seeded');

  // ── Satisfaction Surveys ───────────────────────────────────────────────────

  await q(`INSERT INTO satisfaction_surveys (project_id, token_hash, status, sent_at, completed_at, rating, nps_score, would_recommend, comments, sent_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [p1.id, 'demo-completed-margaret-2026', 'completed', '2026-03-01', '2026-03-02',
      5, 9, true,
      'Very professional team. Ian was knowledgeable and took time to explain how to use the system. The installation was tidy and completed on time. Heating bills already noticeably lower.',
      admin.id]);

  await q(`INSERT INTO satisfaction_surveys (project_id, token_hash, status, sent_at, sent_by)
    VALUES ($1,$2,$3,$4,$5)`,
    [p2.id, 'demo-sent-robert-2026', 'sent', '2026-05-13', admin.id]);

  console.log('✅ Satisfaction surveys seeded');

  // ── Customer Comms Log ─────────────────────────────────────────────────────

  const comms = `INSERT INTO customer_comms_log (project_id, date, method, direction, summary, logged_by) VALUES ($1,$2,$3,$4,$5,$6)`;

  await q(comms, [p1.id, '2026-01-08 10:30', 'phone', 'inbound', 'Customer called to enquire about heat pump suitability and BUS grant eligibility. Survey booked for 14th Jan.', admin.id]);
  await q(comms, [p1.id, '2026-01-14 12:30', 'site_visit', 'outbound', 'Survey completed. Customer present throughout. Heat loss results discussed. Customer confirmed happy to proceed with 8kW Samsung unit.', sarah.id]);
  await q(comms, [p1.id, '2026-01-21 09:00', 'email', 'inbound', 'Customer emailed to confirm acceptance of quote. BUS grant application submitted on their behalf.', admin.id]);
  await q(comms, [p1.id, '2026-02-18 16:30', 'phone', 'outbound', 'Post-commissioning call. Walked customer through controls and schedule settings. Customer confident using the system.', ian.id]);
  await q(comms, [p1.id, '2026-03-15 11:00', 'email', 'inbound', 'Customer reported system running well. Electricity usage as expected per design estimates. Very happy with outcome.', admin.id]);
  await q(comms, [p2.id, '2026-03-10 14:00', 'email', 'inbound', 'Initial enquiry via website. Customer interested in replacing gas boiler. Replied with information pack and survey booking link.', admin.id]);
  await q(comms, [p2.id, '2026-03-19 13:30', 'site_visit', 'outbound', 'Survey completed. Property well suited to ASHP. Reviewed UFH zones — all compatible at 45°C. Customer keen to proceed quickly.', sarah.id]);
  await q(comms, [p2.id, '2026-05-12 15:00', 'email', 'inbound', 'Complaint received about uneven heating in upstairs bedrooms. Acknowledged within 1 hour. Engineer visit scheduled.', admin.id]);
  await q(comms, [p3.id, '2026-04-28 10:00', 'phone', 'inbound', 'Customer enquired about GSHP options for large farmhouse. Currently on oil. Discussed ground loop options and grant eligibility. Survey booked.', admin.id]);
  await q(comms, [p3.id, '2026-05-10 09:30', 'email', 'outbound', 'Sent pre-survey questionnaire and BUS eligibility information. Confirmed survey appointment for 28th May.', sarah.id]);

  console.log('✅ Customer comms log seeded');

  // ── Subcontractors ─────────────────────────────────────────────────────────

  const [elecRows]: any = await sequelize.query(
    `INSERT INTO subcontractors (name, company, email, phone, trades, notes, active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    { bind: ['Dave Norris', 'Norris Electrical Services', 'dave@norriselectrical.co.uk', '07934 112233', '{Electrical,"Part P"}', 'Reliable Part P contractor. Available most weekdays. Prefers 48hr notice.', true] }
  );
  const elecId = (elecRows as any[])[0].id;

  const [plumbRows]: any = await sequelize.query(
    `INSERT INTO subcontractors (name, company, email, phone, trades, notes, active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    { bind: ['Terry Walsh', 'TW Plumbing & Heating', 'terry@twplumbing.co.uk', '07712 998877', '{Plumbing,Heating}', 'Good for secondary circuit work and cylinder installs.', true] }
  );
  const plumbId = (plumbRows as any[])[0].id;

  await q(`INSERT INTO subcontractor_qualifications (subcontractor_id, type, category, cert_number, issuing_body, issued_at, expires_at, never_expires)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [elecId, 'Part P Electrical Competency', 'Electrical', 'NICEIC-2023-04412', 'NICEIC', '2023-04-01', '2026-03-31', false]);

  await q(`INSERT INTO subcontractor_qualifications (subcontractor_id, type, category, cert_number, issuing_body, issued_at, never_expires)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [plumbId, 'Unvented Hot Water Systems', 'Plumbing', 'G3-2022-11923', 'APHC', '2022-09-01', true]);

  await q(`INSERT INTO subcontractor_assignments (project_id, subcontractor_id, role, assigned_by) VALUES ($1,$2,$3,$4)`,
    [p1.id, elecId, 'Electrical connection and Part P sign-off', ian.id]);
  await q(`INSERT INTO subcontractor_assignments (project_id, subcontractor_id, role, assigned_by) VALUES ($1,$2,$3,$4)`,
    [p2.id, elecId, 'Electrical connection', ian.id]);
  await q(`INSERT INTO subcontractor_assignments (project_id, subcontractor_id, role, assigned_by) VALUES ($1,$2,$3,$4)`,
    [p1.id, plumbId, 'Cylinder installation and primary pipework', ian.id]);

  console.log('✅ Subcontractors seeded');

  console.log('\n🎉 Audit demo data complete!');
  process.exit(0);
}

function getMeasuredValue(key: string): string {
  const v: Record<string, string> = {
    'fill.system_pressure': '1.2 bar', 'fill.expansion_vessel': '1.2 bar',
    'fill.inhibitor_concentration': '28%', 'fill.no_leaks': 'Pass — no leaks observed',
    'flow.primary_flow_rate': '14.8 L/min', 'flow.dhw_flow_rate': '8.2 L/min',
    'flow.emitter_balance': 'All zones balanced — lock-shield settings recorded',
    'temp.flow_temp': '46.2°C', 'temp.return_temp': '40.8°C', 'temp.delta_t': '5.4°C',
    'temp.dhw_cylinder': '48°C reached in 42 min',
    'temp.legionella_pasteurisation': '62°C held for 65 min',
    'controls.weather_comp_curve': 'Set: -3°C outdoor → 50°C flow, 20°C outdoor → 35°C flow',
    'controls.room_temp': '21°C setpoint — system responds correctly',
    'controls.dhw_programme': '06:00 and 14:00 daily — legionella Tue 03:00',
    'controls.defrost': 'Defrost cycle confirmed per manufacturer spec',
    'elec.supply_voltage': '237V L-N', 'elec.running_current': '14.2A (nameplate: 18.5A FLA)',
    'elec.earth_continuity': '0.18Ω',
    'perf.cop_calculation': 'Heat output: 7.8kW / Electrical input: 2.1kW = COP 3.71',
    'perf.cop_vs_design': 'Design COP 3.5 @ A7/W45 — achieved 3.71, within acceptable range',
    'perf.noise_level': '42dB at 1m — within permitted limits',
  };
  return v[key] ?? 'Pass';
}

function getExpectedValue(key: string): string {
  const v: Record<string, string> = {
    'fill.system_pressure': '1.0–1.5 bar', 'fill.expansion_vessel': 'Match system pressure',
    'fill.inhibitor_concentration': '25–30%', 'fill.no_leaks': 'No leaks',
    'flow.primary_flow_rate': '14–16 L/min (design)', 'flow.dhw_flow_rate': '7–10 L/min',
    'flow.emitter_balance': 'Design flow per zone',
    'temp.flow_temp': '45°C (design)', 'temp.return_temp': '40°C (design)', 'temp.delta_t': '5°C (design)',
    'temp.dhw_cylinder': '≥45°C', 'temp.legionella_pasteurisation': '≥60°C for ≥60 min',
    'controls.weather_comp_curve': 'Per MCS design', 'controls.room_temp': 'Correct response to demand',
    'controls.dhw_programme': 'Schedule set and tested', 'controls.defrost': 'Per manufacturer spec',
    'elec.supply_voltage': '230V ±10% (207–253V)', 'elec.running_current': '≤18.5A FLA',
    'elec.earth_continuity': '<1Ω',
    'perf.cop_calculation': 'Record values', 'perf.cop_vs_design': '≥3.5 design COP',
    'perf.noise_level': 'No unusual noise',
  };
  return v[key] ?? 'Pass';
}

seedAuditDemo().catch(err => {
  console.error('❌ Audit demo seed failed:', err.message ?? err);
  process.exit(1);
});
