/**
 * Controlled demonstration adapter for the local Fuxing Bank fixture.
 *
 * This module is deliberately the only code-owned location for its routes,
 * locator catalogue and deterministic templates.  Core I10 code may consume
 * this adapter only after TargetProfile carries the explicit, hash-verified
 * `fuxing-bank-demo@2.0.0` binding.
 */
import bankAuthentication from '../../../../contracts/adapters/fuxing-bank-demo-auth-v2.json';
export const FUXING_BANK_DEMO_ROUTES = Object.freeze({
  PORTAL_LOGIN: '/portal/login',
  PORTAL_PROTECTED: '/portal/dashboard',
  PORTAL_PROFILE: '/portal/profile',
  PORTAL_TRANSFERS: '/portal/transfers',
  PORTAL_TRANSFER: '/portal/transfers/new',
  PORTAL_VERIFICATION: '/portal/verification',
  PORTAL_TRANSFER_RESULT: '/portal/transfers/'
});

export const FUXING_BANK_DEMO_TARGETS = Object.freeze({
  LOGIN_SSO_SUBMIT: bankAuthentication.targets.LOGIN_SSO_SUBMIT as {kind:'TEST_ID';value:string},
  LOGIN_USERNAME: bankAuthentication.targets.LOGIN_USERNAME as {kind:'CSS';value:string},
  LOGIN_PASSWORD: bankAuthentication.targets.LOGIN_PASSWORD as {kind:'CSS';value:string},
  LOGIN_SUBMIT: bankAuthentication.targets.LOGIN_SUBMIT as {kind:'CSS';value:string},
  HEADER_DISPLAY_NAME: { kind: 'TEST_ID', value: 'customer-profile-name' },
  HEADER_AVATAR: { kind: 'TEST_ID', value: 'customer-profile-avatar' },
  HEADER_PROFILE_LINK: { kind: 'ROLE', value: 'link|个人资料' },
  PROFILE_DISPLAY_NAME: { kind: 'TEST_ID', value: 'profile-display-name' },
  PROFILE_AVATAR: { kind: 'TEST_ID', value: 'profile-avatar' },
  TRANSFER_ENTRY: { kind: 'TEST_ID', value: 'transfer-entry' },
  TRANSFER_NEW: { kind: 'TEST_ID', value: 'transfer-list-new' },
  TRANSFER_SOURCE_ACCOUNT: { kind: 'TEST_ID', value: 'transfer-source-account' },
  TRANSFER_BENEFICIARY: { kind: 'TEST_ID', value: 'transfer-beneficiary' },
  TRANSFER_AMOUNT: { kind: 'TEST_ID', value: 'transfer-amount' },
  TRANSFER_PURPOSE: { kind: 'TEST_ID', value: 'transfer-description' },
  TRANSFER_SUBMIT: { kind: 'TEST_ID', value: 'transfer-submit' },
  TRANSFER_REVIEW: { kind: 'TEST_ID', value: 'transfer-review' },
  TRANSFER_FIRST_CONFIRM: { kind: 'TEST_ID', value: 'transfer-first-confirm' },
  UKEY_VERIFY: { kind: 'TEST_ID', value: 'ukey-verify-control' },
  TRANSFER_RESULT_ID: { kind: 'TEST_ID', value: 'transfer-result-id' },
  TRANSFER_SETTLED: { kind: 'CSS', value: '[data-testid="transfer-result-status"][data-status="SETTLED"]' }
}) satisfies Readonly<Record<string, { kind: 'ROLE' | 'LABEL' | 'TEST_ID' | 'CSS'; value: string }>>;

export const FUXING_BANK_DEMO_REPAIR_TARGETS = Object.freeze({
  LOGIN_USERNAME: Object.freeze([FUXING_BANK_DEMO_TARGETS.LOGIN_USERNAME]),
  LOGIN_PASSWORD: Object.freeze([FUXING_BANK_DEMO_TARGETS.LOGIN_PASSWORD]),
  LOGIN_SUBMIT: Object.freeze([FUXING_BANK_DEMO_TARGETS.LOGIN_SUBMIT])
}) satisfies Readonly<Record<string, readonly { kind: 'ROLE' | 'LABEL' | 'TEST_ID' | 'CSS'; value: string }[]>>;

export const FUXING_BANK_DEMO_TIMEOUTS = Object.freeze({ DEFAULT_30S: 30_000 });

type AuthenticationTemplateAction={operation:'click'|'fill'|'waitForURL';page:string;target?:string;fixture:string[];routePatternRef?:string};
const authenticationTemplate=bankAuthentication.actions.map(item=>({
  operation:item.operation as AuthenticationTemplateAction['operation'],
  page:item.targetRef==='LOGIN_SSO_SUBMIT'?'LOGIN':'IDENTITY',
  ...(item.targetRef?{target:item.targetRef}:{}),
  fixture:item.credentialKey?[`LOGIN_PROFILE.${item.credentialKey}`]:[],
  ...(item.routePatternRef?{routePatternRef:item.routePatternRef}:{})
}));

export const FUXING_BANK_DEMO_LOGIN_TEMPLATE = [
  { operation: 'goto', routeRef: 'PORTAL_LOGIN', page: 'LOGIN', target: undefined, fixture: [] },
  ...authenticationTemplate,
  { operation: 'expectVisible', page: 'DASHBOARD', target: 'HEADER_DISPLAY_NAME', fixture: [] },
  { operation: 'expectVisible', page: 'DASHBOARD', target: 'HEADER_AVATAR', fixture: [] },
  { operation: 'click', page: 'DASHBOARD', target: 'HEADER_PROFILE_LINK', fixture: [] },
  { operation: 'waitForURL', routePatternRef: 'PORTAL_PROFILE', page: 'PROFILE', target: undefined, fixture: [] },
  { operation: 'expectVisible', page: 'PROFILE', target: 'PROFILE_DISPLAY_NAME', fixture: [] },
  { operation: 'expectVisible', page: 'PROFILE', target: 'PROFILE_AVATAR', fixture: [] },
  { operation: 'expectEqual', page: 'PROFILE', target: 'HEADER_DISPLAY_NAME', comparisonTargetRef: 'PROFILE_DISPLAY_NAME', fixture: [] },
  { operation: 'expectEqual', page: 'PROFILE', target: 'HEADER_AVATAR', comparisonTargetRef: 'PROFILE_AVATAR', fixture: [] },
  { operation: 'screenshot', page: 'PROFILE', target: undefined, fixture: [] }
] as const;

export const FUXING_BANK_DEMO_TRANSFER_TEMPLATE = [
  { operation: 'goto', routeRef: 'PORTAL_LOGIN', page: 'LOGIN', target: undefined, fixture: [] },
  ...authenticationTemplate,
  { operation: 'click', page: 'DASHBOARD', target: 'TRANSFER_ENTRY', fixture: [] },
  { operation: 'waitForURL', routePatternRef: 'PORTAL_TRANSFERS', page: 'TRANSFER_LIST', target: undefined, fixture: [] },
  { operation: 'click', page: 'TRANSFER_LIST', target: 'TRANSFER_NEW', fixture: [] },
  { operation: 'waitForURL', routePatternRef: 'PORTAL_TRANSFER', page: 'TRANSFER', target: undefined, fixture: [] },
  { operation: 'select', page: 'TRANSFER', target: 'TRANSFER_SOURCE_ACCOUNT', optionRef: 'TRANSFER.PAYER_ACCOUNT_ID', fixture: ['TRANSFER.PAYER_ACCOUNT_ID'] },
  { operation: 'select', page: 'TRANSFER', target: 'TRANSFER_BENEFICIARY', optionRef: 'TRANSFER.PAYEE_REF', fixture: ['TRANSFER.PAYEE_REF'] },
  { operation: 'fill', page: 'TRANSFER', target: 'TRANSFER_AMOUNT', fixture: ['TRANSFER.AMOUNT'] },
  { operation: 'fill', page: 'TRANSFER', target: 'TRANSFER_PURPOSE', fixture: ['TRANSFER.PURPOSE'] },
  { operation: 'click', page: 'TRANSFER', target: 'TRANSFER_SUBMIT', fixture: [] },
  { operation: 'expectVisible', page: 'TRANSFER_REVIEW', target: 'TRANSFER_REVIEW', fixture: [] },
  { operation: 'click', page: 'TRANSFER_REVIEW', target: 'TRANSFER_FIRST_CONFIRM', fixture: [] },
  // AUTO_PERSISTED_UKEY runs immediately after TRANSFER_FIRST_CONFIRM through
  // the shared verification-policy bridge: Midscene observes the webpage
  // control and Playwright clicks it.  Keeping another wait/click pair here
  // would wait for a verification page that the policy has already completed.
  { operation: 'waitForURL', routePatternRef: 'PORTAL_TRANSFER_RESULT', page: 'TRANSFER_RESULT', target: undefined, fixture: [] },
  { operation: 'expectVisible', page: 'TRANSFER_RESULT', target: 'TRANSFER_RESULT_ID', fixture: [] },
  { operation: 'expectText', page: 'TRANSFER_RESULT', target: 'TRANSFER_SETTLED', fixture: ['TRANSFER.EXPECTED_STATUS'] },
  { operation: 'screenshot', page: 'TRANSFER_RESULT', target: undefined, fixture: [] }
] as const;

export function fuxingBankDemoPageSignature(page: string) {
  if (page === 'LOGIN') return { routePatternRef: 'PORTAL_LOGIN', landmarkRef: 'PORTAL_SSO', requiredAriaRefs: ['LOGIN_SSO_SUBMIT'] };
  if (page === 'IDENTITY') return { routePatternRef:'IDENTITY_PROVIDER',landmarkRef:'KEYCLOAK_FORM',requiredAriaRefs:['LOGIN_USERNAME','LOGIN_PASSWORD','LOGIN_SUBMIT'] };
  if (page === 'DASHBOARD') return { routePatternRef: 'PORTAL_PROTECTED', landmarkRef: 'PORTAL_HEADER', requiredAriaRefs: ['HEADER_DISPLAY_NAME', 'HEADER_AVATAR'] };
  if (page === 'PROFILE') return { routePatternRef: 'PORTAL_PROFILE', landmarkRef: 'PROFILE_PANEL', requiredAriaRefs: ['PROFILE_DISPLAY_NAME', 'PROFILE_AVATAR'] };
  if (page === 'TRANSFER_LIST') return { routePatternRef: 'PORTAL_TRANSFERS', landmarkRef: 'TRANSFER_LIST', requiredAriaRefs: ['TRANSFER_NEW'] };
  if (page === 'TRANSFER') return { routePatternRef: 'PORTAL_TRANSFER', landmarkRef: 'TRANSFER_FORM', requiredAriaRefs: ['TRANSFER_AMOUNT', 'TRANSFER_PURPOSE', 'TRANSFER_SUBMIT'] };
  if (page === 'TRANSFER_REVIEW') return { routePatternRef: 'PORTAL_TRANSFER', landmarkRef: 'TRANSFER_REVIEW', requiredAriaRefs: ['TRANSFER_REVIEW', 'TRANSFER_FIRST_CONFIRM'] };
  if (page === 'VERIFICATION') return { routePatternRef: 'PORTAL_VERIFICATION', landmarkRef: 'UKEY_VERIFICATION', requiredAriaRefs: ['UKEY_VERIFY'] };
  return { routePatternRef: 'PORTAL_TRANSFER_RESULT', landmarkRef: 'TRANSFER_RESULT', requiredAriaRefs: ['TRANSFER_RESULT_ID', 'TRANSFER_SETTLED'] };
}
