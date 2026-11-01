'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const product=path.join(root,'platform/hengzhun-regression-system');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function currentIdentity() {
  const lifecycle=require(path.join(product,'scripts/i10-agent-lifecycle.cjs'));
  return require(path.join(product,'scripts/i10-release-identity-v4.cjs')).currentReleaseIdentityV4({productRoot:product,
    modelConfigIdentity:lifecycle.modelIdentityFromEnvironment(lifecycle.environmentWithRuntimeFile({root:product}))}).identityHash;
}
function beginEvidence(cleanupId) {
  if(!/^[a-f0-9]{32}$/.test(cleanupId))throw new Error('RF057_CLEANUP_REFERENCE_REQUIRED');
  return {releaseIdentityHash:currentIdentity(),suiteSha256:hash(fs.readFileSync(path.join(__dirname,'suite.json'))),
    cleanupRef:`agent/runs/rf057-cleanup/${cleanupId}.json`};
}
function finishEvidence(report,output) {
  const sourceChanged=currentIdentity()!==report.releaseIdentityHash;
  if(sourceChanged) { report.status='FAILED'; report.sourceChanged=true; }
  report.finishedAt=new Date().toISOString();
  report.artifacts=[];
  function visit(directory) {
    for(const item of fs.readdirSync(directory,{withFileTypes:true})) {
      if(item.isSymbolicLink())throw new Error('RF057_ARTIFACT_SYMLINK');
      const absolute=path.join(directory,item.name);
      if(item.isDirectory())visit(absolute);
      else if(item.isFile()&&item.name!=='report.json') {
        const bytes=fs.readFileSync(absolute);
        report.artifacts.push({path:path.relative(root,absolute).replaceAll('\\','/'),size:bytes.length,sha256:hash(bytes)});
      }
    }
  }
  visit(output);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(sourceChanged)throw new Error('RF057_SOURCE_CHANGED_DURING_TEST');
}
module.exports={currentIdentity,beginEvidence,finishEvidence};
