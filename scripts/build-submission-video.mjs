// Builds the hackathon submission video from the v3 clips, the narration script and the
// HTML motion graphics in frontend/submission-video/. Run with:
//   node --experimental-websocket scripts/build-submission-video.mjs [--stills 3,40,95] [--preview] [--thumbnail] [--timeline-only] [--remux]
// Narration: drop recorded audio as results/local/submission-video/narration-override/<sentence-id>.(wav|m4a|mp3|aiff)
// to replace the generated voice for that sentence; the timeline follows the audio length.
// TTS: Kokoro-82M voice bm_george by default (scripts/tts-kokoro.py in results/local/tts/kokoro-venv; LABOPS_KOKORO_VOICE).
// LABOPS_TTS=chatterbox-turbo uses scripts/tts-chatterbox.py (optional reference clip in LABOPS_TTS_VOICE_REF);
// LABOPS_TTS=say uses the macOS scratch voice.
// Music: put music.(mp3|m4a|wav) in the same output folder to add a bed that ducks under the narration
// (LABOPS_MUSIC_VOLUME, default 0.2). scripts/make-lofi-bgm.py synthesises an original lo-fi drum bed for this.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const src = path.join(root, 'frontend/submission-video');
const out = path.join(root, 'results/local', process.env.LABOPS_VIDEO_OUTPUT ?? 'submission-video');
// Prefer locally regenerated clips; fall back to the copies committed with Git LFS.
const clipsDir = [path.join(root, 'results/local/hackathon-media-v3/mp4'), path.join(root, 'media/hackathon-media-v3')].find(d => fs.existsSync(path.join(d, '01-present-sdl.mp4')));
const CLIPS = ['01-present-sdl', '02-future-sdl', '03-benchmark-task', '04-ui-tour', '05-gpt-policy', '05-jev-priorities'];
const args = process.argv.slice(2);
const has = name => args.includes(name);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const PREVIEW = has('--preview');
const FPS = Number(opt('--fps', PREVIEW ? 15 : 30));
const SCALE = PREVIEW ? 0.5 : 1;
const TTS = process.env.LABOPS_TTS ?? 'kokoro';
const KOKORO_VOICE = process.env.LABOPS_KOKORO_VOICE ?? 'bm_george';
const VOICE = process.env.LABOPS_TTS_VOICE ?? 'Samantha';
const RATE = Number(process.env.LABOPS_TTS_RATE ?? 172);
const VOICE_REF = process.env.LABOPS_TTS_VOICE_REF ? path.resolve(process.env.LABOPS_TTS_VOICE_REF) : null;
const TTS_PYTHON = process.env.LABOPS_TTS_PYTHON ?? path.join(root, 'results/local/tts', TTS === 'kokoro' ? 'kokoro-venv' : 'venv', 'bin/python');
const TTS_SEED = 7;
const MUSIC_VOLUME = Number(process.env.LABOPS_MUSIC_VOLUME ?? 0.2);
const XFADE = 0.5, GAP = 0.28, SR = 48000;
const W = 1920, H = 1080;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const mkdir = d => fs.mkdirSync(d, {recursive: true});
const ff = a => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], {stdio: ['ignore', 'ignore', 'inherit']});
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

function extractFrames() {
  for (const clip of CLIPS) {
    const dir = path.join(out, 'cache/frames', clip), done = path.join(dir, 'done.json');
    const st = fs.statSync(path.join(clipsDir, clip + '.mp4')), source = {bytes: st.size, mtime: st.mtimeMs};
    if (fs.existsSync(done)) { const d = JSON.parse(fs.readFileSync(done)); if (d.source?.bytes === source.bytes && d.source?.mtime === source.mtime) continue; }
    fs.rmSync(dir, {recursive: true, force: true}); mkdir(dir);
    log('extracting frames', clip);
    ff(['-i', path.join(clipsDir, clip + '.mp4'), '-vf', 'scale=1920:1080:flags=lanczos', '-q:v', '2', '-start_number', '0', path.join(dir, '%04d.jpg')]);
    fs.writeFileSync(done, JSON.stringify({frames: fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).length, source}));
  }
  return Object.fromEntries(CLIPS.map(c => [c, JSON.parse(fs.readFileSync(path.join(out, 'cache/frames', c, 'done.json'))).frames]));
}

const override = s => ['wav', 'm4a', 'mp3', 'aiff'].map(e => path.join(out, 'narration-override', `${s.id}.${e}`)).find(f => fs.existsSync(f));
// Text each engine reads: Kokoro's G2P handles the display text except for the few words in `kokoro`.
const ttsText = s => TTS === 'kokoro' ? s.kokoro ?? s.text : s.speak ?? s.text;
const ttsFile = s => {
  const speak = ttsText(s);
  const id = TTS === 'say' ? `say|${VOICE}|${RATE}|${speak}` : TTS === 'kokoro' ? `kokoro|${KOKORO_VOICE}|${speak}` : `${TTS}|${VOICE_REF ? fs.statSync(VOICE_REF).size + VOICE_REF : 'builtin'}|${TTS_SEED}|${speak}`;
  return path.join(out, 'narration', `${s.id}.${crypto.createHash('sha256').update(id).digest('hex').slice(0, 16)}.${TTS === 'say' ? 'aiff' : 'wav'}`);
};

// Generates every sentence that has no recorded override and no cached take, in one model session.
function synthesize(sentences) {
  mkdir(path.join(out, 'narration'));
  const todo = sentences.filter(s => !override(s) && !fs.existsSync(ttsFile(s)));
  if (!todo.length) return;
  if (TTS === 'say') { for (const s of todo) execFileSync('say', ['-v', VOICE, '-r', String(RATE), '-o', ttsFile(s), ttsText(s)]); return; }
  const jobs = path.join(out, 'cache/tts-jobs.json');
  mkdir(path.dirname(jobs));
  const items = todo.map(s => ({id: s.id, text: ttsText(s), out: ttsFile(s)}));
  fs.writeFileSync(jobs, JSON.stringify(TTS === 'kokoro' ? {voice: KOKORO_VOICE, lang: KOKORO_VOICE[0], speed: 1, items} : {voice: VOICE_REF, seed: TTS_SEED, items}, null, 1));
  log(`generating ${todo.length} sentence(s) with ${TTS}`);
  execFileSync(TTS_PYTHON, [path.join(root, TTS === 'kokoro' ? 'scripts/tts-kokoro.py' : 'scripts/tts-chatterbox.py'), jobs], {stdio: ['ignore', 'inherit', 'inherit'], env: {...process.env, HF_HOME: process.env.HF_HOME ?? path.join(root, 'results/local/tts/hf'), PYTORCH_ENABLE_MPS_FALLBACK: '1'}});
}

// Decoded mono s16 PCM for one sentence, trimmed of leading and trailing silence.
function sentenceAudio(s) {
  const rec = override(s), input = rec ?? ttsFile(s);
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], {maxBuffer: 1 << 28});
  return {pcm: new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2), source: rec ? path.relative(out, rec) : 'tts:' + TTS + ':' + (TTS === 'say' ? VOICE : TTS === 'kokoro' ? KOKORO_VOICE : VOICE_REF ?? 'builtin')};
}

function captionChunks(text, start, end) {
  const MAX = 100, chunks = [];
  let rest = text;
  while (rest.length > MAX) {
    const target = rest.length / Math.ceil(rest.length / MAX);
    let best = -1, score = Infinity;
    for (let i = rest.indexOf(' '); i > 0 && i <= MAX; i = rest.indexOf(' ', i + 1)) {
      const s = Math.abs(i - target) - (/[,—:;.]$/.test(rest.slice(0, i)) ? 22 : 0);
      if (s < score) { score = s; best = i; }
    }
    chunks.push(rest.slice(0, best)); rest = rest.slice(best + 1);
  }
  chunks.push(rest);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let t = start;
  return chunks.map(c => { const d = (end - start) * c.length / total, r = {start: t, end: t + d, text: c}; t += d; return r; });
}

function buildTimeline(frames) {
  const script = JSON.parse(fs.readFileSync(path.join(src, 'narration.json'), 'utf8'));
  synthesize(script.scenes.flatMap(sc => sc.sentences));
  const scenes = [], placed = [], captions = [];
  let t = 0;
  script.scenes.forEach((sc, i) => {
    const start = i ? t - XFADE : 0;
    let cursor = sc.lead;
    const sentences = sc.sentences.map(s => {
      const a = sentenceAudio(s), dur = a.pcm.length / SR, item = {id: s.id, text: s.text, start: cursor, end: cursor + dur, source: a.source};
      placed.push({at: start + cursor, pcm: a.pcm});
      if (sc.captions !== false) captions.push(...captionChunks(s.text, start + cursor, start + cursor + dur));
      cursor += dur + GAP;
      return item;
    });
    const duration = Math.max(sc.min, cursor - GAP + sc.tail);
    scenes.push({id: sc.id, chapter: sc.chapter, start, duration, sentences});
    t = start + duration;
  });
  return {fps: FPS, width: W, height: H, xfade: XFADE, duration: t, frames, scenes, captions, placed};
}

function writeAudio(timeline) {
  const n = Math.ceil(timeline.duration * SR), mix = new Float32Array(n);
  for (const p of timeline.placed) { const o = Math.round(p.at * SR); for (let i = 0; i < p.pcm.length && o + i < n; i++) mix[o + i] += p.pcm[i]; }
  let peak = 1;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  const gain = Math.min(1.6, 0.89 * 32767 / peak), data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * gain))), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(out, 'narration.wav'), Buffer.concat([header, data]));
  // Optional music bed (music.mp3/.m4a/.wav in the output folder), ducked under the narration; the result is
  // loudness-normalised to -16 LUFS for web playback.
  const music = ['mp3', 'm4a', 'wav'].map(e => path.join(out, 'music.' + e)).find(f => fs.existsSync(f));
  const d = timeline.duration.toFixed(2), norm = `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=${SR}`;
  const graph = music
    ? ['-stream_loop', '-1', '-i', music, '-filter_complex', `[1:a]aformat=sample_rates=${SR}:channel_layouts=mono,atrim=0:${d},volume=${MUSIC_VOLUME},afade=t=in:d=1.5,afade=t=out:st=${(timeline.duration - 3).toFixed(2)}:d=3[m];[0:a]asplit[v][k];[m][k]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=600[duck];[v][duck]amix=inputs=2:normalize=0:duration=first,${norm}[out]`, '-map', '[out]']
    : ['-af', norm];
  ff(['-i', path.join(out, 'narration.wav'), ...graph, '-ac', '1', '-ar', String(SR), path.join(out, 'soundtrack.wav')]);
  log(music ? `soundtrack: narration + ${path.basename(music)} at volume ${MUSIC_VOLUME}` : 'soundtrack: narration only');
}

function writeSrt(captions) {
  const ts = s => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  fs.writeFileSync(path.join(out, 'captions.en.srt'), captions.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));
}

function serve(timelineJson) {
  const mime = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml'};
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.split('/').includes('..')) { res.writeHead(404); res.end(); return; }
    if (p === '/timeline.json') { res.writeHead(200, {'Content-Type': mime['.json']}); res.end(timelineJson); return; }
    const f = p.startsWith('/frames/') ? path.join(out, 'cache', p) : path.join(src, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(p); return; }
    res.writeHead(200, {'Content-Type': mime[path.extname(f)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=3600'});
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(Number(process.env.LABOPS_VIDEO_PORT ?? 0), '127.0.0.1', () => r(server)));
}

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.seq = 0; this.pending = new Map(); this.ws.onmessage = e => { const m = JSON.parse(e.data), p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }; }
  open() { return new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; }); }
  send(method, params = {}) { const id = ++this.seq; this.ws.send(JSON.stringify({id, method, params})); return new Promise((resolve, reject) => this.pending.set(id, {resolve, reject})); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; }
}

async function launchPage(url) {
  const profile = path.join(out, 'cache/chrome-profile');
  fs.rmSync(profile, {recursive: true, force: true}); mkdir(profile);
  const proc = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--user-data-dir=${profile}`, '--remote-debugging-port=0', `--window-size=${W},${H}`, 'about:blank'], {stdio: 'ignore'});
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await new Promise(r => setTimeout(r, 100));
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const cdp = new Cdp(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: SCALE, mobile: false});
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', {url});
  for (let i = 0; i < 100; i++) { if (await cdp.eval('typeof window.renderFrame === "function" && window.videoReady === true').catch(() => false)) break; await new Promise(r => setTimeout(r, 100)); }
  await cdp.eval('document.fonts.ready.then(() => true)');
  return {cdp, close: () => proc.kill()};
}

async function shot(cdp, format = 'jpeg') {
  const r = await cdp.send('Page.captureScreenshot', {format, quality: format === 'jpeg' ? 92 : undefined, optimizeForSpeed: true, fromSurface: true});
  return Buffer.from(r.data, 'base64');
}

async function main() {
  mkdir(out);
  const frames = extractFrames();
  log('narration:', TTS);
  const timeline = buildTimeline(frames);
  const {placed, ...pub} = timeline;
  fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(pub, null, 1));
  writeAudio(timeline); writeSrt(timeline.captions);
  log(`timeline ${timeline.duration.toFixed(1)} s, ${timeline.scenes.length} scenes, ${timeline.captions.length} caption chunks`);
  if (has('--timeline-only')) return;
  if (has('--remux')) {
    // Swap in a new soundtrack (e.g. after adding music.*) without re-rendering frames; the narration timing must be unchanged.
    const file = path.join(out, 'LabOpsBench-submission-draft.mp4'), tmp = file.replace('.mp4', '.remux.mp4');
    const vdur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
    if (Math.abs(vdur - timeline.duration) > .1) throw new Error(`video is ${vdur.toFixed(2)} s but the timeline is ${timeline.duration.toFixed(2)} s; render again instead`);
    ff(['-i', file, '-i', path.join(out, 'soundtrack.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(timeline.duration), '-movflags', '+faststart', tmp]);
    fs.renameSync(tmp, file);
    log('soundtrack remuxed into', file);
    return;
  }
  const server = await serve(JSON.stringify(pub));
  const {cdp, close} = await launchPage(`http://127.0.0.1:${server.address().port}/`);
  try {
    if (has('--stills')) {
      const dir = path.join(out, 'stills'); mkdir(dir);
      for (const t of opt('--stills', '').split(',').filter(Boolean).map(Number)) {
        await cdp.eval(`renderFrame(${t})`);
        fs.writeFileSync(path.join(dir, `t${t.toFixed(1).padStart(6, '0')}.jpg`), await shot(cdp));
      }
      log('stills written to', dir);
      return;
    }
    if (has('--thumbnail')) {
      await cdp.eval('renderThumbnail()');
      const png = path.join(out, 'thumbnail-1920.png');
      fs.writeFileSync(png, await shot(cdp, 'png'));
      ff(['-i', png, '-vf', 'scale=1280:720:flags=lanczos', path.join(out, 'thumbnail.png')]);
      log('thumbnail written');
      return;
    }
    const total = Math.ceil(timeline.duration * FPS), file = path.join(out, PREVIEW ? 'LabOpsBench-submission-preview.mp4' : 'LabOpsBench-submission-draft.mp4');
    const enc = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', path.join(out, 'soundtrack.wav'),
      '-c:v', 'libx264', '-preset', PREVIEW ? 'veryfast' : 'slow', '-crf', PREVIEW ? '26' : '17', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-c:a', 'aac', '-b:a', '192k', '-t', String(timeline.duration), '-movflags', '+faststart', file], {stdio: ['pipe', 'inherit', 'inherit']});
    const started = Date.now();
    for (let i = 0; i < total; i++) {
      await cdp.eval(`renderFrame(${(i / FPS).toFixed(4)})`);
      const buf = await shot(cdp);
      if (!enc.stdin.write(buf)) await new Promise(r => enc.stdin.once('drain', r));
      if (i % (FPS * 10) === 0) log(`frame ${i}/${total} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    }
    enc.stdin.end();
    await new Promise((resolve, reject) => enc.on('close', c => c === 0 ? resolve() : reject(new Error('ffmpeg exited ' + c))));
    log('video written to', file);
  } finally { close(); server.close(); }
}

main().catch(e => { console.error(e); process.exit(1); });
