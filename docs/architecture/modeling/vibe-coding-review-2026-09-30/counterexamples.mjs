import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../../..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const bank = 'services/bank-channel-service/src/main/java/local/bank/channel/';
const results = [];

// Reproduce the exact Java string concatenation, not a bank request.
const transfer = source(bank + 'payments/TransferController.java');
assert(transfer.includes('"{\\"idempotencyKey\\":\\"" + key + "\\"}"'));
const key = 'abcdefghijklmnop"q';
assert(key.length >= 16 && key.length <= 128);
assert.throws(() => JSON.parse('{"idempotencyKey":"' + key + '"}'), SyntaxError);
results.push({id:'M04',level:'STATIC_COUNTEREXAMPLE',observation:'length-valid key containing quote creates invalid JSON; no HTTP or DB call'});

const loan = source(bank + 'FineractLoanPort.java');
assert(loan.includes('.limit(24)'));
assert(loan.includes('first(row.get("interestRatePerPeriod"), row.get("annualInterestRate"))'));
assert(loan.includes('body.put("amortizationType", 1)'));
const command = loan.match(/public record LoanSubmissionCommand\(([^]*?)\) \{/)[1];
assert(!command.includes('repaymentMethod'));
results.push({id:'M01-M03',level:'SOURCE_ASSERTION',observation:'method absent in command, amortization fixed, per-period rate first, limit24 present; Java parser not executed'});

const reconcile = source(bank + 'reconciliation/ReconciliationService.java');
assert.match(reconcile, /public Map<String, Object> run\(String type\) \{\s*return run\(type, null, null, "MANUAL"\);/);
assert.match(reconcile, /@Transactional\s+Map<String, Object> run\(String type,/);
results.push({id:'M05',level:'SOURCE_ASSERTION',observation:'unannotated public entry self-invokes transactional overload; no transaction failure injection performed'});

const quality = source('platform/hengzhun-regression-system/harness/src/quality-read-model.ts');
assert(quality.includes("releaseGate: 'PENDING'"));
assert.match(quality, /releases\(\): Record<string, unknown>\[\] \{ return \[\]; \}/);
results.push({id:'M14',level:'SOURCE_ASSERTION',observation:'release projection empty and overview fixed PENDING; no SQLite data read'});

fs.writeFileSync(path.join(dir,'verification.json'), JSON.stringify({
  scope:'Model review only; no bank, BYOK, Docker, DB, credential or LIVE access',
  counterexamples:results,
  notPerformed:['bank LIVE reproduction','loan core mutation','EOD fault injection','Full18','release verification'],
},null,2)+'\n');
console.log(JSON.stringify({status:'PASS',checks:results.length,level:'STATIC',results}));
