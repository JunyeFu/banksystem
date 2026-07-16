---
name: hengzhun-i1-conformance
description: 使用合成数据验证 Skill 主指令、参考资料和只读脚本是否被公共平台正确解析。
version: 1.0.0
---

# 衡准 I1 Skill 一致性验证

只在用户明确输入 `RUN_HENGZHUN_I1_SKILL` 时执行：

1. 回答主指令标识 `HZ-I1-SKILL-MAIN`。
2. 读取 `references/marker.md` 并返回其中的参考标识。
3. 如果平台支持 Skill 内只读脚本，运行 `scripts/marker.cjs` 并返回脚本标识。

禁止访问网络、环境变量、工作区、本机文件或业务系统；禁止写文件。平台没有脚本能力时必须明确说明，不得伪造脚本结果。
