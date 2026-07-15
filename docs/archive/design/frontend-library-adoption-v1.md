# 前端设计资料库接入基线

## 目的

“复兴”智能数字银行与“衡准”自动化回归测试平台将本机资料库
`D:\Agent\frontend-design-guidelines` 作为前端重构的设计参考来源。
该资料库用于形成项目自身的设计约束，不能直接替代项目组件库、品牌系统或业务需求。

## 采用范围

- `design-md/ibm`：企业级信息层级、可访问性、数据密集工作台的表达原则。
- `design-md/mastercard`、`design-md/wise`、`design-md/revolut`：金融产品的信息优先级、交易状态与任务流参考。
- `design-md/airtable`、`design-md/linear.app`：运营工作台的表格、筛选、密度和反馈模式参考。
- `_repositories/shadcn-ui/`：仅作为 React 组件组合、无障碍和实现模式参考。

不得复制任何参考品牌的名称、商标、Logo、专有插画、页面截图或完整视觉识别。项目最终视觉以“复兴/衡准”的红、白、黑严肃金融风格为准。

## 技术接入规则

- 既有 Customer Portal 与 Operations Console 继续以 React、TypeScript、Vite 和 Ant Design 为唯一主组件实现库。
- 不在现有 Ant Design 应用中同时引入 shadcn/ui 或 Tailwind 作为第二套基础组件体系；确有新平台独立需求时，须单独 ADR 决定。
- 不把绝对本机路径、参考库源码或其工作树写入 Docker 镜像、发布产物或运行时依赖。
- 在 `platform/` 建立品牌 Token、语义颜色、排版、间距、状态色、表格密度和可访问性规则；页面只消费项目 Token，不消费参考库路径。
- 所有可交互元素必须保留语义标签、键盘访问、可见焦点与稳定 `data-testid`，以服务 Playwright/Midscene 的后续验收。

## B0 交付与验收

1. 新增项目专属 `frontend-design-system.md` 与品牌 Token 配置骨架。
2. 建立“复兴/衡准”术语映射，并在 Quality Case Portal 骨架、演示标题和报告模板中加载。
3. 为客户门户和运营控制台输出组件迁移清单；不在 B0 改动既有业务流程、API、路由或服务名。
4. 通过 TypeScript strict、Ant Design 主题加载、键盘导航样例和稳定测试标识检查。

## 许可与溯源

本机资料库根目录标注 MIT 许可；如后续复制任何可分发代码或资源，必须保留原作者要求的许可与归属声明，并在提交前进行许可证审查。
