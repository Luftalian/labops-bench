// Deterministic motion graphics for the submission video. renderFrame(t) draws the frame at t seconds;
// every animation is a pure function of t and the narration cue times in timeline.json.
const tl = await (await fetch('timeline.json')).json();
const stage = document.getElementById('stage');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const eo = x => 1 - Math.pow(1 - clamp(x), 3);
const eio = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const prog = (t, a, d) => clamp((t - a) / d);
const px = v => `${v.toFixed(1)}px`;

function h(tag, cls = '', html = '', parent) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  if (parent) parent.appendChild(el);
  return el;
}
function at(el, x, y, w, hgt) {
  el.classList.add('abs');
  Object.assign(el.style, {left: px(x), top: px(y)});
  if (w != null) el.style.width = px(w);
  if (hgt != null) el.style.height = px(hgt);
  return el;
}
// Fade/slide in at `a`, optionally out at `out`.
function show(el, t, a, {d = .7, dy = 26, dx = 0, s = 0, out = 1e9, od = .45, o = 1} = {}) {
  const i = eo(prog(t, a, d)), e = 1 - eio(prog(t, out, od)), v = i * e * o;
  el.style.opacity = v.toFixed(3);
  el.style.visibility = v < .002 ? 'hidden' : 'visible';
  el.style.transform = `translate(${px((1 - i) * dx)},${px((1 - i) * dy)}) scale(${(1 - (1 - i) * s).toFixed(4)})`;
}

const loads = [];
function frame(img, clip, idx) {
  const n = tl.frames[clip], i = Math.max(0, Math.min(n - 1, Math.floor(idx)));
  const url = `frames/${clip}/${String(i).padStart(4, '0')}.jpg`;
  if (img.dataset.src === url) return;
  img.dataset.src = url;
  img.src = url;
  loads.push(img.decode().catch(() => {}));
}
// Map scene-local time in [a, b) onto source frames [f0, f1).
const span = (t, a, b, f0, f1) => f0 + clamp((t - a) / (b - a)) * (f1 - f0 - 1);

const icon = {
  clock: '<svg viewBox="0 0 48 48" width="40" height="40"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 13v12l8 5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  element: '<svg viewBox="0 0 48 48" width="42" height="42"><rect x="6" y="6" width="36" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="3.5"/><text x="24" y="32" text-anchor="middle" font-size="18" font-weight="800" fill="currentColor" font-family="-apple-system,system-ui">Ir</text><text x="12" y="17" font-size="8" font-weight="700" fill="currentColor" font-family="ui-monospace,monospace">77</text></svg>',
  bolt: '<svg viewBox="0 0 48 48" width="40" height="40"><path d="M27 4 9 27h13l-3 17 20-25H26z" fill="currentColor"/></svg>',
  drop: '<svg viewBox="0 0 48 48" width="40" height="40"><path d="M24 5C17 15 11 22 11 30a13 13 0 0 0 26 0c0-8-6-15-13-25z" fill="currentColor"/></svg>',
  cloud: '<svg viewBox="0 0 64 48" width="64" height="48"><path d="M18 40h31a11 11 0 0 0 1-22 16 16 0 0 0-30-3A12 12 0 0 0 18 40z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor"/></svg>',
};
const logo = '<span class="logo">' + '<i></i>'.repeat(9) + '</span>';

// ---------- Scenes ----------
const scenes = {};

scenes.title = {
  build(r) {
    this.img = h('img', 'base', '', r);
    h('div', 'shade', '', r).style.background = 'linear-gradient(90deg,rgba(6,16,12,.94) 0%,rgba(6,16,12,.78) 45%,rgba(6,16,12,.35) 100%)';
    this.kicker = at(h('div', 'kicker', 'Simulation benchmark · 2026', r), 120, 236);
    this.word = at(h('div', 'wordmark', 'LabOps<b>Bench</b>', r), 110, 276);
    this.sub = at(h('div', 'subtitle', 'Benchmarking AI Agents for Laboratory Configuration<br>and Experiment Scheduling', r), 120, 460);
    this.auth = at(h('div', 'authors', 'Ryoma Yamamoto · Haruki Nakajima', r), 120, 582);
    this.rule = at(h('div', '', '', r), 120, 660, 0, 3); this.rule.style.background = 'var(--accent)';
    this.hook = at(h('div', 'hook', 'Who decides what runs next<br>in a <span style="color:var(--accent)">self-driving lab?</span>', r), 120, 700, 1500);
    this.chip = at(h('div', 'chip dim', 'Simulated lab · recorded engine events', r), 1460, 990);
    // Thumbnail-only layout
    this.thumb = at(h('div', '', '', r), 0, 0, 1920, 1080);
    this.thumb.innerHTML = `
      <div class="abs" style="left:110px;top:250px;font:800 150px/0.98 var(--sans);letter-spacing:-.045em">Who runs the<br><span style="color:var(--accent)">self-driving lab?</span></div>
      <div class="abs" style="left:116px;top:620px;display:flex;align-items:center;gap:18px;font:800 64px/1 var(--sans);letter-spacing:-.03em">${logo.replace('class="logo"', 'class="logo" style="width:58px;height:58px;padding:11px;gap:5px;border-radius:14px"')}LabOpsBench</div>
      <div class="abs" style="left:118px;top:730px;display:flex;gap:14px"><span class="chip" style="font-size:28px;padding:14px 22px">AI agents</span><span class="chip" style="font-size:28px;padding:14px 22px">Scheduling</span><span class="chip" style="font-size:28px;padding:14px 22px">14 lab scenarios</span></div>
      <div class="abs chip dim" style="right:60px;bottom:50px;font-size:22px">Simulated lab</div>`;
  },
  update(S) {
    const {t, dur} = S;
    frame(this.img, '02-future-sdl', 70);
    this.img.style.transform = `scale(${(1.08 - .05 * t / dur).toFixed(4)})`;
    this.img.style.filter = 'saturate(.9)';
    const thumb = S.thumb;
    for (const el of [this.kicker, this.word, this.sub, this.auth, this.rule, this.hook, this.chip]) el.style.display = thumb ? 'none' : '';
    this.thumb.style.display = thumb ? '' : 'none';
    if (thumb) { this.img.style.transform = 'scale(1.02)'; return; }
    show(this.kicker, t, .15); show(this.word, t, .25, {dy: 40}); show(this.sub, t, .55); show(this.auth, t, .75);
    this.rule.style.width = px(220 * eo(prog(t, .9, .8)));
    show(this.hook, t, S.c(1) - .1, {dy: 30}); show(this.chip, t, 1);
  },
};

scenes.sdl = {
  note: 'Simulated demo · not a benchmark run',
  build(r) {
    this.img = h('img', 'base', '', r);
    h('div', 'shade grad-bottom', '', r); h('div', 'shade grad-top', '', r);
    this.loop = at(h('div', 'glass', '', r), 90, 140, 600, 400);
    this.loop.innerHTML = `<div style="padding:28px 32px"><div class="kicker">Self-driving laboratories</div>
      <svg class="cycle" viewBox="0 0 536 250" width="536" height="250" style="margin-top:8px">
        <defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#c5d9a4"/></marker></defs>
        <circle cx="268" cy="128" r="92" fill="none" stroke="rgba(197,217,164,.25)" stroke-width="2" stroke-dasharray="4 8"/>
        <path d="M300 42 A92 92 0 0 1 352 168" fill="none" stroke="#c5d9a4" stroke-width="3" marker-end="url(#ah)"/>
        <path d="M322 202 A92 92 0 0 1 200 196" fill="none" stroke="#c5d9a4" stroke-width="3" marker-end="url(#ah)"/>
        <path d="M184 168 A92 92 0 0 1 236 42" fill="none" stroke="#c5d9a4" stroke-width="3" marker-end="url(#ah)"/>
        <g data-n="0"><rect x="188" y="14" width="160" height="40" rx="20" fill="#1d372c" stroke="#c5d9a4"/><text x="268" y="40" text-anchor="middle">Run experiment</text></g>
        <g data-n="1"><rect x="330" y="170" width="160" height="40" rx="20" fill="#1d372c" stroke="#c5d9a4"/><text x="410" y="196" text-anchor="middle">Analyse result</text></g>
        <g data-n="2"><rect x="46" y="170" width="160" height="40" rx="20" fill="#1d372c" stroke="#c5d9a4"/><text x="126" y="196" text-anchor="middle">Choose next</text></g>
        <circle class="spark" r="7" fill="#edf0e5"/>
      </svg><div class="cite" style="margin-top:6px">Tom et al., Chem. Rev. 2024</div></div>`;
    this.spark = this.loop.querySelector('.spark');
    this.nodes = [...this.loop.querySelectorAll('g[data-n]')];
    this.agents = at(h('div', 'glass', '', r), 1230, 140, 600);
    this.agents.innerHTML = `<div style="padding:28px 32px"><div class="kicker">Language-model agents → robotic experiments</div>
      <div class="ag" style="margin-top:22px;display:flex;justify-content:space-between;align-items:baseline"><span class="prog">Coscientist</span><span class="cite">Boiko et al., Nature 2023</span></div>
      <div class="ag" style="margin-top:16px;display:flex;justify-content:space-between;align-items:baseline"><span class="prog">ACRA</span><span class="cite">Pagel et al., Commun. Chem. 2026</span></div></div>`;
    this.agRows = [...this.agents.querySelectorAll('.ag')];
    this.progHead = at(h('div', 'kicker', 'Building &amp; scaling SDL infrastructure', r), 92, 642);
    this.progs = [['CA', 'Acceleration Consortium', 'Canada'], ['US', 'Genesis Mission', 'United States'], ['JP', 'ARiSE', 'Japan · JST']].map(([c, n, w], k) => {
      const el = at(h('div', 'glass', '', r), 90 + k * 590, 676, 560, 118);
      el.innerHTML = `<div style="display:flex;gap:20px;align-items:center;padding:24px 26px"><span class="country">${c}</span><div><div class="prog">${n}</div><div class="cite" style="margin-top:6px">${w}</div></div></div>`;
      return el;
    });
  },
  update(S) {
    const {t, c, e} = S;
    frame(this.img, '01-present-sdl', t * 30);
    this.img.style.transform = `scale(${(1.02 + .03 * t / S.dur).toFixed(4)})`;
    show(this.loop, t, c(1) - .2, {out: c(2) + 1.2});
    const a = t * 1.6 - Math.PI / 2;
    this.spark.setAttribute('cx', (268 + 92 * Math.cos(a)).toFixed(1));
    this.spark.setAttribute('cy', (128 + 92 * Math.sin(a)).toFixed(1));
    const active = Math.floor(((a + Math.PI / 2) / (2 * Math.PI)) * 3 + .5) % 3;
    this.nodes.forEach((g, k) => g.querySelector('rect').setAttribute('fill', k === active ? '#3d5c47' : '#1d372c'));
    show(this.agents, t, c(2) - .1, {dx: 40, dy: 0, out: c(3) + 1.6});
    this.agRows.forEach((el, k) => show(el, t, c(2) + .25 + k * .5, {dy: 12, d: .5}));
    const L = e(3) - c(3);
    show(this.progHead, t, c(3), {dy: 10});
    this.progs.forEach((el, k) => show(el, t, c(3) + L * [.1, .3, .5][k], {dy: 30}));
  },
};

scenes.scale = {
  note: 'Concept simulation · synthetic workload · not a scored run',
  build(r) {
    this.img = h('img', 'base', '', r);
    h('div', 'shade grad-bottom', '', r); h('div', 'shade grad-top', '', r);
    this.cloud = at(h('div', 'glass', '', r), 90, 140, 680);
    this.cloud.innerHTML = `<div style="padding:28px 32px;display:flex;gap:26px;align-items:center"><span style="color:var(--accent)">${icon.cloud}</span><div>
      <div class="kicker">Cloud laboratories</div><div style="font:650 30px/1.2 var(--sans);margin-top:10px">Shared instruments, remote access,<br>no lab ownership needed</div>
      <div class="cite" style="margin-top:10px">Arias &amp; Taylor, Adv. Mater. Technol. 2024</div></div></div>`;
    this.panel = at(h('div', 'glass', '', r), 90, 600, 860, 290);
    this.panel.innerHTML = `<div style="padding:30px 40px"><div class="kicker">One facility, many experiments</div>
      <div style="display:flex;gap:70px;margin-top:22px">${[['288', 'instruments'], ['96', 'robot arms'], ['18', 'mobile robots']].map(([n, l]) => `<div><div class="stat-num" data-n="${n}">0</div><div class="stat-lbl">${l}</div></div>`).join('')}</div>
      <div class="cite" style="margin-top:18px">39 × 30 m hall · 10 instrument types</div></div>`;
    this.nums = [...this.panel.querySelectorAll('.stat-num')];
  },
  update(S) {
    const {t, c, e} = S;
    frame(this.img, '02-future-sdl', t * 30);
    show(this.cloud, t, c(1) - .2, {out: c(2) + 2});
    const k0 = c(2) + (e(2) - c(2)) * .38;
    show(this.panel, t, k0 - .6, {dy: 40});
    this.nums.forEach((el, k) => { const n = Number(el.dataset.n), p = eo(prog(t, k0 + k * .55, 1.6)); el.textContent = Math.round(n * p); el.style.color = p >= 1 ? 'var(--accent)' : 'var(--ink)'; });
  },
};

scenes.limits = {
  note: 'Recorded replay · scenario 04 · reference heuristic',
  build(r) {
    this.img = h('img', 'base', '', r);
    this.dim = h('div', 'shade', '', r); this.dim.style.background = '#06100c';
    h('div', 'shade grad-top', '', r);
    this.head = at(h('div', '', '<div class="kicker">The problem</div><div class="headline" style="margin-top:14px">Every resource has a limit.</div>', r), 90, 130);
    this.gp = at(h('div', 'glass', '', r), 90, 300, 860, 380);
    this.gp.innerHTML = `<div style="padding:34px 40px">${['Instruments', 'Arms &amp; AMRs', 'Floor space', 'Time'].map(n => `<div class="gauge"><div class="name">${n}</div><div class="track"><i></i><b></b></div><div class="val">0%</div></div>`).join('')}</div>`;
    this.gauges = [...this.gp.querySelectorAll('.gauge')];
    this.cp = at(h('div', 'glass', '', r), 1010, 300, 820, 380);
    this.cp.innerHTML = `<div style="padding:30px 36px"><div class="kicker">Contention</div></div>
      <div class="abs" style="left:40px;top:110px;width:190px;height:170px;border-radius:18px;background:var(--surface-2);border:2px solid var(--limit);display:grid;place-items:center;text-align:center">
        <div><div style="font:750 26px/1 var(--sans)">Stirrer</div><div class="mono" style="margin-top:10px;color:var(--limit);font-size:16px;font-weight:700">IN USE</div></div></div>
      <div class="abs qlbl" style="left:40px;top:306px;font:650 22px/1 var(--sans);color:var(--muted)"></div>`;
    this.tokens = [0, 1, 2, 3, 4].map(k => { const el = h('div', 'token', 'J' + (k + 2), this.cp); el.style.background = k % 2 ? 'var(--green)' : 'var(--luna)'; return el; });
    this.qlbl = this.cp.querySelector('.qlbl');
    this.core = at(h('div', 'node core', 'Scheduler &amp;<br>resource manager', r), 660, 330, 600, 170);
    this.lines = at(h('div', '', '<svg width="1920" height="1080"><path d="M860 500 L730 640" stroke="#c5d9a4" stroke-width="3" fill="none"/><path d="M1060 500 L1190 640" stroke="#c5d9a4" stroke-width="3" fill="none"/></svg>', r), 0, 0);
    this.o1 = at(h('div', 'node out', 'What to install', r), 500, 640, 440, 110);
    this.o2 = at(h('div', 'node out', 'What to run first', r), 980, 640, 440, 110);
  },
  update(S) {
    const {t, c, e} = S;
    frame(this.img, '03-benchmark-task', Math.min(449, t * 30));
    const blur = eo(prog(t, c(3) - .3, .8));
    this.img.style.filter = `blur(${(blur * 8).toFixed(1)}px)`;
    this.img.style.transform = `scale(${(1.03 + .04 * blur).toFixed(4)})`;
    this.dim.style.opacity = (.32 + .38 * blur).toFixed(3);
    show(this.head, t, c(1) - .1, {out: c(3) - .2});
    const L2 = e(2) - c(2);
    show(this.gp, t, c(2) - .3, {out: c(3) - .2});
    this.gauges.forEach((g, k) => {
      const p = eo(prog(t, c(2) + L2 * [.02, .12, .26, .4][k], 1.3)), v = Math.round(lerp(18, 100, p));
      g.querySelector('i').style.width = v + '%';
      g.querySelector('.val').textContent = v >= 100 ? 'FULL' : v + '%';
      g.classList.toggle('full', v >= 100);
    });
    const t0 = c(2) + L2 * .55;
    show(this.cp, t, t0 - .4, {out: c(3) - .2});
    let queued = 0;
    this.tokens.forEach((el, k) => {
      const p = eo(prog(t, t0 + k * .35, .6)); if (p > .5) queued++;
      el.style.left = px(lerp(860, 270 + k * 56, p)); el.style.top = px(166); el.style.opacity = p.toFixed(3);
    });
    this.qlbl.textContent = queued ? `${queued} job${queued > 1 ? 's' : ''} waiting` : '';
    show(this.core, t, c(3) + .1, {s: .08, dy: 0});
    const L3 = e(3) - c(3);
    show(this.lines, t, c(3) + L3 * .45, {dy: 0});
    show(this.o1, t, c(3) + L3 * .5, {dy: 20}); show(this.o2, t, c(3) + L3 * .75, {dy: 20});
  },
};

scenes.built = {
  note: 'Recorded replay · scenario 04 · reference heuristic',
  build(r) {
    this.img = h('img', 'base', '', r);
    this.dim = h('div', 'shade', '', r); this.dim.style.background = '#06100c';
    h('div', 'shade grad-top', '', r);
    this.q = at(h('div', 'headline', 'Is the decision-maker<br>any good?', r), 0, 380, 1920); this.q.style.cssText += 'text-align:center;font-size:92px';
    this.lock = at(h('div', 'glass', '', r), 90, 170, 1000, 270);
    this.lock.innerHTML = `<div style="padding:36px 44px"><div style="display:flex;align-items:center;gap:22px;font:800 92px/1 var(--sans);letter-spacing:-.04em">${logo.replace('class="logo"', 'class="logo" style="width:72px;height:72px;padding:13px;gap:6px;border-radius:16px"')}<span>LabOps<span style="color:var(--accent)">Bench</span></span></div>
      <div style="margin-top:20px;font:600 30px/1.2 var(--sans);color:var(--muted)">Runs an agent's decisions inside a simulated laboratory</div></div>`;
    this.mods = ['Instruments', 'Robot arms', 'Mobile robots', 'Queues', 'Finite buffers'].map((m, k) => at(h('div', 'chip', `<span class="dot"></span>${m}`, r), 90 + [0, 214, 432, 682, 860][k], 470));
    this.mods.forEach(el => el.style.cssText += 'font-size:23px;padding:13px 20px;background:rgba(12,29,23,.85)');
    this.yes = at(h('div', 'glass', '<div style="padding:22px 30px;display:flex;align-items:center;gap:18px;font:700 34px/1 var(--sans)"><span class="check" style="width:40px;height:40px;font-size:24px">✓</span>Simulates operations, queues &amp; transport</div>', r), 90, 600);
    this.no = at(h('div', 'glass', '<div style="padding:22px 30px;display:flex;align-items:center;gap:18px;font:700 34px/1 var(--sans);color:#ffd2c4"><span class="check" style="width:40px;height:40px;font-size:24px;background:var(--limit)">✕</span><span style="text-decoration:line-through;text-decoration-thickness:3px">Predicts chemistry</span></div>', r), 90, 712);
  },
  update(S) {
    const {t, c, e} = S;
    frame(this.img, '03-benchmark-task', span(t, 0, S.dur, 450, 900));
    this.dim.style.opacity = (.62 - .2 * eo(prog(t, c(2), 1))).toFixed(3);
    show(this.q, t, c(1) - .15, {out: c(2) - .1, s: .05, dy: 0});
    show(this.lock, t, c(2), {dy: 30});
    const L2 = e(2) - c(2);
    this.mods.forEach((el, k) => show(el, t, c(2) + L2 * (.52 + k * .1), {dy: 16, d: .5}));
    show(this.yes, t, c(3) - .1, {dx: -30, dy: 0}); show(this.no, t, c(3) + .5, {dx: -30, dy: 0});
  },
};

scenes.loop = {
  build(r) {
    h('div', 'fill grid-bg', '', r);
    at(h('div', 'kicker', 'How LabOpsBench works', r), 90, 104);
    at(h('div', 'headline', 'One shared loop: observe → decide → execute', r), 90, 128).style.fontSize = '46px';
    this.eng = at(h('div', 'solid', '', r), 90, 215, 860, 555);
    this.eng.innerHTML = `<div style="padding:24px 26px 0"><div class="card-title">Laboratory simulator <span class="muted" style="font-weight:600">· engine</span></div></div>
      <div class="abs" style="left:26px;top:72px;width:808px;height:360px;border-radius:14px;overflow:hidden;border:1px solid var(--line)"><img class="base"></div>
      <div class="abs steps" style="left:26px;top:458px;display:flex;gap:12px;align-items:center"></div>`;
    this.engImg = this.eng.querySelector('img');
    const steps = this.eng.querySelector('.steps');
    this.steps = ['Validate', 'Dispatch', 'Move robots'].map((s, k) => { const el = h('div', 'step', `<span class="check">✓</span>${s}`, steps); if (k < 2) h('span', 'muted', '→', steps).style.fontSize = '22px'; return el; });
    this.inp = at(h('div', 'solid', '', r), 1110, 215, 720, 205);
    this.inp.innerHTML = `<div style="padding:22px 26px"><div class="card-title">Input <span class="muted" style="font-weight:600">· observation at t<sub>k</sub></span></div>
      <div class="r" style="margin-top:16px"><div class="row"><b>Jobs</b>all unfinished, incl. future arrivals · steps · durations</div></div>
      <div class="r" style="margin-top:8px"><div class="row"><b>Lab</b>layout · occupancy · resource limits</div></div>
      <div class="r" style="margin-top:8px"><div class="row"><b>Menu</b>shared equipment candidates</div></div></div>`;
    this.inRows = [...this.inp.querySelectorAll('.r')];
    this.agent = at(h('div', 'agent', '<div class="t">AI AGENT / ALGORITHM</div><div class="s">select equipment · prioritise jobs</div>', r), 1110, 455, 720, 100);
    this.outp = at(h('div', 'solid', '', r), 1110, 590, 720, 170);
    this.outp.innerHTML = `<div style="padding:20px 26px"><div class="card-title">Output <span class="muted" style="font-weight:600">· structured decision</span></div>
      <div class="o0" style="margin-top:12px;display:flex;gap:26px"><div class="row" style="flex:none"><b>t = 0</b>configuration +</div>
        <div style="flex:1;display:grid;gap:3px">${[['J07', 900], ['J08', 890], ['J01', 600]].map(([j, v]) => `<div class="pbar" style="grid-template-columns:44px 1fr 44px"><span>${j}</span><span class="track"><i data-v="${v}"></i></span><span>${v}</span></div>`).join('')}</div></div>
      <div class="o1" style="margin-top:8px"><div class="row"><b>Later</b>priorities + keep / permitted exchange</div></div></div>`;
    this.out0 = this.outp.querySelector('.o0'); this.out1 = this.outp.querySelector('.o1');
    this.pbars = [...this.outp.querySelectorAll('.pbar i')];
    const svg = at(h('div', '', `<svg width="1920" height="1080" style="overflow:visible"><defs><marker id="lah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#c5d9a4"/></marker></defs>
      <path class="a0" d="M952 300 L1102 300"/><path class="a1" d="M1470 422 L1470 450"/><path class="a2" d="M1470 557 L1470 585"/><path class="a3" d="M1108 680 L958 680"/></svg>`, r), 0, 0);
    this.arrows = [...svg.querySelectorAll('path')];
    this.arrows.forEach(p => { p.setAttribute('stroke', '#c5d9a4'); p.setAttribute('stroke-width', '4'); p.setAttribute('fill', 'none'); p.setAttribute('stroke-dasharray', '10 8'); p.setAttribute('marker-end', 'url(#lah)'); });
    // Timeline
    this.tlx = [160, 460, 760, 1060, 1700];
    this.line = at(h('div', '', '', r), 160, 832, 1600, 3); this.line.style.background = 'var(--line)';
    this.ticks = this.tlx.map((x, k) => { const d = at(h('div', '', '', r), x - 8, 825, 16, 16); d.style.cssText += 'border-radius:50%;background:var(--surface-2);border:3px solid var(--accent)'; return d; });
    this.tickLbl = ['t = 0', '1,800 s', '3,600 s', '5,400 s', 'Completion'].map((s, k) => at(h('div', 'tick-lbl', s, r), this.tlx[k], 856));
    this.dots = at(h('div', 'tick-lbl', '· · ·', r), 1380, 820);
    this.head = at(h('div', '', '', r), 152, 818, 16, 30); this.head.style.cssText += 'border-radius:8px;background:var(--ink);box-shadow:0 0 0 6px rgba(237,240,229,.15)';
    this.pause = at(h('div', 'badge', '', r), 0, 776);
    this.span = at(h('div', '', '', r), 160, 896, 0, 10); this.span.style.cssText += 'border-radius:5px;background:var(--accent)';
    this.score = at(h('div', 'badge', '<span style="color:var(--accent)">Score</span> = makespan · time to last unload', r), 1260, 776);
    this.fail = at(h('div', 'badge warn', '✕ Unfinished run → no score', r), 160, 920);
  },
  update(S) {
    const {t, c, e} = S;
    frame(this.engImg, '03-benchmark-task', (t * 30) % 450);
    const on = (a, b) => t >= a && t < b;
    const phase = on(c(1), c(2)) ? 'in' : on(c(2), c(3)) ? 'agent' : on(c(3), c(4)) ? 'eng' : 'all';
    const lit = (el, yes) => { el.style.opacity = yes ? '1' : '.5'; el.style.borderColor = yes ? 'var(--accent)' : 'var(--line)'; };
    lit(this.inp, phase === 'in' || phase === 'all'); lit(this.outp, phase === 'agent' || phase === 'all'); lit(this.eng, phase === 'eng' || phase === 'all');
    this.agent.style.boxShadow = phase === 'agent' ? '0 0 0 10px rgba(197,217,164,.18),0 0 60px rgba(197,217,164,.35)' : 'none';
    this.agent.style.opacity = phase === 'agent' || phase === 'all' ? '1' : '.6';
    const arrowOn = [phase === 'in', phase === 'agent', phase === 'agent', phase === 'eng'];
    this.arrows.forEach((p, k) => { p.setAttribute('stroke-dashoffset', String(-(t * 40) % 18)); p.style.opacity = arrowOn[k] || phase === 'all' ? '1' : '.3'; });
    const L1 = e(1) - c(1);
    this.inRows.forEach((el, k) => show(el, t, c(1) + L1 * [.05, .55, .8][k], {dy: 10, d: .5}));
    show(this.out0, t, c(2) + .3, {dy: 10});
    this.pbars.forEach((el, k) => { el.style.width = (eo(prog(t, c(2) + .8 + k * .25, .8)) * Number(el.dataset.v) / 10) + '%'; });
    show(this.out1, t, c(4) + .2, {dy: 10});
    const L3 = e(3) - c(3);
    this.steps.forEach((el, k) => { const p = prog(t, c(3) + L3 * [.05, .38, .7][k], .4); el.querySelector('.check').style.opacity = eo(p).toFixed(3); el.style.borderColor = p > 0 && t < c(4) ? 'var(--green)' : 'rgba(255,255,255,.12)'; });
    // Decision timeline: the playhead reaches each 1,800 s tick during sentence 4, completion during sentence 5.
    const L4 = e(4) - c(4), kt = [c(4) - .2, c(4) + L4 * .25, c(4) + L4 * .5, c(4) + L4 * .78, c(5) + .4];
    let x = this.tlx[0], dec = 1;
    for (let k = 1; k < kt.length; k++) { const p = eio(prog(t, kt[k] - .7, .7)); if (p > 0) { x = lerp(this.tlx[k - 1], this.tlx[k], p); if (p >= 1 && k < 4) dec = k + 1; } }
    this.head.style.left = px(x - 8);
    this.ticks.forEach((d, k) => { d.style.background = x >= this.tlx[k] - 1 ? 'var(--accent)' : 'var(--surface-2)'; });
    const near = k => Math.abs(t - kt[k]) < .9;
    const atTick = [0, 1, 2, 3].find(k => near(k) && t > c(4) - .3 && t < c(5));
    if (atTick != null) { this.pause.innerHTML = `<span style="color:var(--accent)">${icon.pause}</span>Clock paused · decision ${atTick + 1} / 32 max`; this.pause.style.left = px(this.tlx[atTick] - 20); }
    this.pause.style.opacity = atTick != null ? '1' : '0';
    show(this.score, t, c(5) - .1, {dy: 10});
    this.span.style.width = px(1540 * eo(prog(t, c(5) + .2, 1.2)));
    show(this.fail, t, c(6) - .1, {dy: 10});
  },
};

scenes.lemat = {
  dip: true,
  build(r) {
    h('div', 'fill grid-bg', '', r);
    at(h('div', 'kicker', 'Grounded workloads', r), 90, 104);
    at(h('div', 'headline', 'From published procedures to 14 scenarios', r), 90, 128).style.fontSize = '46px';
    this.srcp = at(h('div', 'solid', '', r), 90, 215, 520, 470);
    this.srcp.innerHTML = `<div style="padding:24px 26px"><div class="card-title">LeMat-Synth</div><div class="cite" style="margin-top:6px">public annotations · revision e4bacbc</div>
      ${[['8c37fd10…', 'Hydroxyapatite · Cs₃Bi₂I₉'], ['73c6aeeb…', 'Silver (Ag) synthesis'], ['arXiv 1706.00484', 'SrTiO₃ etching']].map(([i, m]) => `<div class="rec" style="margin-top:14px"><span class="id">${i}</span><span class="mat">${m}</span></div>`).join('')}
      <div class="cite" style="margin-top:16px">Lederbauer et al., arXiv:2510.26824 (2026)</div></div>`;
    this.recs = [...this.srcp.querySelectorAll('.rec')];
    this.tplp = at(h('div', 'solid', '', r), 700, 215, 560, 470);
    const tpls = [['HA mix', 'var(--luna)'], ['HA full route', 'var(--luna)'], ['Cs₃Bi₂I₉ mix', 'var(--green)'], ['Cs₃Bi₂I₉ separate', 'var(--green)'], ['Cs₃Bi₂I₉ full route', 'var(--green)'], ['Ag sonicate', 'var(--jev)'], ['Ag separate', 'var(--jev)'], ['SrTiO₃ etch', 'var(--algo)']];
    this.tplp.innerHTML = `<div style="padding:24px 26px"><div class="card-title">8 scheduling templates</div>
      <div style="margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:12px">${tpls.map(([n, col]) => `<div class="tpl"><i style="background:${col}"></i>${n}</div>`).join('')}</div>
      <div class="cite" style="margin-top:18px">steps · durations · required capabilities</div></div>`;
    this.tpls = [...this.tplp.querySelectorAll('.tpl')];
    this.scp = at(h('div', 'solid', '', r), 1350, 215, 480, 470);
    this.scp.innerHTML = `<div style="padding:24px 26px"><div class="card-title">14 scenarios</div>
      <div style="margin-top:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${Array.from({length: 14}, (_, k) => `<div class="tile" style="height:58px">${String(k + 1).padStart(2, '0')}</div>`).join('')}</div>
      <div class="stat" style="margin-top:20px;font:650 21px/1.35 var(--sans)">small cells → a hall with<br><span style="color:var(--accent)">32 instruments · 32 arms · 64 jobs</span></div></div>`;
    this.tiles = [...this.scp.querySelectorAll('.tile')]; this.stat = this.scp.querySelector('.stat');
    this.ar = [620, 1270].map(x => at(h('div', '', `<svg width="60" height="40"><path d="M4 20H48" stroke="#c5d9a4" stroke-width="4"/><path d="M42 10L54 20L42 30" fill="none" stroke="#c5d9a4" stroke-width="4" stroke-linejoin="round"/></svg>`, r), x + 6, 430));
    this.strip = at(h('div', 'solid', '', r), 90, 712, 1740, 118);
    this.strip.innerHTML = `<div style="display:flex;align-items:center;gap:34px;padding:24px 28px">
      <div style="flex:none"><div style="font:750 30px/1 var(--sans)">Ca₁₀(PO₄)₆(OH)₂</div><div class="cite" style="margin-top:8px">hydroxyapatite · 5 steps</div></div>
      <div class="flow">${['dissolve', 'add', 'mix', 'precipitate', 'dry'].map((s, k) => (k ? '<span class="arr">→</span>' : '') + `<span class="op">${s}</span>`).join('')}</div>
      <div class="cite" style="margin-left:auto">stirrer · liquid handler · oven</div></div>`;
    this.ops = [...this.strip.querySelectorAll('.op')];
    this.foot = at(h('div', 'cite', 'Durations come from the source records where available; equipment mapping and missing timings are modeling assumptions.', r), 92, 852);
  },
  update(S) {
    const {t, c, e} = S;
    const L1 = e(1) - c(1);
    show(this.srcp, t, c(1) - .2, {dy: 30});
    this.recs.forEach((el, k) => show(el, t, c(1) + .3 + k * .35, {dy: 12, d: .5}));
    show(this.ar[0], t, c(1) + L1 * .45, {dx: -20, dy: 0});
    show(this.tplp, t, c(1) + L1 * .45, {dy: 30});
    this.tpls.forEach((el, k) => show(el, t, c(1) + L1 * .55 + k * .16, {dy: 10, d: .45}));
    show(this.strip, t, c(1) + L1 * .2, {dy: 30});
    const step = Math.floor(Math.max(0, t - c(1) - L1 * .2 - .4) / .7) % 6;
    this.ops.forEach((el, k) => el.classList.toggle('on', k === step));
    show(this.foot, t, c(1) + L1 * .6, {dy: 0});
    show(this.ar[1], t, c(2) - .2, {dx: -20, dy: 0});
    show(this.scp, t, c(2) - .2, {dy: 30});
    this.tiles.forEach((el, k) => el.classList.toggle('on', t > c(2) + .2 + k * .09));
    show(this.stat, t, c(2) + (e(2) - c(2)) * .45, {dy: 10});
  },
};

scenes.luna = {
  dip: true,
  note: 'Recorded run · policy text summarises saved rationale (unverified)',
  build(r) {
    h('div', 'fill grid-bg', '', r);
    this.dev = h('div', 'device', '', r); this.img = h('img', 'base', '', this.dev);
    this.task = at(h('div', 'glass', '', r), 330, 230, 1260, 560);
    this.task.innerHTML = `<div style="padding:34px 40px"><div class="kicker">Scenario 11 · Pipeline scheduling</div>
      <div class="headline" style="font-size:46px;margin-top:12px">Same task for both agents</div>
      <div class="specs" style="display:flex;gap:12px;margin-top:22px">${['7 × 5 m room', '3 robot arms', '1 mobile robot', '12 jobs'].map(s => `<span class="chip" style="font-size:22px">${s}</span>`).join('')}</div>
      <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:40px;margin-top:34px">
        <div class="g1"><div style="font:700 24px/1.2 var(--sans)">6 × Ca₁₀(PO₄)₆(OH)₂</div><div class="cite" style="margin:6px 0 14px">dissolve → add → mix → precipitate → dry</div>
          <div style="display:grid;gap:8px">${'<div class="chain">' + '<i></i>'.repeat(5) + '</div>'}${('<div class="chain">' + '<i></i>'.repeat(5) + '</div>').repeat(5)}</div></div>
        <div class="g2"><div style="font:700 24px/1.2 var(--sans)">6 × Cs₃Bi₂I₉</div><div class="cite" style="margin:6px 0 14px">mix</div>
          <div style="display:grid;gap:8px">${('<div class="chain single"><i></i></div>').repeat(6)}</div></div></div></div>`;
    this.g1 = this.task.querySelector('.g1'); this.g2 = this.task.querySelector('.g2'); this.specs = this.task.querySelector('.specs');
    this.c1 = at(h('div', 'callout', '<i></i>Saved policy · summary', r), 850, 160);
    this.c2 = at(h('div', 'callout', 'Long chains ranked first<i></i>', r), 1010, 300);
  },
  update(S) {
    const {t, c, e} = S;
    const m = c(3) + (e(3) - c(3)) * .45;
    frame(this.img, '05-gpt-policy', t < c(3) ? span(t, 0, c(3), 0, 300) : t < m ? span(t, c(3), m, 300, 600) : span(t, m, S.dur, 600, 900));
    const cover = 1 - eio(prog(t, c(2) - .5, .6));
    this.img.style.filter = `brightness(${(1 - .62 * cover).toFixed(3)}) blur(${(cover * 3).toFixed(1)}px)`;
    show(this.task, t, c(1) - .2, {out: c(2) - .5, s: .03, dy: 0});
    const L1 = e(1) - c(1);
    show(this.specs, t, c(1) + L1 * .1, {dy: 10});
    this.g1.style.opacity = (.22 + .78 * eo(prog(t, c(1) + L1 * .58, .6))).toFixed(3);
    this.g2.style.opacity = (.22 + .78 * eo(prog(t, c(1) + L1 * .82, .6))).toFixed(3);
    show(this.c1, t, c(2) + .2, {dx: -20, dy: 0, out: c(3) + 1});
    show(this.c2, t, c(3) + .2, {dx: -20, dy: 0, out: S.dur - .6});
  },
};

scenes.jev = {
  note: 'Recorded runs · saved decisions replayed',
  build(r) {
    h('div', 'fill grid-bg', '', r);
    this.dev = h('div', 'device', '', r); this.img = h('img', 'base', '', this.dev);
    this.c1 = at(h('div', 'callout', '<i></i>Same observation · same candidates', r), 600, 160);
    this.c2 = at(h('div', 'callout', 'Ranking revised across 17 decisions<i></i>', r), 880, 300);
    this.split = at(h('div', '', '', r), 0, 0, 1920, 1080);
    this.split.innerHTML = `<div class="headline" style="position:absolute;left:0;right:0;top:150px;text-align:center;font-size:58px">Same lab, same jobs — <span style="color:var(--accent)">different strategies</span></div>
      ${['luna', 'jev'].map((m, k) => `<div class="abs" style="left:${90 + k * 885}px;top:280px;width:855px">
        <div style="display:flex;align-items:center;gap:12px;font:800 30px/1 var(--sans);color:var(--${m})"><span style="width:14px;height:14px;border-radius:4px;background:var(--${m})"></span>${m === 'luna' ? 'GPT-6 Luna' : 'Jev'}</div>
        <div style="position:relative;margin-top:16px;width:855px;height:481px;border-radius:16px;overflow:hidden;border:2px solid var(--${m})"><img class="base s${k}"></div>
        <div class="cite" style="margin-top:14px;font-size:18px">${m === 'luna' ? 'Fixed order: hydroxyapatite chains first' : 'Ranking reshuffled as the lab state changes'}</div></div>`).join('')}`;
    this.s0 = this.split.querySelector('.s0'); this.s1 = this.split.querySelector('.s1');
  },
  update(S) {
    const {t, c} = S;
    frame(this.img, '05-jev-priorities', span(t, 0, c(3), 0, 900));
    show(this.c1, t, c(1) + .2, {dx: -20, dy: 0, out: c(2)});
    show(this.c2, t, c(2) + .3, {dx: -20, dy: 0, out: c(3) - .4});
    const sp = eio(prog(t, c(3) - .4, .6));
    this.dev.style.opacity = (1 - sp).toFixed(3);
    this.split.style.opacity = sp.toFixed(3); this.split.style.visibility = sp > 0 ? 'visible' : 'hidden';
    if (sp > 0) { frame(this.s0, '05-gpt-policy', 660); frame(this.s1, '05-jev-priorities', 290); }
  },
};

const BARS = [
  {label: 'Pipeline scheduling · scenario 11', max: 13, best: ['luna'], vals: {fifo: 12.625, ref: 8.310, algo: 8.282, luna: 8.268, jev: 8.327}},
  {label: 'Compact lab layouts · scenario 14', max: 1.45, best: ['algo', 'jev'], vals: {fifo: 1.366, ref: 1.354, algo: 0.683, luna: 0.724, jev: 0.683}},
];
scenes.ui = {
  note: 'Recorded runs · one trial per method',
  build(r) {
    h('div', 'fill grid-bg', '', r);
    this.dev = h('div', 'device', '', r); this.img = h('img', 'base', '', this.dev);
    this.chart = at(h('div', 'glass', '', r), 250, 170, 1420, 690);
    const who = [['fifo', 'FIFO', 'var(--base)'], ['ref', 'Reference', 'var(--base)'], ['algo', 'Algorithm', 'var(--algo)'], ['luna', 'GPT-6 Luna', 'var(--luna)'], ['jev', 'Jev', 'var(--jev)']];
    this.chart.innerHTML = `<div style="padding:34px 44px"><div class="kicker lbl"></div>
      <div style="font:700 40px/1.1 var(--sans);margin-top:12px">Completion time <span class="muted" style="font-weight:600;font-size:28px">· hours · lower is better</span></div>
      <div class="bars" style="margin-top:28px">${who.map(([k, n, col]) => `<div class="lane" data-k="${k}"><div class="who" style="color:${col}">${n}</div><div class="track"><i style="background:${col}"></i><span class="best">FASTEST</span></div><div class="num">0</div></div>`).join('')}</div>
      <div class="cite" style="margin-top:22px;font-size:17px">One recorded trial per method · results depend on the task — not a general ranking</div></div>`;
    this.lanes = [...this.chart.querySelectorAll('.lane')]; this.lbl = this.chart.querySelector('.lbl');
    this.k1 = at(h('div', 'callout', '<i></i>2D plan ⇄ 3D lab', r), 490, 250);
    this.k2 = at(h('div', 'callout', 'Each decision + recorded rationale<i></i>', r), 930, 470);
    this.k3 = at(h('div', 'callout', '<i></i>Playback reads recorded events — never re-scores', r), 470, 760);
  },
  update(S) {
    const {t, c, e} = S;
    frame(this.img, '04-ui-tour', t < c(2) ? span(t, 0, c(2), 0, 150) : t < c(4) - .3 ? 150 : span(t, c(4) - .3, S.dur, 600, 1200));
    const ch = eio(prog(t, c(2) - .5, .6)) * (1 - eio(prog(t, c(4) - .6, .5)));
    this.img.style.filter = `brightness(${(1 - .6 * ch).toFixed(3)}) blur(${(ch * 6).toFixed(1)}px)`;
    show(this.chart, t, c(2) - .4, {out: c(4) - .6, s: .03, dy: 0});
    const m = eio(prog(t, c(3) + .2, 1.1)), set = m < .5 ? BARS[0] : BARS[1];
    this.lbl.textContent = set.label;
    const max = lerp(BARS[0].max, BARS[1].max, m);
    this.lanes.forEach((ln, k) => {
      const key = ln.dataset.k, grow = eo(prog(t, c(2) + k * .12, 1)), v = lerp(BARS[0].vals[key], BARS[1].vals[key], m);
      const w = grow * v / max * 860;
      ln.querySelector('i').style.width = px(w);
      ln.querySelector('.num').textContent = (grow * v).toFixed(3);
      const best = ln.querySelector('.best'), isBest = set.best.includes(key) && grow > .99 && (m < .05 || m > .95);
      best.style.left = px(w + 14); best.style.opacity = isBest ? '1' : '0';
      ln.style.opacity = set.best.includes(key) || (key === 'fifo' && m < .5) ? '1' : '.62';
    });
    const L4 = e(4) - c(4);
    show(this.k1, t, c(4) + L4 * .2, {dx: -20, dy: 0, out: c(5) - .2});
    show(this.k2, t, c(4) + L4 * .6, {dx: -20, dy: 0, out: c(5) - .2});
    show(this.k3, t, c(5), {dy: 16});
  },
};

scenes.future = {
  note: 'Outlook · not part of the current benchmark',
  build(r) {
    this.img = h('img', 'base', '', r);
    this.dim = h('div', 'shade', '', r); this.dim.style.background = '#06100c';
    h('div', 'shade grad-top', '', r);
    this.left = at(h('div', '', '', r), 90, 250, 760);
    this.left.innerHTML = `<div class="kicker k0">Today</div><div class="headline h0" style="margin-top:14px;font-size:60px">LabOpsBench<br>scores time.</div>
      <div class="kicker k1" style="margin-top:44px">Next</div><div class="headline h1" style="margin-top:14px;font-size:60px">One combined<br>decision.</div>
      <div class="n1" style="margin-top:30px;font:600 26px/1.35 var(--sans);color:var(--muted)">A foundation for multi-resource benchmarks,<br>and for validation against physical labs.</div>`;
    this.parts = ['.k0', '.h0', '.k1', '.h1', '.n1'].map(s => this.left.querySelector(s));
    const cx = 1330, cy = 520, R = 250;
    this.geo = {cx, cy, R};
    this.radar = at(h('div', '', `<svg width="1920" height="1080"><g class="rings">${[.33, .66, 1].map(f => `<polygon points="${[0, 1, 2, 3].map(k => { const a = -Math.PI / 2 + k * Math.PI / 2; return `${cx + R * f * Math.cos(a)},${cy + R * f * Math.sin(a)}`; }).join(' ')}" fill="none" stroke="rgba(197,217,164,.2)" stroke-width="2"/>`).join('')}
      ${[0, 1, 2, 3].map(k => { const a = -Math.PI / 2 + k * Math.PI / 2; return `<line class="ax" x1="${cx}" y1="${cy}" x2="${cx + R * Math.cos(a)}" y2="${cy + R * Math.sin(a)}" stroke="rgba(197,217,164,.35)" stroke-width="2"/>`; }).join('')}</g>
      <polygon class="poly" fill="rgba(197,217,164,.22)" stroke="#c5d9a4" stroke-width="4" stroke-linejoin="round"/></svg>`, r), 0, 0);
    this.poly = this.radar.querySelector('.poly');
    const axes = [['clock', 'Time'], ['element', 'Scarce elements'], ['bolt', 'Electricity'], ['drop', 'Water']];
    this.axes = axes.map(([ic, n], k) => {
      const a = -Math.PI / 2 + k * Math.PI / 2, x = cx + (R + 95) * Math.cos(a), y = cy + (R + 95) * Math.sin(a);
      const el = at(h('div', '', `<div class="icon-ring" style="color:var(--accent)">${icon[ic]}</div><div class="axis-lbl">${n}</div>`, r), x - 110, y - 62, 220);
      return el;
    });
    this.end = at(h('div', 'endcard', '', r), 0, 0, 1920, 1080);
    this.end.style.background = 'var(--bg-deep)';
    this.end.innerHTML = `<div class="fill grid-bg" style="opacity:.6"></div><div class="abs" style="left:0;right:0;top:330px;text-align:center">
      <div style="display:inline-flex;align-items:center;gap:26px" class="wordmark">${logo.replace('class="logo"', 'class="logo" style="width:96px;height:96px;padding:17px;gap:8px;border-radius:22px"')}<span>LabOps<b>Bench</b></span></div>
      <div class="subtitle" style="margin-top:30px">Benchmarking AI Agents for Laboratory Configuration and Experiment Scheduling</div>
      <div class="authors" style="margin-top:22px">Ryoma Yamamoto · Haruki Nakajima</div>
      <div style="margin-top:46px;display:inline-flex;gap:14px"><span class="chip">14 scenarios</span><span class="chip">Shared evaluation loop</span><span class="chip">Replayable runs</span></div>
      <div class="cite" style="margin-top:40px;font-size:17px">Simulation benchmark: models operations, queues and transport — not chemistry. Results are single recorded trials.</div></div>`;
  },
  update(S) {
    const {t, c, e, dur} = S;
    frame(this.img, '02-future-sdl', span(t, 0, dur, 450, 900));
    const b = eo(prog(t, c(2) - .4, 1));
    this.img.style.filter = `blur(${(3 + 5 * b).toFixed(1)}px)`;
    this.img.style.transform = 'scale(1.06)';
    this.dim.style.opacity = (.55 + .2 * b).toFixed(3);
    const [k0, h0, k1, h1, n1] = this.parts;
    show(k0, t, c(1) - .2); show(h0, t, c(1));
    const L2 = e(2) - c(2);
    show(k1, t, c(2) + L2 * .7); show(h1, t, c(2) + L2 * .78); show(n1, t, c(3) + .3);
    show(this.radar, t, c(1) + .2, {dy: 0, s: .04});
    const vals = [eo(prog(t, c(1) + .4, 1)) * .85, ...[.3, .45, .58].map(f => eo(prog(t, c(2) + L2 * f, .9)) * .75)];
    const {cx, cy, R} = this.geo;
    this.poly.setAttribute('points', vals.map((v, k) => { const a = -Math.PI / 2 + k * Math.PI / 2, rr = Math.max(4, R * v); return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`; }).join(' '));
    show(this.axes[0], t, c(1) + .3, {dy: 10});
    [.3, .45, .58].forEach((f, k) => show(this.axes[k + 1], t, c(2) + L2 * f - .1, {dy: 10, s: .1}));
    const endAt = e(3) + .5;
    this.end.style.opacity = eio(prog(t, endAt, .8)).toFixed(3);
    this.end.style.visibility = t >= endAt ? 'visible' : 'hidden';
    S.endcard = t >= endAt + .4;
  },
};

// ---------- Global chrome ----------
const roots = {};
const chapterNames = [...new Set(tl.scenes.map(s => s.chapter).filter(Boolean))];
const chapters = h('div', '', '', stage); chapters.id = 'chapters';
const chEls = chapterNames.map(n => h('div', 'ch', `<div class="bar"><i></i></div><div class="lbl">${n}</div>`, chapters));
const brand = h('div', '', `${logo}LabOpsBench`, stage); brand.id = 'brand';
const note = h('div', 'chip dim', '', stage); note.id = 'note';
const caption = h('div', '', '', stage); caption.id = 'caption';
const fade = h('div', '', '', stage); fade.id = 'fade';

for (const s of tl.scenes) {
  const root = h('div', 'scene', '', stage);
  roots[s.id] = root;
  scenes[s.id].build(root);
}

function ctx(s, t, extra = {}) {
  const sent = s.sentences;
  return {t, dur: s.duration, c: n => sent[n - 1].start, e: n => sent[n - 1].end, ...extra};
}

let thumbMode = false;
window.renderFrame = async T => {
  loads.length = 0;
  const t = Math.min(T, tl.duration - 1e-3);
  const vis = tl.scenes.filter(s => t >= s.start && t < s.start + s.duration);
  let top = null, S = null;
  tl.scenes.forEach((s, i) => {
    const root = roots[s.id];
    if (!vis.includes(s)) { root.style.display = 'none'; return; }
    root.style.display = 'block';
    const local = t - s.start;
    const next = tl.scenes[i + 1], dipOut = next && scenes[next.id].dip && t >= next.start;
    root.style.opacity = dipOut ? (1 - eio(prog(t - next.start, 0, tl.xfade * .5))).toFixed(3)
      : !i ? '1' : scenes[s.id].dip ? eio(prog(local, tl.xfade * .5, tl.xfade * .5)).toFixed(3) : eio(prog(local, 0, tl.xfade)).toFixed(3);
    root.style.zIndex = String(i + 1);
    S = ctx(s, local, {thumb: thumbMode});
    scenes[s.id].update(S);
    top = s;
  });
  const endcard = top.id === 'future' && S.endcard;
  // Chapter progress
  const chOn = top.chapter;
  chapters.style.opacity = top.id === 'title' || endcard ? '0' : '1';
  chapterNames.forEach((n, k) => {
    const sc = tl.scenes.filter(s => s.chapter === n), a = sc[0].start, b = sc.at(-1).start + sc.at(-1).duration;
    chEls[k].querySelector('i').style.width = (clamp((t - a) / (b - a)) * 100).toFixed(2) + '%';
    chEls[k].classList.toggle('on', n === chOn);
  });
  brand.style.opacity = top.id === 'title' || endcard ? '0' : '1';
  const nt = scenes[top.id].note;
  note.textContent = nt ?? ''; note.style.opacity = nt && !endcard ? '1' : '0';
  const cap = tl.captions.find(k => t >= k.start - .05 && t < k.end + .12);
  caption.textContent = cap ? cap.text.replace(/(\w)-(?=\w)/g, '$1‑') : '';
  caption.style.opacity = cap && !thumbMode ? '1' : '0';
  fade.style.opacity = Math.max(1 - t / .6, (t - (tl.duration - .8)) / .8, 0).toFixed(3);
  await Promise.all(loads);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
};
window.renderThumbnail = async () => {
  thumbMode = true;
  await renderFrame(tl.scenes[0].duration * .7);
  for (const el of [chapters, brand, note, caption, fade]) el.style.opacity = '0';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
};
window.videoReady = true;
