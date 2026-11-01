const SAFE_CODE=/^[A-Z][A-Z0-9_]{2,80}$/;
const JOURNEY=/^journey_[0-9a-f-]{36}$/;
const SESSION=/^session-[0-9a-f]{32}$/;
export function requireCliSuccess(value,stage){
  if(value.code===0&&value.terminal)return value.terminal;
  const error=new Error('RF057_CLI_COMMAND_FAILED');
  error.code=SAFE_CODE.test(value.terminal?.messageCode||'')?value.terminal.messageCode:'RF057_CLI_COMMAND_FAILED';
  error.stage=stage;error.exitCode=value.code;
  if(JOURNEY.test(value.terminal?.journeyId||''))error.journeyId=value.terminal.journeyId;
  if(SESSION.test(value.terminal?.sessionId||''))error.sessionId=value.terminal.sessionId;
  throw error;
}
export function failureMetadata(error,stage){
  return {errorCode:SAFE_CODE.test(error?.code||'')?error.code:'RF057_TEST_DRIVER_FAILED',
    ...(error?.stage||stage?{stage:error?.stage||stage}:{}),
    ...(Number.isInteger(error?.exitCode)?{exitCode:error.exitCode}:{}),
    ...(JOURNEY.test(error?.journeyId||'')?{journeyId:error.journeyId}:{}),
    ...(SESSION.test(error?.sessionId||'')?{sessionId:error.sessionId}:{})};
}
