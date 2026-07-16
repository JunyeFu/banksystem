[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'coze\skills\i1-conformance-skill'
$outputDirectory = Join-Path $root 'coze\packages'
$zipPath = Join-Path $outputDirectory 'hengzhun-i1-conformance.zip'
$skillPath = Join-Path $outputDirectory 'hengzhun-i1-conformance.skill'

if (-not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md') -PathType Leaf)) {
  throw 'Skill source is incomplete.'
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $skillPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $source '*') -DestinationPath $zipPath -CompressionLevel Optimal
Move-Item -LiteralPath $zipPath -Destination $skillPath

$hash = (Get-FileHash -LiteralPath $skillPath -Algorithm SHA256).Hash.ToLowerInvariant()
$size = (Get-Item -LiteralPath $skillPath).Length
if ($size -gt 10MB) { throw 'Generated Skill package exceeds the HiAgent 10 MiB limit.' }

[ordered]@{ status = 'READY'; path = 'coze/packages/hengzhun-i1-conformance.skill'; bytes = $size; sha256 = $hash } |
  ConvertTo-Json -Compress
