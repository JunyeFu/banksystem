# 产品脚本

所有准备、启动、停止、验证和离线打包命令必须从产品目录执行。脚本不得输出 `.env`、Token、Cookie、Storage State 或真实个人信息。

- `npm run prepare:i2`：建立 `.data/sqlite`、备份、Artifact、Evidence 和日志目录，生成或保留机器本地服务令牌但不输出其值。
- `npm run start:i2`：启动内部 Harness、一致性服务和本机 Coze Studio。
- `npm run stop:i2`：只停止衡准产品服务，不删除数据库或制品。
- `npm run verify:i2`：编译并执行 OpenAPI、SQLite、安全、七工具和输出预算测试，再做生产依赖审计。
- `verify.cmd`：执行 I1 + I2 的完整静态门禁。
