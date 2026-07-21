[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Candidate,
    [ValidateSet('current-clean-directory', 'second-computer')][string]$MachineRole = 'current-clean-directory',
    [switch]$RunAcceptance
)
$ErrorActionPreference = 'Stop'
$candidateRoot = (Resolve-Path -LiteralPath $Candidate).Path
$node = Join-Path $candidateRoot 'runtime\node-v20.20.2-win-x64\node.exe'
& $node (Join-Path $candidateRoot 'scripts\i9-stage8-portable.cjs') verify --candidate $candidateRoot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($RunAcceptance) {
    & $node (Join-Path $candidateRoot 'scripts\i9-stage8-machine-acceptance.cjs') --role $MachineRole
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Output 'HENGZHUN_I9_STAGE8_PORTABLE_CANDIDATE_VERIFIED'
