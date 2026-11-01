"""Generate a bank-only CI topology from public source, never the local runtime."""
import argparse
import copy
import json
from pathlib import Path
import re
import secrets
import uuid
import yaml

PORTS = {'fineract-server': (21100, 8080), 'gateway': (21443, 8080), 'customer-portal': (21882, 80), 'operations-console': (21883, 80), 'keycloak': (21900, 8080)}
CHANNEL = ('bank-channel-postgres', 'keycloak', 'bank-channel-service', 'test-support-service', 'gateway', 'customer-portal', 'operations-console')
CORE = ('postgresql', 'activemq', 'fineract-server')


def fineract_password():
    # The pinned fresh core requires 12..50 chars, all four character classes,
    # no spaces and no consecutive identical characters.
    value = 'Aa1!'
    for _ in range(36):
        value += secrets.choice(''.join(character for character in '0123456789abcdef' if character != value[-1]))
    return value


def substitute(value, environment):
    if isinstance(value, str):
        return re.sub(r'\$\{([A-Z0-9_]+)(?::[-?][^}]*)?\}', lambda match: environment[match[1]], value)
    if isinstance(value, list):
        return [substitute(item, environment) for item in value]
    if isinstance(value, dict):
        return {key: substitute(item, environment) for key, item in value.items()}
    return value


def topology(source, output, project, environment, ports=PORTS):
    core = yaml.safe_load((source / 'postgresql/docker-compose.isolated.yml').read_text(encoding='utf-8'))
    channel = yaml.safe_load((source / 'compose.channel.yaml').read_text(encoding='utf-8'))
    services = {name: copy.deepcopy(core['services'][name]) for name in CORE}
    services.update({name: copy.deepcopy(channel['services'][name]) for name in CHANNEL})
    # Compose extends is resolved explicitly so the new file never imports another project.
    support = copy.deepcopy(services['bank-channel-service'])
    support['environment'].update(services['test-support-service']['environment'])
    support['depends_on'] = services['test-support-service']['depends_on']
    services['test-support-service'] = support
    for name, service in services.items():
        service['restart'] = 'no'
        service.pop('ports', None)
        service.pop('extends', None)
        if name in ports:
            host, container = ports[name]
            service['ports'] = [f'127.0.0.1:{host}:{container}']
        network_names = {'bank_internal': 'core', 'mifos-core-net': 'core', 'bank_front': 'front', 'bank-channel-front': 'front', 'bank-channel-net': 'channel'}
        service['networks'] = [network_names[network] for network in service['networks']]
        base = source / 'postgresql' if name in CORE else source
        volumes = []
        for volume in service.get('volumes', []):
            if volume.startswith('./'):
                local, remote = volume.split(':', 1)
                path = output / 'realms' if local == './infra/keycloak/realms' else (base / local).resolve()
                volumes.append({'type': 'bind', 'source': str(path), 'target': remote.rsplit(':', 1)[0], 'read_only': True})
            else:
                volumes.append(volume)
        if volumes:
            service['volumes'] = volumes
        if 'build' in service:
            service['build']['context'] = str((source / service['build']['context']).resolve())
            service['image'] = f'local/{project}-{name}:candidate'
            if name in ('customer-portal', 'operations-console'):
                realm = 'bank-customer' if name == 'customer-portal' else 'bank-internal'
                service['build']['args']['VITE_OIDC_ISSUER'] = f"http://127.0.0.1:{ports['keycloak'][0]}/realms/{realm}"
    services['test-support-service']['image'] = services['bank-channel-service']['image']
    services['test-support-service'].pop('build')
    return substitute({'name': project, 'services': services, 'networks': {'core': {'internal': True}, 'channel': {'internal': True}, 'front': {}}, 'volumes': {'core_postgresql_data': {}, 'bank_channel_pg_data': {}, 'keycloak_data': {}}, 'secrets': {'channel_db_password': {'file': str(output / 'channel-db-password.txt')}}}, environment)


def prepare(source, output, port_offset=0):
    source = source.resolve()
    output = output.resolve()
    # Source must be the already verified snapshot, not an original runtime tree.
    if source.name != 'source-snapshot' or 'banksystem-rf065' not in source.parts:
        raise ValueError('RF065_SOURCE_SNAPSHOT_REQUIRED')
    if 'banksystem-rf065' not in output.parts or output == source or source in output.parents:
        raise ValueError('RF065_OWNED_OUTPUT_REQUIRED')
    output.mkdir(parents=True, exist_ok=False)
    ports = {name: (host + port_offset, container) for name, (host, container) in PORTS.items()}
    keycloak_port = ports['keycloak'][0]
    project = 'rf065ci' + uuid.uuid4().hex[:12]
    environment = {key: 'C1!' + secrets.token_hex(24) for key in ('POSTGRES_PASSWORD', 'FINERACT_DB_PASS', 'CHANNEL_DB_PASSWORD', 'CLEARING_CALLBACK_SECRET', 'KEYCLOAK_ADMIN_PASSWORD')}
    api_password = fineract_password()
    environment.update(FINERACT_USERNAME='mifos', FINERACT_PASSWORD=api_password, FINERACT_ADMIN_USERNAME='mifos', FINERACT_ADMIN_PASSWORD=api_password, FINERACT_TENANT='default', KEYCLOAK_ADMIN_USERNAME='ci-admin', BANK_CHANNEL_PROFILES='demo', APP_LOCALE='zh-CN', FINERACT_BASE_URL='http://fineract-server:8080/fineract-provider', BANK_CUSTOMER_ISSUER_URI='http://127.0.0.1:21900/realms/bank-customer', BANK_INTERNAL_ISSUER_URI='http://127.0.0.1:21900/realms/bank-internal', BANK_CUSTOMER_JWK_SET_URI='http://keycloak:8080/realms/bank-customer/protocol/openid-connect/certs', BANK_INTERNAL_JWK_SET_URI='http://keycloak:8080/realms/bank-internal/protocol/openid-connect/certs')
    environment.update(BANK_CUSTOMER_ISSUER_URI=f'http://127.0.0.1:{keycloak_port}/realms/bank-customer', BANK_INTERNAL_ISSUER_URI=f'http://127.0.0.1:{keycloak_port}/realms/bank-internal')
    realms = output / 'realms'
    realms.mkdir()
    for realm, port in (('bank-customer', ports['customer-portal'][0]), ('bank-internal', ports['operations-console'][0])):
        data = json.loads((source / f'infra/keycloak/realms/{realm}-realm.json').read_text(encoding='utf-8'))
        client_id = 'customer-portal' if realm == 'bank-customer' else 'operations-console'
        for client in data['clients']:
            if client['clientId'] == client_id:
                client['redirectUris'] = [f'http://127.0.0.1:{port}/*']
                client['webOrigins'] = [f'http://127.0.0.1:{port}']
        (realms / f'{realm}-realm.json').write_text(json.dumps(data), encoding='utf-8')
    (output / 'channel-db-password.txt').write_text(environment['CHANNEL_DB_PASSWORD'], encoding='utf-8')
    (output / 'synthetic.env').write_text('\n'.join(f'{key}={value}' for key, value in environment.items()), encoding='utf-8')
    (output / 'compose.json').write_text(json.dumps(topology(source, output, project, environment, ports), indent=2), encoding='utf-8')
    # Metadata deliberately excludes credentials.
    (output / 'ownership.json').write_text(json.dumps({'project': project, 'source': str(source), 'ports': ports, 'volumes': [f'{project}_{name}' for name in ('core_postgresql_data', 'bank_channel_pg_data', 'keycloak_data')]}), encoding='utf-8')
    print(f'RF065_BANK_PREPARED project={project} directory={output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--port-offset', type=int, choices=(0, 1000), default=0)
    args = parser.parse_args()
    prepare(args.source, args.output, args.port_offset)
