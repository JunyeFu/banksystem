"""Build the dated source model and local previews; never run product services."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import unicodedata
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PALETTE = {'code': ('#eaf1fa', '#406894'), 'authority': ('#e6f2ef', '#267368'),
           'pending': ('#fff2da', '#a97722'), 'neutral': ('#f4f6f9', '#7d8ca0')}


def node(root, identity, label, x, y, width=260, height=90, kind='component', role='code'):
    fill, stroke = PALETTE[role]
    shape = {'component': 'shape=component;', 'database': 'shape=cylinder3;', 'state': 'rounded=1;arcSize=20;',
             'actor': 'shape=umlActor;', 'usecase': 'ellipse;', 'entity': 'rounded=0;', 'text': 'text;align=left;'}[kind]
    style = shape + f'html=1;whiteSpace=wrap;fontFamily=Microsoft YaHei;fontSize=14;fontColor=#23364e;fillColor={fill};strokeColor={stroke};'
    if kind == 'text':
        style += 'fillColor=none;strokeColor=none;'
    cell = ET.SubElement(root, 'mxCell', id=identity, value=label, vertex='1', parent='1', style=style)
    ET.SubElement(cell, 'mxGeometry', x=str(x), y=str(y), width=str(width), height=str(height), attrib={'as': 'geometry'})


def edge(root, identity, source, target, label, kind):
    style = 'html=1;fontSize=13;fontFamily=Microsoft YaHei;strokeColor=#66788d;fontColor=#34485e;labelBackgroundColor=#ffffff;'
    style += {'dependency': 'dashed=1;endArrow=open;', 'state': 'endArrow=open;', 'association': 'endArrow=none;'}[kind]
    cell = ET.SubElement(root, 'mxCell', id=identity, source=source, target=target, value=label, edge='1', parent='1', style=style)
    ET.SubElement(cell, 'mxGeometry', relative='1', attrib={'as': 'geometry'})


def frame(view):
    page = ET.Element('diagram', id=view['id'], name=view['title'])
    model = ET.SubElement(page, 'mxGraphModel', adaptiveColors='auto', page='1', pageWidth=str(view['width']), pageHeight=str(view['height']))
    root = ET.SubElement(model, 'root')
    ET.SubElement(root, 'mxCell', id='0')
    ET.SubElement(root, 'mxCell', id='1', parent='0')
    return page, root


def dsm(view):
    modules = view['modules']
    names = [row[0] for row in modules]
    registry = (ROOT / 'docs/architecture/refactoring/module-boundaries-v1.yaml').read_text(encoding='utf-8')
    declared = []
    for _, _, identity in modules:
        line = next(line for line in registry.splitlines() if f'id: {identity},' in line)
        declared.append(re.findall(r'bank\.[\w-]+', re.search(r'allowedDependencies:\s*\[([^\]]*)\]', line)[1]))
    dependencies, file_count = [], 0
    source_root = ROOT / 'services/bank-channel-service/src/main/java/local/bank/channel'
    for name in names:
        for file in sorted((source_root / name).rglob('*.java')):
            file_count += 1
            for line_number, line in enumerate(file.read_text(encoding='utf-8').splitlines(), 1):
                match = re.match(r'import\s+(?:static\s+)?local\.bank\.channel\.(\w+)\.', line)
                if match and match[1] in names and match[1] != name:
                    dependencies.append({'from': name, 'to': match[1], 'path': file.relative_to(ROOT).as_posix(), 'line': line_number, 'import': line})
    observed = {(row['from'], row['to']) for row in dependencies}
    reach = [[(a, b) in observed for b in names] for a in names]
    for k in range(len(names)):
        for i in range(len(names)):
            for j in range(len(names)):
                reach[i][j] = reach[i][j] or (reach[i][k] and reach[k][j])
    cycles, assigned = [], set()
    for i, name in enumerate(names):
        if name in assigned:
            continue
        group = [peer for j, peer in enumerate(names) if i == j or (reach[i][j] and reach[j][i])]
        assigned.update(group)
        if len(group) > 1:
            cycles.append(group)
    drift = sorted([a, b] for a, b in observed if modules[names.index(b)][2] not in declared[names.index(a)])
    view['dsmEvidence'] = {'sourceFiles': file_count, 'importEdges': len(observed), 'undeclaredEdges': drift, 'cycleGroups': cycles, 'dependencies': dependencies}
    page, root = frame(view)
    for side, offset in [('声明', 30), ('实际import', 780)]:
        node(root, f'{side}-heading', side, offset, 140, 600, 30, 'text', 'neutral')
        for i, (a, label, _) in enumerate(modules):
            node(root, f'{side}-row-{i}', f'{i+1:02} {label}', offset, 235+i*44, 140, 40, 'text', 'neutral')
            node(root, f'{side}-col-{i}', f'{i+1:02}', offset+145+i*44, 185, 40, 40, 'text', 'neutral')
            for j, (b, _, target) in enumerate(modules):
                active = target in declared[i] if side == '声明' else (a, b) in observed
                node(root, f'{side}-{i}-{j}', '—' if i == j else '●' if active else '', offset+145+j*44, 235+i*44, 40, 40, 'entity', 'code' if active else 'neutral')
    node(root, 'dsm-summary', f"扫描{file_count}文件 / {len(observed)}条跨模块边 / {len(drift)}条未声明；强连通组：" + ('；'.join(' ↔ '.join(group) for group in cycles) or '未发现'), 30, 770, 1440, 70, 'text', 'neutral')
    return page


def generate(view, sequence):
    if view['type'] == 'sequence':
        page = ET.fromstring(sequence.layout(view)).find('diagram')
        page.set('id', view['id'])
        root = page.find('mxGraphModel/root')
        for cell in root:
            geometry = cell.find('mxGeometry')
            if geometry is not None and cell.get('parent') == '1' and cell.get('vertex') == '1':
                geometry.set('y', str(float(geometry.get('y', 0))+80))
            if cell.get('edge') == '1':
                for point in cell.findall('mxGeometry/Array/mxPoint'):
                    point.set('y', str(float(point.get('y'))+80))
            cell.set('style', cell.get('style', '')+'fontFamily=Microsoft YaHei;fontSize=14;')
        geometry = [cell.find('mxGeometry') for cell in root if cell.get('vertex') == '1' and cell.get('parent') == '1']
        view['width'] = int(max(float(g.get('x'))+float(g.get('width')) for g in geometry)+80)
        view['height'] = int(max(float(g.get('y'))+float(g.get('height')) for g in geometry)+120)
    elif view['type'] == 'dsm':
        page = dsm(view)
        root = page.find('mxGraphModel/root')
    else:
        page, root = frame(view)
        if view['type'] == 'capabilities':
            node(root, 'target-heading', '目标承诺', 300, 125, 480, 30, 'text', 'authority')
            node(root, 'source-heading', '源码事实与剩余证据门', 850, 125, 600, 30, 'text', 'code')
            for i, (label, target, current) in enumerate(view['rows']):
                y = 185+i*80
                node(root, f'cap-label-{i}', label, 30, y, 240, 65, 'entity', 'neutral')
                node(root, f'cap-target-{i}', target, 300, y, 480, 65, 'entity', 'authority')
                node(root, f'cap-source-{i}', current, 850, y, 600, 65, 'entity', 'pending' if any(word in current for word in ('待','未','不等于')) else 'code')
        else:
            for identity, label, x, y, kind, role in view['nodes']:
                node(root, identity, label, x, y, 260 if kind != 'actor' else 100, 90, kind, role)
            for i, (source, target, label, kind) in enumerate(view['edges']):
                edge(root, f'e-{i}', source, target, label, kind)
    node(root, 'view-title', view['title'], 30, 10, view['width']-60, 45, 'text', 'neutral')
    node(root, 'view-subtitle', view['subtitle'], 30, 65, view['width']-60, 50, 'text', 'neutral')
    node(root, 'view-note', view['note'], 30, view['height']-85, view['width']-60, 65, 'text', 'pending')
    model = page.find('mxGraphModel')
    model.set('pageWidth', str(view['width']))
    model.set('pageHeight', str(view['height']))
    return page


def style(cell):
    return dict(part.split('=', 1) for part in cell.get('style', '').split(';') if '=' in part)


def lines(text, width):
    result = []
    for paragraph in text.splitlines():
        line, size = '', 0
        for char in paragraph:
            size += 14 if unicodedata.east_asian_width(char) in 'WF' else 7.5
            if size > width and line:
                result.append(line)
                line, size = '', 14 if unicodedata.east_asian_width(char) in 'WF' else 7.5
            line += char
        result.append(line)
    return result


def preview(view, page):
    cells = {cell.get('id'): cell for cell in page.findall('mxGraphModel/root/mxCell')}
    boxes = {}
    def box(identity):
        if identity not in boxes:
            cell = cells[identity]
            g = cell.find('mxGeometry')
            x, y, w, h = (float(g.get(key, 0)) for key in ('x','y','width','height'))
            if cell.get('parent') not in ('0','1',None):
                parent = box(cell.get('parent')); x += parent[0]; y += parent[1]
            boxes[identity] = (x,y,w,h)
        return boxes[identity]
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{view["width"]}" height="{view["height"]}" viewBox="0 0 {view["width"]} {view["height"]}">',
           '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="#66788d"/></marker></defs>',
           '<style>text{font-family:"Microsoft YaHei",sans-serif;fill:#23364e;font-size:14px}.edge-label{paint-order:stroke;stroke:white;stroke-width:5px;stroke-linejoin:round}</style><rect width="100%" height="100%" fill="white"/>']
    for identity, cell in cells.items():
        if cell.get('vertex') != '1':
            continue
        x,y,w,h = box(identity); s = style(cell); raw = cell.get('style',''); label = cell.get('value','')
        color, stroke = s.get('fillColor','#eaf1fa'), s.get('strokeColor','#7d8ca0')
        if 'umlLifeline' in raw:
            out += [f'<rect x="{x}" y="{y}" width="{w}" height="40" fill="#eaf1fa" stroke="#406894"/>', f'<path d="M{x+w/2} {y+40} V{y+h}" stroke="#9da9b6" stroke-dasharray="5 4"/>']
        elif raw.startswith('text;'):
            pass
        elif 'ellipse;' in raw:
            out.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" fill="{color}" stroke="{stroke}"/>')
        elif 'umlActor' in raw:
            out.append(f'<circle cx="{x+w/2}" cy="{y+17}" r="9" fill="white" stroke="{stroke}"/><path d="M{x+w/2} {y+26} v25 m-20 -13 h40 m-20 13 l-18 20 m18 -20 l18 20" fill="none" stroke="{stroke}"/>')
        else:
            out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{color}" stroke="{stroke}"/>')
            if 'cylinder3' in raw:
                out.append(f'<ellipse cx="{x+w/2}" cy="{y+8}" rx="{w/2}" ry="8" fill="{color}" stroke="{stroke}"/>')
            if 'shape=component;' in raw:
                out.append(f'<rect x="{x+w-22}" y="{y+8}" width="13" height="16" fill="none" stroke="{stroke}"/>')
        if not label:
            continue
        wrapped = lines(label, w-25)
        lh = 20
        start_y = y+20 if raw.startswith('text;') or 'umlLifeline' in raw else y+h/2-(len(wrapped)-1)*lh/2+5
        if 'umlActor' in raw:
            start_y = y+h-2
        assert len(wrapped)*lh <= h+10 or 'umlLifeline' in raw, (view['id'], identity, 'text clipped', wrapped)
        tx = x+12 if raw.startswith('text;') else x+w/2
        anchor = 'start' if raw.startswith('text;') else 'middle'
        title_style = ' style="font-size:22px;font-weight:600"' if identity == 'view-title' else ''
        out.append(f'<text data-cell="{escape(identity)}" x="{tx}" y="{start_y}" text-anchor="{anchor}"{title_style}>' + ''.join(f'<tspan x="{tx}" dy="{lh if i else 0}">{escape(line)}</tspan>' for i,line in enumerate(wrapped)) + '</text>')
    for identity, cell in cells.items():
        if cell.get('edge') != '1':
            continue
        s = style(cell); a,b = box(cell.get('source')),box(cell.get('target'))
        if 'exitX' in s:
            x1,y1 = a[0]+a[2]*float(s['exitX']),a[1]+a[3]*float(s['exitY'])
            x2,y2 = b[0]+b[2]*float(s['entryX']),b[1]+b[3]*float(s['entryY'])
        else:
            ax,ay,bx,by = a[0]+a[2]/2,a[1]+a[3]/2,b[0]+b[2]/2,b[1]+b[3]/2
            dx,dy = bx-ax,by-ay
            t1=min(abs(a[2]/2/dx) if dx else float('inf'),abs(a[3]/2/dy) if dy else float('inf'))
            t2=min(abs(b[2]/2/dx) if dx else float('inf'),abs(b[3]/2/dy) if dy else float('inf'))
            x1,y1,x2,y2=ax+dx*t1,ay+dy*t1,bx-dx*t2,by-dy*t2
        marker = '' if s.get('endArrow')=='none' else ' marker-end="url(#arrow)"'
        dash = ' stroke-dasharray="6 4"' if s.get('dashed')=='1' else ''
        out.append(f'<path data-edge="{escape(identity)}" d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="#66788d" stroke-width="1.5"{marker}{dash}/>')
        if cell.get('value'):
            out.append(f'<text class="edge-label" data-edge-label="{escape(identity)}" text-anchor="middle" x="{(x1+x2)/2}" y="{(y1+y2)/2-9}">{escape(cell.get("value"))}</text>')
    out.append('</svg>')
    return '\n'.join(out)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--drawio-skill', type=Path, required=True)
    args=parser.parse_args()
    spec=importlib.util.spec_from_file_location('sequence_layout',args.drawio_skill/'scripts/seqlayout.py')
    sequence=importlib.util.module_from_spec(spec);spec.loader.exec_module(sequence)
    sequence.MIN_SPACING=320
    model=json.loads((HERE/'model.json').read_text(encoding='utf-8'))
    sources={}
    for identity,(name,needle) in model['sources'].items():
        content=(ROOT/name).read_text(encoding='utf-8')
        assert needle in content, (identity,name,'source anchor missing',needle)
        sources[identity]={'path':name,'line':content[:content.index(needle)].count('\n')+1,'anchor':needle}
    document=ET.Element('mxfile',host='local',agent='banksystem-current-source-model')
    for view in model['views']:
        assert all(identity in sources for identity in view['refs'])
        page=generate(view,sequence);document.append(page)
        (HERE/(view['id']+'.svg')).write_text(preview(view,page),encoding='utf-8')
    ET.ElementTree(document).write(HERE/'current-business-models.drawio',encoding='utf-8',xml_declaration=True)
    (HERE/'source-evidence.json').write_text(json.dumps({'asOf':model['asOf'],'scope':model['scope'],'sources':sources,
        'views':[{'id':view['id'],'refs':view['refs']} for view in model['views']],
        'dsm':next(view['dsmEvidence'] for view in model['views'] if view['type']=='dsm')},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    entries=''.join(f'<section><h2>{escape(view["title"])}</h2><p>{escape(view["subtitle"])}</p><img src="{view["id"]}.svg" alt="{escape(view["title"])}"></section>' for view in model['views'])
    (HERE/'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>当前业务与实现模型 · 2026-11-06</title><style>body{font-family:"Microsoft YaHei",sans-serif;color:#23364e;background:#f4f6f9;margin:0}header,main{max-width:1500px;margin:auto;padding:24px}section{background:white;padding:20px;margin-bottom:24px}img{width:100%;height:auto}p{line-height:1.8}a{color:#267368}</style><header><h1>当前业务与实现模型 · 2026-11-06</h1><p>整体NO_GO。目标、源码、历史LIVE和待验收分开；本图册不是产品运行证明。</p><a href="current-business-models.drawio">可编辑draw.io</a> · <a href="README.md">来源与差异说明</a></header><main>'+entries+'</main></html>',encoding='utf-8')
    print(json.dumps({'views':len(model['views']),'sourceAnchors':len(sources),'evidenceLevel':'STATIC','dsm':{key:next(view['dsmEvidence'] for view in model['views'] if view['type']=='dsm')[key] for key in ('sourceFiles','importEdges','undeclaredEdges','cycleGroups')},'productDecision':'NO_GO'},ensure_ascii=False))


if __name__=='__main__':
    main()
