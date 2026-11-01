import assert from 'node:assert/strict';
import {requireCliSuccess} from './agent-result.mjs';

export async function executeControlledDocumentFailure({runId,identity,credentialRef,bank,cli,harness,writeInput,phase,quality}) {
  const marker=`RF057-A07-${runId}`;
  phase('CONTROLLED_DOCUMENT_CREATE');
  const form=new FormData();
  form.set('file',new Blob([`${marker} synthetic regression document`],{type:'text/plain'}),'rf057-a07.txt');
  form.set('title',marker);form.set('category','REPORT');
  const draft=await bank('/api/operations/v1/documents',{method:'POST',body:form});
  assert.ok(draft.documentId&&draft.status==='DRAFT'&&draft.version===1,'RF057_A07_DRAFT_REQUIRED');
  phase('CONTROLLED_DOCUMENT_AUTHOR');
  const session=requireCliSuccess(await cli(['session','start']),'CONTROLLED_DOCUMENT_AUTHOR').result;
  const goal=`${marker}：从 http://127.0.0.1:18083/ops/login 打开复兴银行运营控制台，通过 Keycloak 统一身份认证登录，使用已登记安全凭据。导航到文档管理，在标题搜索框筛选精确标题 ${marker}。只检查这份文档所在行的状态标签文本，唯一业务断言是该状态标签精确等于“草稿”。只读，不上传、下载、发布、归档或操作资金；不要断言整个表格、标题或相邻按钮文本。`;
  const file=writeInput(goal);
  const authored=await cli(['journey','author',session.sessionId,'--input-file',file,'--entry-url','http://127.0.0.1:18083/ops/login',
    '--target-system','复兴银行运营控制台','--credential-ref',credentialRef,'--adapter','fuxing-bank-operations','--jsonl']);
  assert.equal(authored.code,20,'RF057_A07_AUTHORING_BOUNDARY_REQUIRED');
  const candidate=authored.terminal.result;
  assert.equal(candidate.status,'AWAITING_USER','RF057_A07_VALIDATED_CANDIDATE_REQUIRED');
  requireCliSuccess(await cli(['journey','approve',candidate.journeyId,'--session',session.sessionId,'--revision',String(candidate.revision),
    '--proposal',candidate.proposalId,'--content-hash',candidate.contentHash,'--jsonl']),'CONTROLLED_DOCUMENT_BIND');
  phase('CONTROLLED_DOCUMENT_PUBLISH');
  const published=await bank(`/api/operations/v1/documents/${draft.documentId}/status`,{method:'PATCH',body:{status:'PUBLISHED',version:draft.version}});
  assert.equal(published.documentId,draft.documentId);assert.equal(published.status,'PUBLISHED');assert.equal(published.version,2);
  const rows=await bank(`/api/operations/v1/documents?query=${encodeURIComponent(marker)}`);
  assert.equal(rows.length,1,'RF057_A07_DOCUMENT_SCOPE_REQUIRED');
  assert.equal(rows[0].documentId,draft.documentId);assert.equal(rows[0].status,'PUBLISHED');assert.equal(rows[0].version,2);
  phase('CONTROLLED_FORMAL_FAILURE');
  const executed=await cli(['journey','execute',candidate.journeyId,'--session',session.sessionId,'--jsonl']);
  assert.equal(executed.code,4,'RF057_A07_EXPECTED_FAILURE_EXIT_REQUIRED');
  assert.equal(executed.terminal.messageCode,'I8_FORMAL_ASSERTION_FAILED','RF057_A07_OTHER_FAILURE_NOT_ALLOWED');
  phase('CONTROLLED_FAILURE_EVIDENCE');
  const proof=await harness('/v1/releases:verify',{caseId:'A07',journeyId:candidate.journeyId});
  assert.equal(proof.verdict,'VERIFIED');assert.equal(proof.releaseIdentityHash,identity);
  assert.equal(proof.journeyId,candidate.journeyId);assert.equal(proof.runStatus,'FAILED');assert.equal(proof.taskStatus,'FAILED');
  assert.ok(proof.runId&&proof.taskId&&proof.expectedAssertionStepId,'RF057_A07_EXACT_FAILURE_REQUIRED');
  assert.ok(['DOM','SCREENSHOT','TRACE','NETWORK','LEDGER'].every(kind=>proof.artifacts?.some(a=>a.evidenceKind===kind))&&
    proof.artifacts.every(a=>a.artifactId&&a.sha256Verified===true&&a.sizeVerified===true&&/^[a-f0-9]{64}$/.test(a.sha256)&&Number.isSafeInteger(a.size)&&a.size>=0),
    'RF057_A07_VERIFIED_ARTIFACTS_REQUIRED');
  await quality(proof);
  const retained=await bank(`/api/operations/v1/documents?query=${encodeURIComponent(marker)}`);
  assert.equal(retained.length,1,'RF057_A07_DOCUMENT_SCOPE_REQUIRED');
  assert.equal(retained[0].documentId,draft.documentId);assert.equal(retained[0].status,'PUBLISHED');assert.equal(retained[0].version,2);
  return {journeyId:candidate.journeyId,sessionId:session.sessionId,runId:proof.runId,taskId:proof.taskId,
    expectedAssertionStepId:proof.expectedAssertionStepId,expectedFailure:{operation:'expectText',expectedText:'草稿',caseMarker:'RF057-A07'},
    controlledFailure:true,qualityReadback:true,document:{documentId:draft.documentId,title:marker,before:{status:draft.status,version:draft.version},
      after:{status:published.status,version:published.version},retained:true},artifacts:proof.artifacts};
}
