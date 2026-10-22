import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(new URL('../',import.meta.url).pathname),base=path.join(root,'results/local/hackathon-media-v3'),capture=path.join(base,'ui-capture-bars');
const screens=JSON.parse(fs.readFileSync(path.join(capture,'scroll-captures.json'))),live2d=JSON.parse(fs.readFileSync(path.join(capture,'live-2d-captures.json'))),live3d=JSON.parse(fs.readFileSync(path.join(capture,'live-3d-captures.json'))),live=[...live2d,...live3d];
if(live2d.length!==120||live3d.length!==120)throw new Error('Need 120 actual UI captures per view');
const probe=f=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',f],{encoding:'utf8'})).streams[0];
const source=probe(path.join(capture,screens[0].file)),w=source.width,h=source.height,scale=h/screens[0].viewport.height;
for(const s of [...screens,...live]){const p=probe(path.join(capture,s.file));if(p.width!==w||p.height!==h)throw new Error('UI capture viewport changed: '+s.file);}
const codec2d=probe(path.join(capture,live2d[0].file)).codec_name,codec3d=probe(path.join(capture,live3d[0].file)).codec_name;
const height=Math.ceil(screens[0].height*scale),panorama=path.join(capture,'actual-ui-page.png');
execFileSync('magick',['-size',`${w}x${height}`,'xc:#12291e',...screens.flatMap(s=>[path.join(capture,s.file),'-geometry',`+0+${Math.round(s.scrollY*scale)}`,'-composite']),panorama]);
const output=path.join(base,'frames/04-ui-tour-clean');fs.mkdirSync(output,{recursive:true});
// Editorial scroll through actual UI captures, then a real UI playback segment.
// No re-created DOM, invented chart values, simulated cursor or UI mockup.
const maxY=Math.min(height-h,Math.round(screens.at(-1).scrollY*scale));
const args=['-filter_complex_threads','2','-hide_banner','-loglevel','error','-y','-loop','1','-framerate','30','-i',panorama,'-framerate','12','-c:v',codec2d,'-i',path.join(capture,'live-2d-%03d.png'),'-framerate','12','-c:v',codec3d,'-i',path.join(capture,'live-3d-%03d.png'),'-filter_complex',`[0:v]trim=duration=20,setpts=PTS-STARTPTS,crop=${w}:${h}:0:'${maxY}*min(1,max(0,(t-2)/19))',scale=1920:1080:flags=lanczos,setsar=1[a];[1:v]trim=duration=10,setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,setsar=1[b];[2:v]trim=duration=10,setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,setsar=1[c];[a][b][c]concat=n=3:v=1:a=0[v]`,'-map','[v]','-frames:v','1200','-q:v','1','-start_number','0',path.join(output,'%04d.jpg')];
execFileSync('ffmpeg',args,{stdio:'inherit'});
const sha=f=>createHash('sha256').update(fs.readFileSync(path.join(capture,f))).digest('hex');
fs.writeFileSync(path.join(base,'ui-capture-evidence.json'),JSON.stringify({source_directory:'ui-capture-bars',source_url:'http://127.0.0.1:4180/benchmarks/',method:'CUA actual browser screenshots; same 20s editorial page scroll with activity bars followed by 2D and 3D replay captures',viewport_css:screens[0].viewport,native_capture_px:{width:w,height:h},output_px:{width:1920,height:1080},capture_manifests:['scroll-captures.json','live-2d-captures.json','live-3d-captures.json'],timing:[{start_s:0,end_s:20,content:'Re-recorded actual results-page scroll with activity bars, preserving the 20-second timing'},{start_s:20,end_s:30,content:'Actual 2D UI playback; 120 captured frames retimed to ten seconds'},{start_s:30,end_s:40,content:'Actual 3D UI playback; 120 captured frames retimed to ten seconds'}],screens,live,source_sha256:Object.fromEntries([...screens,...live].map(s=>[s.file,sha(s.file)])),ui_source_sha256:Object.fromEntries(['frontend/benchmarks/index.html','frontend/benchmarks/styles.css','frontend/benchmarks/app.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]))},null,2));
console.log('Composed actual UI tour from browser captures');
