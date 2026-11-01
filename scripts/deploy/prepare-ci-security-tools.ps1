[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [ValidateSet('gitleaks','syft','osv-scanner')][string[]]$Tools = @('gitleaks','syft','osv-scanner')
)
$ErrorActionPreference = 'Stop'
$output = [IO.Path]::GetFullPath($OutputPath)
if (($output -split '[\\/]') -notcontains 'banksystem-rf065' -or (Test-Path -LiteralPath $output)) { throw 'CI_SECURITY_OWNED_NEW_OUTPUT_REQUIRED' }
$platform = if ($IsWindows) { 'windows' } elseif ($IsLinux) { 'linux' } else { throw 'CI_SECURITY_PLATFORM_UNSUPPORTED' }
$manifest = Get-Content (Join-Path $PSScriptRoot '../test/ci-security-tools.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path $output | Out-Null
$installed = [ordered]@{}
foreach ($name in $Tools) {
  $tool = $manifest.$name
  $asset = $tool.$platform
  $directory = Join-Path $output $name
  New-Item -ItemType Directory -Path $directory | Out-Null
  $download = Join-Path $directory $asset.asset
  $url = "https://github.com/$($tool.repository)/releases/download/v$($tool.version)/$($asset.asset)"
  $curl = if ($IsWindows) { 'curl.exe' } else { 'curl' }
  & $curl --fail --silent --show-error --location --http1.1 --output $download $url
  if ($LASTEXITCODE -ne 0) { throw "CI_SECURITY_TOOL_DOWNLOAD_FAILED:$name" }
  if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256) { throw "CI_SECURITY_TOOL_HASH_MISMATCH:$name" }
  if ($asset.asset.EndsWith('.zip')) { Expand-Archive -LiteralPath $download -DestinationPath $directory }
  elseif ($asset.asset.EndsWith('.tar.gz')) {
    & tar -xzf $download -C $directory
    if ($LASTEXITCODE -ne 0) { throw "CI_SECURITY_TOOL_EXTRACT_FAILED:$name" }
  }
  $executable = Join-Path $directory $asset.executable
  if ($IsLinux) {
    & chmod +x $executable
    if ($LASTEXITCODE -ne 0) { throw "CI_SECURITY_TOOL_MODE_FAILED:$name" }
  }
  [string[]]$versionArguments = if ($name -eq 'osv-scanner') { @('--version') } else { @('version') }
  $version = (& $executable @versionArguments | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $version -notmatch [regex]::Escape($tool.version)) { throw "CI_SECURITY_TOOL_VERSION_MISMATCH:$name" }
  $installed[$name] = @{version=$tool.version;path=$executable;sha256=$asset.sha256;platform=$platform}
  Write-Output "CI_SECURITY_TOOL=$name VERSION=$($tool.version) VERIFIED"
}
$installed | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'toolset.json') -Encoding utf8
