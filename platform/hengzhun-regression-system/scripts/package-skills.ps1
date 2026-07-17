[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $root 'coze\packages'
$skills = @(
  @{ Name = 'normalize-regression-request'; File = 'hengzhun-normalize-regression-request.skill' },
  @{ Name = 'choose-execution-route'; File = 'hengzhun-choose-execution-route.skill' },
  @{ Name = 'explain-regression-result'; File = 'hengzhun-explain-regression-result.skill' }
)

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$results = @()
foreach ($skill in $skills) {
  $source = Join-Path $root ('coze\skills\' + $skill.Name)
  if (-not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md') -PathType Leaf)) {
    throw "Skill source is incomplete: $($skill.Name)"
  }
  $zipPath = Join-Path $outputDirectory ($skill.File + '.zip')
  $skillPath = Join-Path $outputDirectory $skill.File
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $skillPath -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path (Join-Path $source '*') -DestinationPath $zipPath -CompressionLevel Optimal
  Move-Item -LiteralPath $zipPath -Destination $skillPath
  $size = (Get-Item -LiteralPath $skillPath).Length
  if ($size -gt 10MB) { throw "Generated Skill package exceeds 10 MiB: $($skill.Name)" }
  $stream = [System.IO.File]::OpenRead($skillPath)
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
  } finally { $stream.Dispose() }
  $results += [ordered]@{
    name = $skill.Name
    path = 'coze/packages/' + $skill.File
    bytes = $size
    sha256 = $hash
  }
}

[ordered]@{ status = 'READY'; packages = $results } | ConvertTo-Json -Depth 5 -Compress
