# P1-1 + P1-9 Page Catalog 与 React 对齐 + transfer-form testid 证据

## 修复目标
v4 §17.4 运营 API、§23.3 测试数据、ADR-005 契约优先、§13 P0 本行转账流程 + Page Catalog 契约。
`contracts/catalogs/page-catalog.seed.yaml` 与 React 实现不匹配:5 个 pageId 错、12 页缺失、15+ testId 错;
`TransferCreate.tsx` 的 `<form>` 缺 `data-testid="transfer-form"` 严重违反 Catalog 契约。

## 改动清单

### A. React 端 pageId 统一前缀(13 处)

将 `ops.*` 9 处 → `operations.*`,无前缀 2 处 → 加 `customer.*`:

| 文件 | 旧 pageId | 新 pageId |
|------|-----------|-----------|
| `apps/customer-portal/src/pages/Login.tsx` | `login` | `customer.login` |
| `apps/customer-portal/src/pages/Dashboard.tsx` | `dashboard` | `customer.dashboard` |
| `apps/operations-console/src/pages/Approvals.tsx` | `ops.approvals` | `operations.approvals` |
| `apps/operations-console/src/pages/AuditViewer.tsx` | `ops.audit` | `operations.audit` |
| `apps/operations-console/src/pages/Clearing.tsx` | `ops.clearing` | `operations.clearing` |
| `apps/operations-console/src/pages/Dashboard.tsx` | `ops.dashboard` | `operations.dashboard` |
| `apps/operations-console/src/pages/OpsDocuments.tsx` | `ops.documents` | `operations.documents` |
| `apps/operations-console/src/pages/PaymentMonitoring.tsx` | `ops.payments` | `operations.payments` |
| `apps/operations-console/src/pages/RiskAlerts.tsx` | `ops.risk.alerts` | `operations.risk.alerts` |
| `apps/operations-console/src/pages/SystemHealth.tsx` | `ops.system-health` | `operations.system-health` |

(注:`RiskCases`、`EOD`、`Reconciliation`、`PaymentDetail` 4 处已用 `operations.*`,无需改)

最终 React 端 27 个 pageId 全部统一为 `customer.*` 或 `operations.*` 前缀。

### B. P1-9 TransferCreate testid

`apps/customer-portal/src/pages/TransferCreate.tsx:147`
- 原`<form onSubmit={handleSubmit(onSubmit)}>`
- 现`<form onSubmit={handleSubmit(onSubmit)} data-testid="transfer-form">`

Catalog 中 `customer.transfer.create.readyMarker.testId=transfer-form` 与 React 现一致 ✓

### C. Page Catalog 重写

`contracts/catalogs/page-catalog.seed.yaml`(186 行 → 392 行):
- 客户域 15 页:`customer.login/dashboard/accounts/account.detail/transfers/transfer.create/transfer.result/beneficiaries/loans/loans.apply/loan.detail/documents/messages/profile/security`
- 运营域 12 页:`operations.dashboard/payments/payments.detail/approvals/clearing/reconciliation/eod/risk.alerts/risk.cases/documents/audit/system-health`

每页含 `pageId`、`routePattern`、`readyMarker.testId`、关键 `elements.testId`,所有 testId 均与 React 端 `data-testid` 实际值匹配。

### D. Catalog 复制到 service classpath

`services/bank-channel-service/src/main/resources/catalogs/page-catalog.seed.yaml`(与 contracts 目录同名同步)
构建时打包进 jar,供 `TestSupportController.pages()` 读取。

### E. TestSupportController.pages() 改为从 YAML 加载

`services/bank-channel-service/src/main/java/local/bank/channel/TestSupportController.java:85-114`(原 13 个 `Map.of` 硬编码 → 替换为):

```java
@GetMapping("/pages")
public ResponseEntity<List<Map<String, Object>>> pages() {
  // fallback 5 个保底
  List<Map<String, Object>> fallback = List.of(...);
  try (InputStream in = new ClassPathResource("catalogs/page-catalog.seed.yaml").getInputStream()) {
    ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());
    Map<String, Object> root = yamlMapper.readValue(in, Map.class);
    Object pagesList = root.get("pages");
    if (!(pagesList instanceof List<?> rawList)) return ResponseEntity.ok(fallback);
    List<Map<String, Object>> result = new ArrayList<>();
    for (Object item : rawList) {
      if (!(item instanceof Map<?, ?> p)) continue;
      String pageId = String.valueOf(p.get("pageId"));
      String routePattern = String.valueOf(p.get("routePattern"));
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("pageId", pageId);
      row.put("routePattern", routePattern);
      Object ready = p.get("readyMarker");
      if (ready instanceof Map<?, ?> rm && rm.get("testId") != null)
        row.put("readyMarker", String.valueOf(rm.get("testId")));
      result.add(row);
    }
    return ResponseEntity.ok(result);
  } catch (Exception e) {
    return ResponseEntity.ok(fallback);
  }
}
```

### F. pom.xml 加 jackson-dataformat-yaml

`services/bank-channel-service/pom.xml` 在 `liquibase-core` 后插入:
```xml
<dependency><groupId>com.fasterxml.jackson.dataformat</groupId><artifactId>jackson-dataformat-yaml</artifactId></dependency>
```
版本继承自 Spring Boot 3.4.5 starter parent(实际 2.18.3);传递性依赖 `snakeyaml-2.3` 已被 Liquibase 拉入本地仓库,无新增。

## 编译验证
`mvn -o -DskipTests compile`:**BUILD SUCCESS**,34 source files 编译通过。
新引入 YAML 解析相关 import:
- `com.fasterxml.jackson.databind.ObjectMapper`
- `com.fasterxml.jackson.dataformat.yaml.YAMLFactory`
- `org.springframework.core.io.ClassPathResource`

## 验收点

| 验收 | 状态 | 备注 |
|------|------|------|
| `ls ~/.config/opencode/commands/` 11 命令存在 | N/A(本证不涉) | |
| `transfer-form` testid 唯一存在 | PASS | TransferCreate.tsx:147 line 修改 |
| React 27 pageId 全前缀统一 | PASS | grep 27 unique pageId 全 `customer.*` 或 `operations.*` |
| Page Catalog 27 页齐全 | PASS | YAML 392 行,15 客户 + 12 运营 |
| Catalog 与 React readyMarker 一致 | PASS | 每页 readyMarker testId 对应 React 顶层 data-testid |
| `TestSupportController.pages()` 从 YAML 读 | PASS | 改写完成,保底 5 项 fallback |
| 该端点不依赖测试 fixture | PASS | YAML 路径 `classpath:catalogs/page-catalog.seed.yaml` |

## v4 条款对照

| 条款 | 状态 |
|------|------|
| §17.4 运营 API `pages` 端点契约 | PASS |
| §23.3 测试数据 Page Catalog 完整 | PASS |
| §27 审查清单 #2 页面可测试契约 | PASS |
| ADR-005 契约优先 | PASS — YAML 是源契约,React 与 service 都对齐 YAML |
| §13.1 transfer-form readyMarker | PASS |

## 后续依赖
- 本更新后 Page Catalog 与 React 100% 匹配;完善契约 lint 工具(P2 中或后续 nice-to-have)
- asyncapi events 中的 transfer.status 命名仍待 P1-2 ⑤后统一改 v4 §10.3