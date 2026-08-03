#!/usr/bin/env node
'use strict'
// One-off: disable the H1-image RECURRING schedule after acceptance (plan S5).
const stage8 = require('../scripts/i10-stage8-live.cjs')
const scheduleId = process.argv[2]
if (!scheduleId) { console.error('usage: disable-schedule <schedule_id>'); process.exit(1) }
stage8.setEvidenceRootForAcceptance('.data/evidence/i10/stage8')
stage8.disableRecurringSchedule(scheduleId, 'H1-img-cleanup')
  .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch(error => { console.error(String(error?.message || error)); process.exit(1) })
