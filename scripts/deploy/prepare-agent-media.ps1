[CmdletBinding()]
param(
    [string]$AgentRoot = (Join-Path $PSScriptRoot '..\..\platform\hengzhun-regression-system'),
    [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
$product = (Resolve-Path -LiteralPath $AgentRoot).Path
$runtime = Join-Path $product 'runtime'
$spec = (Get-Content -LiteralPath (Join-Path $product 'config\demo-runtime-freeze.json') -Raw | ConvertFrom-Json).mediaFfmpeg
$target = Join-Path $runtime $spec.directory
$binary = Join-Path $runtime $spec.executable

function Assert-MediaBinary([string]$Executable) {
    if ((Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant() -ne $spec.executableSha256) { throw 'AGENT_MEDIA_BINARY_HASH_MISMATCH' }
    $version = @(& $Executable -version)
    if ($LASTEXITCODE -ne 0 -or $version[0] -notmatch ('^ffmpeg version ' + [regex]::Escape($spec.version) + '-')) { throw 'AGENT_MEDIA_VERSION_MISMATCH' }
}

if (Test-Path -LiteralPath $target) {
    Assert-MediaBinary $binary
} else {
    $staging = Join-Path $runtime ('.prepare-media-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    try {
        if ($ArchivePath) {
            $archive = (Resolve-Path -LiteralPath $ArchivePath).Path
        } else {
            $archive = Join-Path $staging 'ffmpeg.zip'
            & curl.exe --fail --location --silent --show-error --max-time 300 --output $archive $spec.downloadUrl
            if ($LASTEXITCODE -ne 0) { throw 'AGENT_MEDIA_DOWNLOAD_FAILED' }
        }
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $spec.archiveSha256) { throw 'AGENT_MEDIA_ARCHIVE_HASH_MISMATCH' }
        Expand-Archive -LiteralPath $archive -DestinationPath $staging
        $unpacked = [IO.Path]::GetFullPath((Join-Path $staging $spec.archiveDirectory))
        $resolvedTarget = [IO.Path]::GetFullPath($target)
        if (-not $unpacked.StartsWith([IO.Path]::GetFullPath($staging) + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $resolvedTarget.StartsWith([IO.Path]::GetFullPath($runtime) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'AGENT_MEDIA_MOVE_PATH_INVALID' }
        Assert-MediaBinary (Join-Path $unpacked 'bin\ffmpeg.exe')
        if (-not (Test-Path -LiteralPath (Join-Path $unpacked 'LICENSE') -PathType Leaf)) { throw 'AGENT_MEDIA_LICENSE_MISSING' }
        New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
        Move-Item -LiteralPath $unpacked -Destination $resolvedTarget
    } finally {
        $resolvedStaging = [IO.Path]::GetFullPath($staging)
        if (-not $resolvedStaging.StartsWith([IO.Path]::GetFullPath($runtime) + '\', [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedStaging -Leaf) -notmatch '^\.prepare-media-[a-f0-9]{32}$') { throw 'AGENT_MEDIA_STAGING_PATH_INVALID' }
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
}
Write-Output "AGENT_MEDIA_READY=PASS version=$($spec.version) license=$($spec.license)"
