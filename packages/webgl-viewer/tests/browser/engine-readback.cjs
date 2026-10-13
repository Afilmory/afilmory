const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '@playwright/test')
const cp=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict')
const root=process.env.UPSTREAM_ROOT
const ref=process.env.AVIF_REFERENCE
;(async()=>{
 const browser=await chromium.launch({channel:'chromium',args:['--enable-unsafe-webgpu']})
 const reports=[]
 try {
 for(const primary of [1,12,9,'color-1','color-12','color-9'])for(const hdr of [false,true]){
  const page=await browser.newPage({viewport:{width:200,height:150},deviceScaleFactor:1})
  const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())})
  await page.addInitScript(hdr=>{
   const original=window.matchMedia.bind(window)
   window.matchMedia=query=>query==='(dynamic-range: high)'?{matches:hdr,media:query,addEventListener(){},removeEventListener(){}}:original(query)
  },hdr)
  await page.goto(process.env.AVIF_TEST_URL)
  const requests=[];page.on('request',r=>{if(r.url().endsWith('.avif'))requests.push(r.url())})
  const actual=await page.evaluate(async({primary})=>{
   const {WebGPUImageViewerEngine}=await import('/engine.js')
   const host=document.createElement('div');host.style.cssText='width:32px;height:24px;position:relative';document.body.append(host)
   const canvas=document.createElement('canvas');canvas.width=32;canvas.height=24;canvas.style.cssText='width:32px;height:24px';host.append(canvas)
   const failures=[],states=[]
   const config={src:'',className:'',width:32,height:24,initialScale:1,minScale:0.1,maxScale:10,wheel:{step:0.1},pinch:{step:0.1},doubleClick:{step:2,mode:'toggle',animationTime:0},panning:{},limitToBounds:true,centerOnInit:true,smooth:false,alignmentAnimation:{sizeX:0,sizeY:0,velocityAlignmentTime:0},velocityAnimation:{sensitivity:1,animationTime:0},debug:false}
   const engine=new WebGPUImageViewerEngine(canvas,config,e=>failures.push(e.message),v=>states.push(v))
   await engine.initialized
   const device=engine.device
   // Keep the real engine's pipeline, worker, uniforms, uploads and HDR predicate.
   // Substitute only a same-format render target so it can be read back without presentation conversion.
   const output=device.createTexture({size:[32,24],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC})
   engine.context.getCurrentTexture=()=>output
   await engine.loadImage(new URL(`/gainmap-${primary}.avif`,location.origin).href,32,24)
   await device.queue.onSubmittedWorkDone()
   const read=device.createBuffer({size:256*24,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})
   const enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture:output},{buffer:read,bytesPerRow:256},[32,24]);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ)
   const data=new Uint16Array(read.getMappedRange().slice(0));read.unmap()
   const half=b=>{const e=(b>>10)&31;return (b&32768?-1:1)*(e?(1+(b&1023)/1024)*2**(e-15):(b&1023)*2**-24)}
   const pixels=[];for(let y=0;y<24;y++)for(let x=0;x<32;x++)pixels.push([0,1,2,3].map(c=>half(data[y*128+x*4+c])))
   const result={hdr:engine.isHDR,extended:engine.extendedRange,states,failures,viewport:engine.getViewport(),pixels}
   output.destroy();read.destroy();engine.destroy();return result
  },{primary})
  assert.equal(actual.hdr,hdr);assert.equal(actual.extended,true);assert.deepEqual(actual.failures,[]);assert.equal(requests.length,1)
  const reference=JSON.parse(cp.execFileSync(ref,[`${root}/packages/webgl-viewer/src/fixtures/gainmap-${primary}.avif`,hdr?'hdr':'sdr']))
  const linear=x=>Math.sign(x)*(Math.abs(x)<=0.04045?Math.abs(x)/12.92:((Math.abs(x)+0.055)/1.055)**2.4)
  const pqLinear=v=>{const p=v**(1/(2523/32));return (Math.max(p-3424/4096,0)/(2413/128-2392/128*p))**(1/(2610/16384))*10000/203}
  let maxError=0,maxRelative=0,maxOutput=0,worst=null,maxPixelRelative=0
  const toP3=[[1.3435783,-0.2821797,-0.0613986],[-0.06529745,1.0757879,-0.01049045],[0.00282179,-0.0195985,1.0167767]]
  actual.pixels.forEach((p,i)=>p.slice(0,3).forEach((v,c)=>{const got=linear(v),rgb=reference.pqRec2020[i].map(pqLinear),expected=toP3[c].reduce((n,v,k)=>n+v*rgb[k],0);const err=Math.abs(got-expected);if(err>maxError){maxError=err;worst={i,c,got,expected}}maxRelative=Math.max(maxRelative,err/Math.max(0.1,Math.abs(expected)));maxOutput=Math.max(maxOutput,v)}))
  actual.pixels.forEach((p,i)=>{const rgb=reference.pqRec2020[i].map(pqLinear);const expected=toP3.map(row=>row.reduce((n,v,k)=>n+v*rgb[k],0));const peak=Math.max(0.1,...expected.map(Math.abs));const error=Math.max(...expected.map((v,c)=>Math.abs(linear(p[c])-v)));maxPixelRelative=Math.max(maxPixelRelative,error/peak);assert.ok(error<=0.005+0.02*peak,`CICP ${primary} HDR=${hdr} pixel ${i}: linear error ${error}, reference peak ${peak}`);assert.equal(p[3],1)})
  assert.deepEqual(consoleErrors,[])
  assert.ok(hdr?maxOutput>1:maxOutput<=1, 'HDR must exceed SDR white; SDR must preserve the base')
  reports.push({primary,hdr,extended:actual.extended,requests:requests.length,maxError,maxRelative,maxPixelRelative,maxOutput,worst,viewport:actual.viewport,failures:actual.failures})
  await page.close()
 }
 console.log(JSON.stringify({browser:browser.version(),reports},null,2))
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
