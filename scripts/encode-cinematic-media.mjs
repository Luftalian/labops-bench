import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(new URL('../',import.meta.url).pathname),base=path.join(root,'results/local/hackathon-media-v3');
const ids=['01-present-sdl','02-future-sdl','03-benchmark-task','04-ui-tour','05-gpt-policy','05-jev-priorities'];
const previousFile=path.join(base,'media-validation.json');
const previous=fs.existsSync(previousFile)?JSON.parse(fs.readFileSync(previousFile)):null;
const selected=process.argv.slice(2).length?process.argv.slice(2):ids;
const probe=f=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',f],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const run=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});
for(const id of selected){
 if(!ids.includes(id))throw new Error('Unknown clip '+id);const dir=path.join(base,'frames',id==='04-ui-tour'?'04-ui-tour-clean':id);
 if(!fs.existsSync(path.join(dir,'0899.jpg'))||fs.readdirSync(dir).filter(f=>/^\d{4}\.jpg$/.test(f)).length!==900)throw new Error(id+' incomplete capture');
 const width=id==='03-benchmark-task'?3840:1920,height=id==='03-benchmark-task'?2160:1080,input=probe(path.join(dir,'0000.jpg')).streams[0];if(input.width!==width||input.height!==height)throw new Error('Unexpected source pixels');
 for(const d of ['mp4','masters'])fs.mkdirSync(path.join(base,d),{recursive:true});
 const mp4=path.join(base,'mp4',id+'.mp4'),mov=path.join(base,'masters',id+'.mov');
 const ready=(file,w)=>{try{const p=probe(file),s=p.streams[0];return s.width===w&&Number(p.format.duration)===30&&s.color_space==='bt709'&&s.color_primaries==='bt709'&&fs.statSync(file).mtimeMs>fs.statSync(path.join(dir,'0899.jpg')).mtimeMs;}catch{return false;}};
 if(ready(mp4,1920)&&ready(mov,width))continue;
 const mp4Pending=mp4.replace('.mp4','.pending.mp4'),movPending=mov.replace('.mov','.pending.mov');
 const filter=size=>'sidedata=mode=delete:type=ICC_PROFILE,scale='+size+'in_color_matrix=bt601:out_color_matrix=bt709:in_range=full:out_range=limited:flags=lanczos,setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709';
 const color=['-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709'];console.log('Encoding '+id+' · '+width+'×'+height+' master');
 run(['-framerate','30','-i',path.join(dir,'%04d.jpg'),'-frames:v','900','-vf',filter('1920:1080:'),...color,'-c:v','libx264','-threads','4','-crf','16','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',mp4Pending,
 '-frames:v','900','-vf',filter(''),...color,'-c:v','prores_ks','-threads','4','-profile:v','3','-pix_fmt','yuv422p10le','-vendor','apl0',movPending]);
 fs.renameSync(mp4Pending,mp4);fs.renameSync(movPending,mov);
}
if(selected.length!==ids.length)process.exit(0);
const hash=async f=>{const h=createHash('sha256');for await(const bytes of fs.createReadStream(f))h.update(bytes);return h.digest('hex');};
const artifacts=[];
for(const id of ids)for(const folder of ['mp4','masters']){
 const relative=folder+'/'+id+(folder==='mp4'?'.mp4':'.mov'),f=path.join(base,relative),prior=previous?.artifacts.find(a=>a.file===relative),stat=fs.statSync(f);
 if(prior&&stat.size===prior.bytes&&stat.mtimeMs<=Date.parse(previous.created_at)){artifacts.push({...prior,validated_at:prior.validated_at??previous.created_at,reused_validation:true});continue;}
 const p=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',f],{encoding:'utf8'})),s=p.streams[0],width=folder==='masters'&&id==='03-benchmark-task'?3840:1920;
 if(s.width!==width||s.height!==width*9/16||s.avg_frame_rate!=='30/1'||Number(s.nb_read_frames)!==900||Number(p.format.duration)!==30||s.color_space!=='bt709'||s.color_primaries!=='bt709'||s.color_transfer!=='bt709')throw new Error('Invalid format '+relative);
 run(['-i',f,'-f','null','-']);artifacts.push({file:relative,validated_at:new Date().toISOString(),bytes:fs.statSync(f).size,sha256:await hash(f),codec:s.codec_name,profile:s.profile,width:s.width,height:s.height,frames:900,duration_s:30,fps:s.avg_frame_rate,color_space:s.color_space,color_primaries:s.color_primaries,color_transfer:s.color_transfer,pixel_format:s.pix_fmt,audio_streams:p.streams.filter(s=>s.codec_type==='audio').length});
}
const gif=path.join(root,'docs/assets/sdl-future-lab.gif');
const sameGif=previous?.gif&&fs.existsSync(gif)&&artifacts.find(a=>a.file==='mp4/02-future-sdl.mp4')?.sha256===previous.artifacts.find(a=>a.file==='mp4/02-future-sdl.mp4')?.sha256&&await hash(gif)===previous.gif.sha256;
if(!sameGif)run(['-ss','2','-t','8','-i',path.join(base,'mp4/02-future-sdl.mp4'),'-filter_complex','fps=12,scale=1280:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4','-loop','0',gif]);
fs.writeFileSync(path.join(base,'media-validation.json'),JSON.stringify({revision:'cinematic-3',created_at:new Date().toISOString(),ffmpeg:execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0],artifacts,gif:{file:'docs/assets/sdl-future-lab.gif',bytes:fs.statSync(gif).size,sha256:await hash(gif)}},null,2));console.log('Validated all revised clips and README GIF');
