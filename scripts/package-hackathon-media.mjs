import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(new URL('../',import.meta.url).pathname),base=path.join(root,'results/local/hackathon-media');
const clips=['01-present-sdl','02-future-sdl','03-benchmark-task','04-ui-tour','05-model-decisions','06-results'];
const names=['現在規模のSDL — 1アーム','未来のSDL — 128アーム','具体的な課題 — 3Dから2Dへ','実UIの全体像','Luna / Jevの判断とラボ','白背景の比較結果'];
const validation=JSON.parse(fs.readFileSync(path.join(base,'media-validation.json'))),provenance=JSON.parse(fs.readFileSync(path.join(base,'provenance.json'))),report=JSON.parse(fs.readFileSync(path.join(base,'sources/report.json')));
const h=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const a=report.ablations.find(r=>r.method==='ablation-packed-full-fifo'),b=report.ablations.find(r=>r.method==='ablation-packed-full-tail');
const subtitles=[
 [[0,15,'1台のアームと装置、1台のAMRで24件のjobを処理。搬送とロードを2倍速で再生。'],[15,30,'時刻を処理終了付近へカット。アンロードから次のjobのロードへ。3倍速。']],
 [[0,15,'128台のアーム、128台の装置、256件のjob。比較成績とは別のスケール実演。'],[15,30,'3600秒の処理後へ時刻をカット。記録されたアンロードと次のロードを4倍速で再生。']],
 [[0,14,'保有36台・室内2bay・22件のjob。部屋と台数の制約下で完了時間を最小化。3D、3倍速。'],[14,22,'2Dへ切替え、実際の搬出時刻へカット。sonicatorをゲートから搬出。4倍速。'],[22,30,'搬入時刻へカット。centrifugeとstirrerを搬入。移動と校正時間は採点に含まれる。']],
 [[0,7.5,'実際の設計UI。部屋・装置・アーム・AMRの条件と、計算されたラボを確認。'],[7.5,15,'共通schedulerインターフェース。残job、必要能力、予約、priorityを確認して判断を提出。'],[15,22.5,'保存済み14課題・50試行の比較と再生。閲覧にはAPIキー不要。'],[22.5,30,'保存されたengine eventsを3Dと2Dで再生。描画は成績を変更しない。']],
 [[0,7,'Lunaの保存判断。3工程jobのJ0007〜J0012へ高いpriorityを与えている。'],[7,15,'1800秒の次判断へ時刻をカット。priority更新とラボの状態を併記。'],[15,22,'Jevの保存判断。同じ公開状態に対してLunaとは異なるpriorityを返している。'],[22,30,'Jevの1800秒の判断へカット。モデル出力の理由文は未検証の記録として表示。']],
 [[0,7.5,'同一配置の順序ablationでは、FIFOから下流工程優先へ変えると完了時間が'+((1-b.makespan_s/a.makespan_s)*100).toFixed(1)+'%短縮。'],[7.5,15,'置き切れない機器の課題では、優先度と搬出入の選択が完了時間を変える。'],[15,22.5,'時間差需要を含む課題。全方式で仕事・台数・部屋・engine条件を揃えて比較。'],[22.5,30,'配置距離の課題では高度なアルゴリズムとJevが同時間。各条件1試行で、一般的なモデル順位は未確定。']]
];
const stamp=s=>{const ms=Math.round(s*1000);return `00:00:${String(Math.floor(ms/1000)).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
fs.mkdirSync(path.join(base,'subtitles'),{recursive:true});
subtitles.forEach((segments,i)=>fs.writeFileSync(path.join(base,'subtitles',clips[i]+'.ja.srt'),segments.map(([a,b,t],n)=>`${n+1}\n${stamp(a)} --> ${stamp(b)}\n${t}\n`).join('\n')));
const frameEvidence=clips.map(id=>{const dir=path.join(base,'frames',id),hash=createHash('sha256');for(let n=0;n<900;n++)hash.update(fs.readFileSync(path.join(dir,String(n).padStart(4,'0')+'.jpg')));return {clip:id,frames:900,ordered_jpeg_sha256:hash.digest('hex'),first_frame_mtime:fs.statSync(path.join(dir,'0000.jpg')).mtime.toISOString(),last_frame_mtime:fs.statSync(path.join(dir,'0899.jpg')).mtime.toISOString()};});
const nativeEvidence=['fixed','scheduler','benchmarks'].map(key=>{const list=JSON.parse(fs.readFileSync(path.join(base,'sources/native-'+key+'.json'))),hash=createHash('sha256');list.forEach(e=>hash.update(fs.readFileSync(path.join(base,'sources/native-'+key,e.file))));return {screen:key,frames:list.length,source_kind:'actual-browser-screenshot-sequence',timing_sha256:h(path.join(base,'sources/native-'+key+'.json')),ordered_png_sha256:hash.digest('hex')};});
const evidence={version:'hackathon-media-1',created_at:new Date().toISOString(),scope:'Local submission ingredients; no external upload. Simulation, exploratory n=1 model comparisons.',sources:provenance.sources,engine_source_hashes:provenance.engine_source_hashes,render_source_hashes:Object.fromEntries(['frontend/media/app.mjs','frontend/media/index.html','scripts/serve-hackathon-media.mjs','scripts/prepare-hackathon-media.mjs','scripts/encode-hackathon-media.mjs','scripts/package-hackathon-media.mjs'].map(f=>[f,h(path.join(root,f))])),native_capture:nativeEvidence,frames:frameEvidence,validation};
fs.writeFileSync(path.join(root,'docs/HACKATHON_MEDIA_EVIDENCE.json'),JSON.stringify(evidence,null,2));
fs.writeFileSync(path.join(base,'EDITING_GUIDE.md'),`# ハッカソン動画の編集素材\n\n全6本、各30秒、1920×1080、30 fps、音声なし。Rec.709。\n\n編集には masters/ のProRes 422 LT MOV、確認・共有には mp4/ のH.264を使ってください。日本語字幕は subtitles/ のSRTを別トラックで取り込めます。画面に英語の説明は含まれています。\n\n${clips.map((id,i)=>`${i+1}. ${names[i]} — [MP4](mp4/${id}.mp4) / [MOV](masters/${id}.mov) / [日本語SRT](subtitles/${id}.ja.srt)`).join('\n')}\n\nREADME GIFはリポジトリの docs/assets/sdl-128-arms.gif。\n\n全てシミュレーション。128アームは独立したデモで比較成績には含めません。モデル比較は各条件1試行、候補制限あり。出典・カット位置はリポジトリの docs/HACKATHON_MEDIA_V3.md、動画形式と全ストリーム検証は media-validation.json を参照してください。\n`);
fs.writeFileSync(path.join(base,'gallery.html'),`<!doctype html><html lang="ja"><meta charset="utf-8"><title>LabOpsBench · 提出用映像素材</title><style>body{background:#10251e;color:#dcebd5;font:18px system-ui;margin:32px}h1{font-size:30px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}video{width:100%;border-radius:12px}a{color:#c5db8d}article{background:#1b3d2d;padding:20px;border-radius:16px}p{line-height:1.7}</style><h1>LabOpsBench · 提出用映像素材</h1><p>各30秒 / 1080p / 30 fps / 音声なし。編集用はProRes 422 LT MOV、日本語SRTは別トラックで使えます。<br>実行記録によるシミュレーション。128アームのデモは比較成績に含みません。比較は各条件1試行。</p><main>${clips.map((id,i)=>`<article><h2>${i+1}. ${names[i]}</h2><video controls preload="metadata" src="mp4/${id}.mp4"></video><p><a href="mp4/${id}.mp4">MP4</a> / <a href="masters/${id}.mov">編集用MOV</a> / <a href="subtitles/${id}.ja.srt">日本語SRT</a></p></article>`).join('')}</main></html>`);
const thumbnailInputs=[];
for(const [i,id]of clips.entries()){
 const file=path.join(base,'thumbnail-'+(i+1)+'.jpg');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',i===3?'9':'3','-i',path.join(base,'mp4',id+'.mp4'),'-frames:v','1','-vf','scale=640:360',file]);thumbnailInputs.push('-i',file);
}
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...thumbnailInputs,'-filter_complex','[0:v][1:v][2:v][3:v][4:v][5:v]xstack=inputs=6:layout=0_0|640_0|1280_0|0_360|640_360|1280_360[v]','-map','[v]','-frames:v','1',path.join(base,'contact-sheet.jpg')]);
fs.copyFileSync(path.join(root,'docs/assets/sdl-128-arms.gif'),path.join(base,'README-sdl-128-arms.gif'));
const archive='labopsbench-hackathon-materials.zip',members=[...clips.flatMap(id=>['mp4/'+id+'.mp4','masters/'+id+'.mov','subtitles/'+id+'.ja.srt']),'EDITING_GUIDE.md','media-validation.json','gallery.html','contact-sheet.jpg','README-sdl-128-arms.gif'];
execFileSync('zip',['-0','-q',archive,...members],{cwd:base,stdio:'inherit'});
execFileSync('unzip',['-tq',archive],{cwd:base,stdio:'inherit'});
console.log('Packaged gallery, six Japanese SRT files, editing guide, contact sheet, evidence manifest and '+archive);
