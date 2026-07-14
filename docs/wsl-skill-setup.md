# WSL 侧 OpenCode Skill 库复刻指南

## 当前 Windows 侧布局

```
~/code/opencode-power-pack/          # git clone 的源仓库
  skills/                             # 11 个 SKILL.md 目录
    agents-md-improver/SKILL.md
    agents-md-revise/SKILL.md
    code-architect/SKILL.md
    code-explorer/SKILL.md
    code-review/SKILL.md
    code-reviewer/SKILL.md
    feature-dev/SKILL.md
    frontend-design/SKILL.md
    mcp-builder/SKILL.md
    security-review/SKILL.md
    skill-creator/SKILL.md
  commands/                           # 11 个斜杠命令 .md（已汉化 description）

~/.config/opencode/
  opencode.json                       # 插件配置（含 plugin 数组）
  commands/                           # 复制的斜杠命令文件

~/.local/bin/agnix                   # agnix CLI 二进制（v0.37.5）

~/.agents/skills/                    # arkcli 系统自带 skills（25 个）
~/.claude/skills/                     # 同上副本
```

## WSL 侧复刻步骤

### 1. 安装 opencode-power-pack 插件

```bash
# 编辑 WSL 侧 opencode 配置
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/opencode.json << 'PATCH'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-power-pack@git+https://github.com/waybarrios/opencode-power-pack.git",
    "agentsys"
  ]
}
PATCH
# 如果已有 opencode.json，只需把 plugin 数组合并进去
```

### 2. 克隆仓库并链接斜杠命令

```bash
# 克隆
git clone https://github.com/waybarrios/opencode-power-pack.git ~/code/opencode-power-pack

# 复制汉化后的命令文件（从 Windows 侧跨拷，或直接用原版后自行汉化）
mkdir -p ~/.config/opencode/commands
cp ~/code/opencode-power-pack/commands/*.md ~/.config/opencode/commands/

# 如需汉化 description，逐个编辑 frontmatter：
# sed -i 's/^description:.*/description: 你的中文描述/' ~/.config/opencode/commands/code-review.md
```

### 3. 安装 agnix CLI

```bash
# 方式 A：直接用 Windows 侧的二进制（通过 WSL 互操作）
# agnix.exe 在 PATH 中可直接调用，但路径检查可能不兼容

# 方式 B：下载 Linux 二进制（推荐）
curl -L -o /tmp/agnix.tar.gz \
  https://github.com/agent-sh/agnix/releases/latest/download/agnix-x86_64-unknown-linux-musl.tar.gz
tar -xzf /tmp/agnix.tar.gz -C ~/.local/bin/
chmod +x ~/.local/bin/agnix
agnix --version
```

### 4. 汉化斜杠命令描述（11 个）

在 WSL 中执行以下脚本，批量替换 description 为中文：

```bash
declare -A descs=(
  ["agents-md-improver"]="审计并改进 AGENTS.md / CLAUDE.md 项目规则文件"
  ["agents-md-revise"]="将会话经验保存到 AGENTS.md / CLAUDE.md 项目记忆"
  ["code-architect"]="设计功能架构，输出实现蓝图（文件/组件/数据流/构建顺序）"
  ["code-explorer"]="深度分析代码库功能实现（追踪执行路径/映射架构层次）"
  ["code-review"]="审查 PR 或代码变更中的 bug、逻辑错误和规范违规"
  ["code-reviewer"]="审查代码 bug、安全漏洞和质量问题（置信度过滤）"
  ["feature-dev"]="引导式七阶段功能开发工作流"
  ["frontend-design"]="生成高质量前端界面（避免通用 AI 风格，自检可访问性）"
  ["mcp-builder"]="引导构建高质量 MCP 服务器（Python 或 TypeScript）"
  ["security-review"]="安全审查待提交变更中的真实可利用漏洞"
  ["skill-creator"]="创建和改进 SKILL.md 技能文件"
)

for cmd in "${!descs[@]}"; do
  file="$HOME/.config/opencode/commands/${cmd}.md"
  if [ -f "$file" ]; then
    desc="${descs[$cmd]}"
    # 替换 description 行
    sed -i "s/^description:.*/description: ${desc}/" "$file"
    echo "OK: $cmd -> $desc"
  fi
done
```

### 5. 验证

```bash
# 检查命令文件
ls ~/.config/opencode/commands/

# 检查插件配置
cat ~/.config/opencode/opencode.json | grep -A5 plugin

# 检查 agnix
agnix --version

# 重启 opencode 后在 TUI 中验证
# 按 Ctrl+P 打开命令面板，应看到 11 个斜杠命令
```

## 注意事项

- WSL 的 `~` 对应 `/home/<username>`，不是 `/mnt/c/Users/<username>`
- 如果 WSL 和 Windows 共享同一项目目录（`/mnt/d/Agent/banksystem`），只需在 WSL 侧配置 opencode 即可，项目文件无需复制
- agnix 在 WSL 中应使用 Linux 二进制（musl 静态链接），不要用 Windows exe
- opencode-power-pack 的 skills 目录由插件自动注册，无需手动复制到 `~/.config/opencode/skills/`
