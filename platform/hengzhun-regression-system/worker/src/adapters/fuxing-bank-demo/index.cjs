'use strict';
const {BANK_AUTH}=require('./authentication.cjs');

// Explicit adapter data for the local Fuxing Bank demonstration system.  This
// module owns controlled selectors and route references; generic workers must
// obtain their locators from a frozen TargetProfile instead.
const FUXING_BANK_DEMO_ROUTES = Object.freeze({
  LOGIN: '/portal/login',
  PROFILE: '/portal/profile',
  TRANSFERS: '/portal/transfers',
  TRANSFER: '/portal/transfers/new',
  VERIFICATION: '/portal/verification',
  TRANSFER_RESULT: '/portal/transfers/',
  PROTECTED: '/portal/dashboard'
});

const FUXING_BANK_DEMO_TARGETS = Object.freeze({
  LOGIN_SSO_SUBMIT: {...BANK_AUTH.targets.LOGIN_SSO_SUBMIT,prompt:'银行门户中的统一身份认证按钮'},
  LOGIN_USERNAME: {...BANK_AUTH.targets.LOGIN_USERNAME,prompt:'银行 Keycloak 身份认证页的账号输入框'},
  LOGIN_PASSWORD: {...BANK_AUTH.targets.LOGIN_PASSWORD,prompt:'银行 Keycloak 身份认证页的密码输入框'},
  LOGIN_SUBMIT: {...BANK_AUTH.targets.LOGIN_SUBMIT,prompt:'银行 Keycloak 身份认证页的登录按钮'},
  HEADER_DISPLAY_NAME: { kind: 'TEST_ID', value: 'customer-profile-name', prompt: '页面右上角的当前客户姓名' },
  HEADER_AVATAR: { kind: 'TEST_ID', value: 'customer-profile-avatar', prompt: '页面右上角的当前客户头像' },
  HEADER_PROFILE_LINK: { kind: 'ROLE', value: 'link|个人资料', prompt: '门户顶部主导航中的个人资料链接，不是右上角客户菜单项' },
  PROFILE_DISPLAY_NAME: { kind: 'TEST_ID', value: 'profile-display-name', prompt: '个人资料页中的客户姓名' },
  PROFILE_AVATAR: { kind: 'TEST_ID', value: 'profile-avatar', prompt: '个人资料页中的客户头像' },
  TRANSFER_ENTRY: { kind: 'TEST_ID', value: 'transfer-entry', prompt: '门户导航中的转账业务入口' },
  TRANSFER_NEW: { kind: 'TEST_ID', value: 'transfer-list-new', prompt: '转账列表中的新增转账按钮' },
  TRANSFER_SOURCE_ACCOUNT: {kind:'TEST_ID',value:'transfer-source-account',prompt:'转账表单中的付款账户下拉选择框'},
  TRANSFER_BENEFICIARY: {kind:'TEST_ID',value:'transfer-beneficiary',prompt:'转账表单中的收款人下拉选择框'},
  TRANSFER_AMOUNT: { kind: 'TEST_ID', value: 'transfer-amount', prompt: '转账表单中的转账金额输入框' },
  TRANSFER_PURPOSE: { kind: 'TEST_ID', value: 'transfer-description', prompt: '转账表单中的转账用途输入框' },
  TRANSFER_SUBMIT: { kind: 'TEST_ID', value: 'transfer-submit', prompt: '提交转账信息以进入摘要页的按钮' },
  TRANSFER_REVIEW: { kind: 'TEST_ID', value: 'transfer-review', prompt: '转账摘要确认区域' },
  TRANSFER_FIRST_CONFIRM: { kind: 'TEST_ID', value: 'transfer-first-confirm', prompt: '转账信息填写完成后的第一次确认按钮' },
  UKEY_VERIFY: { kind: 'TEST_ID', value: 'ukey-verify-control', prompt: '网页持久化U盾验证确认按钮' },
  TRANSFER_RESULT_ID: { kind: 'TEST_ID', value: 'transfer-result-id', prompt: '转账结果页面中的转账参考号' },
  TRANSFER_SETTLED: { kind: 'CSS', value: '[data-testid="transfer-result-status"][data-status="SETTLED"]', prompt: '转账结果页中实际已结算的状态，不是处理中或申请受理' }
});

const FUXING_BANK_DEMO_ROUTE_PATTERNS = Object.freeze({
  PORTAL_PROFILE: FUXING_BANK_DEMO_ROUTES.PROFILE,
  PORTAL_TRANSFERS: FUXING_BANK_DEMO_ROUTES.TRANSFERS,
  PORTAL_TRANSFER: FUXING_BANK_DEMO_ROUTES.TRANSFER,
  PORTAL_VERIFICATION: FUXING_BANK_DEMO_ROUTES.VERIFICATION,
  PORTAL_TRANSFER_RESULT: FUXING_BANK_DEMO_ROUTES.TRANSFER_RESULT,
  PORTAL_PROTECTED: FUXING_BANK_DEMO_ROUTES.PROTECTED
});

async function selectTransferParty(page,targetRef,value) {
  const prefix=targetRef==='TRANSFER_SOURCE_ACCOUNT'?'transfer-source-option-':'transfer-beneficiary-option-';
  await page.getByTestId(FUXING_BANK_DEMO_TARGETS[targetRef].value).click();
  await page.getByTestId(prefix+value).click();
}

async function assertTransferSelection(page,fixtures) {
  const form=page.getByTestId('transfer-form');
  for(const [attribute,ref] of [['data-payer-account-id','TRANSFER.PAYER_ACCOUNT_ID'],['data-beneficiary-id','TRANSFER.PAYEE_REF'],['data-currency','TRANSFER.CURRENCY']]) {
    if(await form.getAttribute(attribute)!==fixtures[ref]) throw Object.assign(new Error('Actual transfer selection differs from bound business inputs'),{code:'CANDIDATE_TRANSFER_SELECTION_MISMATCH'});
  }
}

module.exports = { FUXING_BANK_DEMO_ROUTES, FUXING_BANK_DEMO_TARGETS, FUXING_BANK_DEMO_ROUTE_PATTERNS, selectTransferParty, assertTransferSelection };
