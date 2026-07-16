[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root '.data'
$vendor = Join-Path $data 'vendor\coze-studio'
$revision = '72cecff858a5a18662c5d9d1a4764c53ebc98317'
$sourceUrl = 'https://github.com/coze-dev/coze-studio.git'
$runtimeEnv = Join-Path $data 'runtime.env'
$cozeEnv = Join-Path $vendor 'docker\.env'
$cozeEnvExample = Join-Path $vendor 'docker\.env.example'

function New-RandomValue([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($buffer)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Set-ExportValue([System.Collections.Generic.List[string]]$Lines, [string]$Name, [string]$Value) {
  $pattern = '^\s*export\s+' + [Regex]::Escape($Name) + '='
  $replacement = 'export ' + $Name + '="' + $Value.Replace('"', '') + '"'
  for ($index = 0; $index -lt $Lines.Count; $index++) {
    if ($Lines[$index] -match $pattern) {
      $Lines[$index] = $replacement
      return
    }
  }
  $Lines.Add($replacement)
}

New-Item -ItemType Directory -Path $data -Force | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $vendor '.git') -PathType Container)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $vendor) -Force | Out-Null
  git clone --filter=blob:none --no-checkout --config core.longpaths=true $sourceUrl $vendor | Out-Null
}

git -C $vendor config core.longpaths true
git -C $vendor fetch --depth 1 origin $revision | Out-Null
git -C $vendor checkout --detach $revision | Out-Null
$actualRevision = (git -C $vendor rev-parse HEAD).Trim()
if ($actualRevision -ne $revision) { throw 'Coze Studio source revision mismatch.' }

if (-not (Test-Path -LiteralPath $runtimeEnv -PathType Leaf)) {
  $token = New-RandomValue 48
  [System.IO.File]::WriteAllText($runtimeEnv, ('HENGZHUN_CONFORMANCE_TOKEN=' + $token + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $cozeEnv -PathType Leaf)) {
  if (-not (Test-Path -LiteralPath $cozeEnvExample -PathType Leaf)) { throw 'Coze Studio environment template is missing.' }
  $lines = [System.Collections.Generic.List[string]]::new()
  Get-Content -LiteralPath $cozeEnvExample -Encoding UTF8 | ForEach-Object { $lines.Add($_) }

  Set-ExportValue $lines 'MYSQL_ROOT_PASSWORD' (New-RandomValue 36)
  Set-ExportValue $lines 'MYSQL_PASSWORD' (New-RandomValue 36)
  Set-ExportValue $lines 'MINIO_ROOT_USER' ('hz' + (New-RandomValue 12))
  Set-ExportValue $lines 'MINIO_ROOT_PASSWORD' (New-RandomValue 36)
  Set-ExportValue $lines 'REDIS_PASSWORD' (New-RandomValue 36)
  Set-ExportValue $lines 'ALLOW_EMPTY_PASSWORD' 'no'
  Set-ExportValue $lines 'DISABLE_USER_REGISTRATION' 'false'
  Set-ExportValue $lines 'SERVER_HOST' 'http://127.0.0.1:8888'
  Set-ExportValue $lines 'WEB_LISTEN_ADDR' '127.0.0.1:8888'
  Set-ExportValue $lines 'EMBEDDING_TYPE' 'http'
  Set-ExportValue $lines 'HTTP_EMBEDDING_ADDR' 'http://hengzhun-conformance:18787'
  Set-ExportValue $lines 'HTTP_EMBEDDING_DIMS' '64'
  Set-ExportValue $lines 'MODEL_PROTOCOL_0' 'openai'
  Set-ExportValue $lines 'MODEL_OPENCOZE_ID_0' '100001'
  Set-ExportValue $lines 'MODEL_NAME_0' '衡准 I1 机械链路模型'
  Set-ExportValue $lines 'MODEL_ID_0' 'gpt-4o-mini-2024-07-18'
  Set-ExportValue $lines 'MODEL_API_KEY_0' 'local-i1-mechanical-nonsecret'
  Set-ExportValue $lines 'MODEL_BASE_URL_0' 'http://hengzhun-conformance:18787/v1'
  Set-ExportValue $lines 'CODE_RUNNER_ALLOW_ENV' ''
  Set-ExportValue $lines 'CODE_RUNNER_ALLOW_READ' ''
  Set-ExportValue $lines 'CODE_RUNNER_ALLOW_WRITE' ''
  Set-ExportValue $lines 'CODE_RUNNER_ALLOW_RUN' ''
  Set-ExportValue $lines 'CODE_RUNNER_ALLOW_NET' ''
  Set-ExportValue $lines 'CODE_RUNNER_ALLOW_FFI' ''
  [System.IO.File]::WriteAllLines($cozeEnv, $lines, [System.Text.UTF8Encoding]::new($false))
}

& (Join-Path $PSScriptRoot 'package-skills.ps1') | Out-Null
[ordered]@{ status = 'READY'; cozeRevision = $actualRevision; secrets = 'generated-or-preserved-without-output' } |
  ConvertTo-Json -Compress
