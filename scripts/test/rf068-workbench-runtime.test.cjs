'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { main } = require('../demo/rf068-workbench-runtime.cjs')

test('web ownership treats a reused PID as stale but never adopts a same-creation wrong executable',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rf068-web-owner-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const receipt=path.join(dir,'receipt.json');fs.writeFileSync(receipt,JSON.stringify({pid:123,createdAt:'2026-10-24T04:18:08.5578870Z'}));
  const script=path.resolve(__dirname,'../demo/agent-workbench.ps1');
  const invoke=(created,exe)=>require('node:child_process').spawnSync('powershell',['-NoProfile','-Command',`
    $ErrorActionPreference='Stop';$receiptPath='${receipt.replaceAll("'","''")}';$nodePath='C:\\Test\\node.exe';$entryPath='C:\\Test\\entry.mjs';
    function Get-CimInstance { [pscustomobject]@{ProcessId=123;CreationDate=[datetime]::Parse('${created}');ExecutablePath='${exe}';CommandLine='node "C:\\Test\\entry.mjs"'} }
    $ast=[System.Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'","''")}',[ref]$null,[ref]$null);
    $fn=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-OwnedWebProcess'},$true);
    Invoke-Expression $fn.Extent.Text;$found=Get-OwnedWebProcess;if($null -eq $found){'STALE'}else{'OWNED'}
  `],{encoding:'utf8',windowsHide:true});
  const reused=invoke('2026-10-25T04:18:08Z','C:\\Windows\\conhost.exe');assert.equal(reused.status,0,reused.stderr);assert.match(reused.stdout,/STALE/);
  const wrong=invoke('2026-10-24T04:18:08.5578870Z','C:\\Windows\\conhost.exe');assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/AGENT_WEB_PROCESS_OWNERSHIP_CONFLICT/);
  const owned=invoke('2026-10-24T04:18:08.5578870Z','C:\\Test\\node.exe');assert.equal(owned.status,0,owned.stderr);assert.match(owned.stdout,/OWNED/);
});
test('inspect is read-only even with a live unhealthy PID; start retains the mutation guard', async t => {
  const product = fs.mkdtempSync(path.join(os.tmpdir(), 'rf068-runtime-test-'))
  t.after(() => fs.rmSync(product, { recursive: true, force: true }))
  const deps = { product, alive: () => true, release: { currentReleaseIdentityV4: () => ({ identityHash: 'd'.repeat(64) }) },
    lifecycle: { environmentWithRuntimeFile: () => ({}), modelIdentityFromEnvironment: () => ({}),
      managedStatus: async () => ({ healthy: false, status: 'NOT_READY', services: [{ name: 'harness', pid: 1, owned: true, healthy: false }] }),
      readManagedState: () => ({ services: [{ pid: 1 }] }) } }
  const result = await main(['inspect'], deps)
  assert.equal(result.status, 'INSPECTED'); assert.equal(result.mutationPerformed, false); assert.equal(result.runtime.status, 'NOT_READY')
  assert.deepEqual(fs.readdirSync(product), [])
  await assert.rejects(main(['start', 'd'.repeat(64)], deps), error => error.code === 'RF068_LIVE_MANAGED_PROCESS_REQUIRES_REVIEW')
  assert.deepEqual(fs.readdirSync(product), [])
})
