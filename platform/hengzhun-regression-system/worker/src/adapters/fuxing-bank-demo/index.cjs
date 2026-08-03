'use strict';

// Explicit adapter data for the local Fuxing Bank demonstration system.  This
// module owns controlled selectors and route references; generic workers must
// obtain their locators from a frozen TargetProfile instead.
const FUXING_BANK_DEMO_ROUTES = Object.freeze({
  LOGIN: '/portal/login',
  PROFILE: '/portal/profile',
  TRANSFERS: '/portal/transfers',
  TRANSFER: '/portal/transfers/new',
  VERIFICATION: '/portal/verification',
  ORDER_QUERY: '/portal/orders/query',
  PROTECTED: '/portal/dashboard'
});

const FUXING_BANK_DEMO_TARGETS = Object.freeze({
  LOGIN_USERNAME: { kind: 'TEST_ID', value: 'login-username', prompt: '账号密码登录区域中的用户名或手机号输入框' },
  LOGIN_PASSWORD: { kind: 'TEST_ID', value: 'login-password', prompt: '账号密码登录区域中的密码输入框' },
  LOGIN_SUBMIT: { kind: 'TEST_ID', value: 'login-submit', prompt: '红色的账号密码登录按钮' },
  HEADER_DISPLAY_NAME: { kind: 'TEST_ID', value: 'customer-profile-name', prompt: '页面右上角的当前客户姓名' },
  HEADER_AVATAR: { kind: 'TEST_ID', value: 'customer-profile-avatar', prompt: '页面右上角的当前客户头像' },
  HEADER_PROFILE_LINK: { kind: 'ROLE', value: 'link|个人资料', prompt: '门户顶部主导航中的个人资料链接，不是右上角客户菜单项' },
  PROFILE_DISPLAY_NAME: { kind: 'TEST_ID', value: 'profile-display-name', prompt: '个人资料页中的客户姓名' },
  PROFILE_AVATAR: { kind: 'TEST_ID', value: 'profile-avatar', prompt: '个人资料页中的客户头像' },
  TRANSFER_ENTRY: { kind: 'TEST_ID', value: 'transfer-entry', prompt: '门户导航中的转账业务入口' },
  TRANSFER_NEW: { kind: 'TEST_ID', value: 'transfer-list-new', prompt: '转账列表中的新增转账按钮' },
  TRANSFER_AMOUNT: { kind: 'TEST_ID', value: 'transfer-amount', prompt: '转账表单中的转账金额输入框' },
  TRANSFER_PURPOSE: { kind: 'TEST_ID', value: 'transfer-description', prompt: '转账表单中的转账用途输入框' },
  TRANSFER_SUBMIT: { kind: 'TEST_ID', value: 'transfer-submit', prompt: '提交转账信息以进入摘要页的按钮' },
  TRANSFER_REVIEW: { kind: 'TEST_ID', value: 'transfer-review', prompt: '转账摘要确认区域' },
  TRANSFER_FIRST_CONFIRM: { kind: 'TEST_ID', value: 'transfer-first-confirm', prompt: '转账信息填写完成后的第一次确认按钮' },
  UKEY_VERIFY: { kind: 'TEST_ID', value: 'ukey-verify-control', prompt: '网页持久化U盾验证确认按钮' },
  ORDER_NUMBER: { kind: 'TEST_ID', value: 'transfer-order-number', prompt: '单号查询页面中的转账单号' },
  ORDER_STATUS: { kind: 'TEST_ID', value: 'transfer-order-status', prompt: '单号查询页面中的受理状态' }
});

const FUXING_BANK_DEMO_ROUTE_PATTERNS = Object.freeze({
  PORTAL_PROFILE: FUXING_BANK_DEMO_ROUTES.PROFILE,
  PORTAL_TRANSFERS: FUXING_BANK_DEMO_ROUTES.TRANSFERS,
  PORTAL_TRANSFER: FUXING_BANK_DEMO_ROUTES.TRANSFER,
  PORTAL_VERIFICATION: FUXING_BANK_DEMO_ROUTES.VERIFICATION,
  PORTAL_ORDER_QUERY: FUXING_BANK_DEMO_ROUTES.ORDER_QUERY,
  PORTAL_PROTECTED: FUXING_BANK_DEMO_ROUTES.PROTECTED
});

module.exports = { FUXING_BANK_DEMO_ROUTES, FUXING_BANK_DEMO_TARGETS, FUXING_BANK_DEMO_ROUTE_PATTERNS };
