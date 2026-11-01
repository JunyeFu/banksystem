import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {capabilities, modules} from './model.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir,'../../../../..');
const sourceRoot = path.join(root,'services/bank-channel-service/src/main/java/local/bank/channel');
const registryPath = 'docs/architecture/refactoring/module-boundaries-v1.yaml';
const registry = fs.readFileSync(path.join(root,registryPath),'utf8');
const index = new Map(modules.map(([name],i)=>[name,i]));
const declared = modules.map(([, ,id])=>{
  const line = registry.split('\n').find(line=>line.includes(`id: ${id},`));
  assert(line, `Registry missing ${id}`);
  return [...line.match(/allowedDependencies:\s*\[([^\]]*)\]/)[1].matchAll(/bank\.[\w-]+/g)].map(match=>match[0]);
});
const dependencies = [];
let sourceFiles = 0;
function scan(folder, sourceModule) {
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    const full=path.join(folder,entry.name);
    if(entry.isDirectory()) scan(full,sourceModule);
    else if(entry.name.endsWith('.java')) {
      sourceFiles++;
      fs.readFileSync(full,'utf8').split('\n').forEach((line,i)=>{
        const match=line.match(/^import\s+(?:static\s+)?local\.bank\.channel\.(\w+)\./);
        if(match && index.has(match[1]) && match[1]!==sourceModule)
          dependencies.push({from:sourceModule,to:match[1],file:path.relative(root,full).replaceAll('\\','/'),line:i+1,import:line.trim()});
      });
    }
  }
}
for(const [name] of modules) scan(path.join(sourceRoot,name),name);
const actual = modules.map(()=>modules.map(()=>false));
for(const dependency of dependencies) actual[index.get(dependency.from)][index.get(dependency.to)]=true;
const reach=actual.map(row=>[...row]);
for(let k=0;k<modules.length;k++) for(let i=0;i<modules.length;i++) for(let j=0;j<modules.length;j++)
  reach[i][j] ||= reach[i][k] && reach[k][j];
const cycleGroups=[];
const assigned=new Set();
for(let i=0;i<modules.length;i++) if(!assigned.has(i)) {
  const group=modules.map((_,j)=>j).filter(j=>j===i || (reach[i][j]&&reach[j][i]));
  for(const j of group) assigned.add(j);
  if(group.length>1) cycleGroups.push(group.map(j=>modules[j][0]));
}
const declaredMatrix=modules.map(([, ,id],i)=>modules.map(([, ,targetId],j)=>i!==j && declared[i].includes(targetId)));
const drifts=[];
for(let i=0;i<modules.length;i++)for(let j=0;j<modules.length;j++)if(actual[i][j]&&!declaredMatrix[i][j])drifts.push([modules[i][0],modules[j][0]]);
const analysis={scope:'11 production domain packages; explicit Java imports in main sources; no runtime/SQL/HTTP call-graph claim',sourceFiles,modules,registry:registryPath,declaredMatrix,actualMatrix:actual,dependencies,cycleGroups,undeclaredImportEdges:drifts};
fs.writeFileSync(path.join(dir,'dependency-evidence.json'),JSON.stringify(analysis,null,2)+'\n');

const colors={target:['#e6f2ef','#207267'],implemented:['#e9f0fa','#416a9f'],partial:['#fff1d5','#b47b16'],gap:['#fbe5e6','#b54d56'],neutral:['#f5f7fa','#8793a6']};
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
class Scene {
  constructor(id,title,subtitle,width=1600,height=830){Object.assign(this,{id,title,subtitle,width,height,nodes:[],edges:[]});}
  node(id,label,x,y,w,h,kind='box',color='neutral',parent='1'){assert(!this.nodes.some(node=>node.id===id));this.nodes.push({id,label,x,y,w,h,kind,color,parent});return id;}
  text(id,label,x,y,w=700,h=30,parent='1'){return this.node(id,label,x,y,w,h,'text','neutral',parent);}
  edge(from,to,label='',color='neutral',dashed=false){this.edges.push({id:`edge${this.edges.length}`,from,to,label,color,dashed});}
  absolute(node){let x=node.x,y=node.y,p=node.parent;while(p!=='1'){const owner=this.nodes.find(node=>node.id===p);assert(owner);x+=owner.x;y+=owner.y;p=owner.parent;}return {...node,x,y};}
  xml(){
    const nodes=this.nodes.map(node=>{
      const [fill,stroke]=colors[node.color];
      const shape=node.kind==='group'?'swimlane;startSize=36;container=1;pointerEvents=0;':node.kind==='component'?'shape=component;':node.kind==='database'?'shape=cylinder3;':node.kind==='text'?'text;align=left;':'rounded=1;';
      return `<mxCell id="${node.id}" value="${escape(node.label).replaceAll('\n','&#xa;')}" parent="${node.parent}" vertex="1" style="${shape}html=1;whiteSpace=wrap;fontSize=${node.kind==='text'?16:13};fillColor=${node.kind==='text'?'none':fill};strokeColor=${node.kind==='text'?'none':stroke};"><mxGeometry x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" as="geometry"/></mxCell>`;
    });
    const edges=this.edges.map(edge=>{
      const a=this.nodes.find(node=>node.id===edge.from),b=this.nodes.find(node=>node.id===edge.to);assert(a&&b);
      const ancestors=node=>{const ids=[];let parent=node.parent;while(true){ids.push(parent);if(parent==='1')break;parent=this.nodes.find(owner=>owner.id===parent).parent;}return ids;};
      const targetParents=new Set(ancestors(b));
      const parent=ancestors(a).find(id=>targetParents.has(id));
      return `<mxCell id="${edge.id}" edge="1" parent="${parent}" source="${edge.from}" target="${edge.to}" value="${escape(edge.label)}" style="html=1;edgeStyle=orthogonalEdgeStyle;endArrow=${edge.dashed?'open':'classic'};dashed=${edge.dashed?1:0};strokeColor=${colors[edge.color][1]};fontSize=11;"><mxGeometry relative="1" as="geometry"/></mxCell>`;
    });
    return `<diagram id="${this.id}" name="${escape(this.title)}"><mxGraphModel adaptiveColors="auto" page="1" pageWidth="${this.width}" pageHeight="${this.height}"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${nodes.join('')}${edges.join('')}</root></mxGraphModel></diagram>`;
  }
  svg(){
    const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}"><defs>${Object.entries(colors).map(([name,[,stroke]])=>`<marker id="${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 L9 5 L1 9" fill="none" stroke="${stroke}" stroke-width="1.5"/></marker>`).join('')}</defs><style>text{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#23364e}.edge{font-size:11px;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}</style><rect width="100%" height="100%" fill="white"/><rect width="100%" height="94" fill="#14334d"/><text x="30" y="40" style="fill:#fff" font-size="26" font-weight="700">${escape(this.title)}</text><text x="30" y="72" style="fill:#d9e7f1" font-size="14">${escape(this.subtitle)}</text>`];
    const drawNode=node=>{
      const n=this.absolute(node),[fill,stroke]=colors[n.color];
      if(n.kind!=='text') {
        out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.kind==='group'?9:4}" fill="${n.kind==='group'?'#fafbfd':fill}" stroke="${stroke}" stroke-width="${n.kind==='group'?1:1.4}"/>`);
        if(n.kind==='group') out.push(`<path d="M${n.x},${n.y+36} H${n.x+n.w}" stroke="${stroke}"/>`);
        if(n.kind==='component')out.push(`<rect x="${n.x+n.w-22}" y="${n.y+8}" width="13" height="16" fill="none" stroke="${stroke}"/><rect x="${n.x+n.w-26}" y="${n.y+10}" width="7" height="4" fill="${fill}" stroke="${stroke}"/><rect x="${n.x+n.w-26}" y="${n.y+18}" width="7" height="4" fill="${fill}" stroke="${stroke}"/>`);
        if(n.kind==='database')out.push(`<ellipse cx="${n.x+n.w/2}" cy="${n.y+7}" rx="${n.w/2}" ry="7" fill="${fill}" stroke="${stroke}"/>`);
      }
      const lines=n.label.split('\n');
      const left=n.kind==='group'||n.kind==='text';
      const tx=left?n.x+12:n.x+n.w/2-(n.kind==='component'?12:0);
      const ty=n.kind==='group'?n.y+24:n.kind==='text'?n.y+19:n.y+n.h/2-(lines.length-1)*8+5;
      out.push(`<text text-anchor="${left?'start':'middle'}" x="${tx}" y="${ty}" font-size="${left?16:13}" font-weight="${n.kind==='group'?700:400}">${lines.map((line,i)=>`<tspan x="${tx}" dy="${i?16:0}">${escape(line)}</tspan>`).join('')}</text>`);
    };
    this.nodes.filter(node=>node.kind==='group').forEach(drawNode);
    for(const edge of this.edges){
      const a=this.absolute(this.nodes.find(node=>node.id===edge.from)),b=this.absolute(this.nodes.find(node=>node.id===edge.to));
      const ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2;
      const dx=bx-ax,dy=by-ay;
      const aScale=Math.min(dx?Math.abs((a.w/2)/dx):Infinity,dy?Math.abs((a.h/2)/dy):Infinity);
      const bScale=Math.min(dx?Math.abs((b.w/2)/dx):Infinity,dy?Math.abs((b.h/2)/dy):Infinity);
      const x1=ax+dx*aScale,y1=ay+dy*aScale,x2=bx-dx*bScale,y2=by-dy*bScale;
      out.push(`<path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="${colors[edge.color][1]}" stroke-width="${edge.color==='gap'?2:1.5}" ${edge.dashed?'stroke-dasharray="6 4"':''} marker-end="url(#${edge.color})"/><text class="edge" x="${(x1+x2)/2+5}" y="${(y1+y2)/2-6}">${escape(edge.label)}</text>`);
    }
    this.nodes.filter(node=>node.kind!=='group').forEach(drawNode);
    out.push('</svg>');return out.join('\n');
  }
}

const scenes=[];
const capacity=new Scene('01-capability-map','业务能力地图｜目标承诺 × 当前实现','Business Capability Map · 同一布局逐项对照；颜色表示本轮源码观察，不表示 LIVE 通过',1600,815);
for(const [side,offset] of [['desired',20],['actual',820]]){
  capacity.node(side,side==='desired'?'TARGET｜文档与约束要求':'AS-IS｜当前代码与业务缺口',offset,110,760,610,'group');
  capabilities.forEach((group,row)=>{
    capacity.text(`${side}-g${row}`,group.group,20,50+row*135,720,25,side);
    group.items.forEach((item,col)=>capacity.node(`${side}-${row}-${col}`,[item[0],...(side==='desired'?item.slice(1,3):item.slice(3,5))].join('\n'),40+180*col,90+row*135,140,60,'box',side==='desired'?'target':item[5],side));
  });
}
capacity.text('key','目标：绿色｜已有代码：蓝色｜边界/恢复窗口：黄色｜明确语义或功能缺口：红色',25,745,1500);
capacity.text('scope','业务实现不等于发布完成；Fineract 唯一账务源；Flowise 不进入交付链。详见上一轮 M01–M17。',25,780,1500);
scenes.push(capacity);

const component=new Scene('02-uml-component','UML 组件分层对照｜职责在哪里实现？','Component Diagram · 单个 Bank Channel 容器内部；依赖箭头为虚线；右侧红线标记已观测的越层职责',1600,875);
for(const [side,x] of [['desired',20],['actual',820]]){
  component.node(side,side==='desired'?'TARGET｜组件职责与关联资源':'AS-IS｜组件职责与关联资源',x,110,760,665,'group');
  component.node(`${side}-bank`,'«container» Bank Channel',20,40,720,500,'group','neutral',side);
  const n=(id,label,col,row,kind='component',color='neutral')=>component.node(`${side}-${id}`,label,40+col*180,row<4?60+row*120:600,140,60,kind,color,row<4?`${side}-bank`:side);
  n('api',side==='desired'?'银行 HTTP API\n请求 / 响应 / 授权':'银行 HTTP API\n含部分业务与 WHERE',1,0,'component',side==='desired'?'target':'partial');
  n('app',side==='desired'?'应用服务\n事务 / 跨模块编排':'应用服务已存在\n入口职责未全收敛',1,1,'component',side==='desired'?'target':'partial');
  n('domains','业务模块集合\n见右侧责任清单',1,2,'component',side==='desired'?'target':'implemented');
  n('repos',side==='desired'?'业务 Repository\nSQL / 锁归属':'业务 Repository\n仍接收 WHERE 片段',0,3,'component',side==='desired'?'target':'partial');
  n('ports',side==='desired'?'五个核心能力端口\n业务类型 / 单位':'五个核心能力端口\n贷款条件 / 单位缺口',2,3,'component',side==='desired'?'target':'gap');
  n('db','Channel PostgreSQL\n工作流 / 投影',0,4,'database','implemented');
  n('core','Fineract API\n唯一账务权威',2,4,'component','implemented');
  component.text(`${side}-list`,'业务模块责任\n身份 / 账户 / 收款人\n支付 / 贷款 / 风险\n文档 / 对账 / EOD\n审计 / 通知 / 投影',530,245,180,130,`${side}-bank`);
  const e=(a,b,label='',color='neutral')=>component.edge(`${side}-${a}`,`${side}-${b}`,label,color,true);
  e('api','app');e('app','domains');e('domains','repos');e('domains','ports');e('repos','db');e('ports','core');
  if(side==='actual'){e('api','repos','查询语法 / 直接存储','gap');e('api','ports','受理事务内核心读取','gap');}
}
component.text('key','组件符号表示逻辑职责；内部框为渠道容器；底部 PostgreSQL / Fineract 是外部资源。具体模块耦合见 DSM。',25,805,1500);
component.text('note','目标要求责任分离；并不要求每一个只读投影增加应用服务，也不禁止合法的跨模块协调。',25,842,1500);
scenes.push(component);

const context=new Scene('03-context-ownership','业务上下文与数据所有权｜两个产品不能互当真相源','Context & Data Ownership · 比较业务边界与权威数据，不把文件夹误认为独立微服务',1600,855);
for(const [side,x] of [['desired',20],['actual',820]]) {
  context.node(side,side==='desired'?'TARGET｜已接受的权威边界':'AS-IS｜边界已有，部分语义未闭合',x,110,760,635,'group');
  const n=(id,label,col,row,kind='box',color='neutral')=>context.node(`${side}-${id}`,label,40+col*180,60+row*120,140,60,kind,color,side);
  n('iam','身份上下文\nKeycloak 身份 / 角色',0,0,'box','implemented');
  n('core','核心银行上下文\n客户 / 账户 / 贷款',2,0,'database','implemented');
  n('channel','渠道业务上下文\n订单 / 申请 / 复核',1,1,'box',side==='desired'?'target':'partial');
  n('local','渠道状态与投影\n不等于核心总账',2,2,'database',side==='desired'?'target':'partial');
  n('test','自动化测试上下文\nJourney / Case / Run',0,3,'box','implemented');
  n('evidence','Harness 状态权威\nSQLite / Evidence',1,3,'database','implemented');
  n('quality','Quality 只读视图\n不拥有执行状态',2,3,'box',side==='desired'?'target':'partial');
  context.edge(`${side}-iam`,`${side}-channel`,'身份映射');
  context.edge(`${side}-channel`,`${side}-core`,'核心 API');
  context.edge(`${side}-channel`,`${side}-local`,'业务状态');
  context.edge(`${side}-test`,`${side}-evidence`,'唯一状态写入');
  context.edge(`${side}-evidence`,`${side}-quality`,'只读投影');
  context.edge(`${side}-test`,`${side}-channel`,'经浏览器测试');
  context.text(`${side}-note`,side==='desired'?'核心事实 → 业务结果 → 测试核验\n申请≠贷款；受理≠入账\n渠道投影≠核心 GL':'当前缺口\n贷款条件 / 单位失真\nGL 对账来源不足\n质量发布投影未实现',40,555,670,75,side);
}
context.text('key','实体归属与部署边界是不同维度；这里只显示宏观所有权，不声称完整 DDD 战略设计已经实现。',25,784,1500);
context.text('note','测试平台不直接写核心数据库；Quality 不增加写控制面；Flowise 仅为历史材料。',25,818,1500);
scenes.push(context);

const dsm=new Scene('04-dependency-dsm','模块依赖结构矩阵｜声明边界 × 源码依赖','Dependency Structure Matrix · 行模块依赖列模块；左侧是现有注册表声明，不等于已修正的理想架构',1600,910);
for(const [side,x,matrix] of [['declared',20,declaredMatrix],['actual',820,actual]]) {
  dsm.node(side,side==='declared'?'DECLARED｜allowedDependencies 注册表':'OBSERVED｜Java 主源码显式 import',x,110,760,625,'group');
  modules.forEach(([,label],i)=>{
    dsm.text(`${side}-row${i}`,`${String(i+1).padStart(2,'0')} ${label}`,15,110+i*40,170,35,side);
    dsm.text(`${side}-col${i}`,String(i+1).padStart(2,'0'),190+i*40,65,40,35,side);
    modules.forEach((_,j)=>{
      const on=matrix[i][j];
      const cycle=side==='actual'&&on&&cycleGroups.some(group=>group.includes(modules[i][0])&&group.includes(modules[j][0]));
      dsm.node(`${side}-${i}-${j}`,i===j?'—':on?'●':'',190+j*40,110+i*40,38,38,'box',i===j?'neutral':cycle?'gap':on?'implemented':'neutral',side);
    });
  });
}
dsm.text('legend','● = 存在依赖；灰色 = 无显式标记/对角线；红色 = 强连通组内部依赖（编译依赖环，不是运行递归）。',25,766,1500);
dsm.text('cycles',`当前强连通组：${cycleGroups.map(group=>group.map(name=>modules[index.get(name)][1]).join(' ↔ ')).join('；')||'未发现'}`,25,805,1500);
dsm.text('drift',`扫描 ${sourceFiles} 个 Java 文件，${actual.flat().filter(Boolean).length} 条跨模块 import 边；${drifts.length} 条未列入当前声明。声明漂移需要人工审查，不自动等于错误依赖。`,25,844,1500);
dsm.text('limits','范围排除根目录核心端口、Test Support、前端和 MCP；不包含 SQL 表引用、反射、HTTP 运行依赖。',25,880,1500);
scenes.push(dsm);

const xml=`<mxfile host="local" agent="banksystem-macro-modeling">${scenes.map(scene=>scene.xml()).join('')}</mxfile>\n`;
fs.writeFileSync(path.join(dir,'macro-business-comparison.drawio'),xml);
for(const scene of scenes) fs.writeFileSync(path.join(dir,`${scene.id}.svg`),scene.svg());
fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>宏观业务模块对照</title><style>body{margin:0;background:#eef2f7;color:#24364e;font-family:'Microsoft YaHei',sans-serif}header,main{max-width:1500px;margin:auto;padding:28px}section{padding:20px;background:white;margin-bottom:24px;border-radius:10px}img{width:100%;height:auto}a{color:#176f9b}p{line-height:1.8}</style><header><h1>业务模块宏观对比 · 专业工程视图</h1><p>能力地图 → UML 组件职责 → 上下文所有权 → DSM 依赖结构。左侧目标/声明，右侧源码实现；所有颜色均不是 LIVE 完成等级。</p><a href="macro-business-comparison.drawio">可编辑 draw.io</a> · <a href="README.md">图种与阅读说明</a> · <a href="dependency-evidence.json">依赖边证据</a></header><main>${scenes.map(scene=>`<section><h2>${escape(scene.title)}</h2><p>${escape(scene.subtitle)}</p><a href="${scene.id}.svg"><img src="${scene.id}.svg" alt="${escape(scene.title)}"></a></section>`).join('')}</main></html>`);
const pngArgument=process.argv.indexOf('--png-module');
if(pngArgument>=0){
  const sharp=createRequire(import.meta.url)(path.resolve(process.argv[pngArgument+1]));
  for(const scene of scenes)await sharp(path.join(dir,`${scene.id}.svg`)).resize({width:scene.width*2}).png().toFile(path.join(dir,`${scene.id}.png`));
}
console.log(JSON.stringify({views:scenes.length,sourceFiles,importEdges:actual.flat().filter(Boolean).length,undeclaredEdges:drifts.length,cycleGroups,scope:'STATIC_IMPORT_GRAPH; not LIVE'}));
