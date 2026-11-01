import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local review artifacts only. No network, bank calls, model calls or external assets.
const directory = path.dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(fs.readFileSync(path.join(directory, 'views.json'), 'utf8'));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const colors = { good: ['#e7f4ec', '#39815d'], gap: ['#fde9e8', '#b94f48'], warn: ['#fff4d9', '#b88722'], actual: ['#eaf0fb', '#5274a7'] };
const geometry = node => ({ x: node[2] * 180 + 40, y: node[3] * 120 + 90, w: 140, h: node[4] === 'decision' ? 80 : 60 });
const pages = [];
const previews = [];
let totalNodes = 0, totalEdges = 0;

for (const page of model.pages) {
  const map = new Map(page.nodes.map(node => [node[0], node]));
  if (map.size !== page.nodes.length) throw new Error(`Duplicate node: ${page.id}`);
  const width = Math.max(...page.nodes.map(node => geometry(node).x)) + 190;
  const height = Math.max(...page.nodes.map(node => geometry(node).y + geometry(node).h)) + 50;
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  cells.push(`<mxCell id="title" value="${esc(page.title)}" style="text;html=1;fontSize=20;fontStyle=1;align=left;" vertex="1" parent="1"><mxGeometry x="40" y="20" width="${width - 80}" height="40" as="geometry"/></mxCell>`);
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#66758a"/></marker></defs><rect width="100%" height="100%" fill="white"/><style>text{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#26364c} .label{font-size:12px} .edge{font-size:10px;paint-order:stroke;stroke:white;stroke-width:4px;stroke-linejoin:round}</style><text x="40" y="43" font-size="20" font-weight="700">${esc(page.title)}</text>`];
  for (const [index, edge] of page.edges.entries()) {
    const [from, to, label, dashed] = edge;
    if (!map.has(from) || !map.has(to)) throw new Error(`Missing endpoint: ${page.id} ${from} ${to}`);
    const a = geometry(map.get(from)), b = geometry(map.get(to));
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const forward = horizontal ? b.x > a.x : b.y > a.y;
    const ax = horizontal ? a.x + (forward ? a.w : 0) : a.x + a.w / 2;
    const ay = horizontal ? a.y + a.h / 2 : a.y + (forward ? a.h : 0);
    const bx = horizontal ? b.x + (forward ? 0 : b.w) : b.x + b.w / 2;
    const by = horizontal ? b.y + b.h / 2 : b.y + (forward ? 0 : b.h);
    const line = horizontal ? `M${ax},${ay} H${(ax + bx) / 2} V${by} H${bx}` : `M${ax},${ay} V${(ay + by) / 2} H${bx} V${by}`;
    svg.push(`<path d="${line}" fill="none" stroke="#66758a" stroke-width="1.5" ${dashed ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#arrow)"/><text class="edge" x="${(ax + bx) / 2 + 3}" y="${(ay + by) / 2 - 6}">${esc(label)}</text>`);
    cells.push(`<mxCell id="e${index}" value="${esc(label)}" edge="1" parent="1" source="${esc(from)}" target="${esc(to)}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;fontSize=10;endArrow=classic;strokeColor=#66758a;${dashed ? 'dashed=1;' : ''}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
  for (const node of page.nodes) {
    const [id, label, , , kind, color = 'actual'] = node;
    const g = geometry(node), [fill, stroke] = colors[color];
    let shape = 'rounded=1;';
    if (kind === 'decision') shape = 'rhombus;';
    if (kind === 'case') shape = 'ellipse;';
    if (kind === 'actor') shape = 'shape=umlActor;';
    if (kind === 'db') shape = 'shape=cylinder3;';
    cells.push(`<mxCell id="${esc(id)}" value="${esc(label).replaceAll('\n', '&#xa;')}" vertex="1" parent="1" style="${shape}html=1;whiteSpace=wrap;fontSize=12;fillColor=${fill};strokeColor=${stroke};"><mxGeometry x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" as="geometry"/></mxCell>`);
    if (kind === 'decision') svg.push(`<polygon points="${g.x+70},${g.y} ${g.x+140},${g.y+40} ${g.x+70},${g.y+80} ${g.x},${g.y+40}" fill="${fill}" stroke="${stroke}"/>`);
    else if (kind === 'case') svg.push(`<ellipse cx="${g.x+70}" cy="${g.y+30}" rx="70" ry="30" fill="${fill}" stroke="${stroke}"/>`);
    else if (kind === 'actor') svg.push(`<circle cx="${g.x+70}" cy="${g.y+8}" r="7" fill="${fill}" stroke="${stroke}"/><path d="M${g.x+70},${g.y+15} v18 m-16,-12 h32 m-16,12 l-12,12 m12,-12 l12,12" fill="none" stroke="${stroke}"/>`);
    else {
      svg.push(`<rect x="${g.x}" y="${g.y}" width="140" height="60" rx="${kind==='db'?0:8}" fill="${fill}" stroke="${stroke}"/>`);
      if (kind === 'db') svg.push(`<ellipse cx="${g.x+70}" cy="${g.y+6}" rx="70" ry="6" fill="${fill}" stroke="${stroke}"/>`);
    }
    const lines = label.split('\n');
    const firstY = kind === 'actor' ? g.y + 58 : g.y + g.h / 2 - (lines.length - 1) * 8 + 4;
    svg.push(`<text class="label" text-anchor="middle" x="${g.x+70}" y="${firstY}">${lines.map((line,i)=>`<tspan x="${g.x+70}" dy="${i?16:0}">${esc(line)}</tspan>`).join('')}</text>`);
  }
  svg.push('</svg>');
  fs.writeFileSync(path.join(directory, `${page.id}.svg`), svg.join('\n'));
  pages.push(`<diagram id="${esc(page.id)}" name="${esc(page.title)}"><mxGraphModel adaptiveColors="auto" page="1" pageWidth="${width}" pageHeight="${height}"><root>${cells.join('')}</root></mxGraphModel></diagram>`);
  previews.push(`<section id="${esc(page.id)}"><h2>${esc(page.title)}</h2><p class="note">${esc(page.note)}</p><div class="canvas">${svg.join('')}</div><p><a href="${page.id}.svg">单页 SVG</a> · 类型：${esc(page.type)}</p></section>`);
  totalNodes += page.nodes.length; totalEdges += page.edges.length;
}

fs.writeFileSync(path.join(directory, 'business-models.drawio'), `<mxfile host="local" agent="banksystem-model-review">${pages.join('')}</mxfile>\n`);
fs.writeFileSync(path.join(directory, 'preview.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>银行双模型复盘</title><style>body{margin:0;background:#f2f5fa;color:#26364c;font-family:'Microsoft YaHei',sans-serif}header,main{max-width:1150px;margin:auto;padding:28px}header{background:#102b49;color:white;max-width:none}header>div{max-width:1150px;margin:auto}h1{font-size:27px}nav{display:flex;flex-wrap:wrap;gap:10px}a{color:#2168a4}header a{color:#d9eaff}section{background:white;border-radius:12px;padding:22px;margin-bottom:26px;border:1px solid #dce4ef}h2{font-size:20px}.note{font-size:14px;line-height:1.8;color:#53647a}.canvas{overflow:auto}svg{max-width:none;display:block}.legend{border-left:4px solid #39815d;padding:12px;background:#eaf2ed}footer{padding:24px;text-align:center;color:#53647a}</style><header><div><p>BUSINESS MODEL REVIEW · 2026-09-30</p><h1>理想业务 × 实际实现 × Vibe Coding 反思</h1><p>本地静态模型，不是 LIVE 运行结果。绿色不代表现场已通过。</p><nav>${model.pages.map(page=>`<a href="#${page.id}">${esc(page.id.slice(0,2))} ${esc(page.title.split('：')[0])}</a>`).join('')}</nav><p><a href="review.md">对照报告</a> · <a href="practice.md">个人练习</a> · <a href="business-models.drawio">可编辑 draw.io 图册</a></p></div></header><main><p class="legend">${esc(model.legend)}</p>${previews.join('')}</main><footer>仅基于当前工作区源码；未运行银行写入或 Agent LIVE。</footer></html>`);
console.log(JSON.stringify({pages:model.pages.length,nodes:totalNodes,edges:totalEdges,output:'business-models.drawio + 8 SVG + preview.html'}));
