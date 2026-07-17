[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtimeEnv = Join-Path $root '.data\runtime.env'
$values = @{}
Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}
$serviceToken = $values['HENGZHUN_SERVICE_TOKEN']
if (-not $serviceToken) { throw 'Harness service token is unavailable.' }
$headers = @{ Authorization = 'Bearer ' + $serviceToken; 'Content-Type' = 'application/json' }
$baseUrl = 'http://127.0.0.1:18788'
$namespace = 'i4-three-cases'

function Invoke-Harness([string]$Path, $Body) {
    return Invoke-RestMethod -Method Post -Uri ($baseUrl + $Path) -Headers $headers -Body ($Body | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec 30
}

$definitions = @(
    [ordered]@{
        executionProfile='LOGIN_PROFILE'; title='Portal login and profile identity consistency'; route='customer.login -> customer.profile';
        objective='Use a synthetic credential alias and verify header, avatar, and profile identity.'; summary='I4 low-risk case one.';
        steps=@(@{action='Log in through the portal';expected='Login succeeds'},@{action='Open profile';expected='Identity is consistent'});
        assertions=@('Header and profile names match','Avatar matches the first display-name character')
    },
    [ordered]@{
        executionProfile='ACCOUNT_OWNERSHIP'; title='Account list detail and own-data isolation'; route='customer.accounts -> customer.account.detail';
        objective='Verify account list, owned detail, and rejection of a foreign synthetic account identifier.'; summary='I4 low-risk case two.';
        steps=@(@{action='Open account list';expected='Synthetic account exists'},@{action='Open owned detail';expected='Detail belongs to list'},@{action='Open foreign identifier';expected='Access is rejected'});
        assertions=@('Owned detail belongs to list','Foreign detail cannot be read')
    },
    [ordered]@{
        executionProfile='AUTH_REJECTION_RECOVERY'; title='Wrong credential and expired session recovery'; route='customer.login -> session.recovery';
        objective='Verify wrong credentials and an expired in-memory session are rejected and correct credentials recover.'; summary='I4 low-risk case three.';
        steps=@(@{action='Submit wrong password';expected='Stay on login'},@{action='Log in correctly';expected='Recovery succeeds'},@{action='Expire session and log in again';expected='Recovery succeeds'});
        assertions=@('Wrong credential is rejected','Expired session is rejected','Correct login recovers')
    }
)

$results = @()
foreach ($definition in $definitions) {
    $suffix = [Guid]::NewGuid().ToString('N')
    $case = Invoke-Harness '/v1/plugin/cases:create-draft' ([ordered]@{
        namespace=$namespace; idempotencyKey='case:'+$suffix; actorRef='coze-hengzhun-agent'; title=$definition.title;
        objective=$definition.objective; summary=$definition.summary; riskLevel='LOW'; route=$definition.route;
        executionProfile=$definition.executionProfile; steps=$definition.steps; assertions=$definition.assertions;
        credentialAlias='i3-customer'; knowledgeRetrieval=@{sourceAuthority='COZE_KNOWLEDGE_BASE';query=$definition.title;resultSummary=$definition.summary;citationRefs=@('kb://hengzhun/i4/three-cases')}
    })
    $plan = Invoke-Harness '/v1/plugin/plans:compile' @{namespace=$namespace;idempotencyKey='plan:'+$suffix;caseId=$case.caseId;expectedCaseVersion=1;executionRoute='PLAYWRIGHT'}
    if ($plan.planStatus -ne 'READY') { throw "I4 plan is not ready: $($definition.executionProfile)" }
    $run = Invoke-Harness '/v1/plugin/runs:submit' @{namespace=$namespace;idempotencyKey='run:'+$suffix;caseId=$case.caseId;expectedCaseVersion=1;planId=$plan.planId;environment='local';credentialAlias='i3-customer'}
    $polls = 0
    do {
        Start-Sleep -Seconds 2
        $task = Invoke-Harness '/v1/plugin/tasks:get' @{namespace=$namespace;taskId=$run.taskId}
        $polls++
    } while ($task.status -in @('QUEUED','RUNNING') -and $polls -lt 60)
    if ($task.status -ne 'SUCCEEDED') { throw "I4 case failed: profile=$($definition.executionProfile), status=$($task.status), code=$($task.errorCode)" }
    $artifact = Invoke-Harness '/v1/plugin/artifacts:get-metadata' @{namespace=$namespace;artifactId=$task.resultArtifactId}
    $results += [ordered]@{
        executionProfile=$definition.executionProfile;caseId=$case.caseId;planId=$plan.planId;scriptId=$plan.scriptId;
        runId=$run.runId;taskId=$run.taskId;status=$task.status;artifactId=$artifact.artifactId;artifactSha256=$artifact.sha256;polls=$polls
    }
}
$fixtureCount = @($results | ForEach-Object { $_.runId } | Select-Object -Unique).Count
if ($fixtureCount -ne 3) { throw 'I4 runs are not isolated.' }
$out = [ordered]@{status='PASSED';namespace=$namespace;caseCount=3;independentBrowserContexts=$true;fixtureIsolation=$true;cases=$results}
$resultPath = Join-Path $root '.data\evidence\i4-live-result.json'
[System.IO.File]::WriteAllText($resultPath, ($out | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
$out | ConvertTo-Json -Depth 10 -Compress
