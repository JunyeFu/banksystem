/**
 * Controlled demonstration adapter for the local Fuxing Bank fixture.
 *
 * This module is deliberately the only code-owned location for its routes,
 * locator catalogue and deterministic templates.  Core I10 code may consume
 * this adapter only after TargetProfile carries the explicit, hash-verified
 * `fuxing-bank-demo@1.0.0` binding.
 */
export const FUXING_BANK_DEMO_ROUTES = Object.freeze({
  PORTAL_LOGIN: '/portal/login',
  PORTAL_PROTECTED: '/portal/dashboard',
  PORTAL_PROFILE: '/portal/profile',
  PORTAL_TRANSFERS: '/portal/transfers',
  PORTAL_TRANSFER: '/portal/transfers/new',
  PORTAL_VERIFICATION: '/portal/verification',
  PORTAL_ORDER_QUERY: '/portal/orders/query'
});

export const FUXING_BANK_DEMO_TARGETS = Object.freeze({
  LOGIN_USERNAME: { kind: 'TEST_ID', value: 'login-username' },
  LOGIN_PASSWORD: { kind: 'TEST_ID', value: 'login-password' },
  LOGIN_SUBMIT: { kind: 'TEST_ID', value: 'login-submit' },
  HEADER_DISPLAY_NAME: { kind: 'TEST_ID', value: 'customer-profile-name' },
  HEADER_AVATAR: { kind: 'TEST_ID', value: 'customer-profile-avatar' },
  HEADER_PROFILE_LINK: { kind: 'ROLE', value: 'link|个人资料' },
  PROFILE_DISPLAY_NAME: { kind: 'TEST_ID', value: 'profile-display-name' },
  PROFILE_AVATAR: { kind: 'TEST_ID', value: 'profile-avatar' },
  TRANSFER_ENTRY: { kind: 'TEST_ID', value: 'transfer-entry' },
  TRANSFER_NEW: { kind: 'TEST_ID', value: 'transfer-list-new' },
  TRANSFER_AMOUNT: { kind: 'TEST_ID', value: 'transfer-amount' },
  TRANSFER_PURPOSE: { kind: 'TEST_ID', value: 'transfer-description' },
  TRANSFER_SUBMIT: { kind: 'TEST_ID', value: 'transfer-submit' },
  TRANSFER_REVIEW: { kind: 'TEST_ID', value: 'transfer-review' },
  TRANSFER_FIRST_CONFIRM: { kind: 'TEST_ID', value: 'transfer-first-confirm' },
  UKEY_VERIFY: { kind: 'TEST_ID', value: 'ukey-verify-control' },
  ORDER_NUMBER: { kind: 'TEST_ID', value: 'transfer-order-number' },
  ORDER_STATUS: { kind: 'TEST_ID', value: 'transfer-order-status' }
}) satisfies Readonly<Record<string, { kind: 'ROLE' | 'LABEL' | 'TEST_ID'; value: string }>>;

export const FUXING_BANK_DEMO_REPAIR_TARGETS = Object.freeze({
  LOGIN_USERNAME: Object.freeze([FUXING_BANK_DEMO_TARGETS.LOGIN_USERNAME, { kind: 'LABEL' as const, value: '用户名 / 手机号' }]),
  LOGIN_PASSWORD: Object.freeze([FUXING_BANK_DEMO_TARGETS.LOGIN_PASSWORD, { kind: 'LABEL' as const, value: '密码' }]),
  LOGIN_SUBMIT: Object.freeze([FUXING_BANK_DEMO_TARGETS.LOGIN_SUBMIT, { kind: 'ROLE' as const, value: 'button|账号密码登录' }])
}) satisfies Readonly<Record<string, readonly { kind: 'ROLE' | 'LABEL' | 'TEST_ID'; value: string }[]>>;

export const FUXING_BANK_DEMO_TIMEOUTS = Object.freeze({ DEFAULT_30S: 30_000 });

export const FUXING_BANK_DEMO_LOGIN_TEMPLATE = [
  { operation: 'goto', routeRef: 'PORTAL_LOGIN', page: 'LOGIN', target: undefined, fixture: [] },
  { operation: 'fill', page: 'LOGIN', target: 'LOGIN_USERNAME', fixture: ['LOGIN_PROFILE.USERNAME'] },
  { operation: 'fill', page: 'LOGIN', target: 'LOGIN_PASSWORD', fixture: ['LOGIN_PROFILE.PASSWORD'] },
  { operation: 'click', page: 'LOGIN', target: 'LOGIN_SUBMIT', fixture: [] },
  { operation: 'waitForURL', routePatternRef: 'PORTAL_PROTECTED', page: 'DASHBOARD', target: undefined, fixture: [] },
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
  { operation: 'fill', page: 'LOGIN', target: 'LOGIN_USERNAME', fixture: ['LOGIN_PROFILE.USERNAME'] },
  { operation: 'fill', page: 'LOGIN', target: 'LOGIN_PASSWORD', fixture: ['LOGIN_PROFILE.PASSWORD'] },
  { operation: 'click', page: 'LOGIN', target: 'LOGIN_SUBMIT', fixture: [] },
  { operation: 'waitForURL', routePatternRef: 'PORTAL_PROTECTED', page: 'DASHBOARD', target: undefined, fixture: [] },
  { operation: 'click', page: 'DASHBOARD', target: 'TRANSFER_ENTRY', fixture: [] },
  { operation: 'waitForURL', routePatternRef: 'PORTAL_TRANSFERS', page: 'TRANSFER_LIST', target: undefined, fixture: [] },
  { operation: 'click', page: 'TRANSFER_LIST', target: 'TRANSFER_NEW', fixture: [] },
  { operation: 'waitForURL', routePatternRef: 'PORTAL_TRANSFER', page: 'TRANSFER', target: undefined, fixture: [] },
  { operation: 'fill', page: 'TRANSFER', target: 'TRANSFER_AMOUNT', fixture: ['TRANSFER.AMOUNT'] },
  { operation: 'fill', page: 'TRANSFER', target: 'TRANSFER_PURPOSE', fixture: ['TRANSFER.PURPOSE'] },
  { operation: 'click', page: 'TRANSFER', target: 'TRANSFER_SUBMIT', fixture: [] },
  { operation: 'expectVisible', page: 'TRANSFER_REVIEW', target: 'TRANSFER_REVIEW', fixture: [] },
  { operation: 'click', page: 'TRANSFER_REVIEW', target: 'TRANSFER_FIRST_CONFIRM', fixture: [] },
  // AUTO_PERSISTED_UKEY runs immediately after TRANSFER_FIRST_CONFIRM through
  // the shared verification-policy bridge: Midscene observes the webpage
  // control and Playwright clicks it.  Keeping another wait/click pair here
  // would wait for a verification page that the policy has already completed.
  { operation: 'waitForURL', routePatternRef: 'PORTAL_ORDER_QUERY', page: 'ORDER_QUERY', target: undefined, fixture: [] },
  { operation: 'expectVisible', page: 'ORDER_QUERY', target: 'ORDER_NUMBER', fixture: [] },
  { operation: 'expectText', page: 'ORDER_QUERY', target: 'ORDER_STATUS', fixture: ['TRANSFER.EXPECTED_STATUS'] },
  { operation: 'screenshot', page: 'ORDER_QUERY', target: undefined, fixture: [] }
] as const;

export function fuxingBankDemoPageSignature(page: string) {
  if (page === 'LOGIN') return { routePatternRef: 'PORTAL_LOGIN', landmarkRef: 'PORTAL_LOGIN_FORM', requiredAriaRefs: ['LOGIN_USERNAME', 'LOGIN_PASSWORD', 'LOGIN_SUBMIT'] };
  if (page === 'DASHBOARD') return { routePatternRef: 'PORTAL_PROTECTED', landmarkRef: 'PORTAL_HEADER', requiredAriaRefs: ['HEADER_DISPLAY_NAME', 'HEADER_AVATAR'] };
  if (page === 'PROFILE') return { routePatternRef: 'PORTAL_PROFILE', landmarkRef: 'PROFILE_PANEL', requiredAriaRefs: ['PROFILE_DISPLAY_NAME', 'PROFILE_AVATAR'] };
  if (page === 'TRANSFER_LIST') return { routePatternRef: 'PORTAL_TRANSFERS', landmarkRef: 'TRANSFER_LIST', requiredAriaRefs: ['TRANSFER_NEW'] };
  if (page === 'TRANSFER') return { routePatternRef: 'PORTAL_TRANSFER', landmarkRef: 'TRANSFER_FORM', requiredAriaRefs: ['TRANSFER_AMOUNT', 'TRANSFER_PURPOSE', 'TRANSFER_SUBMIT'] };
  if (page === 'TRANSFER_REVIEW') return { routePatternRef: 'PORTAL_TRANSFER', landmarkRef: 'TRANSFER_REVIEW', requiredAriaRefs: ['TRANSFER_REVIEW', 'TRANSFER_FIRST_CONFIRM'] };
  if (page === 'VERIFICATION') return { routePatternRef: 'PORTAL_VERIFICATION', landmarkRef: 'UKEY_VERIFICATION', requiredAriaRefs: ['UKEY_VERIFY'] };
  return { routePatternRef: 'PORTAL_ORDER_QUERY', landmarkRef: 'ORDER_QUERY_PANEL', requiredAriaRefs: ['ORDER_NUMBER', 'ORDER_STATUS'] };
}
