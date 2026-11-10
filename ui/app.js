"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let api = null;
let INFO = { version: "1.0.0", repo: "", auto_update: true };
let timers = [];
let current = -1;
let latest = null;

/* ---------- animations : glitch + texte révélé ---------- */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#/%&";
function type(el, text, speed = 20) {
  text = text ?? el.dataset.full ?? el.textContent;
  el.dataset.full = text;
  clearInterval(el._ti);
  let i = 0;
  el.textContent = "";
  el._ti = setInterval(() => {
    i++;
    el.textContent = text.slice(0, i) + (i < text.length ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : "");
    if (i >= text.length) clearInterval(el._ti);
  }, speed);
}
function typeAll(root, delay = 0) {
  root.querySelectorAll("[data-t]").forEach((el, k) => {
    if (!el.dataset.full) el.dataset.full = el.textContent;
    el.textContent = "";
    setTimeout(() => type(el), delay + k * 18);
  });
}
function glitch(el) { el.classList.remove("glitch"); void el.offsetWidth; el.classList.add("glitch"); }
function flash(el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
const underline = (w = "72%") =>
  `<svg class="underline" style="width:${w}" viewBox="0 0 200 10" preserveAspectRatio="none"><path pathLength="1" vector-effect="non-scaling-stroke" d="M2 6 C 60 2, 120 9, 198 4"/></svg>`;

/* ---------- formats ---------- */
function bytes(b) {
  if (b >= 1e12) return (b / 1e12).toFixed(2) + " TB";
  if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(1) + " MB";
  if (b >= 1e3) return (b / 1e3).toFixed(0) + " KB";
  return Math.round(b) + " B";
}
function uptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  return (d ? d + "D " : "") + String(h).padStart(2, "0") + "H " + String(m).padStart(2, "0") + "M";
}
function setStatus(el, msg, ok = true) {
  el.classList.toggle("err", !ok);
  type(el, msg, 14);
}

/* ---------- onglets ---------- */
const TABS = [
  { label: "COMMANDS", key: "LAUNCH", kanji: "令", title: "COMMANDS", sub: "EXECUTE YOUR COMMAND", render: viewCommands },
  { label: "SYSTEM", key: "MONITOR", kanji: "心", title: "SYSTEM", sub: "READ THE HEART OF THE MACHINE", render: viewSystem },
  { label: "CLEAN", key: "PURIFY", kanji: "浄", title: "PURIFY", sub: "CUT AWAY THE DEAD WEIGHT", render: viewClean },
  { label: "TOOLS", key: "BLADES", kanji: "刃", title: "TOOLS", sub: "SHARPEN YOUR BLADES", render: viewTools },
  { label: "UPDATE", key: "REFORGE", kanji: "新", title: "UPDATE", sub: "THE BLADE IS REFORGED", render: viewUpdate },
];

function buildTabs() {
  $("#tabs").innerHTML = TABS.map((t, i) =>
    `<li data-i="${i}"><span class="sl">/</span><span data-t>${t.label}</span><span class="dot"></span><span class="k">${i + 1}</span>${underline()}</li>`).join("");
  $("#tabs").onclick = e => { const li = e.target.closest("li"); if (li) select(+li.dataset.i); };
}

function select(i) {
  if (i === current) return;
  current = i;
  timers.forEach(clearInterval);
  timers = [];
  document.querySelectorAll("#tabs li").forEach((li, k) => li.classList.toggle("on", k === i));
  const t = TABS[i];
  $("#kanji").textContent = t.kanji;
  $("#title").dataset.full = t.title;
  $("#subtitle").dataset.full = t.sub;
  const view = $("#view");
  view.innerHTML = "";
  view.scrollTop = 0;
  t.render(view);
  glitch($("#panel"));
  typeAll($("#panel"), 120);
}

/* ---------- / COMMANDS ---------- */
async function viewCommands(v) {
  v.innerHTML = `
    <div class="cmdline"><input id="cmd" placeholder="TYPE A COMMAND" spellcheck="false" autocomplete="off"><span class="exec" id="exec">EXECUTE</span></div>
    <div class="status" id="status"></div>
    <div id="list"></div>`;
  const input = $("#cmd"), list = $("#list"), status = $("#status"), exec = $("#exec");
  let cmds = await api.commands();
  let sel = 0, shown = [];

  const parse = () => {
    const raw = input.value.trim().replace(/^\//, "");
    const parts = raw.split(/\s+/).filter(Boolean);
    return { name: (parts[0] || "").toUpperCase(), args: parts.slice(1), spaced: /\s$/.test(input.value) };
  };
  const filter = () => {
    const { name, args, spaced } = parse();
    if (!name) return cmds;
    if (args.length || spaced) return cmds.filter(c => c.name === name);
    return [...cmds.filter(c => c.name.startsWith(name)), ...cmds.filter(c => !c.name.startsWith(name) && c.name.includes(name))];
  };
  const draw = (animate = false) => {
    const { name, args } = parse();
    shown = filter();
    sel = Math.min(sel, Math.max(shown.length - 1, 0));
    exec.classList.toggle("show", shown.length > 0 && shown[0].name === name);
    list.innerHTML = shown.map((c, i) => {
      const typed = c.name === name;
      const pills = c.args.map((a, k) => typed && args[k]
        ? `<span class="pill val">${esc(k === c.args.length - 1 ? args.slice(k).join(" ") : args[k])}</span>`
        : `<span class="pill">${a}</span>`).join("") + (c.custom ? `<span class="pill">CUSTOM</span>` : "");
      return `<div class="row click${i === sel ? " sel" : ""}" data-i="${i}">
        <span><span class="sl">/</span><span ${animate ? "data-t" : ""}>${c.name}</span></span>
        <span class="pills">${pills}</span><span></span>
        <span class="desc" ${animate ? "data-t" : ""}>${esc(c.desc)}</span>${underline("150px")}</div>`;
    }).join("") || `<div class="row"><span class="dim">NO MATCHING COMMAND</span></div>`;
    if (animate) typeAll(list, 200);
  };
  const run = async c => {
    const { name, args } = parse();
    const given = c.name === name ? args : [];
    if (c.args.length && given.length < c.args.length) {
      input.value = `/${c.name} ${given.join(" ")}${given.length ? " " : ""}`;
      input.focus();
      draw();
      setStatus(status, c.args.slice(given.length).join(" · ") + " REQUIRED", false);
      return;
    }
    const r = await api.run(c.name, given);
    setStatus(status, r.msg, r.ok);
    if (r.ok) { flash(list.children[sel] || list); input.value = ""; }
    if (r.refresh) cmds = await api.commands();
    sel = 0;
    draw();
  };

  input.oninput = () => { sel = 0; draw(); };
  input.onkeydown = e => {
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === "Tab") { if (shown[sel]) { input.value = `/${shown[sel].name} `; draw(); } e.preventDefault(); }
    else if (e.key === "Enter") { if (shown[sel]) run(shown[sel]); }
    else if (e.key === "Escape") { input.value = ""; sel = 0; draw(); }
  };
  exec.onclick = () => shown[0] && run(shown[0]);
  list.onclick = e => { const row = e.target.closest(".row.click"); if (row) { sel = +row.dataset.i; run(shown[sel]); } };
  draw(true);
  setTimeout(() => input.focus(), 50);
}

/* ---------- / SYSTEM ---------- */
function viewSystem(v) {
  const stat = (id, name, desc) => `<div class="row">
      <span><span class="sl">/</span><span data-t>${name}</span></span>
      <span class="pills"><span class="pill" id="${id}-p">—</span></span>
      <div class="gauge"><b id="${id}-g" style="width:0"></b></div>
      <span class="big" id="${id}-v">—</span></div>`;
  v.innerHTML = stat("cpu", "CPU") + stat("ram", "MEMORY") + stat("disk", "DISK") +
    `<div class="row"><span><span class="sl">/</span><span data-t>NETWORK</span></span>
       <span class="pills"><span class="pill">DOWN</span><span class="pill val" id="net-d">—</span><span class="pill">UP</span><span class="pill val" id="net-u">—</span></span><span></span><span class="desc" data-t>LIVE TRAFFIC</span></div>
     <div class="row"><span><span class="sl">/</span><span data-t>UPTIME</span></span>
       <span class="pills"><span class="pill val" id="up">—</span></span><span></span><span class="desc" id="bat">SINCE LAST BOOT</span></div>
     <div class="section" data-t>HEAVIEST PROCESSES</div><div id="procs"></div>`;
  const set = (id, pct, pill, val) => {
    $(`#${id}-g`).style.width = Math.min(pct, 100) + "%";
    $(`#${id}-p`).textContent = pill;
    $(`#${id}-v`).textContent = val;
  };
  const tick = async () => {
    const s = await api.stats();
    if (!$("#cpu-g")) return;
    set("cpu", s.cpu, `${s.cores} THREADS`, Math.round(s.cpu) + " %");
    set("ram", s.ram, `${bytes(s.ram_used)} / ${bytes(s.ram_total)}`, Math.round(s.ram) + " %");
    set("disk", s.disk, `${bytes(s.disk_used)} / ${bytes(s.disk_total)}`, Math.round(s.disk) + " %");
    $("#net-d").textContent = bytes(s.down) + "/S";
    $("#net-u").textContent = bytes(s.up) + "/S";
    $("#up").textContent = uptime(s.uptime);
    if (s.battery) $("#bat").textContent = `BATTERY ${Math.round(s.battery.pct)} %${s.battery.plugged ? " · PLUGGED" : ""}`;
  };
  const armed = {};
  const procs = async () => {
    const list = await api.processes();
    const box = $("#procs");
    if (!box) return;
    box.innerHTML = list.map(p => `<div class="row">
        <span><span class="sl">/</span>${esc(p.name.replace(/\.exe$/i, "").toUpperCase())}</span>
        <span class="pills">${p.count > 1 ? `<span class="pill">×${p.count}</span>` : ""}<span class="pill val">${bytes(p.mem)}</span></span><span></span>
        <span class="act${armed[p.name] ? " warn" : ""}" data-n="${esc(p.name)}">${armed[p.name] ? "CONFIRM" : "END"}</span></div>`).join("");
  };
  $("#procs").onclick = async e => {
    const b = e.target.closest(".act");
    if (!b) return;
    const n = b.dataset.n;
    if (!armed[n]) { armed[n] = true; b.textContent = "CONFIRM"; b.classList.add("warn"); setTimeout(() => { delete armed[n]; procs(); }, 3000); return; }
    delete armed[n];
    const r = await api.kill(n);
    b.classList.remove("warn");
    type(b, r.msg, 14);
    setTimeout(procs, 900);
  };
  tick(); procs();
  timers.push(setInterval(tick, 1000), setInterval(procs, 3500));
}

/* ---------- / CLEAN ---------- */
function viewClean(v) {
  const T = [
    ["TEMP", "TEMP FILES", "USER TEMPORARY FOLDER"],
    ["BIN", "RECYCLE BIN", "EMPTIES THE BIN FOR GOOD"],
    ["ROBLOX", "ROBLOX LOGS", "STUDIO AND PLAYER LOGS"],
    ["CRASH", "CRASH DUMPS", "OLD CRASH REPORTS"],
    ["DNS", "DNS CACHE", "FIXES SOME CONNECTION ISSUES"],
  ];
  v.innerHTML = `<div class="row"><span><span class="sl">/</span><span data-t>RECLAIMABLE</span></span><span class="pills"><span class="pill" id="scan-p">SCANNING</span></span><span></span><span class="big" id="total">—</span></div>
    <div class="status" id="cstatus"></div>` +
    T.map(([k, n, d]) => `<div class="row" data-k="${k}">
      <span><span class="sl">/</span><span data-t>${n}</span></span>
      <span class="pills"><span class="pill${k === "DNS" ? "" : " val"}" id="c-${k}">${k === "DNS" ? "INSTANT" : "…"}</span></span>
      <span class="desc" data-t>${d}</span><span class="act" data-k="${k}">EXECUTE</span></div>`).join("") +
    `<div class="row click" id="rescan"><span><span class="sl">/</span><span data-t>RESCAN</span></span><span></span><span></span><span class="desc" data-t>MEASURE AGAIN</span></div>`;
  const scan = async () => {
    $("#scan-p").textContent = "SCANNING";
    const s = await api.scan();
    if (!$("#total")) return;
    let total = 0;
    for (const [k, x] of Object.entries(s)) {
      total += x.size;
      const el = $(`#c-${k}`);
      if (el) el.textContent = `${bytes(x.size)} · ${x.count} ${k === "BIN" ? "ITEMS" : "FILES"}`;
    }
    $("#scan-p").textContent = "4 TARGETS";
    type($("#total"), bytes(total), 30);
  };
  v.onclick = async e => {
    if (e.target.closest("#rescan")) return scan();
    const b = e.target.closest(".act");
    if (!b) return;
    if (!b.classList.contains("warn")) {
      b.classList.add("warn"); b.textContent = "CONFIRM";
      setTimeout(() => { if (b.classList.contains("warn")) { b.classList.remove("warn"); b.textContent = "EXECUTE"; } }, 3000);
      return;
    }
    b.classList.remove("warn"); b.textContent = "…";
    const r = await api.clean(b.dataset.k);
    b.textContent = "EXECUTE";
    setStatus($("#cstatus"), r.ok ? `${r.msg}${r.freed ? " · " + bytes(r.freed) + " FREED" : ""}` : r.msg, r.ok);
    flash(b.closest(".row"));
    scan();
  };
  scan();
}

/* ---------- / TOOLS ---------- */
function viewTools(v) {
  let len = 20, sym = true, pw = "";
  v.innerHTML = `
    <div class="row"><span><span class="sl">/</span><span data-t>PASSWORD</span></span>
      <span class="pills"><span class="pill btn" id="pw-m">−</span><span class="pill val" id="pw-l">LENGTH 20</span><span class="pill btn" id="pw-p">+</span><span class="pill btn active" id="pw-s">SYMBOLS</span></span>
      <span></span><span><span class="act" id="pw-g">GENERATE</span> &nbsp; <span class="act" id="pw-c">COPY</span></span></div>
    <div class="row"><span class="pw" id="pw"></span></div>
    <div class="section" data-t>FOCUS TIMER</div>
    <div class="row"><span class="timer" id="tm">25:00</span>
      <span class="pills" id="tm-p">${[5, 15, 25, 45, 60].map(m => `<span class="pill btn${m === 25 ? " active" : ""}" data-m="${m}">${m} MIN</span>`).join("")}</span>
      <span></span><span><span class="act" id="tm-s">START</span> &nbsp; <span class="act" id="tm-r">RESET</span></span></div>
    <div class="section" data-t>NOTES</div>
    <textarea class="notes" id="notes" placeholder="WRITE SOMETHING… SAVED AUTOMATICALLY" spellcheck="false"></textarea>
    <div class="status" id="tstatus"></div>`;

  const gen = async () => { pw = await api.password(len, sym); type($("#pw"), pw, 12); };
  $("#pw-m").onclick = () => { len = Math.max(8, len - 2); $("#pw-l").textContent = "LENGTH " + len; gen(); };
  $("#pw-p").onclick = () => { len = Math.min(64, len + 2); $("#pw-l").textContent = "LENGTH " + len; gen(); };
  $("#pw-s").onclick = e => { sym = !sym; e.target.classList.toggle("active", sym); gen(); };
  $("#pw-g").onclick = gen;
  $("#pw-c").onclick = async () => { await api.copy(pw); setStatus($("#tstatus"), "PASSWORD COPIED"); };
  gen();

  // minuteur (garde son état entre les onglets)
  const T = window.__timer ||= { total: 1500, left: 1500, end: 0, running: false };
  const draw = () => {
    const el = $("#tm");
    if (!el) return;
    const left = T.running ? Math.max(0, (T.end - Date.now()) / 1000) : T.left;
    el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    el.classList.toggle("done", T.done === true);
    $("#tm-s").textContent = T.running ? "PAUSE" : "START";
  };
  $("#tm-p").onclick = e => {
    const p = e.target.closest("[data-m]");
    if (!p) return;
    document.querySelectorAll("#tm-p .pill").forEach(x => x.classList.toggle("active", x === p));
    Object.assign(T, { total: p.dataset.m * 60, left: p.dataset.m * 60, running: false, done: false });
    draw();
  };
  $("#tm-s").onclick = () => {
    if (T.running) { T.left = Math.max(0, (T.end - Date.now()) / 1000); T.running = false; }
    else { if (T.left <= 0) T.left = T.total; T.end = Date.now() + T.left * 1000; T.running = true; T.done = false; }
    draw();
  };
  $("#tm-r").onclick = () => { Object.assign(T, { left: T.total, running: false, done: false }); draw(); };
  draw();
  timers.push(setInterval(draw, 250));

  const notes = $("#notes");
  api.notes().then(t => notes.value = t);
  let st;
  notes.oninput = () => { clearTimeout(st); st = setTimeout(async () => { await api.save_notes(notes.value); setStatus($("#tstatus"), "NOTES SAVED"); }, 700); };
}
// le minuteur sonne même hors de l'onglet
setInterval(() => {
  const T = window.__timer;
  if (T && T.running && Date.now() >= T.end) { T.running = false; T.left = 0; T.done = true; gong(); toast("TIMER", "TIME IS UP", null); }
}, 500);
function gong() {
  try {
    const ctx = new AudioContext();
    [110, 220, 331, 523].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25 / (i + 1), ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.5);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 3.6);
    });
  } catch (_) { /* pas de son */ }
}

/* ---------- / UPDATE ---------- */
function viewUpdate(v) {
  v.innerHTML = `
    <div class="row"><span><span class="sl">/</span><span data-t>VERSION</span></span><span class="pills"><span class="pill val">${INFO.version}</span></span><span></span><span class="desc" data-t>INSTALLED</span></div>
    <div class="row"><span><span class="sl">/</span><span data-t>LATEST</span></span><span class="pills"><span class="pill val" id="u-l">${latest && latest.ok ? latest.latest : "—"}</span></span><span></span><span class="desc" id="u-d">${latest && latest.ok ? latest.date : "NOT CHECKED"}</span></div>
    <div class="row click" id="u-repo"><span><span class="sl">/</span><span data-t>REPOSITORY</span></span><span class="pills"><span class="pill">${esc(INFO.repo.toUpperCase())}</span></span><span></span><span class="desc" data-t>OPEN ON GITHUB</span></div>
    <div class="row"><span><span class="sl">/</span><span data-t>AUTO CHECK</span></span><span class="pills"><span class="pill btn${INFO.auto_update ? " active" : ""}" id="u-auto">${INFO.auto_update ? "ON" : "OFF"}</span></span><span></span><span class="desc" data-t>AT EVERY LAUNCH</span></div>
    <div class="row"><span><span class="sl">/</span><span data-t>CHECK NOW</span></span><span></span><span></span><span class="act" id="u-check">EXECUTE</span></div>
    <div class="row hidden" id="u-inst"><span><span class="sl">/</span>INSTALL</span><span class="pills"><span class="pill val" id="u-iv"></span></span><div class="gauge"><b id="u-g" style="width:0"></b></div><span class="act" id="u-go">EXECUTE</span></div>
    <div class="status" id="ustatus"></div>
    <div class="relnotes hidden" id="u-notes"></div>`;
  const show = r => {
    if (!r.ok) return setStatus($("#ustatus"), r.msg, false);
    $("#u-l").textContent = r.latest;
    $("#u-d").textContent = r.date || "";
    $("#u-inst").classList.toggle("hidden", !r.newer);
    $("#u-iv").textContent = "V" + r.latest;
    if (r.notes) { $("#u-notes").textContent = r.notes; $("#u-notes").classList.remove("hidden"); }
    setStatus($("#ustatus"), r.newer ? `VERSION ${r.latest} IS READY` : "YOUR BLADE IS UP TO DATE");
  };
  if (latest) show(latest);
  $("#u-repo").onclick = () => api.open_url(`https://github.com/${INFO.repo}`);
  $("#u-auto").onclick = async e => {
    INFO.auto_update = !INFO.auto_update;
    await api.set_auto_update(INFO.auto_update);
    e.target.textContent = INFO.auto_update ? "ON" : "OFF";
    e.target.classList.toggle("active", INFO.auto_update);
  };
  $("#u-check").onclick = async () => { setStatus($("#ustatus"), "CONTACTING GITHUB"); latest = await api.check_update(); show(latest); markUpdate(); };
  $("#u-go").onclick = () => install($("#ustatus"));
}
async function install(statusEl) {
  const r = await api.install_update();
  if (!r.ok) { if (statusEl) setStatus(statusEl, r.msg, false); else toast("UPDATE", r.msg, null); return; }
  const poll = setInterval(async () => {
    const p = await api.update_progress();
    const g = $("#u-g");
    if (g) g.style.width = p.pct + "%";
    if (statusEl && document.body.contains(statusEl)) statusEl.textContent = `${p.msg} ${p.pct} %`;
    if (p.state === "error") { clearInterval(poll); toast("UPDATE", p.msg, null); }
  }, 300);
}
function markUpdate() {
  const li = document.querySelectorAll("#tabs li")[4];
  if (li) li.classList.toggle("alert", !!(latest && latest.newer));
}

/* ---------- toast ---------- */
function toast(head, msg, action) {
  const t = $("#toast");
  t.innerHTML = `<span><span class="sl">/ </span>${head}</span><span class="dim">${esc(msg)}</span>${action ? `<span class="act" id="t-go">${action.label}</span>` : ""}<span class="act" id="t-x">×</span>`;
  t.classList.remove("hidden");
  glitch(t);
  if (action) $("#t-go").onclick = () => { action.run(); t.classList.add("hidden"); };
  $("#t-x").onclick = () => t.classList.add("hidden");
}

/* ---------- verrou ---------- */
async function gate() {
  const st = await api.license_status();
  $("#lk-mid").textContent = st.machine;
  if (st.licensed) return true;
  return new Promise(resolve => {
    const lock = $("#lock");
    lock.classList.remove("hidden");
    glitch($(".lock-card"));
    typeAll($(".lock-card"), 120);
    const key = $("#lk-key"), status = $("#lk-status");
    $("#lk-copy").onclick = async () => { await api.copy(st.machine); setStatus(status, "MACHINE ID COPIED"); };
    const tryKey = async () => {
      const r = await api.activate(key.value);
      setStatus(status, r.msg, r.ok);
      if (r.ok) { flash($(".lock-card")); setTimeout(() => { lock.classList.add("hidden"); resolve(true); }, 450); }
    };
    $("#lk-go").onclick = tryKey;
    key.onkeydown = e => { if (e.key === "Enter" && e.ctrlKey) tryKey(); };
    setTimeout(() => key.focus(), 400);
  });
}

/* ---------- démarrage ---------- */
async function boot() {
  INFO = await api.info();
  $("#ver").textContent = "v" + INFO.version;
  $("#foot-ver").textContent = "V" + INFO.version;
  $("#btn-close").onclick = () => api.close();
  $("#btn-min").onclick = () => api.minimize();
  glitch($("#bar"));
  typeAll($("#bar"));
  await gate();  // bloque tant que la clé n'est pas validée
  buildTabs();
  document.addEventListener("keydown", e => {
    const digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);  // touche physique (AZERTY ok)
    if (e.ctrlKey && digit) { select(+digit[1] - 1); e.preventDefault(); }
    else if (current === 0 && !e.ctrlKey && e.key.length === 1 && document.activeElement !== $("#cmd") && document.activeElement.tagName !== "TEXTAREA") $("#cmd")?.focus();
  });
  document.addEventListener("contextmenu", e => { if (!e.target.closest("input,textarea")) e.preventDefault(); });
  glitch($("#nav"));
  typeAll($("#nav"), 80);
  setTimeout(() => select(0), 180);
  if (INFO.auto_update) {
    setTimeout(async () => {
      latest = await api.check_update();
      markUpdate();
      if (latest.ok && latest.newer) toast("UPDATE", `VERSION ${latest.latest} AVAILABLE`, { label: "INSTALL", run: () => { select(4); install($("#ustatus")); } });
    }, 2500);
  }
}

/* aperçu dans un navigateur sans pywebview : fausse API */
function mockApi() {
  const ok = m => Promise.resolve({ ok: true, msg: m });
  return {
    info: () => Promise.resolve({ version: "1.0.0", repo: "owner/ronin-tool", auto_update: false, frozen: false }),
    commands: () => Promise.resolve([["DOWNLOADS", [], "OPENS DOWNLOADS"], ["STUDIO", [], "LAUNCHES ROBLOX STUDIO"], ["SEARCH", ["QUERY"], "SEARCHES THE WEB"], ["SHUTDOWN", ["MINUTES"], "SCHEDULES SHUTDOWN"], ["ADD", ["NAME", "PATH / URL"], "ADDS A COMMAND"]].map(([name, args, desc]) => ({ name, args, desc, custom: false }))),
    run: n => ok(n + " LAUNCHED"),
    stats: () => Promise.resolve({ cpu: 20 + Math.random() * 30, cores: 12, ram: 61, ram_used: 9.8e9, ram_total: 16e9, disk: 72, disk_used: 340e9, disk_total: 476e9, down: Math.random() * 3e6, up: 4e4, uptime: 190000, battery: null }),
    processes: () => Promise.resolve([{ name: "chrome.exe", mem: 1.9e9, count: 22 }, { name: "RobloxStudioBeta.exe", mem: 1.2e9, count: 1 }, { name: "Discord.exe", mem: 4.1e8, count: 6 }]),
    kill: () => ok("1 PROCESS ENDED"),
    scan: () => Promise.resolve({ TEMP: { size: 1.3e9, count: 4211 }, BIN: { size: 2.2e8, count: 14 }, ROBLOX: { size: 8.4e7, count: 96 }, CRASH: { size: 0, count: 0 } }),
    clean: () => Promise.resolve({ ok: true, freed: 1.1e9, msg: "4100 FILES REMOVED" }),
    password: l => Promise.resolve(Array.from({ length: l }, () => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?"[(Math.random() * 64) | 0]).join("")),
    copy: () => ok(""), notes: () => Promise.resolve(""), save_notes: () => ok(""), set_auto_update: () => ok(""),
    open_url: () => ok(""), minimize: () => 0, close: () => 0,
    license_status: () => Promise.resolve({ licensed: true, machine: "DEMO-MOCK-0000-0000", name: "", exp: 0 }),
    activate: () => ok("ACCESS GRANTED"),
    check_update: () => Promise.resolve({ ok: true, latest: "1.0.1", newer: true, notes: "- NEW TOOLS\n- FASTER SCAN", date: "2026-11-10" }),
    install_update: () => Promise.resolve({ ok: false, msg: "DEV MODE — BUILD THE EXE FIRST" }),
    update_progress: () => Promise.resolve({ state: "idle", pct: 0, msg: "" }),
  };
}

let booted = false;
window.addEventListener("pywebviewready", () => { if (!booted) { booted = true; api = window.pywebview.api; boot(); } });
if (location.search.includes("mock")) { booted = true; api = mockApi(); boot(); }
