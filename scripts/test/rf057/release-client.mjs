export async function verifyRegisteredReports(reportPaths, send) {
  for (const reportPath of reportPaths) await send('/v1/releases/reports:register', {reportPath});
  const result = await send('/v1/releases:verify', {});
  if (result.verificationPerformed !== true || !['GO', 'NO_GO'].includes(result.decision)) {
    throw Object.assign(new Error('RELEASE_VERIFICATION_RESPONSE_INVALID'), {code:'RELEASE_VERIFICATION_RESPONSE_INVALID'});
  }
  return result;
}
