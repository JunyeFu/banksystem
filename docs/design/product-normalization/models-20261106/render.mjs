// Same-source diagram previews only; no product page, model, or bank calls.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const here=path.dirname(fileURLToPath(import.meta.url));
const argument=name=>process.argv[process.argv.indexOf(name)+1];
assert(process.argv.includes('--playwright')&&process.argv.includes('--browser'),'Use existing --playwright module directory and --browser executable');
const {chromium}=createRequire(import.meta.url)(path.resolve(argument('--playwright')));
const browser=await chromium.launch({headless:true,executablePath:path.resolve(argument('--browser'))});
const model=JSON.parse(fs.readFileSync(path.join(here,'model.json'),'utf8'));
const results=[];
try{
  const context=await browser.newContext();
  const page=await context.newPage(),errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith('file:'))network.push(request.url());});
  for(const view of model.views){
    await page.goto(pathToFileURL(path.join(here,`${view.id}.svg`)).href);
    await page.evaluate(()=>document.fonts.ready);
    const dimensions=await page.locator('svg').evaluate(svg=>({width:Number(svg.getAttribute('width')),height:Number(svg.getAttribute('height'))}));
    await page.setViewportSize(dimensions);
    const geometry=await page.evaluate(()=>{
      const svg=document.querySelector('svg'),w=Number(svg.getAttribute('width')),h=Number(svg.getAttribute('height'));
      const texts=[...svg.querySelectorAll('text')].map(node=>{const r=node.getBBox();return {id:node.dataset.cell||node.dataset.edgeLabel,text:node.textContent,x:r.x,y:r.y,width:r.width,height:r.height};});
      const clipped=texts.filter(r=>r.x<0||r.y<0||r.x+r.width>w||r.y+r.height>h);
      const paths=[...svg.querySelectorAll('path[data-edge]')].map(node=>({id:node.dataset.edge,path:node.getAttribute('d')}));
      const labels=texts.filter(row=>svg.querySelector(`[data-edge-label="${row.id}"]`));
      const overlappingLabels=[];
      for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
        const a=labels[i],b=labels[j];
        if(Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y))overlappingLabels.push([a.id,b.id]);
      }
      return {texts:texts.length,paths:paths.length,straightPathSegments:paths.every(row=>/^M[-\d.e+ ]+ L[-\d.e+ ]+$/.test(row.path)),clipped,overlappingLabels,nonempty:svg.querySelectorAll('rect,ellipse,circle').length>0};
    });
    assert(geometry.nonempty,`${view.id}: empty diagram`);
    assert.deepEqual(geometry.clipped,[],`${view.id}: clipped text`);
    assert.deepEqual(geometry.overlappingLabels,[],`${view.id}: overlapping edge labels`);
    assert(geometry.straightPathSegments,`${view.id}: unexpected path geometry`);
    assert.equal(geometry.paths,view.type==='graph'?view.edges.length:view.type==='sequence'?view.messages.length:0,`${view.id}: disconnected edge projection`);
    assert(geometry.texts>3,`${view.id}: missing title/content`);
    await page.screenshot({path:path.join(here,`${view.id}.png`)});
    results.push({id:view.id,...dimensions,...geometry});
  }
  await page.goto(pathToFileURL(path.join(here,'index.html')).href);
  assert.equal(await page.locator('main section').count(),model.views.length);
  assert(await page.getByRole('link',{name:'可编辑draw.io',exact:true}).isVisible());
  assert.equal(await page.locator('img').evaluateAll(images=>images.filter(image=>!image.complete||image.naturalWidth===0).length),0);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  const result={status:'PASSED',scope:'LOCAL_SAME_XML_GEOMETRY_PREVIEWS_NOT_DRAWIO_NATIVE_EXPORT',asOf:model.asOf,views:results,browser:browser.version(),externalRequests:0,pageErrors:errors,productDecision:'NO_GO'};
  fs.writeFileSync(path.join(here,'render-check.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,views:results.length,clippedText:0,externalRequests:0,productDecision:'NO_GO'}));
}finally{await browser.close();}
