param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '../../docs/baseline/swagger-original.json')
)

$ErrorActionPreference = 'Stop'
$config = Invoke-RestMethod -Uri 'http://127.0.0.1:13000/fineract-provider/api-docs/swagger-config' -TimeoutSec 20
$uri = "http://127.0.0.1:13000$($config.url)"
Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $OutputPath -TimeoutSec 60
$document = Get-Content -LiteralPath $OutputPath -Raw | ConvertFrom-Json
if (-not $document.swagger -and -not $document.openapi) { throw 'Downloaded document is not an OpenAPI document.' }
Write-Output "exported=$uri paths=$($document.paths.psobject.Properties.Count)"
