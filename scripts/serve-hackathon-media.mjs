import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('../',import.meta.url).pathname),out=path.join(root,'results/local',process.env.LABOPS_MEDIA_OUTPUT??'hackathon-media-v3');
const clips=['01-present-sdl','02-future-sdl','03-benchmark-task','04-ui-tour','05-model-decisions','05-gpt-policy','05-jev-priorities','06-results'];
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.stl':'application/octet-stream','.css':'text/css','.mp4':'video/mp4','.mov':'video/quicktime','.srt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1'),p=decodeURIComponent(url.pathname);
  if(p.split('/').includes('..')){res.writeHead(404);res.end();return;}
  const match=p.match(/^\/capture\/(0[1-6]-[a-z-]+)\/(\d{4})\.jpg$/);
  if(req.method==='POST'&&match&&clips.includes(match[1])&&Number(match[2])<900){
   const chunks=[];let n=0;for await(const b of req){n+=b.length;if(n>8e6)throw new Error('Frame too large');chunks.push(b);}
   const bytes=Buffer.concat(chunks);if(bytes[0]!==255||bytes[1]!==216)throw new Error('JPEG required');
   const dir=path.join(out,'frames',match[1]);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,match[2]+'.jpg'),bytes);
   fs.writeFileSync(path.join(out,'capture-status.json'),JSON.stringify({clip:match[1],frame:Number(match[2]),time:new Date().toISOString()}));res.writeHead(200);res.end('ok');return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let f;
  if(p==='/')f=path.join(root,'frontend/media/index.html');
  else if(p==='/gallery.html'||p==='/contact-sheet.jpg')f=path.join(out,p.slice(1));
  else if(/^\/(mp4|masters|subtitles)\//.test(p)){
   const [folder,name]=p.slice(1).split('/'),extension=folder==='mp4'?'.mp4':folder==='masters'?'.mov':'.ja.srt';
   if(clips.some(id=>name===id+extension))f=path.join(out,folder,name);
  }
  else if(p.startsWith('/media/'))f=path.join(root,'frontend/media',p.slice(7));
  else if(p.startsWith('/source/'))f=path.join(out,'sources',p.slice(8));
  else if(p==='/replay-layout.mjs')f=path.join(root,'frontend/replay-layout.mjs');
  else if(p==='/workshop/media-three.mjs'){
   const source=fs.readFileSync(path.join(root,'backend/poc/demo/workshop/three-view.mjs'),'utf8').replace('new THREE.WebGLRenderer({antialias:true})','new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true})');
   res.writeHead(200,{'Content-Type':'text/javascript'});res.end(source);return;
  }else if(p.startsWith('/workshop/assets/xarm/'))f=path.join(root,'backend/poc/sim/physics/assets/xarm6/xarm_description/meshes/xarm6/visual',p.split('/').at(-1));
  else if(/^\/(workshop|vendor)\//.test(p))f=path.join(root,'backend/poc/demo',p);
  if(!f||!path.resolve(f).startsWith(root+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end(p);return;}
  const size=fs.statSync(f).size,headers={'Content-Type':mime[path.extname(f)]??'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
  const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if(range){const start=Number(range[1]),end=Math.min(size-1,range[2]?Number(range[2]):size-1);if(start>end||start>=size){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`});if(req.method==='HEAD')res.end();else fs.createReadStream(f,{start,end}).pipe(res);return;}
  res.writeHead(200,{...headers,'Content-Length':size});if(req.method==='HEAD')res.end();else fs.createReadStream(f).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}
});
const port=Number(process.env.LABOPS_MEDIA_PORT??4185);
server.listen(port,'127.0.0.1',()=>console.log(`Media export UI http://127.0.0.1:${port}/ · gallery.html — localhost only; media stays under ${out}`));
