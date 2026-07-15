# SSO

> 迁移来源：`raw/SSO.docx`

> 原文含 25 个内嵌图像；完整原件保存在 `raw/`，图像不作 OCR 推断。

SSO

如何对接飞书SSO登录？

飞书开发者平台配置操作

登录飞书开发者平台

https://open.feishu.cn （外网地址，适用于非字节内部人员）

https://open.larkoffice.com（内网地址，适用于字节内部人员）

点击【开发者后台】

点击【创建企业自建应用】

输入【应用名称】和【应用描述】，点击【创建】

选择【网页应用】，点击添加

左边侧边栏选择【网页应用】，桌面端主页填写 HiAgent 地址 http://$IP:32300 ，【打开方式配置】按照自己的喜好选择，点击【保存】

左边侧边栏点击【安全设置】，填写【重定向URL】，点击【添加】

【重定向URL】参考下图中的 RedurectUri

点击【创建版本】，填写【应用版本号】和【更新说明】，【桌面端的默认能力】选择【网页应用】，点击【保存】，成功保存之后点击右上角的【确认发布】

左边侧边栏点击【凭证与基础信息】，获取 App ID（ClientId） 和 App Secret（ClientSecret）

点击【开发文档】-->【开发指南】-->【应用登录与用户授权】-->【网页应用登录】-->【登录流程概述】

点击【接口文档:获取登录授权码code】获取 AuthorizeUri

AuthorizeUri ：

外网/内网：https://accounts.feishu.cn/open-apis/authen/v1/authorize

点击【接口文档:获取user_access_token】获取 TokenUri

TokenUri：

外网：https://open.feishu.cn/open-apis/authen/v2/oauth/token

内网：https://open.larkoffice.com/open-apis/authen/v2/oauth/token

点击【接口文档:获取用户身份信息】获取【用户信息传递方式】等信息

【用户信息获取地址】：

外网：https://open.feishu.cn/open-apis/authen/v1/user_info

内网：https://open.larkoffice.com/open-apis/authen/v1/user_info

从下面【响应体示例】中选择【用户名参数】和【用户显示名参数】，如需展示邮箱和userID等信息，需要在右侧应用【权限配置】中开通对应的权限

配置示例

登录HiAgent平台管理端，点击【第三方认证】-->【SSO配置】-->【创建第三方认证】

配置SSO名称，选择需要配置的租户，第三方认证选择OAuth 2.0 SSO

将从飞书开发者平台获取的信息填入配置中

ClientId 对应 App ID

ClientSecret 对应 App Secret

URL 对应 HiAgent 平台登录地址（http://$IP:32300）

RedirectUri 对应上述步骤7中的 RedurectUri

AuthorizeUri ： https://accounts.feishu.cn/open-apis/authen/v1/authorize

TokenUri：参考上面的获取填写

用户信息获取地址：参考上面的获取填写

用户名参数和用户显示名参数从上方响应体示例中获取

其余参数保持默认

点击提交，SSO状态为启用

联系火山运维同学进行以下操作

修改 configs.yaml 配置文件，将 useSSO 设置为 true

重新部署llmops-base模块

登录 HiAgent 平台，输入租户名称，点击下一步

点击SSO登录，点击授权

登录成功，点击头像显示配置的信息

## 表格 1

- 行 1: Shell { "code": 0, "msg": "success", "data": { #用户中文姓名 "name": "zhangsan", #用户英文姓名 "en_name": "zhangsan", #用户头像的完整 URL 地址 "avatar_url": "www.feishu.cn/avatar/icon", #用户头像缩略图的 URL 地址 "avatar_thumb": "www.feishu.cn/avatar/icon_thumb", #用户头像中等尺寸图片的 URL 地址 "avatar_middle": "www.feishu.cn/avatar/icon_middle", #用户头像大尺寸图片的 URL 地址 "avatar_big": "www.feishu.cn/avatar/icon_big", #飞书开放平台为用户生成的唯一标识，在同一个应用内，每个用户的 open_id 是唯一的。它用于在应用中识别用户，确保用户身份的唯一性 "open_id": "ou-caecc734c2e3328a62489fe0648c4b98779515d3", #在飞书开放平台体系下，union_id是跨应用的用户唯一标识。对于同一个用户，在不同的应用中其 union_id是相同的，方便进行用户身份的统一管理和关联 "union_id": "on-d89jhsdhjsajkda7828enjdj328ydhhw3u43yjhdj", #用户的飞书邮箱地址 "email": "zhangsan@feishu.cn", #用户的企业邮箱地址 "enterprise_email": "demo@mail.com", #飞书系统内部为用户分配的唯一标识 "user_id": "5d9bdxxx", #用户的手机号码 "mobile": "+86130002883xx", #用户所属企业的唯一标识 "tenant_key": "736xxx75d", #用户的员工编号 "employee_no": "111222333" } }

## 表格 2

- 行 1: Shell volcWeb: llmops: #强制SSO登陆功能，控制页面是否强制跳转SSO页面; #设置为true时，前置需要设置useSSO为true,tenantMode为single isForceSSO: false # 全局开启SSO，如果用户端需要用sso，则需要为true useSSO: "true" # 'single' \| 'multiple', 用户端登录方式：单租户、多租户 tenantMode: "multiple" # 打开llmops-base模块开关，其余模块设置为 false modules: - name: llmops-base version: v1.3.0 enable: true

## 表格 3

- 行 1: Bash /vecps/cadm product install --config-file /vecps/configs.yaml --kubeconfig /root/.kube/config
