# 固定运行时

本目录保存产品内固定 Node.js 20.20.2、Playwright 1.59.1、Midscene 1.10.5、Chromium 1217 与 FFmpeg 1011 的本机副本。二进制和依赖由 `.gitignore` 排除，不作为源码提交。

`verify-runtime.cmd` 只做版本、文件和 Chromium 启动校验，不安装、不下载、不修改系统环境。
