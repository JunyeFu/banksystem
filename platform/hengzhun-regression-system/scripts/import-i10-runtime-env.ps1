[CmdletBinding()]
param()

$root = Split-Path -Parent $PSScriptRoot
$runtimeEnv = Join-Path $root '.data\runtime.env'
$platformAdmin = Join-Path $root 'config\platform-admin.json'

$allowed = @(
    'CONTROL_API_KEY', 'CONTROL_BASE_URL', 'CONTROL_MODEL_NAME',
    'VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL_NAME', 'VISION_MODEL_FAMILY',
    'HENGZHUN_SERVICE_TOKEN', 'HENGZHUN_MCP_TOKEN', 'HENGZHUN_WORKER_TOKEN', 'HENGZHUN_PORTAL_BASE_URL',
    'FLOWISE_API_KEY', 'FLOWISE_ADMIN_EMAIL', 'FLOWISE_ADMIN_PASSWORD', 'FLOWISE_ADMIN_NAME',
    'PLATFORM_ADMIN_EMAIL', 'PLATFORM_ADMIN_PASSWORD', 'PLATFORM_ADMIN_NAME'
)

# Machine-local runtime.env takes precedence when present. Missing values fall
# back to Windows user-scoped environment variables so secrets remain outside
# the repository and portable package.
if (Test-Path -LiteralPath $runtimeEnv -PathType Leaf) {
    Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$' -and $allowed -contains $Matches[1]) {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
        }
    }
}
foreach ($name in $allowed) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
        $userValue = [Environment]::GetEnvironmentVariable($name, 'User')
        if (-not [string]::IsNullOrWhiteSpace($userValue)) {
            [Environment]::SetEnvironmentVariable($name, $userValue, 'Process')
        }
    }
}

# The local Flowise UI identity is a portable product setting, not an LLM or
# banking credential. The tracked config is authoritative on every computer;
# vendor-specific aliases remain process-only implementation details.
if (Test-Path -LiteralPath $platformAdmin -PathType Leaf) {
    $admin = Get-Content -LiteralPath $platformAdmin -Raw -Encoding UTF8 | ConvertFrom-Json
    $env:PLATFORM_ADMIN_EMAIL = [string]$admin.email
    $env:PLATFORM_ADMIN_PASSWORD = [string]$admin.password
    $env:PLATFORM_ADMIN_NAME = [string]$admin.name
    $env:FLOWISE_ADMIN_EMAIL = $env:PLATFORM_ADMIN_EMAIL
    $env:FLOWISE_ADMIN_PASSWORD = $env:PLATFORM_ADMIN_PASSWORD
    $env:FLOWISE_ADMIN_NAME = $env:PLATFORM_ADMIN_NAME
}

# Midscene 1.10.5 consumes these legacy names internally. They are process-only
# aliases; the user-facing and portable configuration contract remains generic.
if ($env:VISION_API_KEY) { $env:MIDSCENE_MODEL_API_KEY = $env:VISION_API_KEY }
if ($env:VISION_BASE_URL) { $env:MIDSCENE_MODEL_BASE_URL = $env:VISION_BASE_URL }
if ($env:VISION_MODEL_NAME) { $env:MIDSCENE_MODEL_NAME = $env:VISION_MODEL_NAME }
if ($env:VISION_MODEL_FAMILY) { $env:MIDSCENE_MODEL_FAMILY = $env:VISION_MODEL_FAMILY }
