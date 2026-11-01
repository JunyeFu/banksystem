'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const {
  genericActionTerms,
  genericEvidenceMatchesTerms,
  genericLocateInstruction,
  readOnlyDetailLocatorEvidence,
  boundedVisualHitOffsets,
  composeMidscenePrompt,
  genericLocatorMatchesAction,
  deriveDynamicLocator
} = require('../../worker/src/i10-midscene-candidate-authoring.cjs')
const { stabilityAllowedOrigins } = require('../../worker/src/i8-stability-runner.cjs')
const { targetRuntimeAllowedOrigins } = require('../../worker/src/i10-worker-utils.cjs')

test('S5 navigation context is not part of the visible account control label',()=>{
  const action={operation:'click',instruction:'从门户导航打开账户列表页面。'};
  assert.deepEqual(genericActionTerms(action),['账户']);
  assert.equal(genericEvidenceMatchesTerms(action,'账户'),true);
  assert.equal(genericEvidenceMatchesTerms(action,'转账'),false);
});

test('authentication-form submission matches only the actual sign-in submit label',()=>{
  const action={operation:'click',instruction:'提交身份认证表单'};
  assert.deepEqual(genericActionTerms(action),['登录']);
  assert.equal(genericEvidenceMatchesTerms(action,'登录'),true);
  for(const label of ['取消登录','注册账号','忘记密码','确认转账','登录并转账']) assert.equal(genericEvidenceMatchesTerms(action,label),false,label);
  assert.equal(genericEvidenceMatchesTerms({...action,instruction:'提交身份认证表单后转账'},'登录'),false);
});

test('authentication submission accepts the visually selected submit input, not cancel or register',async()=>{
  const runtimeRequire=require('node:module').createRequire(path.join(root,'runtime/package.json'));
  const {chromium}=runtimeRequire('playwright');const freeze=JSON.parse(read('config/demo-runtime-freeze.json'));
  const browser=await chromium.launch({executablePath:path.join(root,'runtime',freeze.chromium.executable),headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent('<meta charset="utf-8"><input id="kc-login" type="submit" value="登录"><button id="cancel">取消登录</button><button id="register">注册账号</button><span id="static">登录</span>');
    const action={operation:'click',instruction:'提交身份认证表单'};
    assert.equal(await genericLocatorMatchesAction(page,{kind:'CSS',value:'#kc-login'},action),true);
    for(const id of ['cancel','register','static'])assert.equal(await genericLocatorMatchesAction(page,{kind:'CSS',value:'#'+id},action),false,id);
  } finally {await browser.close();}
});

test('S5 read-only locative qualifiers are not literal DOM text',()=>{
  const action={operation:'expectVisible',instruction:'在账户列表中只读核对账户标识、人民币余额和账户状态字段。'};
  assert.deepEqual(genericActionTerms(action),['账户标识']);
  assert.equal(genericEvidenceMatchesTerms(action,'账户标识 CNY 可用余额 正常'),true);
  assert.equal(genericEvidenceMatchesTerms(action,'通知中心'),false);
  assert.notDeepEqual(genericActionTerms({...action,operation:'click'}),['账户标识']);
  const collection={operation:'expectVisible',instruction:'只读检查账户列表中账户、人民币余额和账户状态字段的展示。'};
  assert.deepEqual(genericActionTerms(collection),['账户']);
  assert.equal(genericEvidenceMatchesTerms(collection,'账户 CNY 可用余额 正常'),true);
  assert.deepEqual(genericActionTerms({operation:'expectVisible',instruction:'只读查看账户列表中的账户信息。'}),['账户']);
  assert.deepEqual(genericActionTerms({operation:'expectVisible',instruction:'只读查看账户列表中的人民币余额。'}),['余额']);
  assert.deepEqual(genericActionTerms({operation:'expectVisible',instruction:'只读查看账户列表中的账户状态。'}),['账户状态']);
});

test('SSO entry intent accepts the actual sign-in label and rejects different or compound actions', () => {
  for (const instruction of ['点击统一身份认证入口', '打开统一身份认证入口。', '点击统一身份认证登录按钮', '点击“统一身份认证登录”按钮']) {
    const action = { operation: 'click', instruction };
    assert.deepEqual(genericActionTerms(action), ['统一身份认证登录']);
    assert.equal(genericEvidenceMatchesTerms(action, '统一身份认证登录'), true);
    for (const label of ['注册账号', '登录', '确认转账', '统一身份认证登录帮助', '取消统一身份认证登录', '统一身份认证登录并转账']) {
      assert.equal(genericEvidenceMatchesTerms(action, label), false, label);
    }
  }
  for (const instruction of ['点击统一身份认证入口并转账', '点击统一身份认证登录后提交转账']) {
    const action = { operation: 'click', instruction };
    assert.deepEqual(genericActionTerms(action), []);
    assert.equal(genericEvidenceMatchesTerms(action, '统一身份认证登录'), false);
  }
  assert.equal(genericEvidenceMatchesTerms({ operation: 'click', instruction: '确认转账' }, '统一身份认证登录'), false);
});

test('SSO actual browser locator must remain the visually selected interactive sign-in button', async () => {
  const runtimeRequire = require('node:module').createRequire(path.join(root, 'runtime/package.json'));
  const { chromium } = runtimeRequire('playwright');
  const freeze = JSON.parse(read('config/demo-runtime-freeze.json'));
  const browser = await chromium.launch({ executablePath: path.join(root, 'runtime', freeze.chromium.executable), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent('<meta charset="utf-8"><section><h1>统一身份认证登录</h1><button data-testid="login-sso-submit">统一身份认证登录</button><button data-testid="register">注册账号</button><button data-testid="transfer">确认转账</button><button data-testid="help">统一身份认证登录帮助</button><span data-testid="static">统一身份认证登录</span><button data-testid="compound">统一身份认证登录并转账</button></section>');
    const action = { operation: 'click', instruction: '点击统一身份认证入口' };
    assert.equal(await genericLocatorMatchesAction(page, { kind: 'TEST_ID', value: 'login-sso-submit' }, action), true);
    for (const value of ['register', 'transfer', 'help', 'static', 'compound']) {
      assert.equal(await genericLocatorMatchesAction(page, { kind: 'TEST_ID', value }, action), false, value);
    }
    const box = await page.getByTestId('login-sso-submit').boundingBox();
    const selected = await deriveDynamicLocator(page, { center: [(box.x + box.width / 2) / 2, (box.y + box.height / 2) / 2] }, { expectedTerms: genericActionTerms(action), interactionMatch: true });
    assert.deepEqual(selected, { kind: 'TEST_ID', value: 'login-sso-submit' });
    assert.equal(await genericLocatorMatchesAction(page, selected, action), true);
  } finally { await browser.close(); }
});

test('observed page-qualified read-only collection anchors the business noun only', () => {
  const action = { operation: 'expectVisible', instruction: '查看账户概览页面中的账户列表区域' }
  assert.deepEqual(genericActionTerms(action), ['账户'])
  assert.equal(genericEvidenceMatchesTerms(action, '我的账户 CNY 可用余额'), true)
  assert.equal(genericEvidenceMatchesTerms(action, '消息中心'), false)
  assert.notDeepEqual(genericActionTerms({ ...action, operation: 'click' }), ['账户'])
})

test('generic account summary assertion anchors a visible account region, not the generated card phrase', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '确认账户卡片、余额和账户状态正常显示'
  }
  assert.deepEqual(genericActionTerms(action), ['账户列表'])
  const prompt = genericLocateInstruction(action)
  assert.match(prompt, /与“账户列表”一致/)
  assert.doesNotMatch(prompt, /账户卡片/)
})

test('generic account assertion drops an already-completed login clause before visual locating', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '使用测试环境预配置的安全认证方式完成登录；在账户概览页面查看账户列表区域；查找币种为人民币（CNY）的账户并核对余额显示'
  }
  assert.deepEqual(genericActionTerms(action), ['账户列表'])
  const prompt = genericLocateInstruction(action)
  assert.match(prompt, /与“账户列表”一致/)
  assert.doesNotMatch(prompt, /完成登录/)
})

test('generic read-only detail navigation accepts a visible view affordance without widening mutation clicks', () => {
  assert.deepEqual(genericActionTerms({ operation: 'click', instruction: '进入账户明细页面' }), ['账户'])
  assert.deepEqual(genericActionTerms({ operation: 'click', instruction: '进入收款人详情页' }), ['收款人'])
  assert.equal(genericEvidenceMatchesTerms({ operation: 'click', instruction: '进入账户明细页面' }, '查看'), true)
  assert.equal(genericEvidenceMatchesTerms({ operation: 'click', instruction: '创建转账并进入交易详情' }, '查看'), false)
  assert.equal(genericEvidenceMatchesTerms({ operation: 'click', instruction: '进入账户明细页面' }, '删除'), false)
  assert.match(genericLocateInstruction({ operation: 'click', instruction: '进入账户明细页面' }), /不要定位只进入列表页的顶层导航链接/)
  const action = { operation: 'click', instruction: '进入账户明细页面' }
  assert.equal(readOnlyDetailLocatorEvidence(action, { tagName: 'button', clickable: true, text: '活期储蓄 正常' }), true)
  assert.equal(readOnlyDetailLocatorEvidence(action, { tagName: 'a', clickable: true, text: '账户' }), false)
  assert.equal(readOnlyDetailLocatorEvidence(action, { tagName: 'button', clickable: true, text: '删除账户' }), false)
  assert.equal(readOnlyDetailLocatorEvidence({ operation: 'click', instruction: '创建转账并进入交易详情' }, { tagName: 'button', clickable: true, text: '查看' }), null)
})

test('generic navigation compares a quoted destination with the visible label text', () => {
  const action = { operation: 'click', instruction: '导航至“账户概览”页面' }
  assert.deepEqual(genericActionTerms(action), ['账户概览'])
  assert.equal(genericEvidenceMatchesTerms(action, '账户概览'), true)
})

test('generic navigation ignores presentation words outside its quoted label', () => {
  const action = { operation: 'click', instruction: '导航至“账户概览”功能页面' }
  assert.deepEqual(genericActionTerms(action), ['账户概览'])
  assert.equal(genericEvidenceMatchesTerms(action, '账户概览'), true)
})

test('generic navigation treats navigation menu as context before the enter action', () => {
  const action = { operation: 'click', instruction: '在页面导航菜单中进入账户概览页面' }
  assert.deepEqual(genericActionTerms(action), ['账户概览'])
  assert.equal(genericEvidenceMatchesTerms(action, '账户概览'), true)
})

test('generic navigation removes sentence punctuation from the visible label', () => {
  const action = { operation: 'click', instruction: '进入账户概览页面。' }
  assert.deepEqual(genericActionTerms(action), ['账户概览'])
  assert.equal(genericEvidenceMatchesTerms(action, '账户概览'), true)
})

test('generic navigation removes a presentation-only function suffix from the visible label', () => {
  const action = { operation: 'click', instruction: '从主页面导航至账户概览功能' }
  assert.deepEqual(genericActionTerms(action), ['账户概览'])
  assert.equal(genericEvidenceMatchesTerms(action, '账户概览'), true)
})

test('generic disjunctive navigation accepts either rendered destination label', () => {
  const action = { operation: 'click', instruction: '在门户首页找到并进入账户概览或账户列表页面' }
  assert.deepEqual(genericActionTerms(action), ['账户概览', '账户列表'])
  assert.match(genericLocateInstruction(action), /“账户概览”或“账户列表”/)
  assert.equal(genericEvidenceMatchesTerms(action, '账户概览'), true)
  assert.equal(genericEvidenceMatchesTerms(action, '账户列表'), true)
  assert.equal(genericEvidenceMatchesTerms(action, '转账'), false)
})

test('generic click compares an explicitly quoted visible control label', () => {
  const action = { operation: 'click', instruction: '在主页面导航栏中定位并点击“账户概览”入口' }
  assert.deepEqual(genericActionTerms(action), ['账户概览'])
  assert.equal(genericEvidenceMatchesTerms(action, '账户概览'), true)
})

test('generic account overview assertion compares the contained business region', () => {
  const action = { operation: 'expectVisible', instruction: '检查账户概览中的账户列表' }
  assert.deepEqual(genericActionTerms(action), ['账户'])
  assert.equal(genericEvidenceMatchesTerms(action, '我的账户'), true)
})

test('generic balance assertion compares the visible fact rather than its account qualifier', () => {
  const action = { operation: 'expectVisible', instruction: '核对人民币账户的可用余额' }
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic currency assertion anchors the explicit visible ISO currency code', () => {
  const action = { operation: 'expectVisible', instruction: '检查页面中是否有币种为人民币（CNY/人民币）的账户。' }
  assert.deepEqual(genericActionTerms(action), ['CNY'])
  assert.match(genericLocateInstruction(action), /与“CNY”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic RMB currency assertion maps the business name to the visible ISO code', () => {
  const action = { operation: 'expectVisible', instruction: '查看账户列表中是否存在币种为“人民币”的账户。' }
  assert.deepEqual(genericActionTerms(action), ['CNY'])
  assert.match(genericLocateInstruction(action), /与“CNY”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic direct field inspection removes the record qualifier and field suffix', () => {
  const action = { operation: 'expectVisible', instruction: '查看该人民币账户的可用余额字段。' }
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.match(genericLocateInstruction(action), /与“可用余额”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic list-record field inspection anchors the rendered column label', () => {
  const action = { operation: 'expectVisible', instruction: '查看账户列表中各账户的币种信息。' }
  assert.deepEqual(genericActionTerms(action), ['币种'])
  assert.match(genericLocateInstruction(action), /与“币种”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '币种'), true)
})

test('generic combined account assertion removes the list containment suffix from its visual anchor', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '检查账户列表中是否存在币种为人民币（CNY）的账户；查看该人民币账户对应的可用余额字段'
  }
  assert.deepEqual(genericActionTerms(action), ['账户'])
  assert.match(genericLocateInstruction(action), /与“账户”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '我的账户'), true)
})

test('generic read-only assertion uses its explicitly quoted visible fact as the visual anchor', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '在账户概览页面中查找人民币账户（货币代码为CNY或显示人民币符号）；查看该人民币账户对应的“可用余额”字段'
  }
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.match(genericLocateInstruction(action), /与“可用余额”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic compound lookup anchors the explicitly checked visible fact', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '在账户概览列表中查找币种为人民币的账户，并检查其可用余额是否可见'
  }
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.match(genericLocateInstruction(action), /与“可用余额”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic compound lookup does not let a quoted qualifier replace the checked visible fact', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '在账户概览页面中查找币种为“人民币”的账户，并检查其可用余额是否显示。'
  }
  const prompt = genericLocateInstruction(action)
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.match(prompt, /与“可用余额”一致/)
  assert.doesNotMatch(prompt, /与“人民币”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic semicolon assertion anchors its trailing verified fact', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '验证页面上至少展示一个人民币账户；验证其可用余额'
  }
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.match(genericLocateInstruction(action), /与“可用余额”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic possessive conjunction assertion anchors its trailing visible fact', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '在账户概览中查找人民币账户及其可用余额信息。'
  }
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.match(genericLocateInstruction(action), /与“可用余额”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic possessive account assertion anchors an explicit trailing balance noun', () => {
  const action = { operation: 'expectVisible', instruction: '查看账户列表中的人民币账户及其可用余额' }
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.match(genericLocateInstruction(action), /与“可用余额”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic existence assertion anchors its corresponding trailing balance noun', () => {
  const action = { operation: 'expectVisible', instruction: '验证页面上是否至少存在一个人民币账户及对应的可用余额。' }
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.match(genericLocateInstruction(action), /与“可用余额”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic trailing safety clause does not replace the explicitly inspected fact', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '检查页面展示的账户列表，确认是否存在人民币账户，并查看其可用余额，不执行任何交易操作。'
  }
  assert.deepEqual(genericActionTerms(action), ['可用余额'])
  assert.match(genericLocateInstruction(action), /与“可用余额”一致/)
  assert.equal(genericEvidenceMatchesTerms(action, '可用余额（CNY）'), true)
})

test('generic compound assertion prompt does not require every fact in one visual card', () => {
  const action = {
    operation: 'expectVisible',
    instruction: '查看账户列表中是否存在币种为“人民币（CNY）”的账户，并检查其“可用余额”字段。'
  }
  const prompt = genericLocateInstruction(action)
  assert.match(prompt, /与“可用余额”一致的可见文字本身或与其语义一致的直接信息区域中心/)
  assert.match(prompt, /其余业务描述只定义断言上下文/)
  assert.doesNotMatch(prompt, /该卡片承载/)
})

test('generic read-only prompt leads with its concrete visual anchor', () => {
  const basePrompt = '受控上下文：目标 DYNAMIC_007 与完整业务断言'
  const locateInstruction = '只读视觉目标：“可用余额”'
  const prompt = composeMidscenePrompt({
    action: { operation: 'expectVisible' },
    basePrompt,
    genericInstruction: locateInstruction,
    adapterInstruction: '',
    observationHints: '可见标题摘要'
  })

  assert.ok(prompt.indexOf(locateInstruction) < prompt.indexOf(basePrompt))
  assert.match(prompt, /可见标题摘要/)
})

test('customer dashboard exposes the available-balance label as an accessible visual landmark', () => {
  const dashboard = read('../../apps/customer-portal/src/pages/Dashboard.tsx')
  assert.match(
    dashboard,
    /<span role="heading" aria-level=\{2\}>可用余额（\{currency\}）<\/span>/
  )
})

test('generic interactive prompt keeps the sealed context first', () => {
  const basePrompt = '受控上下文'
  const locateInstruction = '点击视觉目标'
  const prompt = composeMidscenePrompt({
    action: { operation: 'click' },
    basePrompt,
    genericInstruction: locateInstruction,
    adapterInstruction: '',
    observationHints: ''
  })

  assert.equal(prompt.indexOf(basePrompt), 0)
})

test('generic Midscene waitForURL requires a real URL change within frozen target origins rather than a portal path fallback', () => {
  const source = read('worker/src/i10-midscene-candidate-authoring.cjs')
  assert.match(source, /if \(generic\) \{[\s\S]{0,900}allowedNavigationOrigins\.has\(url\.origin\) && url\.href !== baseline/)
  assert.match(source, /genericNavigationBaseline = beforeClickUrl/)
  const genericBranch = source.match(/if \(generic\) \{([\s\S]{0,900})\} else \{/)
  assert.ok(genericBranch)
  assert.doesNotMatch(genericBranch[1], /portal\/(?:dashboard|profile|transfer|orders)/)
})

test('generic visual locating may receive a bounded redacted control-name hint but never a DOM executor', () => {
  const source = read('worker/src/i10-midscene-candidate-authoring.cjs')
  assert.match(source, /async function accessibleControlHint/)
  assert.match(source, /querySelectorAll\('a,button,select,input:not\(\[type="hidden"\]\),textarea,\[contenteditable="true"\]/)
  assert.match(source, /element instanceof HTMLInputElement \|\| element instanceof HTMLSelectElement/)
  assert.match(source, /inputValueIsSafeLabel/)
  assert.match(source, /不要返回字段标签文字、表单卡片、容器边框或说明文字/)
  assert.match(source, /const selectedLabel = node\.closest\('label'\)/)
  assert.match(source, /selectedLabel\?\.control/)
  assert.match(source, /document\.getElementById\(selectedLabel\.htmlFor\)/)
  assert.match(source, /for \(let current = node; current instanceof HTMLElement && current !== document\.body; current = current\.parentElement\)/)
  assert.match(source, /nearbyControls\.length === 1/)
  assert.match(source, /current !== document\.body/)
  assert.match(source, /if \(!\(interactive instanceof HTMLElement\)\) return null/)
  assert.match(source, /const explicitAccessibleName = String\(node\.getAttribute\('aria-label'\) \|\| ''\)/)
  assert.match(source, /if \(role && explicitAccessibleName && explicitAccessibleName\.length <= 160\)/)
  assert.doesNotMatch(source, /value: `\$\{role\}\|\$\{node\.textContent/)
  assert.match(source, /segments\.length < 24/)
  assert.match(source, /if \(current !== document\.body \|\| !segments\.length\) return null/)
  assert.match(source, /不要返回周围卡片、标题或说明文字/)
  assert.match(source, /replace\(\/\\b\\d\{4,\}\\b\/g, '\*\*\*'\)/)
  assert.match(source, /仅用于视觉消歧；不得将其当作DOM定位器或跳过截图观察/)
  assert.match(source, /async function accessibleLandmarkHint/)
  assert.match(source, /当前页面可见标题摘要/)
  assert.match(source, /function genericLocateInstruction/)
  // Keep this structural check tolerant of additional read-only leading verbs
  // (for example 查询).  The safety property is that generic visual hints
  // remove an action verb before matching the visible business noun; it must
  // not freeze one historical spelling of that allowlist.
  assert.match(source, /\.replace\(\/\^\(\?:确认\|验证\|检查\|校验\|核对\|查看\|确保\|查询\|打开\|进入\|导航\(\?:至\|到\)\?\)\\s\*\[:：\]\?\\s\*\/, ''\)/)
  assert.match(source, /当前动作是只读视觉定位：请在当前截图中优先定位与/)
  assert.match(source, /generated Playwright assertion keeps the full fact set in scope/)
  assert.match(source, /async function genericLocatorMatchesAction/)
  assert.match(source, /I10_MIDSCENE_TARGET_VALIDATION_FAILED/)
  assert.match(source, /stage: 'ACTION_EXECUTED'/)
  assert.match(source, /operation: action\.operation/)
  assert.match(source, /return action\.operation === 'expectVisible' \? terms\.slice\(0, 1\) : terms/)
  assert.match(source, /if \(action\.operation === 'click' && !evidence\.clickable\) return false/)
  assert.match(source, /if \(action\.operation === 'fill' && !evidence\.editable\) return false/)
  assert.match(source, /if \(action\.operation === 'select' && !evidence\.selectable\) return false/)
  assert.match(source, /if \(action\.operation === 'check' && !evidence\.checkable\) return false/)
  assert.match(source, /if \(action\.operation === 'upload' && !evidence\.uploadable\) return false/)
  assert.match(source, /if \(action\.operation === 'download' && !evidence\.clickable\) return false/)
  assert.match(source, /tagName === 'textarea' \|\| element\.isContentEditable/)
  assert.match(source, /tagName === 'button' \|\| tagName === 'a' \|\| role === 'button'/)
  assert.match(source, /async function resolveCredentialValueForLocatedInput/)
  assert.match(source, /String\(element\.type \|\| ''\)\.toLowerCase\(\) === 'password'/)
  assert.match(source, /await resolveCredentialValueForLocatedInput\(page, verifiedLocator, credential, action\)/)
  assert.match(source, /const clickable = generic \? dynamicLocator\(page, verifiedLocator\)/)
  assert.match(source, /promptHash: sha256\(basePrompt\), screenshotHash/)
  assert.match(source, /promptHash: sha256\(basePrompt\), locatorMatched: true/)
})

test('generic screenshots preserve the reached page without inventing a visual element target', () => {
  const source = read('worker/src/i10-midscene-candidate-authoring.cjs')
  assert.match(source, /function requiresVisualLocator\(action\)/)
  assert.match(source, /'goto', 'waitForURL', 'screenshot', 'humanVerification'/)
  assert.match(source, /action\.semanticTargetRef && \(!generic \|\| requiresVisualLocator\(action\)\)/)
  assert.match(source, /expectedTerms: genericActionTerms\(action\)/)
  assert.match(source, /regionMatch: action\.operation === 'expectVisible'/)
  assert.match(source, /fixed 24px cross and only each hit's own[\s\S]*never search the page for a matching term/)
})

test('formal and stability runners use only frozen profile origins', () => {
  for (const relative of ['worker/src/i8-formal-runner.cjs', 'worker/src/i8-stability-runner.cjs']) {
    const source = read(relative)
    assert.match(source, /targetRuntimeAllowedOrigins/)
    assert.doesNotMatch(source, /launchOrigin === 'http:\/\/127\.0\.0\.1:18082'/)
  }
  const sharedPolicy = read('worker/src/i10-worker-utils.cjs')
  assert.doesNotMatch(sharedPolicy, /adapter\?\.adapterId === 'fuxing-bank-demo'/)
  assert.match(sharedPolicy, /allowedNavigationOrigins/)
})

test('the deterministic IntentPlan compiler selects a controlled profile only from a frozen adapter binding', () => {
  const source = read('flowise/i10/agentflow-v6.json')
  const flow = JSON.parse(source)
  const planner = flow.nodes.find(node => node.id === 'llmAgentflow_intent')
  const compiler = planner.data.inputs.customFunctionJavascriptFunction
  assert.match(compiler, /targetProfileSnapshot\.adapterBinding/)
  assert.match(compiler, /binding\.adapterId === 'fuxing-bank-demo' && transferRequested/)
  assert.match(compiler, /TRANSFER_UKEY_ORDER_QUERY/)
  assert.doesNotMatch(compiler, /draft\.targetSystem|\/portal\/login/)
  const execute = new Function(
    '$caseDraftJson', '$route', '$targetProfileId', '$targetProfileVersion', '$targetProfileHash', '$targetProfileSnapshot',
    compiler
  )
  const genericResult = execute(JSON.stringify({
    entryUrl: 'http://127.0.0.1:18082/portal/login',
    steps: [
      { action: '发起转账', expected: '显示确认结果' }
    ]
  }), '', 'target-profile-generic', 1, 'a'.repeat(64), '{}')
  assert.equal(genericResult.valid, 'YES')
  assert.equal(genericResult.executionProfile, 'GENERIC_WEB')
})

test('authoring enforces the same frozen browser origin policy as stability and formal execution', () => {
  const source = read('worker/src/i10-midscene-candidate-authoring.cjs')
  assert.match(source, /targetRuntimeAllowedOrigins/)
  assert.match(source, /await context\.route\('\*\*\/\*'/)
  assert.match(source, /route\.abort\('blockedbyclient'\)/)
})

test('stability network policy admits the identity origin only when declared in the frozen profile', () => {
  const generic = {
    allowedNavigationOrigins: ['http://127.0.0.1:18082'],
    allowedInteractionOrigins: ['http://127.0.0.1:18082'],
    credentialOrigins: ['http://127.0.0.1:18082'],
    adapterBinding: null,
  }
  assert.deepEqual(stabilityAllowedOrigins(generic, 'http://127.0.0.1:18082/'), ['http://127.0.0.1:18082'])
  assert.deepEqual(stabilityAllowedOrigins({
    ...generic,
    adapterBinding: { adapterId: 'fuxing-bank-demo', adapterVersion: '2.0.0', manifestHash: 'a'.repeat(64) },
  }, 'http://127.0.0.1:18082/'), ['http://127.0.0.1:18082'])
  assert.deepEqual(stabilityAllowedOrigins({...generic,allowedNavigationOrigins:[...generic.allowedNavigationOrigins,'http://127.0.0.1:19000']},'http://127.0.0.1:18082/'),['http://127.0.0.1:18082','http://127.0.0.1:19000'])
  assert.deepEqual([...targetRuntimeAllowedOrigins(generic, 'http://127.0.0.1:18082/')], ['http://127.0.0.1:18082'])
})

test('generic read-only region locating samples only a bounded 24px neighborhood', () => {
  const offsets = boundedVisualHitOffsets({ regionMatch: true, expectedTermCount: 1 })
  assert.deepEqual(offsets[0], [0, 0])
  assert.ok(offsets.some(([x, y]) => x === 24 && y === 0))
  assert.ok(offsets.every(([x, y]) => Math.abs(x) <= 24 && Math.abs(y) <= 24))
  assert.deepEqual(boundedVisualHitOffsets({ regionMatch: false, expectedTermCount: 1 }), [[0, 0]])
  assert.deepEqual(boundedVisualHitOffsets({ regionMatch: true, expectedTermCount: 0 }), [[0, 0]])

  const source = read('worker/src/i10-midscene-candidate-authoring.cjs')
  assert.match(source, /document\.elementFromPoint\(x \+ dx, y \+ dy\)/)
  assert.doesNotMatch(source, /querySelectorAll\([^\n]*expectedTerms/)
})

test('run claims preserve the ACTIVE TargetProfile adapter binding for formal network policy', () => {
  const source = read('harness/src/service.ts')
  assert.match(source, /resolved_addresses_json: string; adapter_binding_json: string/)
  assert.match(source, /JSON\.parse\(targetProfile\.adapter_binding_json \|\| 'null'\)/)
  assert.match(source, /adapterBinding: parsedAdapterBinding/)
})

test('controlled demo routes and locators live in the explicit adapter rather than generic builder code', () => {
  const builder = read('harness/src/i8/script-package-builder.ts')
  const adapter = read('harness/src/i8/adapters/fuxing-bank-demo.ts')
  for (const marker of ['/portal/login', 'transfer-first-confirm']) {
    assert.doesNotMatch(builder, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(adapter, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(builder, /isFuxingBankDemoAdapter/)
  assert.match(adapter, /bankAuthentication\.targets\.LOGIN_USERNAME/)
  assert.match(builder, /const baseline = navigationBaseline \|\| page\.url\(\)/)
})

test('Midscene controlled selectors and U-key behavior require an explicit adapter binding', () => {
  const authoring = read('worker/src/i10-midscene-candidate-authoring.cjs')
  const workerAdapter = read('worker/src/adapters/fuxing-bank-demo/index.cjs')
  const dispatcher = read('worker/src/i10-verification-policy.cjs')
  for (const marker of ['/portal/login', 'transfer-first-confirm']) {
    assert.doesNotMatch(authoring, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(workerAdapter, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(authoring, /FUXING_BANK_DEMO_ROUTES/)
  assert.match(workerAdapter, /BANK_AUTH\.targets\.LOGIN_USERNAME/)
  assert.match(dispatcher, /isFuxingDemoBinding\(adapterBinding\)/)
  assert.match(dispatcher, /: NONE/)
})

test('new controlled task assembly loads the explicit adapter while legacy paths remain replay-only shims', () => {
  const worker = read('worker/src/index.cjs')
  const utils = read('worker/src/i10-worker-utils.cjs')
  const shim = read('worker/src/login-profile.cjs')
  assert.match(worker, /require\('\.\/adapters\/fuxing-bank-demo\/login-profile\.cjs'\)/)
  assert.match(worker, /adapters\/fuxing-bank-demo\/login-profile@1\.0\.0/)
  assert.match(worker, /worker\/src\/login-profile\.cjs/)
  assert.match(shim, /adapters\/fuxing-bank-demo\/login-profile\.cjs/)
  assert.doesNotMatch(utils, /portal\/login|login-username/)
  assert.match(utils, /targetRuntimeAllowedOrigins/)
})

test('the controlled adapter accepts an in-memory DPAPI credential while preserving the legacy alias fallback', () => {
  const adapter = read('worker/src/adapters/fuxing-bank-demo/login-profile.cjs')
  const utils = read('worker/src/i10-worker-utils.cjs')
  const worker = read('worker/src/index.cjs')
  assert.match(adapter, /resolveExecutionCredential\(task, environment, options\)/)
  assert.match(utils, /const supplied = options\?\.credential/)
  assert.match(utils, /supplied\?\.username && supplied\?\.password/)
  assert.match(utils, /return resolveCredential\(task\?\.execution\?\.credentialAlias, environment\)/)
  assert.match(worker, /if \(task\.execution\?\.credentialRef\)/)
  assert.match(worker, /credentials:resolve/)
  assert.match(worker, /credential: i10Credential/)
})

test('target profile preparation derives only case-scoped generic capabilities', () => {
  const flow = JSON.parse(read('flowise/i10/agentflow-v6.json'))
  const classificationMerge = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_classification_merge')
  assert.match(classificationMerge.data.inputs.customFunctionJavascriptFunction, /scheduleRefs\.length === 1/)
  assert.match(classificationMerge.data.inputs.customFunctionJavascriptFunction, /scheduleId: explicitScheduleRef \|\|/)
  const derive = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v5_application_profile_derive')
  const prepare = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_prepare')
  const prerequisite = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_target_profile_prerequisite')
  assert.ok(derive)
  assert.ok(prepare)
  assert.ok(prerequisite)
  const implementation = derive.data.inputs.customFunctionJavascriptFunction
  assert.match(implementation, /moduleId: 'case-scope'/)
  assert.match(implementation, /本次案例范围/)
  assert.match(implementation, /explicitAdapterSelection/)
  assert.match(implementation, /fuxing-bank-demo/)
  assert.match(implementation, /明确选择|使用|采用/)
  assert.doesNotMatch(implementation, /targetSystem.*fuxing-bank-demo|entryUrl.*fuxing-bank-demo/)
  assert.ok(prepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'applicationProfile' && arg.inputArgValue === '{{$flow.state.applicationProfileJson}}'))
  assert.ok(prepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'adapterSelection' && arg.inputArgValue === '{{$flow.state.targetAdapterSelection}}'))
  assert.ok(prerequisite.data.inputs.customFunctionInputVariables.some(variable => variable.variableName === 'naturalLanguage'))
  assert.match(prerequisite.data.inputs.customFunctionJavascriptFunction, /!explicitAdapterSelection/)
  assert.ok(flow.edges.some(edge => edge.source === derive.id && edge.target === prepare.id))
  const crossProjection = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v6_cross_session_journey_projection')
  const adapterRoute = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v6_cross_session_adapter_route')
  assert.ok(crossProjection.data.inputs.customFunctionUpdateState.some(update =>
    update.key === 'targetAdapterSelection' && update.value === '{{ output.projectedAdapterSelection }}'))
  assert.ok(crossProjection.data.inputs.customFunctionUpdateState.some(update =>
    update.key === 'targetAdapterConfirmationRequired' && update.value === '{{ output.adapterConfirmationRequired }}'))
  assert.match(crossProjection.data.inputs.customFunctionJavascriptFunction,/adapterConfirmationRequired/)
  assert.match(crossProjection.data.inputs.customFunctionJavascriptFunction,/references\?\.targetProfileId/)
  assert.ok(adapterRoute)
  assert.equal(adapterRoute.data.inputs.conditions[0].value1,'{{$flow.state.targetAdapterConfirmationRequired}}')
  const crossPrepare = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_prepare_cross_session')
  assert.ok(crossPrepare)
  assert.equal(crossPrepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'applicationProfile'),false)
  assert.ok(crossPrepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'adapterSelection'))
  assert.ok(flow.edges.some(edge => edge.source === adapterRoute.id && edge.target === crossPrepare.id))
  assert.equal(flow.edges.filter(edge => edge.target === crossPrepare.id).length,1)
  const crossStatusRoute = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v6_cross_session_target_profile_status')
  assert.ok(crossStatusRoute)
  assert.deepEqual(crossStatusRoute.data.inputs.conditions.map(item => item.value2),['PENDING_CONFIRMATION','ACTIVE'])
  assert.ok(flow.edges.some(edge => edge.source === crossStatusRoute.id && edge.sourceHandle.endsWith('-output-0') && edge.target === 'humanInputAgentflow_i10_v4_target_profile_confirm_cross_session'))
  assert.ok(flow.edges.some(edge => edge.source === crossStatusRoute.id && edge.sourceHandle.endsWith('-output-1') && edge.target === 'toolAgentflow_i10_v6_post_target_journey_prepare_already_active_cross_session'))
  for (const id of [
    'humanInputAgentflow_i10_v4_target_profile_confirm_cross_session',
    'toolAgentflow_i10_v4_target_profile_approve_cross_session',
    'toolAgentflow_i10_v4_target_profile_get_cross_session',
    'toolAgentflow_i10_v6_post_target_journey_prepare_cross_session',
    'customFunctionAgentflow_i10_v6_post_target_journey_projection_cross_session',
    'directReplyAgentflow_i10_v6_target_profile_transition_cross_session'
  ]) {
    assert.ok(flow.nodes.some(node => node.id === id),`missing isolated target-profile node ${id}`)
    assert.equal(flow.edges.filter(edge => edge.target === id).length,1,`${id} must not become an AND-join`)
  }
  for (const id of [
    'toolAgentflow_i10_v6_post_target_journey_prepare_already_active_cross_session',
    'customFunctionAgentflow_i10_v6_post_target_journey_projection_already_active_cross_session',
    'directReplyAgentflow_i10_v6_target_profile_transition_already_active_cross_session'
  ]) assert.equal(flow.edges.filter(edge => edge.target === id).length,1,`${id} must remain a single-parent continuation`)
  for (const [projectionId, prepareId] of [
    ['customFunctionAgentflow_i10_v6_post_target_journey_projection_cross_session', 'toolAgentflow_i10_v6_post_target_journey_prepare_cross_session'],
    ['customFunctionAgentflow_i10_v6_post_target_journey_projection_already_active_cross_session', 'toolAgentflow_i10_v6_post_target_journey_prepare_already_active_cross_session']
  ]) {
    const projection = flow.nodes.find(node => node.id === projectionId)
    const contentVariable = projection.data.inputs.customFunctionInputVariables
      .find(item => item.variableName === 'content')
    assert.equal(contentVariable?.variableValue, `{{ ${prepareId}.output.content }}`)
  }
  for (const nodeId of [
    'toolAgentflow_i10_v6_cross_session_authoring_submit',
    'toolAgentflow_i10_v6_cross_session_authoring_resume_submit'
  ]) {
    const node = flow.nodes.find(item => item.id === nodeId)
    assert.deepEqual(
      node.data.inputs.toolInputArgs.map(item => item.inputArgName).sort(),
      ['authoringContext', 'choice', 'confirmationRef', 'expectedVersion', 'preparationId', 'reason', 'sessionRef']
    )
  }
})
