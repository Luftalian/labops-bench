import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(new URL('../',import.meta.url).pathname),base=path.join(root,'results/local/hackathon-media');
const clips=['01-present-sdl','02-future-sdl','03-benchmark-task','04-ui-tour','05-model-decisions','06-results'];
const run=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});
for(const id of clips){
 const frames=path.join(base,'frames',id),files=fs.existsSync(frames)?fs.readdirSync(frames).filter(f=>/^\d{4}\.jpg$/.test(f)):[];
 if(files.length!==900)throw new Error(id+': expected 900 frames, got '+files.length);
 for(const folder of ['mp4','masters'])fs.mkdirSync(path.join(base,folder),{recursive:true});
 const mp4=path.join(base,'mp4',id+'.mp4'),mov=path.join(base,'masters',id+'.mov');
 const reusable=file=>{try{const p=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',stdio:['ignore','pipe','ignore']})),s=p.streams[0];return s.color_space==='bt709'&&s.color_primaries==='bt709'&&s.color_transfer==='bt709'&&Number(p.format.duration)===30&&fs.statSync(file).mtimeMs>fs.statSync(path.join(frames,'0899.jpg')).mtimeMs;}catch{return false;}};
 if(!reusable(mp4)||!reusable(mov)){
  console.log('Encoding '+id);
  // Browser JPEGs carry an sRGB ICC profile. Drop inherited ICC side data so
  // MOV writes the explicit video colour tags, rather than a conflicting ICC.
  const color=['-vf','sidedata=mode=delete:type=ICC_PROFILE,scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=full:out_range=limited,setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709'];
  run(['-framerate','30','-start_number','0','-i',path.join(frames,'%04d.jpg'),'-frames:v','900',...color,'-c:v','libx264','-threads','4','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',mp4,
   '-frames:v','900',...color,'-c:v','prores_ks','-threads','4','-profile:v','1','-pix_fmt','yuv422p10le','-vendor','apl0',mov]);
 }
}
const assets=path.join(root,'docs/assets');fs.mkdirSync(assets,{recursive:true});
const gif=path.join(assets,'sdl-128-arms.gif');
run(['-ss','0.5','-t','8','-i',path.join(base,'mp4/02-future-sdl.mp4'),'-filter_complex','fps=12,scale=1280:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4','-loop','0',gif]);
const artifacts=[];
for(const relative of [...clips.map(id=>'mp4/'+id+'.mp4'),...clips.map(id=>'masters/'+id+'.mov')]){
 const file=path.join(base,relative),probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],{encoding:'utf8'})),s=probe.streams[0];
 if(s.width!==1920||s.height!==1080||Number(s.nb_read_frames)!==900||Number(probe.format.duration)!==30||s.color_space!=='bt709'||s.color_primaries!=='bt709'||s.color_transfer!=='bt709')throw new Error('Unexpected media format '+relative);
 // Decode the complete stream, not only metadata.
 run(['-v','error','-i',file,'-f','null','-']);
 artifacts.push({file:relative,bytes:fs.statSync(file).size,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),codec:s.codec_name,profile:s.profile,color_space:s.color_space,color_primaries:s.color_primaries,color_transfer:s.color_transfer,pixel_format:s.pix_fmt,width:s.width,height:s.height,frames:Number(s.nb_read_frames),fps:s.avg_frame_rate,duration_s:Number(probe.format.duration),audio_streams:probe.streams.filter(s=>s.codec_type==='audio').length});
}
fs.writeFileSync(path.join(base,'media-validation.json'),JSON.stringify({created_at:new Date().toISOString(),ffmpeg:execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0],artifacts,gif:{file:'docs/assets/sdl-128-arms.gif',bytes:fs.statSync(gif).size,sha256:createHash('sha256').update(fs.readFileSync(gif)).digest('hex')}},null,2));
console.log('Validated all 12 videos and created '+gif);
