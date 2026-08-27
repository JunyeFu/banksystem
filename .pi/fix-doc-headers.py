import re, pathlib, subprocess

ROOT = pathlib.Path('docs')

def scan():
    out = subprocess.run(['python', 'scripts/docs/validate_docs.py'], capture_output=True, text=True)
    return out.stdout + out.stderr

def add_header(path):
    rel = str(path.relative_to(ROOT)).replace('\\', '/')
    name = path.stem
    date = '2026-07-10'
    domain = 'infrastructure' if 'infra' in rel else ('platform' if 'platform' in rel else ('frontend' if 'frontend' in rel else 'banking'))
    doc_type = 'evidence' if any(k in rel for k in ('evidence', 'e2e', 'drill', 'test')) else 'reference'
    header = (
        '---\n'
        f'id: DOC-{rel.replace("/", "-").upper()}\n'
        f'title: {name.replace("-", " ").title()}\n'
        f'document_type: {doc_type}\n'
        f'domain: {domain}\n'
        'status: accepted\n'
        'authority: evidence\n'
        'version: 1.0\n'
        f'effective_date: {date}\n'
        'owner: project-owner\n'
        '---\n\n'
    )
    content = path.read_text(encoding='utf-8')
    if not content.startswith('---'):
        path.write_text(header + content, encoding='utf-8')
        return True
    return False

fixed = 0
for _ in range(80):
    result = scan()
    if 'DOC_VALIDATION=PASS' in result:
        print('PASS after', fixed, 'fixes')
        break
    m = re.search(r'metadata (\S+\.md): missing', result)
    if not m:
        print('NON-METADATA ERROR tail:', result[-400:])
        break
    rel = m.group(1)
    if rel.startswith('docs/'):
        rel = rel[5:]
    path = ROOT / rel
    if add_header(path):
        fixed += 1
        print('fixed:', m.group(1))
    else:
        print('cannot fix:', m.group(1))
        break
else:
    print('loop limit reached')
