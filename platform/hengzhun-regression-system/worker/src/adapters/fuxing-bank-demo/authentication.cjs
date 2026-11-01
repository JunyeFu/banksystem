'use strict';
const BANK_AUTH=require('../../../../contracts/adapters/fuxing-bank-demo-auth-v2.json');
const OPERATIONS_AUTH=require('../../../../contracts/adapters/fuxing-bank-operations-auth-v1.json');
const crypto=require('node:crypto');
function authenticationManifestHash(manifest){
  function normalize(value){
    if(Array.isArray(value))return value.map(normalize);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,nested])=>[key,normalize(nested)]));
    return value;
  }
  return crypto.createHash('sha256').update(JSON.stringify(normalize(manifest))).digest('hex');
}
function authenticationForBinding(binding){
  for(const authentication of [BANK_AUTH,OPERATIONS_AUTH]) {
    if(binding?.adapterId===authentication.adapterId&&binding.adapterVersion===authentication.adapterVersion&&binding.manifestHash===authenticationManifestHash(authentication))return authentication;
  }
  return undefined;
}
function assertCredentialOrigin(profile,url){
  if(!profile.credentialOrigins.includes(new URL(url).origin))
    throw Object.assign(new Error('Credential origin is not approved'),{code:'I10_CREDENTIAL_ORIGIN_NOT_ALLOWED'});
}
function assertAuthenticationRealm(authentication,url){
  const current=new URL(url);
  if(current.origin!==authentication.identityOrigin||!(current.pathname===authentication.issuerPath||current.pathname.startsWith(authentication.issuerPath+'/')))
    throw Object.assign(new Error('Bank authentication realm is not approved'),{code:'I10_BANK_AUTH_REALM_NOT_ALLOWED'});
}
function authLocator(page,target){
  const item=BANK_AUTH.targets[target];
  return item.kind==='TEST_ID'?page.getByTestId(item.value):page.locator(item.value);
}
async function openBankAuthentication(page){
  await authLocator(page,'LOGIN_SSO_SUBMIT').click();
  await page.waitForURL(url=>url.origin===BANK_AUTH.identityOrigin&&url.pathname.startsWith(BANK_AUTH.issuerPath),{timeout:30000});
}
async function submitBankCredentials(page,credential){
  assertCredentialOrigin({credentialOrigins:[BANK_AUTH.identityOrigin]},page.url());
  if(!new URL(page.url()).pathname.startsWith(BANK_AUTH.issuerPath))
    throw Object.assign(new Error('Bank authentication realm is not approved'),{code:'I10_BANK_AUTH_REALM_NOT_ALLOWED'});
  await authLocator(page,'LOGIN_USERNAME').fill(credential.username);
  await authLocator(page,'LOGIN_PASSWORD').fill(credential.password);
  await authLocator(page,'LOGIN_SUBMIT').click();
}
async function waitBankAuthenticated(page,portalOrigin){
  await page.waitForURL(url=>url.origin===portalOrigin&&url.pathname.startsWith(BANK_AUTH.authenticatedPath),{timeout:30000});
  await page.getByTestId('customer-profile-name').waitFor({state:'visible',timeout:30000});
}
async function executeBankAuthentication(page,credential){
  const portalOrigin=new URL(page.url()).origin;
  await openBankAuthentication(page);
  await submitBankCredentials(page,credential);
  await waitBankAuthenticated(page,portalOrigin);
}
module.exports={BANK_AUTH,authenticationForBinding,assertAuthenticationRealm,assertCredentialOrigin,authLocator,openBankAuthentication,submitBankCredentials,waitBankAuthenticated,executeBankAuthentication};
