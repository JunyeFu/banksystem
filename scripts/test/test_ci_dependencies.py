import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('dependencies', ROOT / 'scripts/deploy/prepare-ci-dependencies.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ProductDependencyBoundaryTest(unittest.TestCase):
    def test_local_security_patch_and_original_license_enter_dependency_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'banksystem-rf065'
            source = root / 'scan/scan-source'
            source.mkdir(parents=True)
            (source.parent / 'secrets.json').write_text(json.dumps({'status': 'PASSED', 'scannerExitCode': 0, 'count': 0}))
            for relative in [f'{package}/{name}' for package in MODULE.PACKAGES for name in ('package.json', 'package-lock.json')] + list(MODULE.VENDOR_FILES) + ['LICENSE']:
                target = source / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('controlled public fixture', encoding='utf-8')
            output = root / 'dependencies'
            MODULE.prepare(source, output)
            for relative in MODULE.VENDOR_FILES:
                self.assertEqual((output / 'product-dependencies' / relative).read_text(), 'controlled public fixture')

    def test_failed_secret_scan_blocks_dependency_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'banksystem-rf065'
            source = root / 'scan/scan-source'
            source.mkdir(parents=True)
            (source.parent / 'secrets.json').write_text(json.dumps({'status': 'FAILED', 'scannerExitCode': 1, 'count': 1}))
            output = root / 'dependencies'
            with self.assertRaisesRegex(ValueError, 'SECRET_SCAN_NOT_PASSED'):
                MODULE.prepare(source, output)
            self.assertFalse(output.exists())

    def test_missing_product_lock_fails_before_copying(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'banksystem-rf065'
            source = root / 'scan/scan-source'
            source.mkdir(parents=True)
            (source.parent / 'secrets.json').write_text(json.dumps({'status': 'PASSED', 'scannerExitCode': 0, 'count': 0}))
            output = root / 'dependencies'
            with self.assertRaisesRegex(ValueError, 'DEPENDENCY_FILE_MISSING'):
                MODULE.prepare(source, output)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
