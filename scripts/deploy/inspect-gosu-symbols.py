"""Review Go findings for the two exact observed gosu binaries, not whole images."""
import argparse
import hashlib
import json
from pathlib import Path

GOSU_SHA256 = '52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0'
PATCH_SHA256 = '351e2d1c6f79515a43fede58c07b0c8d9469a9482b09cbe9042bd6b420564e2c'
PROFILES = {
    GOSU_SHA256: {'github.com/tianon/gosu': '1.19.0', 'github.com/moby/sys/user': '0.1.0',
                 'golang.org/x/sys': '0.1.0', 'stdlib': '1.24.6'},
    PATCH_SHA256: {'github.com/tianon/gosu': '(devel)', 'github.com/moby/sys/user': '0.4.1',
                  'golang.org/x/sys': '0.1.0', 'stdlib': '1.26.9'},
}


def stream(path):
    text = path.read_text(encoding='utf-8-sig')
    decoder, messages = json.JSONDecoder(), []
    while text.strip():
        message, end = decoder.raw_decode(text.lstrip())
        messages.append(message)
        text = text.lstrip()[end:]
    return messages


def assess(advisory, package, records, findings, target):
    aliases = {advisory['id'], *advisory.get('aliases', [])}
    matches = []
    for record in records:
        if aliases.intersection({record['id'], *record.get('aliases', [])}) and record not in matches:
            matches.append(record)
    result = {'id': advisory['id'], 'package': package,
              'severity': advisory.get('severity', []),
              'databaseSeverity': advisory.get('database_specific', {}).get('severity'),
              'status': 'UNDER_INVESTIGATION', 'reasonCode': 'GO_DATABASE_COVERAGE_MISSING'}
    if not matches:
        return result
    if len(matches) != 1:
        return {**result, 'reasonCode': 'GO_DATABASE_COVERAGE_CONFLICT'}
    record = matches[0]
    result.update({'goId': record['id'], 'references': record.get('references', [])})
    affected = [row for row in record['affected'] if row['package']['name'] == package['name']]
    imports = [item for row in affected for item in row.get('ecosystem_specific', {}).get('imports', [])]
    if not affected or not imports:
        return {**result, 'reasonCode': 'GO_SYMBOL_COVERAGE_INCOMPLETE'}
    applicable = [item for item in imports
                  if (not item.get('goos') or target['goos'] in item['goos'])
                  and (not item.get('goarch') or target['goarch'] in item['goarch'])]
    if not applicable:
        return {**result, 'status': 'NOT_AFFECTED', 'reasonCode': 'TARGET_PLATFORM_NOT_AFFECTED'}
    hits = [row for row in findings if row['osv'] == record['id']
            and any(frame.get('function') for frame in row['trace'])]
    if hits:
        return {**result, 'status': 'AFFECTED', 'reasonCode': 'VULNERABLE_SYMBOL_PRESENT', 'findings': hits}
    if not target.get('pkgSymbols') or any(not item.get('symbols') for item in applicable):
        return {**result, 'reasonCode': 'GO_SYMBOL_COVERAGE_INCOMPLETE'}
    return {**result, 'status': 'NOT_AFFECTED', 'reasonCode': 'VULNERABLE_SYMBOLS_NOT_PRESENT'}


def validate(messages, extracted, binary_sha):
    if binary_sha not in PROFILES:
        raise ValueError('GOSU_BINARY_IDENTITY_CHANGED')
    expected = PROFILES[binary_sha]
    if len(extracted) != 2 or extracted[0] != {'name': 'govulncheck-extract', 'version': '0.1.0'}:
        raise ValueError('GOSU_EXTRACT_FORMAT_CHANGED')
    target = extracted[1]
    if (target['path'], target['goVersion'], target['goos'], target['goarch']) != (
            'github.com/tianon/gosu', 'go' + expected['stdlib'], 'linux', 'amd64'):
        raise ValueError('GOSU_TARGET_OR_SYMBOL_COVERAGE_CHANGED')
    configs = [row['config'] for row in messages if 'config' in row]
    sboms = [row['SBOM'] for row in messages if 'SBOM' in row]
    if len(configs) != 1 or len(sboms) != 1 or any('error' in row for row in messages):
        raise ValueError('GOSU_ANALYSIS_INCOMPLETE')
    config = configs[0]
    if (config['scanner_name'], config['scanner_version'], config['scan_mode'], config['scan_level'], config['db']) != (
            'govulncheck', 'v1.9.0', 'binary', 'symbol', 'https://vuln.go.dev'):
        raise ValueError('GOSU_ANALYSIS_MODE_CHANGED')
    modules = {row['path']: row['version'].removeprefix('v').removeprefix('go') for row in sboms[0]['modules']}
    if sboms[0]['go_version'] != target['goVersion'] or modules != expected:
        raise ValueError('GOSU_ANALYSIS_MODULES_CHANGED')
    return target, modules, config


def main():
    parser = argparse.ArgumentParser()
    for name in ('analysis', 'extract', 'native', 'binary', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    messages = stream(args.analysis)
    target, modules, config = validate(messages, stream(args.extract), digest(args.binary))
    records = [row['osv'] for row in messages if 'osv' in row]
    findings = [row['finding'] for row in messages if 'finding' in row]
    native = json.loads(args.native.read_text(encoding='utf-8'))
    reviews = []
    for result in native['results']:
        if result['source']['path'] != '/usr/local/bin/gosu':
            continue
        for row in result['packages']:
            package = row['package']
            if package['ecosystem'] != 'Go':
                continue
            if modules[package['name']] != package['version']:
                raise ValueError('GOSU_NATIVE_MODULE_VERSION_CHANGED')
            reviews.extend(assess(advisory, package, records, findings, target)
                           for advisory in row.get('vulnerabilities', []))
    if not reviews:
        raise ValueError('GOSU_NATIVE_FINDINGS_MISSING')
    result = {'scope': 'GOSU_1_19_MOBY041_LINUX_AMD64_STATIC_ONLY' if digest(args.binary) == PATCH_SHA256
                       else 'GOSU_1_19_LINUX_AMD64_STATIC_ONLY',
              'inputs': {name: digest(getattr(args, name)) for name in ('analysis', 'extract', 'native', 'binary')},
              'scanner': config, 'target': {key: target[key] for key in ('goVersion', 'goos', 'goarch')},
              'symbolCount': len(target.get('pkgSymbols', [])), 'reviews': reviews,
              'reviewed': sum(row['status'] == 'NOT_AFFECTED' for row in reviews),
              'blocked': sum(row['status'] != 'NOT_AFFECTED' for row in reviews),
              'candidateReady': False, 'releaseDecision': 'NO_GO',
              'limits': 'Only this public binary. Original native severity/exit retained. '
                        'No OS-package waiver or whole-image decision; no account-file inspection.'}
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / 'gosu-symbol-review.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({key: result[key] for key in ('symbolCount', 'reviewed', 'blocked', 'releaseDecision')}))


if __name__ == '__main__':
    main()
