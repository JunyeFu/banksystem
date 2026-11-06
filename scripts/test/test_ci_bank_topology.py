import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('ci_bank', ROOT / 'scripts/deploy/prepare-ci-bank.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BankTopologyTest(unittest.TestCase):
    def test_default_mq_authentication_uses_one_separate_credential_for_broker_and_channel_clients(self):
        environment = {key: 'synthetic' for key in ('CHANNEL_DB_PASSWORD', 'FINERACT_USERNAME', 'FINERACT_PASSWORD', 'CLEARING_CALLBACK_SECRET', 'FINERACT_BASE_URL', 'FINERACT_TENANT', 'BANK_CUSTOMER_ISSUER_URI', 'BANK_CUSTOMER_JWK_SET_URI', 'BANK_INTERNAL_ISSUER_URI', 'BANK_INTERNAL_JWK_SET_URI', 'BANK_CHANNEL_PROFILES', 'APP_LOCALE', 'KEYCLOAK_ADMIN_USERNAME', 'KEYCLOAK_ADMIN_PASSWORD', 'POSTGRES_PASSWORD', 'FINERACT_DB_PASS', 'ACTIVEMQ_PASSWORD')}
        environment['ACTIVEMQ_PASSWORD'] = 'synthetic-independent-mq-secret'
        result = MODULE.topology(ROOT, Path('owned-synthetic'), 'rf065ciauth', environment)
        self.assertEqual(result['services']['activemq'].get('environment', {}), {
            'ACTIVEMQ_CONNECTION_USER': 'admin', 'ACTIVEMQ_CONNECTION_PASSWORD': 'synthetic-independent-mq-secret'})
        for name in ('bank-channel-service', 'test-support-service'):
            self.assertEqual(result['services'][name]['environment']['ACTIVEMQ_PASSWORD'], 'synthetic-independent-mq-secret')
        config = MODULE.yaml.safe_load((ROOT / 'services/bank-channel-service/src/main/resources/application.yml').read_text(encoding='utf-8'))
        self.assertEqual(config['spring']['activemq']['password'], '${ACTIVEMQ_PASSWORD}')
        del environment['ACTIVEMQ_PASSWORD']
        with self.assertRaisesRegex(KeyError, 'ACTIVEMQ_PASSWORD'):
            MODULE.topology(ROOT, Path('owned-synthetic'), 'rf065ciauth', environment)

    def test_core_password_matches_observed_fresh_core_policy(self):
        password = MODULE.fineract_password()
        self.assertEqual(len(password), 40)
        for pattern in ('[A-Z]', '[a-z]', '[0-9]', '[^A-Za-z0-9]'):
            self.assertRegex(password, pattern)
        self.assertNotIn(' ', password)
        self.assertTrue(all(left != right for left, right in zip(password, password[1:])))

    def test_owned_topology_has_no_original_network_or_secret_bind(self):
        environment = {key: 'synthetic' for key in ('CHANNEL_DB_PASSWORD', 'FINERACT_USERNAME', 'FINERACT_PASSWORD', 'CLEARING_CALLBACK_SECRET', 'FINERACT_BASE_URL', 'FINERACT_TENANT', 'BANK_CUSTOMER_ISSUER_URI', 'BANK_CUSTOMER_JWK_SET_URI', 'BANK_INTERNAL_ISSUER_URI', 'BANK_INTERNAL_JWK_SET_URI', 'BANK_CHANNEL_PROFILES', 'APP_LOCALE', 'KEYCLOAK_ADMIN_USERNAME', 'KEYCLOAK_ADMIN_PASSWORD', 'POSTGRES_PASSWORD', 'FINERACT_DB_PASS', 'ACTIVEMQ_PASSWORD')}
        with tempfile.TemporaryDirectory() as directory:
            result = MODULE.topology(ROOT, Path(directory), 'rf065cisynthetic', environment)
        self.assertEqual(set(result['services']), set(MODULE.CORE + MODULE.CHANNEL))
        self.assertEqual(len(result['volumes']), 3)
        self.assertTrue(all('external' not in network and 'name' not in network for network in result['networks'].values()))
        self.assertEqual(result['secrets']['channel_db_password']['file'], str(Path(directory) / 'channel-db-password.txt'))
        for name, service in result['services'].items():
            self.assertNotIn('extends', service)
            self.assertEqual(service['restart'], 'no')
            for port in service.get('ports', []):
                self.assertTrue(port.startswith('127.0.0.1:21'))
            for volume in service.get('volumes', []):
                if isinstance(volume, dict):
                    self.assertNotIn('/secrets/', volume['source'].replace('\\', '/'))
                    self.assertTrue(volume['read_only'])
        self.assertEqual(result['services']['test-support-service']['image'], result['services']['bank-channel-service']['image'])
        self.assertNotIn('build', result['services']['test-support-service'])
        self.assertEqual(result['services']['bank-channel-service']['dns_search'], ['.'])
        self.assertEqual(result['services']['test-support-service']['dns_search'], ['.'])
        self.assertIn('21900/realms/bank-customer', result['services']['customer-portal']['build']['args']['VITE_OIDC_ISSUER'])

    def test_original_source_is_rejected_before_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'new'
            with self.assertRaisesRegex(ValueError, 'SOURCE_SNAPSHOT_REQUIRED'):
                MODULE.prepare(Path(directory) / 'original-source', output)
            self.assertFalse(output.exists())

    def test_linux_local_port_offset_applies_to_ports_and_frontend_issuer(self):
        ports = {name: (host + 1000, container) for name, (host, container) in MODULE.PORTS.items()}
        environment = {key: 'synthetic' for key in ('CHANNEL_DB_PASSWORD', 'FINERACT_USERNAME', 'FINERACT_PASSWORD', 'CLEARING_CALLBACK_SECRET', 'FINERACT_BASE_URL', 'FINERACT_TENANT', 'BANK_CUSTOMER_ISSUER_URI', 'BANK_CUSTOMER_JWK_SET_URI', 'BANK_INTERNAL_ISSUER_URI', 'BANK_INTERNAL_JWK_SET_URI', 'BANK_CHANNEL_PROFILES', 'APP_LOCALE', 'KEYCLOAK_ADMIN_USERNAME', 'KEYCLOAK_ADMIN_PASSWORD', 'POSTGRES_PASSWORD', 'FINERACT_DB_PASS', 'ACTIVEMQ_PASSWORD')}
        result = MODULE.topology(ROOT, Path('owned'), 'rf065cisynthetic', environment, ports)
        for name, (host, container) in ports.items():
            self.assertEqual(result['services'][name]['ports'], [f'127.0.0.1:{host}:{container}'])
        self.assertIn('22900/realms/bank-customer', result['services']['customer-portal']['build']['args']['VITE_OIDC_ISSUER'])


if __name__ == '__main__':
    unittest.main()
