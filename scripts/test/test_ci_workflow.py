"""Checks the declared workflow without starting services or installing dependencies."""
import json
import importlib.util
import subprocess
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT / '.github/workflows/ci.yml').read_text(encoding='utf-8')
WORKFLOW = yaml.load(SOURCE, Loader=yaml.BaseLoader)


class ProductWorkflowTest(unittest.TestCase):
    def test_demo_credentials_run_under_windows_powershell51_in_the_source_job(self):
        job = WORKFLOW['jobs']['source-engineering']
        self.assertEqual(job['runs-on'], 'windows-latest')
        step = next(row for row in job['steps'] if row.get('name') == 'Verify demo credential preparation on Windows PowerShell 5.1')
        self.assertIn('powershell.exe -NoProfile -NonInteractive', step['run'])
        self.assertIn('-File scripts/test/test-demo-credentials.ps1', step['run'])
        self.assertIn('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }', step['run'])

    def test_source_engineering_installs_fixed_yaml_before_importing_scan_contracts(self):
        steps = WORKFLOW['jobs']['source-engineering']['steps']
        runs = '\n'.join(step.get('run', '') for step in steps)
        install = 'python -m pip install PyYAML==6.0.3'
        self.assertLess(runs.index(install), runs.index('test_ci_dependency_scan.py'))
        preparation = next(step['run'] for step in steps if install in step.get('run', ''))
        self.assertIn('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }', preparation)

    def test_all_product_changes_trigger_checks(self):
        for trigger in ('push', 'pull_request'):
            self.assertEqual(WORKFLOW['on'][trigger], {})
        self.assertEqual(set(WORKFLOW['jobs']), {'governance', 'bank-java', 'shared-frontend', 'frontend-build', 'agent', 'bank-browser-integration', 'source-engineering'})
        governance = '\n'.join(step.get('run', '') for step in WORKFLOW['jobs']['governance']['steps'])
        self.assertIn('python scripts/docs/validate_docs.py --source-only', governance)
        self.assertIn('test_refactoring_source_scope.py', governance)

    def test_agent_prepares_both_versions_and_actual_commands(self):
        steps = WORKFLOW['jobs']['agent']['steps']
        checkout = next(step for step in steps if step.get('uses') == 'actions/checkout@v4')
        self.assertEqual(checkout['with']['fetch-depth'], '0')
        versions = [step['with']['node-version'] for step in steps if step.get('uses') == 'actions/setup-node@v4']
        self.assertEqual(versions, ['20.20.2', '24.19.0', '20.20.2'])
        runs = '\n'.join(step.get('run', '') for step in steps)
        for fragment in ('runtime/node-v20.20.2-win-x64', 'runtime/node-v24.19.0-win-x64', 'npm ci --prefix agent-cli', "@('controller', 'runtime')", 'runtime/node_modules/playwright/cli.js', '$freeze.chromium.executable'):
            self.assertIn(fragment, runs)
        package = json.loads((ROOT / 'platform/hengzhun-regression-system/package.json').read_text(encoding='utf-8'))
        for step in steps:
            command = step.get('run', '')
            if command.startswith('npm run '):
                self.assertIn(command.removeprefix('npm run '), package['scripts'])

    def test_every_prepared_product_has_a_lockfile(self):
        for directory in ('packages/bank-api-client', 'packages/bank-ui-kit', 'apps/customer-portal', 'apps/operations-console', 'apps/quality-case-portal', 'platform/hengzhun-regression-system', 'platform/hengzhun-regression-system/controller', 'platform/hengzhun-regression-system/agent-cli', 'platform/hengzhun-regression-system/runtime'):
            self.assertTrue((ROOT / directory / 'package-lock.json').is_file(), directory)

    def test_coverage_has_an_explicit_tool_without_changing_runtime_or_floors(self):
        product = ROOT / 'platform/hengzhun-regression-system'
        package = json.loads((product / 'package.json').read_text(encoding='utf-8'))
        self.assertEqual(package['engines']['node'], '20.20.2')
        self.assertEqual(package['scripts']['test:coverage'], r'runtime\node-v24.19.0-win-x64\node.exe scripts/run-registered-tests.cjs coverage')
        self.assertIn('node-v20.20.2-win-x64', package['scripts']['test:registered'])
        coverage = json.loads((product / 'scripts/verification/test-manifest.json').read_text(encoding='utf-8'))['coverage']
        self.assertEqual(coverage['thresholds'], {'lines': 50, 'branches': 70, 'functions': 60})
        for path in ('scripts/i10-case-draft-normalizer.selftest.cjs', 'scripts/progress.selftest.cjs', 'scripts/recovery.selftest.cjs', 'scripts/verification/case-draft-normalizer.test.cjs', 'scripts/verification/context-envelope.test.cjs', 'scripts/verification/generic-worker-routing.test.cjs', 'scripts/verification/input-safety.test.cjs', 'scripts/verification/midscene-diagnostics.test.cjs', 'scripts/verification/secret-scan-streaming.test.cjs', 'scripts/verification/verification-policy.test.cjs'):
            self.assertIn(path, coverage['tests'])

    def test_customer_has_real_quality_commands_in_the_frontend_matrix(self):
        package = json.loads((ROOT / 'apps/customer-portal/package.json').read_text(encoding='utf-8'))
        self.assertEqual(package['scripts']['lint'], 'eslint src vite.config.ts --max-warnings 0')
        self.assertEqual(package['scripts']['typecheck'], 'tsc --noEmit -p tsconfig.json')
        self.assertEqual(package['scripts']['test'], 'vitest run')
        steps = WORKFLOW['jobs']['frontend-build']['steps']
        check = next(step for step in steps if step.get('name') == 'Check customer lint types and authentication units')
        self.assertEqual(check['if'], "matrix.app == 'customer-portal'")
        for command in ('npm run lint', 'npm run typecheck', 'npm test'):
            self.assertIn(f'{command} --prefix apps/customer-portal', check['run'])
        self.assertEqual(check['run'].count('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }'), 3)

    def test_operations_has_real_quality_commands_in_the_frontend_matrix(self):
        package = json.loads((ROOT / 'apps/operations-console/package.json').read_text(encoding='utf-8'))
        self.assertEqual(package['scripts']['lint'], 'eslint src vite.config.ts --max-warnings 0')
        self.assertEqual(package['scripts']['typecheck'], 'tsc --noEmit -p tsconfig.json')
        self.assertEqual(package['scripts']['test'], 'vitest run')
        steps = WORKFLOW['jobs']['frontend-build']['steps']
        check = next(step for step in steps if step.get('name') == 'Check operations lint types and document units')
        self.assertEqual(check['if'], "matrix.app == 'operations-console'")
        for command in ('npm run lint', 'npm run typecheck', 'npm test'):
            self.assertIn(f'{command} --prefix apps/operations-console', check['run'])
        self.assertEqual(check['run'].count('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }'), 3)

    def test_quality_has_real_read_only_quality_commands_in_the_frontend_matrix(self):
        package = json.loads((ROOT / 'apps/quality-case-portal/package.json').read_text(encoding='utf-8'))
        self.assertEqual(package['scripts']['lint'], 'eslint src vite.config.ts vite.agent.config.ts --max-warnings 0')
        self.assertEqual(package['scripts']['typecheck'], 'tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json')
        self.assertEqual(package['scripts']['test'], 'vitest run')
        steps = WORKFLOW['jobs']['frontend-build']['steps']
        check = next(step for step in steps if step.get('name') == 'Check quality lint types and read-only units')
        self.assertEqual(check['if'], "matrix.app == 'quality-case-portal'")
        for command in ('npm run lint', 'npm run typecheck', 'npm test'):
            self.assertIn(f'{command} --prefix apps/quality-case-portal', check['run'])
        self.assertEqual(check['run'].count('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }'), 3)

    def test_isolated_runtime_installs_use_explicit_node_and_frozen_npm(self):
        script = (ROOT / 'scripts/deploy/verify-ci-agent-runtime.ps1').read_text(encoding='utf-8')
        self.assertIn("'agent-cli', '.', 'controller', 'runtime'", script)
        self.assertIn('Invoke-Checked $node @($npmCli,', script)
        self.assertNotIn('Get-Command npm.cmd', script)
        self.assertIn('node_modules\\npm\\bin\\npm-cli.js', script)
        self.assertIn("'--cache', $cache", script)
        for forbidden in ('docker ', 'sourceEnvironment', 'Get-Content .env', 'start:agent'):
            self.assertNotIn(forbidden, script)
        self.assertEqual(script.count('--ignore-scripts'), 1)
        self.assertIn("if ($package -eq 'runtime') { $installArguments += '--ignore-scripts' }", script)
        self.assertIn('RF065_SQLITE_ABI=PASS', script)
        self.assertIn('RF065_BROWSER_LAUNCH=PASS', script)

    def test_snapshot_filter_preserves_public_template_without_copying_runtime_or_secrets(self):
        script = (ROOT / 'scripts/deploy/verify-ci-source-snapshot.ps1').read_text(encoding='utf-8')
        body = script.split('foreach ($relative in @($files | Sort-Object -Unique)) {', 1)[1].split('    $source = Join-Path $repository $relative', 1)[0]
        product = 'platform/hengzhun-regression-system'
        kept = ['.env.example', 'docs/design/product-normalization/delivery.md', f'{product}/harness/src/server.ts', f'{product}/runtime/package.json', f'{product}/runtime/package-lock.json', f'{product}/config/demo-runtime-freeze.json', f'{product}/config/i9.runtime.example.json']
        blocked = ['.env', '.env.local', 'runtime.env', 'postgresql/fineract-db/docker/postgresql.env', 'agent/runs/result.json', 'logs/runtime.log', 'backups/archive.json', '.local/notes.json', 'private.key', f'{product}/.data/runtime.env', f'{product}/node_modules/package.json', f'{product}/dist/harness/src/index.js', f'{product}/runtime/ocr-models/model.onnx', f'{product}/config/private-runtime.json']
        cases = ','.join("'" + item + "'" for item in kept + blocked)
        command = f"$productRelative='{product}'; $cases=@({cases}); $included=@(foreach ($relative in $cases) {{{body}\n$relative}}); ConvertTo-Json -InputObject $included -Compress"
        result = subprocess.run(['pwsh', '-NoProfile', '-Command', command], capture_output=True, text=True, encoding='utf-8', check=True)
        self.assertEqual(json.loads(result.stdout), kept)

    def test_frontend_and_java_jobs_use_actual_checks(self):
        self.assertEqual(WORKFLOW['jobs']['frontend-build']['strategy']['matrix']['app'], ['customer-portal', 'operations-console', 'quality-case-portal'])
        steps = WORKFLOW['jobs']['bank-java']['steps']
        self.assertEqual(next(step['with']['java-version'] for step in steps if step.get('uses') == 'actions/setup-java@v4'), '21')
        self.assertIn('.\\mvnw.cmd --batch-mode --settings ..\\..\\scripts\\test\\ci-maven-settings.xml test', [step.get('run') for step in steps])
        self.assertTrue((ROOT / 'scripts/test/ci-maven-settings.xml').is_file())

    def test_no_live_or_original_environment_mutation(self):
        for forbidden in ('audit:critical', 'HENGZHUN_MODEL_API_KEY', 'demo.ps1', 'continue-on-error: true', ' down', ' reset', 'logs --'):
            self.assertNotIn(forbidden, SOURCE)
        for job in WORKFLOW['jobs'].values():
            for step in job['steps']:
                if 'foreach ' in step.get('run', '') and job is not WORKFLOW['jobs']['bank-browser-integration']:
                    self.assertIn('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }', step['run'])

    def test_bank_browser_job_owns_topology_and_uploads_only_public_evidence(self):
        job = WORKFLOW['jobs']['bank-browser-integration']
        self.assertEqual(job['runs-on'], 'ubuntu-24.04')
        self.assertEqual(job['defaults']['run']['working-directory'], 'banksystem-rf065/source-snapshot')
        checkout = next(step for step in job['steps'] if step.get('uses') == 'actions/checkout@v4')
        self.assertEqual(checkout['with']['path'], 'banksystem-rf065/source-snapshot')
        runs = '\n'.join(step.get('run', '') for step in job['steps'])
        for required in ('prepare-ci-bank.py --source', 'synthetic.env', 'ensure-fineract-credentials.ps1', 'run-golden-path.ps1', 'ci-bank-browser.cjs', 'chromium-1217/chrome-linux64/chrome', 'install --with-deps chromium'):
            self.assertIn(required, runs)
        for step in job['steps']:
            if step.get('run') and step.get('shell', 'bash') == 'bash':
                self.assertTrue(step['run'].startswith('set -euo pipefail'))
        artifact = next(step['with'] for step in job['steps'] if step.get('uses') == 'actions/upload-artifact@v4')
        for item in artifact['path'].splitlines():
            self.assertTrue(item.startswith('banksystem-rf065/bank/'))
            self.assertIn(Path(item).name, {'golden-result.json', 'browser-result.json', 'browser-failure.json', 'customer-transfer.png', 'operations-transfer.png'})
        self.assertIn('Select-Object status, errorCode, stage, httpStatus, journeyId, correlationId, sourceAccountId, targetAccountId, amount, currency, fineractTransactionId', runs)
        self.assertIn('if ($resultCode -ne 0) { exit $resultCode }', runs)
        driver = (ROOT / 'scripts/test/ci-bank-browser.cjs').read_text(encoding='utf-8')
        self.assertIn('assert.equal(browser.version(), freeze.chromium.version)', driver)

    def test_engineering_job_propagates_scans_and_uploads_only_public_reports(self):
        job = WORKFLOW['jobs']['source-engineering']
        self.assertEqual(job['runs-on'], 'windows-latest')
        self.assertEqual(job['defaults']['run']['working-directory'], 'banksystem-rf065/source-snapshot')
        runs = '\n'.join(step.get('run', '') for step in job['steps'])
        for required in ('prepare-ci-security-tools.ps1', 'test_ci_scan.py', 'test_ci_dependency_scan.py', 'test_ci_artifacts.py', 'check_ci_gitleaks.py', 'prepare-ci-scan.py', 'prepare-ci-dependencies.py', 'scan-ci-dependencies.py'):
            self.assertIn(required, runs)
        for step in job['steps']:
            if 'python ' in step.get('run', ''):
                if 'scan-ci-dependencies.py --directory' in step['run']:
                    self.assertIn('if ($nativeScanCode -notin @(0, 1)) { exit $nativeScanCode }', step['run'])
                    self.assertIn('verify-ci-dependency-review.py --directory', step['run'])
                    self.assertTrue(step['run'].rstrip().endswith('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }'))
                else:
                    self.assertEqual(step['run'].count('python '), step['run'].count('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }'))
        artifact = next(step['with'] for step in job['steps'] if step.get('uses') == 'actions/upload-artifact@v4')
        names = {Path(item).name for item in artifact['path'].splitlines()}
        self.assertEqual(names, {'secrets.json', 'dependency-coverage.json', 'source.cdx.json', 'dependencies.json', 'dependency-result.json', 'vulnerability-inventory.json', 'license-unresolved.json', 'dependency-review.json', 'license-review.json', 'source.reviewed.cdx.json', 'zip-patch-regression.txt', 'candidate-manifest.json', 'checksums.sha256', 'controlled-source.zip', 'source-license-review.json'})
        self.assertNotIn('gitleaks-redacted.json', artifact['path'])
        self.assertNotIn('scanner.log', artifact['path'])

    def test_source_candidate_is_verified_after_review_and_uploaded_complete(self):
        steps = WORKFLOW['jobs']['source-engineering']['steps']
        review_index = next(index for index, step in enumerate(steps)
                            if 'verify-ci-dependency-review.py --directory' in step.get('run', ''))
        package_index = next(index for index, step in enumerate(steps)
                             if 'verify-ci-artifacts.py --source-only' in step.get('run', ''))
        self.assertLess(review_index, package_index)
        command = steps[package_index]['run']
        self.assertIn('verify-ci-artifacts.py --verify "$root/candidate-source" --repository $PWD', command)
        self.assertEqual(command.count('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }'), 2)
        artifact = next(step['with'] for step in steps if step.get('uses') == 'actions/upload-artifact@v4')
        spec = importlib.util.spec_from_file_location('workflow_artifacts', ROOT / 'scripts/deploy/verify-ci-artifacts.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        expected = {'candidate-manifest.json', 'checksums.sha256', 'controlled-source.zip',
                    'reports/secrets.json', module.LICENSE_REPORT, *(f'reports/{name}' for name in module.REPORTS)}
        prefix = 'banksystem-rf065/engineering/candidate-source/'
        actual = {item.removeprefix(prefix) for item in artifact['path'].splitlines() if item.startswith(prefix)}
        self.assertEqual(actual, expected)


if __name__ == '__main__':
    unittest.main()
