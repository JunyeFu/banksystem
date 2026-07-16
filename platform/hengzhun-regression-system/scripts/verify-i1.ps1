[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$vendor = Join-Path $root '.data\vendor\coze-studio'
$vendorDocker = Join-Path $vendor 'docker'
$cozeEnv = Join-Path $vendorDocker '.env'
$baseCompose = Join-Path $vendorDocker 'docker-compose.yml'
$overrideCompose = Join-Path $root 'coze\studio\docker-compose.hengzhun.yml'
$runtimeEnv = Join-Path $root '.data\runtime.env'
$expectedRevision = '72cecff858a5a18662c5d9d1a4764c53ebc98317'

function Wait-Container([string]$Name, [int]$Seconds = 360) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    $state = docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $Name 2>$null
    if ($LASTEXITCODE -eq 0 -and ($state -eq 'running|healthy' -or $state -eq 'running|none')) { return }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  throw "Container did not become ready: $Name"
}

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Product-local Node.js is missing.' }
& $node (Join-Path $PSScriptRoot 'verify-structure.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Structure verification failed.' }
& $node (Join-Path $PSScriptRoot 'verify-i1-artifacts.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Artifact verification failed.' }
& $node (Join-Path $PSScriptRoot 'verify-i1-results.cjs')
if ($LASTEXITCODE -ne 0) { throw 'I1 conformance result verification failed.' }
& $node --test (Join-Path $root 'tests\conformance\conformance-server.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Conformance unit tests failed.' }
& (Join-Path $root 'runtime\verify-runtime.cmd')
if ($LASTEXITCODE -ne 0) { throw 'Frozen runtime verification failed.' }
& (Join-Path $PSScriptRoot 'package-skills.ps1') | Out-Null

if (-not (Test-Path -LiteralPath $cozeEnv -PathType Leaf) -or -not (Test-Path -LiteralPath $runtimeEnv -PathType Leaf)) {
  throw 'I1 runtime configuration is not prepared. Run prepare:i1 first.'
}
$actualRevision = (git -C $vendor rev-parse HEAD).Trim()
if ($actualRevision -ne $expectedRevision) { throw 'Coze Studio source revision mismatch.' }

$images = docker compose --env-file $cozeEnv -f $baseCompose -f $overrideCompose config --images
if ($LASTEXITCODE -ne 0) { throw 'Coze Studio Compose configuration is invalid.' }
if (($images | Where-Object { $_ -match ':latest$' }).Count -gt 0) { throw 'Mutable Coze image detected.' }
if (($images | Where-Object { $_ -notmatch '@sha256:[a-f0-9]{64}$' }).Count -gt 0) { throw 'Unpinned Coze image detected.' }

foreach ($container in @('hengzhun-conformance','coze-mysql','coze-redis','coze-elasticsearch','coze-minio','coze-etcd','coze-milvus','coze-nsqlookupd','coze-nsqd','coze-nsqadmin','coze-server','coze-web')) {
  Wait-Container $container
}

$network = docker network inspect hengzhun-control | ConvertFrom-Json
if (-not $network[0].Internal) { throw 'Control network must remain internal.' }
$members = @($network[0].Containers.PSObject.Properties.Value | ForEach-Object Name | Sort-Object)
$expectedMembers = @('coze-server','hengzhun-conformance')
if (($members -join ',') -ne ($expectedMembers -join ',')) {
  throw ('Unexpected control-network members: ' + ($members -join ','))
}

$probe = "const h={authorization:'Bearer '+process.env.HENGZHUN_CONFORMANCE_TOKEN,'x-conformance-id':'docker-probe'};Promise.all([fetch('http://hengzhun-conformance:18787/health'),fetch('http://hengzhun-conformance:18787/v1/echo/network?mode=safe',{headers:h}),fetch('http://hengzhun-conformance:18787/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'I1_CONFORMANCE_PING'}]})})]).then(async r=>{if(r.some(x=>!x.ok))process.exit(2);const m=await r[2].json();if(m.choices[0].message.content!=='I1_CONFORMANCE_PONG')process.exit(3)}).catch(()=>process.exit(4))"
docker run --rm --network hengzhun-control --env-file $runtimeEnv node@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 node -e $probe
if ($LASTEXITCODE -ne 0) { throw 'Controlled Coze-to-Harness network probe failed.' }

$ui = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8888/' -TimeoutSec 20
if ($ui.StatusCode -ne 200) { throw 'Coze Studio UI is unavailable.' }

[ordered]@{
  status = 'HENGZHUN_I1_MACHINE_BASELINE_VERIFIED'
  cozeStudio = '0.5.1'
  cozeRevision = $actualRevision
  console = 'http://127.0.0.1:8888'
  controlNetworkMembers = $members
  publicUiConformance = 'requires recorded public-UI execution results'
} | ConvertTo-Json -Depth 4
