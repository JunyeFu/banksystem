---
id: HIAGENT-251-A1B3EB7CCC737536
title: "HiAgent OpenAPI通用说明"
document_type: external-reference
domain: hiagent
status: reference
authority: external
version: 2.5.1
effective_date: 2026-07-16
source_file: "2.5.1帮助文档/API & SDK/HiAgent OpenAPI通用说明.pdf"
source_sha256: a1b3eb7ccc737536ab9f0a19e2695872117bd9b9f9ecf3a17c654ae43d59342c
extraction_method: pdf
---

# HiAgent OpenAPI通用说明

> 外部参考资料：HiAgent 2.5.1 帮助文档。仅供项目开发阶段检索，不得覆盖本项目当前架构、契约、代码、测试或运行证据；不得作为交付系统运行时知识来源。

## 提取正文

## 第 1 页

HiAgentOpenAPI通⽤说明
本⽂档旨在为HiAgent平台的开发者提供⼀份清晰、统⼀的API通⽤说明，帮助您快速理解平台的接
⼝规范并开始集成。
1.接⼝分类
HiAgent平台的API主要分为两⼤类，分别对应不同的使⽤场景和认证⽅式：
智能体API(AgentAPI)
•
⽤途:主要⽤于与已创建的智能体进⾏对话交
互。
•
特点:调⽤⽅式直接，专注于发布后的智能体
对话以及周边能⼒。
•
访问⽅式：
https://{dom ain}/api/proxy/api/v1，⽐如
https://hia.volcenginepaas.com /api/proxy/
api/v1
平台API(Platform API)
•
⽤途:涵盖平台级别的所有核⼼功能，如⽤⼾
管理(IAM )、知识库(K BS)、应⽤管理(App)
等。
•
特点:功能全⾯，提供对平台资源的程序化管
理能⼒。
•
访问⽅式：top-server-nodeport地址，⼀般
为{Host IP}:30040 
2.接⼝认证
根据接⼝分类的不同，平台提供两种相应的认证⽅案。
2.1 智能体API认证：APIKey
当调⽤智能体API时，您需要使⽤ API Key 进⾏认证。
•
获取⽅式:
a. 在智能体编排⻚⾯发布智能体配置。
b.在智能体发布⻚⾯，开启API配置开关并单击渠道发布，系统会为您⽣成API地址。
c. apikey 通过点击API 密钥来获取。

## 第 2 页

•
使⽤⽅法:将 apikey 放⼊HTTP请求的 Apikey 头中。
💡请求头格式Apikey: <YOUR_API_KEY> 
2.2 平台API认证：⽕⼭引擎鉴权
当调⽤平台接⼝时，需要采⽤标准的⽕⼭引擎OpenAPI鉴权⽅案。
•
获取⽅式:
a. 登录HiAgent平台。
b.通过 点击头像  -> 账号中⼼  -> 密钥管理⻚⾯获取您的 AccessKey 和
SecretAccessKey 。
•
使⽤⽅法:使⽤获取的密钥对您的请求进⾏签名。签名结果会附加在请求的 Authorization 头
中。具体的签名算法请参考⽕⼭引擎的官⽅⽂档
https://www.volcengine.com /docs/6369/156029。
3.通⽤请求与响应结构
3.1 智能体API
3.1.1 请求体结构
•
通⽤请求参数
字段 位置 含义

## 第 3 页

Apikey Header 智能体APIkey
其他参考各个接⼝说明。
3.1.2 通⽤返回内容
没有通⽤返回，具体返回内容请参考各个接⼝说明。
3.2 平台API
3.2.1 请求体结构
•
通⽤请求参数
字段 位置 含义
Action Query 代表请求的Action，例如：G etU serByID
Version Query 代表请求的Version，例如：2022-01-01
X-Account-Id Query 租⼾ID，如果是单租⼾，⼀般是1000000000
Region Header 固定值：cn-north-1
AccessK ey Header AccessKey 
SecretK ey Header SecretAccessKey 
接⼝所需的其他参数放在body⾥⾯。
3.2.2 请求⽅式
所有请求均为POST请求。
3.2.3 返回结构
3.2.3.1 正常返回
代码块
{ 
    "ResponseMetadata": { 
        "RequestId": "2020102017223001022507", // 从 X-Top-Request-Id 的 header 获取 
        "Action": "{Action}",// 从请求 Action 的 query 获取 
        "Version": "{Version}",// 从请求 Version 的 query 获取 
1
2
3
4
5

## 第 4 页

}, 
    "Result":"..." 
} 
•
ResponseMetadata 是必须返回的，Result 是具体接⼝返回的内容，格式需满⾜标准
json。
•HTTPCode为200
3.2.3.2 异常返回
代码块
{ 
    "ResponseMetadata": { 
        "RequestId": "2020102017223001022507", 
        "Action": "{Action}", 
        "Version": "{Version}", 
        "Error": { 
            "Code": "InvalidActionOrVersion", 
            "Message": "Could not find operation GetUserById for version 2018-
01-012", 
            "Data": {} 
        } 
    } 
} 
•
发⽣错误时不返回Result 字段，并且ResponseMetadata 中增加Error 字段，包含错误的
Code 和Message 等信息
4.通⽤错误码
HTTP状态码 错误类型 建议操作
401U nauthorized 认证失败 请检查您的 API Key 或 ⽕⼭鉴权签
名是否正确、有效。
400BadRequest 参数错误 请检查请求体参数的格式、类型和完整
性是否符合接⼝要求。
404NotFound 资源不存在 请检查请求的U RL或资源ID是否正确。
500InternalServerError 服务器内部错误 请稍后重试，如果问题持续存在，请联
系技术⽀持。
6
7
8
1
2
3
4
5
6
7
8
9
10
11
12

## 第 5 页

🎁注意:更详细的业务错误码，请参考具体接⼝的独⽴⽂档。
5.请求⽰例
5.1 智能体API
参考各个接⼝提供的⽰例说明。
5.2 平台API
5.2.1 Postm an
使⽤Postm an访问平台接⼝需要先将签名脚本拷⻉到Scripts->Pre-request（脚本具体内容如下，复制
粘贴即可）
代码块
const crypto = require('crypto-js'); 
const { SHA256, HmacSHA256: hmacSHA256, enc } = crypto; 
const util = { 
  crypto: { 
    hmac: function hmac(key, string) { 
      return hmacSHA256(string, key); 
    }, 
 
    sha256: function sha256(data) { 
      return SHA256(data); 
    }, 
1
2
3
4
5
6
7
8
9
10
11

## 第 6 页

}, 
}; 
 
/** 
 * @api private 
 */ 
const expiresHeader = 'presigned-expires'; 
 
const unsignableHeaders = [ 
  'authorization', 
  'content-type', 
  'content-length', 
  'user-agent', 
  expiresHeader, 
  'expect', 
  'x-amzn-trace-id', 
]; 
 
const uriEscape = (str) => { 
  try { 
    return encodeURIComponent(str) 
      .replace(/[^A-Za-z0-9_.~\-%]+/g, escape) 
      .replace( 
        /[*]/g, 
        (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}` 
      ); 
  } catch (e) { 
    return ''; 
  } 
}; 
 
const queryParamsToString = (params, sort = true) => 
  (sort ? Object.keys(params).sort() : Object.keys(params)) 
    .map((key) => { 
      const val = params[key]; 
      if (typeof val === 'undefined' || val === null) { 
        return; 
      } 
 
      const escapedKey = uriEscape(key); 
      if (!escapedKey) { 
        return; 
      } 
 
      if (Array.isArray(val)) { 
        return `${escapedKey}=${val 
          .map(uriEscape) 
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58

## 第 7 页

.sort() 
          .join(`&${escapedKey}=`)}`; 
      } 
 
      return `${escapedKey}=${uriEscape(val)}`; 
    }) 
    .filter((v) => v) 
    .join('&'); 
 
/** 
 * @api private 
 */ 
class AWSSignersV4 { 
  constructor(request, serviceName, options) { 
    this.request = request; 
    this.request.headers = request.headers || {}; 
    this.serviceName = serviceName; 
    options = options || {}; 
    this.signatureCache = 
      typeof options.signatureCache === 'boolean' 
        ? options.signatureCache 
        : true; 
    this.operation = options.operation; 
    this.signatureVersion = options.signatureVersion; 
    this.constant = options.isVolcengine 
      ? { 
          algorithm: 'HMAC-SHA256', 
          v4Identifier: 'request', 
          dateHeader: 'X-Date', 
          tokenHeader: 'x-security-token', 
          contentSha256Header: 'X-Content-Sha256', 
          kDatePrefix: '', 
        } 
      : { 
          algorithm: 'AWS4-HMAC-SHA256', 
          v4Identifier: 'aws4_request', 
          dateHeader: 'X-Amz-Date', 
          tokenHeader: 'x-amz-security-token', 
          contentSha256Header: 'X-Amz-Content-Sha256', 
          kDatePrefix: 'AWS4', 
        }; 
    this.bodySha256 = options.bodySha256; 
  } 
 
  addAuthorization(credentials, date) { 
    const datetime = this.iso8601(date).replace(/[:\-]|\.\d{3}/g, ''); 
    this.addHeaders(credentials, datetime); 
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105

## 第 8 页

this.request.headers['Authorization'] = this.authorization( 
      credentials, 
      datetime 
    ); 
  } 
 
  addHeaders(credentials, datetime) { 
    this.request.headers[this.constant.dateHeader] = datetime; 
    if (credentials.sessionToken) { 
      this.request.headers[this.constant.tokenHeader] = 
        credentials.sessionToken; 
    } 
    if (this.request.body) { 
      let body = this.request.body; 
      if (typeof body !== 'string') { 
        if (body instanceof URLSearchParams) { 
          body = body.toString(); 
        } else { 
          body = JSON.stringify(body); 
        } 
      } 
      this.request.headers[this.constant.contentSha256Header] = 
        this.bodySha256 || util.crypto.sha256(body).toString(); 
    } 
  } 
 
  authorization(credentials, datetime) { 
    const parts = []; 
    const credString = this.credentialString(datetime); 
    parts.push( 
      `${this.constant.algorithm} 
Credential=${credentials.accessKeyId}/${credString}` 
    ); 
    parts.push(`SignedHeaders=${this.signedHeaders()}`); 
    const signature = this.signature(credentials, datetime); 
    console.log('signature is', signature.toString(enc.Hex)); 
    parts.push(`Signature=${signature}`); 
    return parts.join(', '); 
  } 
 
  signature(credentials, datetime) { 
    const signingKey = this.getSigningKey( 
      credentials, 
      datetime.substr(0, 8), 
      this.request.region, 
      this.serviceName, 
      this.signatureCache 
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151

## 第 9 页

); 
    const signStr = this.stringToSign(datetime); 
    console.log('signStr is', signStr); 
    console.log('signingKey is', signingKey.toString(enc.Hex)); 
    return util.crypto.hmac(signingKey, signStr, 'hex'); 
  } 
 
  stringToSign(datetime) { 
    const parts = []; 
    parts.push(this.constant.algorithm); 
    parts.push(datetime); 
    parts.push(this.credentialString(datetime)); 
    const canonicalString = this.canonicalString(); 
    console.log('canonicalString is', canonicalString); 
    parts.push(this.hexEncodedHash(canonicalString)); 
 
    return parts.join('\n'); 
  } 
 
  canonicalString() { 
    const parts = [], 
      pathname = this.request.pathname || '/'; 
 
    parts.push(this.request.method.toUpperCase()); 
    parts.push(pathname); 
    parts.push(queryParamsToString(this.request.params) || ''); 
    parts.push(`${this.canonicalHeaders()}\n`); 
    parts.push(this.signedHeaders()); 
    parts.push(this.hexEncodedBodyHash()); 
    return parts.join('\n'); 
  } 
 
  canonicalHeaders() { 
    const headers = []; 
    Object.keys(this.request.headers).forEach((key) => { 
      headers.push([key, this.request.headers[key]]); 
    }); 
    headers.sort((a, b) => (a[0].toLowerCase() < b[0].toLowerCase() ? -1 : 1)); 
    const parts = []; 
    headers.forEach((item) => { 
      const key = item[0].toLowerCase(); 
      if (this.isSignableHeader(key)) { 
        const value = item[1]; 
        if ( 
          typeof value === 'undefined' || 
          value === null || 
          typeof value.toString !== 'function' 
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198

## 第 10 页

) { 
          throw new Error(`Header ${key} contains invalid value`); 
        } 
        parts.push(`${key}:${this.canonicalHeaderValues(value.toString())}`); 
      } 
    }); 
    return parts.join('\n'); 
  } 
 
  canonicalHeaderValues(values) { 
    return values.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); 
  } 
 
  signedHeaders() { 
    const keys = []; 
    Object.keys(this.request.headers).forEach((key) => { 
      key = key.toLowerCase(); 
      if (this.isSignableHeader(key)) { 
        keys.push(key); 
      } 
    }); 
    return keys.sort().join(';'); 
  } 
 
  credentialString(datetime) { 
    return this.createScope( 
      datetime.substr(0, 8), 
      this.request.region, 
      this.serviceName 
    ); 
  } 
 
  hexEncodedHash(string) { 
    return util.crypto.sha256(string); 
  } 
 
  hexEncodedBodyHash() { 
    if (this.request.headers[this.constant.contentSha256Header]) { 
      return this.request.headers[this.constant.contentSha256Header]; 
    } 
 
    if (this.request.body) { 
      return this.hexEncodedHash(queryParamsToString(this.request.body)); 
    } 
    return this.hexEncodedHash(''); 
  } 
 
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
229
230
231
232
233
234
235
236
237
238
239
240
241
242
243
244
245

## 第 11 页

isSignableHeader(key) { 
    if (key.toLowerCase().indexOf('x-amz-') === 0) { 
      return true; 
    } 
    return unsignableHeaders.indexOf(key) < 0; 
  } 
 
  iso8601(date) { 
    if (date === undefined) { 
      date = new Date(); 
    } 
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z'); 
  } 
 
  getSigningKey(credentials, date, region, service) { 
    // const credsIdentifier = crypto.hmac(credentials.secretAccessKey, 
credentials.accessKeyId, 'base64'); 
    // const cacheKey = [credsIdentifier, date, region, service].join('_'); 
 
    const kDate = util.crypto.hmac( 
      `${this.constant.kDatePrefix}${credentials.secretAccessKey}`, 
      date 
    ); 
    // debugger; 
    const kRegion = util.crypto.hmac(kDate, region); 
    const kService = util.crypto.hmac(kRegion, service); 
 
    const signingKey = util.crypto.hmac(kService, this.constant.v4Identifier); 
 
    return signingKey; 
  } 
 
  createScope(date, region, serviceName) { 
    return [ 
      date.substr(0, 8), 
      region, 
      serviceName, 
      this.constant.v4Identifier, 
    ].join('/'); 
  } 
} 
 
/** 
 * 获取值  ⽀持变量语法 
 * @param {string} value  
 * @returns  
 */ 
246
247
248
249
250
251
252
253
254
255
256
257
258
259
260
261
262
263
264
265
266
267
268
269
270
271
272
273
274
275
276
277
278
279
280
281
282
283
284
285
286
287
288
289
290
291

## 第 12 页

function getValue(value = '') { 
  const variableKeyMatch = value.match(/^\{\{(.+?)\}\}$/); 
  const variableKey = variableKeyMatch && variableKeyMatch[1]; 
  if (variableKey) { 
    return pm.environment.get(variableKey) || value; 
  } else { 
    return value; 
  } 
} 
 
/** 
 * 将 postman 的 kv list转换为map 并过滤 disabled 参数 
 * @param {*} list  
 * @returns  
 */ 
function getMap(list) { 
  const map = {}; 
  list.forEach((item) => { 
    if (!item.disabled) { 
      const value = typeof item.value === 'string' ? getValue(item.value) : ''; 
      // 重复 query 处理 
      if (map[item.key]) { 
        map[item.key] = Array.isArray(map[item.key]) 
          ? [...map[item.key], value] 
          : [map[item.key], value]; 
      } else map[item.key] = value; 
    } 
  }); 
  return map; 
} 
// 获取转换后的 headers 和 params 
const headers = getMap(pm.request.headers.all()); 
const params = getMap(pm.request.url.query.all()); 
 
// 从 headers 中解析出签名所需参数 
const { 
  AccessKey, 
  SecretKey, 
  ServiceName, 
  Region = 'cn-north-1', 
  isVolcEngine = 'true', 
  'X-Security-Token': sessionToken, 
} = headers; 
 
// 经过处理的 header 不再透传 
const handleKeys = [ 
  'AccessKey', 
292
293
294
295
296
297
298
299
300
301
302
303
304
305
306
307
308
309
310
311
312
313
314
315
316
317
318
319
320
321
322
323
324
325
326
327
328
329
330
331
332
333
334
335
336
337
338

## 第 13 页

'SecretKey', 
  'ServiceName', 
  'Region', 
  'isVolcEngine', 
  'X-Security-Token', 
]; 
handleKeys.forEach((key) => { 
  delete headers[key]; 
  pm.request.headers.remove(key); 
}); 
 
// 构造签名对象 
const signObj = { 
  region: Region, 
  headers: {}, // 默认不签名⽤⼾传递的 headers 防⽌ tlb 改 header 导致的签名错误  本代码⽤
于开发⾃测  这部分安全性可以忽略 
  params, 
  method: pm.request.method, 
  pathname: '/' + (pm.request.url.path ? pm.request.url.path.join('/') : ''), 
}; 
 
// 串化各种情况下的 body 
if (pm.request.body) { 
  switch (pm.request.body.mode) { 
    case 'raw': 
      signObj.body = pm.request.body.raw; 
      break; 
    case 'urlencoded': 
      const bodys = getMap(pm.request.body.urlencoded.all()); 
      signObj.body = queryParamsToString(bodys, false); 
      break; 
    case 'formdata': { 
      const enableBodys = pm.request.body.formdata.filter( 
        (item) => !item.disabled 
      ); 
      if (enableBodys.length === 0) { 
        break; 
      } 
      // ⾃⼰⽣成 boundary 
      const boundary = `--------------------------${Date.now()}`; 
      pm.request.headers.add({ 
        key: 'Content-Type', 
        value: `multipart/form-data; boundary=${boundary}`, 
      }); 
      signObj.body = `--${boundary}\r\n${enableBodys 
        .map( 
          (item) => 
339
340
341
342
343
344
345
346
347
348
349
350
351
352
353
354
355
356
357
358
359
360
361
362
363
364
365
366
367
368
369
370
371
372
373
374
375
376
377
378
379
380
381
382
383
384

## 第 14 页

`Content-Disposition: form-data; name="${ 
              item.key 
            }"\r\n\r\n${getValue(item.value)}\r\n` 
        ) 
        .join(`--${boundary}\r\n`)}--${boundary}--\r\n`; 
      break; 
    } 
    default: 
      break; 
  } 
} 
 
// 执⾏签名 
const signer = new AWSSignersV4(signObj, ServiceName, { 
  isVolcengine: isVolcEngine !== 'false', 
}); 
signer.addAuthorization({ 
  accessKeyId: AccessKey, 
  secretAccessKey: SecretKey, 
  sessionToken, 
}); 
 
// 将签名后的 headers 注⼊到请求的 headers 中 
Object.keys(signer.request.headers).forEach((key) => { 
  pm.request.headers.add({ 
    key, 
    value: signer.request.headers[key], 
  }); 
}); 
 
// 对 query 做 encode 处理  同时通过 queryParamsToString 保证签名时的 querystring 与发送出请
求的⼀致 
if (pm.request.url.query) { 
  pm.request.url.query = queryParamsToString(params); 
} 
 
// 构造 curl 命令  ⽤于⾃⾏ debug 
try { 
  function getCurlBodyString(body) { 
    if (!body) return ''; 
    switch (body.mode) { 
      case 'raw': 
        return `--header 'Content-Type: application/json' \\ 
--data-raw '${body.raw}'`; 
      case 'urlencoded': 
        const bodys = getMap(body.urlencoded.all()); 
        const bodyString = queryParamsToString(bodys, false); 
385
386
387
388
389
390
391
392
393
394
395
396
397
398
399
400
401
402
403
404
405
406
407
408
409
410
411
412
413
414
415
416
417
418
419
420
421
422
423
424
425
426
427
428
429
430

## 第 15 页

return `--header 'Content-Type: application/x-www-form-urlencoded' \\ 
${bodyString 
  .split('&') 
  .map((v) => `--data-urlencode '${v}'`) 
  .join(' \\\n')}`; 
      case 'formdata': { 
        // formdata 怎么 curl 还没想明⽩ 
        throw new Error('can not generate curl of formdata'); 
      } 
      default: 
        break; 
    } 
  } 
  const headerString = pm.request.headers 
    .toString() 
    .split('\n') 
    .map((line) => `--header '${line}'`) 
    .join(' \\\n'); 
  const bodyString = getCurlBodyString(pm.request.body); 
  const url = `${pm.request.url.protocol}://${pm.request.url.host.join('.')}${ 
    pm.request.path ? pm.request.path.join('/') : '/' 
  }?${pm.request.url.query}`; 
  // 打印出 curl 请求 
  console.log( 
    [ 
      `curl --location --request ${pm.request.method} '${url}'`, 
      headerString, 
      bodyString, 
    ] 
      .filter((v) => !!v) 
      .join(' \\\n') 
  ); 
} catch (e) { 
  console.log(e); 
} 
具体Postm an⽰例参考各个接⼝提供的⽂档。
5.2.2 J ava代码⽰例
推荐通过M aven依赖使⽤⽕⼭引擎SDK forJ ava：详情⻅：⽕⼭引擎SDK forJ ava
代码块
<dependency> 
    <groupId>org.apache.httpcomponents</groupId> 
    <artifactId>httpclient</artifactId> 
431
432
433
434
435
436
437
438
439
440
441
442
443
444
445
446
447
448
449
450
451
452
453
454
455
456
457
458
459
460
461
462
463
464
465
1
2
3

## 第 16 页

<version>4.5.8</version> 
</dependency> 
<dependency> 
    <groupId>com.volcengine</groupId> 
    <artifactId>volc-sdk-java</artifactId> 
    <version>1.0.49</version> 
</dependency> 
代码块
package com.example; 
 
import com.volcengine.auth.ISignerV4; 
import com.volcengine.auth.impl.SignerV4Impl; 
import com.volcengine.model.Credentials; 
import com.volcengine.service.SignableRequest; 
import org.apache.http.HttpEntity; 
import org.apache.http.HttpResponse; 
import org.apache.http.client.config.RequestConfig; 
import org.apache.http.client.utils.URIBuilder; 
import org.apache.http.entity.ByteArrayEntity; 
import org.apache.http.entity.ContentType; 
import org.apache.http.client.HttpClient; 
import org.apache.http.impl.client.HttpClientBuilder; 
import org.apache.http.util.Asserts; 
import org.apache.http.util.EntityUtils; 
 
public class RequestHandler { 
 
    private ISignerV4 singer; 
    private Credentials credentials = new Credentials(); 
    private HttpClient httpClient; 
    private String url; 
 
    public void GenRequest(String ak, String sk, String host, String action, 
String version) { 
        singer = new SignerV4Impl(); 
        RequestConfig requestConfig = 
RequestConfig.custom().setConnectionRequestTimeout(1000) 
                .setSocketTimeout(3000).setConnectTimeout(1000).build(); 
        httpClient = 
HttpClientBuilder.create().setDefaultRequestConfig(requestConfig).build(); 
 
        credentials.setAccessKeyID(ak); 
4
5
6
7
8
9
10
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31

## 第 17 页

credentials.setSecretAccessKey(sk); 
        credentials.setRegion("cn-north-1"); 
        credentials.setService("app"); 
 
        url = host + "/?Action=" + action + "&Version=" + version; 
    } 
 
    // 请求数据 
    public void sendByteData(byte[] data) throws Exception { 
        send(data, ContentType.APPLICATION_JSON); 
    } 
 
    private void send(byte[] data, ContentType contentType) throws Exception { 
        SignableRequest signableRequest; 
        signableRequest = new SignableRequest(); 
        signableRequest.setMethod("POST"); 
        URIBuilder uriBuilder = new URIBuilder(url); 
 
        signableRequest.setHeader("Content-Type", contentType.getMimeType()); 
 
        signableRequest.setEntity(new ByteArrayEntity(data, contentType)); 
        signableRequest.setUriBuilder(uriBuilder); 
        signableRequest.setURI(uriBuilder.build()); 
 
        singer.sign(signableRequest, credentials); 
 
        Asserts.notNull(signableRequest, "signableRequest can not null"); 
 
        HttpResponse response = httpClient.execute(signableRequest); 
 
        if (response.getStatusLine().getStatusCode() != 200) { 
            throw new Exception("http status code error"); 
        } 
 
        HttpEntity respEntity = response.getEntity(); 
        byte[] content = EntityUtils.toByteArray(respEntity); 
 
        String answer = new String(content, "UTF-8"); 
        System.out.println(answer); 
    } 
 
    public static void main(String[] args) throws Exception { 
        RequestHandler h = new RequestHandler(); 
 
        // TOP Host 获取可以咨询交付同学 
        h.GenRequest("${AK}", "${SK}", "${TOP Host}", "${Action}", 
"${Version}"); 
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77

## 第 18 页

h.sendByteData("{\"TenantID\":\"1000000000\"}".getBytes()); 
    } 
} 
更多代码⽰例参考： HiAgent平台API调⽤⽰例（适⽤于V1.4.x及以后版本）
78
79
80
81
