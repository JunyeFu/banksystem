[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\platform\hengzhun-regression-system')).Path
$isolatedBase = 'D:\Agent\.codex-temp\banksystem-rf065'
$isolatedRoot = Join-Path $isolatedBase ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $isolatedRoot -Force | Out-Null
Write-Output "RF065_ISOLATED_ROOT=$isolatedRoot"
$originalPath = $env:PATH
$cache = Join-Path $isolatedRoot 'npm-cache'
foreach ($name in @('HENGZHUN_MODEL_NAME', 'HENGZHUN_MODEL_BASE_URL', 'HENGZHUN_MODEL_API_KEY')) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
}

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments, [string]$Directory)
    Push-Location -LiteralPath $Directory
    try {
        & $Executable @Arguments
        if ($LASTEXITCODE -ne 0) { throw "RF065_COMMAND_FAILED:$Executable exit=$LASTEXITCODE" }
    } finally { Pop-Location }
}

foreach ($version in @('20.20.2', '24.19.0')) {
    $relative = "runtime\node-v$version-win-x64"
    $directory = Join-Path $isolatedRoot $relative
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot "$relative\node.exe") -Destination (Join-Path $directory 'node.exe')
    New-Item -ItemType Directory -Path (Join-Path $directory 'node_modules') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot "$relative\node_modules\npm") -Destination (Join-Path $directory 'node_modules\npm') -Recurse
    Invoke-Checked (Join-Path $directory 'node.exe') @('--version') $isolatedRoot
}
foreach ($package in @('.', 'agent-cli', 'controller', 'runtime')) {
    $target = Join-Path $isolatedRoot $package
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    foreach ($file in @('package.json', 'package-lock.json')) {
        Copy-Item -LiteralPath (Join-Path (Join-Path $sourceRoot $package) $file) -Destination (Join-Path $target $file)
    }
}
New-Item -ItemType Directory -Path (Join-Path $isolatedRoot 'config') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'config\demo-runtime-freeze.json') -Destination (Join-Path $isolatedRoot 'config\demo-runtime-freeze.json')
New-Item -ItemType Directory -Path (Join-Path $isolatedRoot 'vendor') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'vendor\extract-zip') -Destination (Join-Path $isolatedRoot 'vendor\extract-zip') -Recurse

try {
    foreach ($package in @('agent-cli', '.', 'controller', 'runtime')) {
        $version = if ($package -eq 'agent-cli') { '24.19.0' } else { '20.20.2' }
        $env:PATH = (Join-Path $isolatedRoot "runtime\node-v$version-win-x64") + ';' + $originalPath
        Write-Output "RF065_INSTALL=$package NODE=$version"
        $node = Join-Path $isolatedRoot "runtime\node-v$version-win-x64\node.exe"
        $npmCli = Join-Path $isolatedRoot "runtime\node-v$version-win-x64\node_modules\npm\bin\npm-cli.js"
        Invoke-Checked $node @($npmCli, '--version') $isolatedRoot
        $installArguments = @($npmCli, 'ci', '--install-links', '--no-audit', '--cache', $cache)
        if ($package -eq 'runtime') { $installArguments += '--ignore-scripts' }
        Invoke-Checked $node $installArguments (Join-Path $isolatedRoot $package)
    }
    $node20 = Join-Path $isolatedRoot 'runtime\node-v20.20.2-win-x64\node.exe'
    $node24 = Join-Path $isolatedRoot 'runtime\node-v24.19.0-win-x64\node.exe'
    Invoke-Checked $node20 @('-e', 'const Database=require("better-sqlite3");const db=new Database(":memory:");if(db.prepare("select 42 as n").get().n!==42)throw Error("SQLite ABI failed");db.close();console.log("RF065_SQLITE_ABI=PASS")') $isolatedRoot
    Invoke-Checked $node20 @('--input-type=module', '-e', 'await import("@langchain/langgraph");console.log("RF065_CONTROLLER_IMPORT=PASS")') (Join-Path $isolatedRoot 'controller')
    Invoke-Checked $node24 @('--input-type=module', '-e', 'await import("@earendil-works/pi-tui");console.log("RF065_CLI_IMPORT=PASS")') (Join-Path $isolatedRoot 'agent-cli')
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $isolatedRoot 'runtime\browsers'
    Invoke-Checked $node20 @('runtime/node_modules/playwright/cli.js', 'install', 'chromium') $isolatedRoot
    $freeze = Get-Content -LiteralPath (Join-Path $isolatedRoot 'config\demo-runtime-freeze.json') -Raw | ConvertFrom-Json
    $browser = Join-Path (Join-Path $isolatedRoot 'runtime') $freeze.chromium.executable
    if (-not (Test-Path -LiteralPath $browser -PathType Leaf)) { throw 'RF065_FROZEN_CHROMIUM_MISSING' }
    Invoke-Checked $node20 @('-e', 'const {chromium}=require("./runtime/node_modules/playwright");const freeze=require("./config/demo-runtime-freeze.json");(async()=>{const browser=await chromium.launch({executablePath:require("path").resolve("runtime",freeze.chromium.executable),headless:true});try{const page=await browser.newPage();await page.setContent("<h1>RF065 isolated browser</h1>");if(await page.locator("h1").textContent()!=="RF065 isolated browser")throw Error("Browser assertion failed");console.log("RF065_BROWSER_LAUNCH=PASS");}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});') $isolatedRoot
    & (Join-Path $PSScriptRoot 'prepare-agent-media.ps1') -AgentRoot $isolatedRoot
    Write-Output 'RF065_RUNTIME_PREPARATION=PASS'
} finally {
    $env:PATH = $originalPath
}
