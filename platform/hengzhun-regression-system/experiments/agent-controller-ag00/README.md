# AG-00 isolated agent-controller PoC

This directory is synthetic test infrastructure, not Hengzhun product runtime.

It may import exact pinned LangGraph.js and Deep Agents JS packages, but it must not import or modify Flowise, Harness, MCP, Worker, SQLite, browser, credentials, `.data`, publication or acceptance evidence. The synthetic Harness is the sole state authority. Deep Agents receives no external model, network, shell, host-filesystem, browser, database, credential or mutating tool.

Run with the product-bundled Node runtime:

```powershell
& '..\..\runtime\node-v20.20.2-win-x64\node.exe' --test test\controller.test.mjs
```

Passing tests are CONTRACT/synthetic INTEGRATION evidence only.
