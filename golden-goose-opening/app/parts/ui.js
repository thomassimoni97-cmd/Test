// ---------------------------------------------------------------- state
const S = {
  model: null, file: null, loadedAt: null, demo: false,
  view: "program", opening: null, mode: "outline",
  f: { q: "", status: [], owner: [], area: [], sig: [] }, cell: null,
  collapsed: [], task: null, pop: null, menu: false,
};
try { const v = JSON.parse(localStorage.getItem("gg-view2") || "{}"); ["view", "opening", "mode"].forEach((k) => { if (v[k]) S[k] = v[k]; }); } catch (e) { /* storage unavailable */ }
const remember = () => { try { localStorage.setItem("gg-view2", JSON.stringify({ view: S.view, opening: S.opening, mode: S.mode })); } catch (e) { /* ignore */ } };
const $ = (id) => document.getElementById(id);
const resetFilters = () => { S.f = { q: "", status: [], owner: [], area: [], sig: [] }; S.cell = null; S.pop = null; };

function load(buf, name, demo) {
  try {
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const model = buildModel(wb);
    Object.assign(S, { model, file: name, loadedAt: new Date(), demo, task: null });
    if (!model.openings.some((o) => o.code === S.opening)) {
      S.opening = (model.openings.filter((o) => o.tasks.length).sort((a, b) => (a.current || 0) - (b.current || 0))[0] || model.openings[0] || {}).code || null;
    }
    $("alert").hidden = true;
    render();
  } catch (err) {
    $("alert-text").textContent = err.message || "The file could not be read. Check that it is an .xlsx export of the Action Log.";
    $("alert").hidden = false;
  }
}

// ---------------------------------------------------------------- small visual helpers
const ICONS = {
  store: '<path d="M2.5 6.5 3.5 3h9l1 3.5M3 6.5v7h10v-7M6.5 13.5v-4h3v4"/>',
  company: '<rect x="3" y="2.5" width="10" height="11" rx="1"/><path d="M6 5.5h1M9 5.5h1M6 8h1M9 8h1M7 13.5v-2.5h2v2.5"/>',
  pin: '<path d="M8 14s5-4.5 5-8.2A5 5 0 0 0 3 5.8C3 9.5 8 14 8 14z"/><circle cx="8" cy="6" r="1.8"/>',
  cal: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
  flag: '<path d="M3.5 14V2.5M3.5 3h8l-1.8 2.5L11.5 8h-8"/>',
};
const icon = (n) => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true">${ICONS[n]}</svg>`;
const cxIcon = (lvl) => { const n = { Low: 1, Medium: 2, High: 3 }[lvl] || 0; return `<span class="cx" aria-hidden="true">${[6, 10, 14].map((h, i) => `<i style="height:${h}px" class="${i < n ? "on" : ""}"></i>`).join("")}</span>`; };
function donut(pct) {
  const r = 15, c = 2 * Math.PI * r, v = pct == null ? 0 : pct;
  return `<svg class="donut" viewBox="0 0 38 38" role="img" aria-label="${pct == null ? "no tasks" : pct + "% completed"}"><circle class="bg" cx="19" cy="19" r="${r}"/>${v ? `<circle class="fg" cx="19" cy="19" r="${r}" stroke-dasharray="${(c * v) / 100} ${c}"/>` : ""}<text x="19" y="22.5" text-anchor="middle">${pct == null ? "–" : pct + "%"}</text></svg>`;
}
const BAR = [["Completed", "seg-done"], ["In Progress", "seg-progress"], ["Blocked", "seg-blocked"], ["Not Started", "seg-todo"]];
function statusBar(ts, big) {
  const app = ts.filter((t) => t.applicable);
  const segs = BAR.map(([s, c]) => [s, c, app.filter((t) => t.status === s).length]).filter((x) => x[2]);
  return `<div class="sbar${big ? " big" : ""}" title="${segs.map(([s, , n]) => `${s} ${n}`).join(" · ") || "No tasks"}">${segs.map(([, c, n]) => `<span class="seg ${c}" style="flex:${n}"></span>`).join("")}</div>`;
}
const statusLegend = (ts) => { const app = ts.filter((t) => t.applicable), na = ts.length - app.length; return `<div class="legend num">${BAR.map(([s, c]) => `<span><i class="${c}"></i>${s} <b>${app.filter((t) => t.status === s).length}</b></span>`).join("")}${na ? `<span>N/A <b>${na}</b></span>` : ""}</div>`; };
const pctDone = (ts) => { const a = ts.filter((t) => t.applicable).length; return a ? Math.round((ts.filter((t) => t.status === "Completed").length / a) * 100) : null; };
const DOT = { "Blocked": "d-blocked", "In Progress": "d-progress", "Completed": "d-done", "Not Started": "d-todo", "N/A": "d-na" };
const byAreaOrder = (m) => (a, b) => (m.areaOrder.get(a[0]) ?? 99) - (m.areaOrder.get(b[0]) ?? 99) || a[0].localeCompare(b[0]);
const groupBy = (ts, key) => { const g = new Map(); ts.forEach((t) => { const k = key(t); if (!g.has(k)) g.set(k, []); g.get(k).push(t); }); return g; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const flagHtml = (t) => t.errors.length ? `<span class="flag err" title="${esc(t.errors.join(" · "))}">${t.errors.length}</span>` : t.warnings.length ? `<span class="flag warn" title="${esc(t.warnings.join(" · "))}">!</span>` : "";
const tags = (t) => `${t.decision && t.isOpen ? '<span class="tag dec">Decision</span>' : ""}${t.critical && t.isOpen ? '<span class="tag crit">Critical</span>' : ""}`;
const dueCls = (t) => (t.overdue ? "due-over" : t.dueSoon ? "due-soon" : "");
const taskOrder = (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || ((a.due || Infinity) - (b.due || Infinity)) || (a.id < b.id ? -1 : 1);
function daysLeftText(o) {
  if (o.status === "Opened") return "Opened";
  if (o.remaining == null) return "";
  if (o.remaining < 0) return `<span class="red">${-o.remaining} wd past date</span>`;
  return `in ${o.remaining} wd`;
}

// ---------------------------------------------------------------- filters
const SIGNALS = [["overdue", "Overdue"], ["blocked", "Blocked"], ["decision", "Decision required"], ["critical", "Critical for opening"], ["stale", "No update for 10+ wd"], ["issues", "Data issues"]];
const sigMatch = (t, s) => ({ overdue: t.overdue, blocked: t.status === "Blocked", decision: t.decision && t.isOpen, critical: t.critical && t.isOpen, stale: t.stale, issues: t.errors.length || t.warnings.length }[s]);
function filtered(ts) {
  const f = S.f, q = f.q.toLowerCase();
  return ts.filter((t) =>
    (!q || [t.id, t.task, t.desc, t.lu, t.blocker, t.macro, t.sub, t.opening?.location, ...t.owners].join(" ").toLowerCase().includes(q)) &&
    (!f.status.length || f.status.includes(t.status)) && (!f.owner.length || t.owners.some((o) => f.owner.includes(o))) &&
    (!f.area.length || f.area.includes(t.macro)) && (!f.sig.length || f.sig.some((s) => sigMatch(t, s))) &&
    (!S.cell || (t.opening?.code === S.cell.code && t.macro === S.cell.area)));
}
function multi(key, label, options) {
  const sel = S.f[key];
  return `<div class="ms"><button type="button" class="ms-btn" data-ms="${key}" aria-expanded="${S.pop === key}">${label}${sel.length ? ` <b>${sel.length}</b>` : ""} <span class="car">▾</span></button>
    ${S.pop === key ? `<div class="ms-pop" role="group" aria-label="${label}">${options.map(([v, l, n]) => `<label><input type="checkbox" data-msv="${key}" value="${esc(v)}"${sel.includes(v) ? " checked" : ""}><span>${esc(l)}</span><span class="muted num">${n ?? ""}</span></label>`).join("")}
      <div class="ms-foot"><button type="button" class="linkbtn" data-msclear="${key}">Clear</button><button type="button" class="linkbtn" data-msclose>Done</button></div></div>` : ""}</div>`;
}
function filterBar(scope, opts) {
  const count = (fn) => (v) => scope.filter((t) => fn(t, v)).length;
  const areas = [...groupBy(scope, (t) => t.macro).keys()].map((a) => [a]).sort(byAreaOrder(S.model)).map(([a]) => [a, a || "—", count((t, v) => t.macro === v)(a)]);
  const owners = [...new Set(scope.flatMap((t) => t.owners).filter(Boolean))].sort().map((o) => [o, o, count((t, v) => t.owners.includes(v))(o)]);
  const statuses = STATUSES.map((s) => [s, s, count((t, v) => t.status === v)(s)]);
  const sigs = SIGNALS.map(([v, l]) => [v, l, scope.filter((t) => sigMatch(t, v)).length]);
  const chips = [];
  ["area", "owner", "status"].forEach((k) => S.f[k].forEach((v) => chips.push([k, v, v])));
  S.f.sig.forEach((v) => chips.push(["sig", v, SIGNALS.find((s) => s[0] === v)?.[1] || v]));
  if (S.cell) chips.push(["cell", "", `${S.model.openings.find((o) => o.code === S.cell.code)?.location} · ${S.cell.area}`]);
  const n = filtered(scope).length;
  return `<div class="filters">
      <input type="search" id="f-q" placeholder="Search" value="${esc(S.f.q)}" aria-label="Search tasks">
      ${opts.area ? multi("area", "Area", areas) : ""}${multi("owner", "Owner", owners)}${multi("status", "Status", statuses)}${multi("sig", "Show only", sigs)}
      <span class="count num">${n} of ${plural(scope.length, "task")}</span>
    </div>
    ${chips.length || S.f.q ? `<div class="chips">${chips.map(([k, v, l]) => `<button type="button" class="chip" data-rm="${k}" data-v="${esc(v)}">${esc(l)}<span aria-hidden="true">×</span></button>`).join("")}<button type="button" class="linkbtn" id="f-clear">Clear all</button></div>` : ""}`;
}

// ---------------------------------------------------------------- nav
function renderNav() {
  const m = S.model;
  const cur = S.view === "opening" && m ? m.openings.find((o) => o.code === S.opening) : null;
  const q = ($("menu-q")?.value || "").toLowerCase();
  const items = m ? m.openings.filter((o) => !q || `${o.location} ${o.code} ${o.country}`.toLowerCase().includes(q)).sort((a, b) => (a.current || Infinity) - (b.current || Infinity)) : [];
  const group = (g, label) => { const l = items.filter((o) => o.type === g); return l.length ? `<div class="menu-group">${label}</div>${l.map((o) => `<button type="button" class="menu-item" data-open="${esc(o.code)}"><b>${esc(o.location)}</b><span class="num">${o.m.total ? pctDone(o.tasks) + "%" : "no tasks"}</span><span class="num">${fmtDate(o.current)}</span><span class="num">${o.remaining != null ? o.remaining + " wd" : ""}</span></button>`).join("")}` : ""; };
  $("nav").innerHTML = `
    <button type="button" data-view="program" aria-current="${S.view === "program" ? "page" : "false"}">Program</button>
    <div class="menu"><button type="button" id="menu-btn" aria-expanded="${S.menu}" aria-current="${S.view === "opening" ? "page" : "false"}">${cur ? esc(cur.location) : "Openings"} ▾</button>
      ${S.menu ? `<div class="menu-pop"><input type="search" id="menu-q" placeholder="Find an opening" aria-label="Find an opening" value="${esc(q)}">
        <div id="menu-list">${group("New Store", "New stores") + group("New Company", "New companies") || '<p class="hint" style="padding:8px">No opening matches.</p>'}</div></div>` : ""}</div>
    <button type="button" data-view="areas" aria-current="${S.view === "areas" ? "page" : "false"}">Areas</button>`;
  $("nav").querySelectorAll("[data-view]").forEach((b) => b.onclick = () => go(b.dataset.view));
  $("menu-btn").onclick = () => { S.menu = !S.menu; renderNav(); if (S.menu) $("menu-q").focus(); };
  const mq = $("menu-q");
  if (mq) mq.oninput = () => { const pos = mq.selectionStart; renderNav(); const n = $("menu-q"); n.focus(); n.setSelectionRange(pos, pos); };
  $("nav").querySelectorAll("[data-open]").forEach((b) => b.onclick = () => { S.menu = false; openOpening(b.dataset.open); });
}
function go(view) { S.view = view; S.menu = false; S.task = null; resetFilters(); remember(); render(); window.scrollTo(0, 0); }
function openOpening(code) { S.opening = code; go("opening"); }

// ---------------------------------------------------------------- shell
function render() {
  const m = S.model;
  $("demo-banner").hidden = !S.demo;
  const t = S.loadedAt;
  $("file-info").innerHTML = m ? `<b>${esc(S.file)}</b><br>loaded ${fmtDate(dayOnly(t))}, ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "";
  if (m) {
    const e = m.tasks.filter((x) => x.errors.length).length, w = m.tasks.filter((x) => !x.errors.length && x.warnings.length).length;
    const label = e || w ? [e && plural(e, "error"), w && plural(w, "warning")].filter(Boolean).join(" · ") : "Data checks OK";
    $("quality").innerHTML = `<button type="button" class="chip-q ${e ? "err" : w ? "warn" : "ok"}" id="q-btn" title="Data quality checks on the loaded file">${label}</button>`;
    $("q-btn").onclick = () => { if (!e && !w) return; go("areas"); S.f.sig = ["issues"]; render(); };
  }
  renderNav();
  $("main").innerHTML = !m ? "" : S.view === "program" ? programView(m) : S.view === "areas" ? areasView(m) : openingView(m);
  bindMain();
  renderPanel();
}

// ---------------------------------------------------------------- program
function programView(m) {
  const ops = m.openings.slice().sort((a, b) => (a.current || Infinity) - (b.current || Infinity));
  const all = metrics(m.tasks);
  const attention = ops.filter((o) => o.m.blocked || o.m.overdue);
  const next = ops.find((o) => o.status !== "Opened" && o.current && o.current >= TODAY);
  const moved = ops.filter((o) => o.delay > 0).sort((a, b) => b.delay - a.delay);
  const withTasks = ops.filter((o) => o.m.total).length;
  const pct = pctDone(m.tasks);

  const story = `<section class="story">
    <div class="eyebrow">Program · ${fmtDate(TODAY)}</div>
    <h1>${plural(ops.length, "opening")}. ${attention.length ? `${plural(attention.length, "needs", "need")} attention.` : "Nothing blocked or overdue."}</h1>
    <ul class="story-list">
      ${next ? `<li><span>Next opening is <button type="button" data-open="${esc(next.code)}"><b>${esc(next.location)}</b></button> on <b>${fmtDate(next.current)}</b>, in ${next.remaining} working days.</span></li>` : ""}
      ${moved.length ? `<li><span><b>${plural(moved.length, "opening")}</b> moved the date: ${moved.slice(0, 4).map((o) => `<button type="button" data-open="${esc(o.code)}">${esc(o.location)}</button> <span class="red">${signed(o.delay)} wd</span>`).join(", ")}${moved.length > 4 ? "…" : ""}</span></li>` : ""}
      <li><span><b>${plural(m.tasks.length, "task")}</b> tracked on ${withTasks} of ${ops.length} openings, <b>${pct ?? 0}%</b> completed.</span></li>
      <li><span>${[["blocked", all.blocked, "blocked", "red"], ["overdue", all.overdue, "overdue", "red"], ["decision", all.decisions, all.decisions === 1 ? "decision waiting" : "decisions waiting", "amber"]].map(([k, n, l, c]) => n ? `<button type="button" data-sig="${k}"><b class="${c}">${n} ${l}</b></button>` : `0 ${l}`).join(", ")}.</span></li>
    </ul>
  </section>`;

  // runway scale
  const pts = ops.flatMap((o) => [o.start, o.current, o.baseline]).filter(Boolean).concat([TODAY]);
  const min = new Date(Math.min(...pts)); min.setDate(min.getDate() - 10);
  const max = new Date(Math.max(...pts)); max.setDate(max.getDate() + 20);
  const pos = (d) => ((d - min) / (max - min)) * 100;
  const ticks = [];
  for (let d = new Date(min.getFullYear(), min.getMonth() + 1, 1); d < max; d.setMonth(d.getMonth() + 1)) {
    ticks.push(`<span style="left:${pos(d)}%">${MONTHS[d.getMonth()]}${d.getMonth() === 0 || !ticks.length ? " " + String(d.getFullYear()).slice(2) : ""}</span>`);
  }
  const todayX = pos(TODAY);
  const row = (o) => {
    const x = o.m, p = pctDone(o.tasks);
    const start = o.start || o.current;
    let track = "";
    if (o.current) {
      track += `<span class="rw-line" style="left:${pos(start)}%;width:${Math.max(0, pos(o.current) - pos(start))}%"></span>`;
      if (o.start && TODAY > o.start) track += `<span class="rw-elapsed" style="left:${pos(o.start)}%;width:${Math.max(0, pos(TODAY < o.current ? TODAY : o.current) - pos(o.start))}%"></span>`;
      if (o.delay > 0 && o.baseline) track += `<span class="rw-slip" style="left:${pos(o.baseline)}%;width:${pos(o.current) - pos(o.baseline)}%"></span><span class="rw-base" style="left:${pos(o.baseline)}%" title="Baseline ${fmtDate(o.baseline)}"></span>`;
      track += `<span class="rw-dot ${o.status === "Tentative" ? "tent" : ""} ${o.delay > 0 ? "late" : ""}" style="left:${pos(o.current)}%" title="Opening ${fmtDate(o.current)}"></span>`;
    }
    track += `<span class="rw-today" style="left:${todayX}%"></span>`;
    const sig = [x.blocked && `<span class="red">${x.blocked} blocked</span>`, x.overdue && `<span class="red">${x.overdue} overdue</span>`, x.decisions && `<span class="amber">${plural(x.decisions, "decision")}</span>`].filter(Boolean);
    return `<button type="button" class="rw-row" data-open="${esc(o.code)}">
      <span class="rw-name"><b>${esc(o.location)}</b><span>${o.complexity ? cxIcon(o.complexity) : ""}<span class="mono">${esc(o.code)}</span>${o.status === "Tentative" ? " · tentative" : ""}</span></span>
      <span class="rw-track" aria-hidden="true">${track}</span>
      <span class="rw-date num">${o.delay > 0 ? `<s>${fmtDate(o.baseline)}</s>` : ""}<b>${fmtDate(o.current)}</b><span>${daysLeftText(o)}</span></span>
      <span class="rw-prog">${x.total ? donut(p) + `<span class="sig num"><span>${x.done} of ${x.applicable} done</span>${sig.length ? `<span>${sig.join(" · ")}</span>` : '<span class="muted">No blockers</span>'}</span>` : '<span class="muted" style="font-size:14px">No tasks yet</span>'}</span>
    </button>`;
  };
  const axis = `<div class="rw-axis"><span></span><span class="rw-ticks num">${ticks.join("")}<span class="today" style="left:${todayX}%">Today</span></span><span class="hint">Opening date</span><span class="hint">Tasks</span></div>`;
  const grp = (type, label) => { const l = ops.filter((o) => o.type === type); return l.length ? `<h2 class="rw-group">${label} · ${l.length}</h2>${l.map(row).join("")}` : ""; };
  const other = ops.filter((o) => o.type !== "New Store" && o.type !== "New Company");

  return story + `<section>
    <div class="sec-head"><h2>Timeline to opening</h2></div>
    <div class="legend-rw"><span><span class="lg-el"></span>Time elapsed since kick-off</span><span><span class="lg-dot"></span>Opening date</span><span><span class="lg-dot tent"></span>Tentative</span><span><span class="lg-slip"></span><span class="lg-dot late"></span>Moved from baseline</span></div>
    <div class="rw-scroll"><div class="rw">${axis}${grp("New Store", "New stores")}${grp("New Company", "New companies")}${other.length ? `<h2 class="rw-group">Other</h2>${other.map(row).join("")}` : ""}</div></div>
    <p class="hint" style="margin-top:12px;padding:0 12px">All figures are calculated from the loaded Action Log. Working days exclude Saturday and Sunday. Click an opening to see its detail.</p>
  </section>`;
}

// ---------------------------------------------------------------- opening
function attentionList(scope, showOpening) {
  const rank = (t) => (t.status === "Blocked" ? 0 : t.overdue ? 1 : t.decision ? 2 : 3);
  const list = scope.filter((t) => t.isOpen && (t.status === "Blocked" || t.overdue || t.decision || (t.critical && t.dueSoon))).sort((a, b) => rank(a) - rank(b) || ((a.due || 0) - (b.due || 0)));
  const reason = (t) => t.status === "Blocked" ? ["Blocked", "st-blocked"] : t.overdue ? ["Overdue", "st-blocked"] : t.decision ? ["Decision", "st-dec"] : ["Due soon", "st-soon"];
  return `<div class="att-box"><h2>Needs attention · ${list.length}</h2>${list.length ? `<ul class="att">${list.slice(0, 7).map((t) => { const [r, c] = reason(t); return `<li><button type="button" data-task="${esc(t.id)}"><span class="pill ${c}">${r}</span><span class="att-t">${esc(t.task)}<span class="sub">${showOpening ? esc(t.opening?.location || "") + " · " : ""}${esc(t.macro)} · ${esc(t.owners[0] || "no owner")} · due ${fmtDate(t.due, false)}</span></span></button></li>`; }).join("")}</ul>${list.length > 7 ? `<p class="hint" style="padding:6px">and ${list.length - 7} more. Use "Show only" below.</p>` : ""}` : `<p class="hint" style="margin-top:8px">Nothing blocked, overdue or waiting for a decision.</p>`}</div>`;
}

function outline(list, m) {
  const groups = [...groupBy(list, (t) => t.macro).entries()].sort(byAreaOrder(m));
  return `<div class="ol">${groups.map(([area, ts]) => {
    const open = !S.collapsed.includes(area);
    const x = metrics(ts);
    const leads = [...new Set(ts.map((t) => t.owners[0]).filter(Boolean))];
    const sig = [x.blocked && `<span class="red">${x.blocked} blocked</span>`, x.overdue && `<span class="red">${x.overdue} overdue</span>`].filter(Boolean).join(" · ");
    return `<div class="ol-area">
      <button type="button" class="ol-head" data-coll="${esc(area)}" aria-expanded="${open}"><span class="car">▾</span>
        <span class="an">${esc(area || "No area")}<span>${esc(leads.slice(0, 2).join(", "))}${leads.length > 2 ? ` +${leads.length - 2}` : ""}</span></span>
        ${statusBar(ts)}<span class="ac num">${x.done}/${x.applicable} done${sig ? " · " + sig : ""}</span></button>
      ${open ? `<ul class="ol-tasks">${ts.slice().sort(taskOrder).map((t) => {
        const owners = t.owners.filter(Boolean);
        const top = t.notes[0];
        const line = t.isOpen && t.blocker && (t.status === "Blocked" || t.decision)
          ? `<span class="blk">${t.status === "Blocked" ? "Blocked: " : "Decision: "}${esc(t.blocker)}</span>`
          : top ? `<b>${fmtDate(top.date, false)}</b> · ${esc(top.text)}` : "No updates yet";
        return `<li><button type="button" class="ol-task${t.isOpen ? "" : " done"}${S.task === t.id ? " sel" : ""}" data-task="${esc(t.id)}">
          <span class="dot ${DOT[t.status] || "d-blocked"}" title="${esc(t.status)}"></span>
          <span class="tt"><span class="mono">${esc(t.id)}</span>${esc(t.task)}${tags(t)}${flagHtml(t)}</span>
          <span class="ow">${esc(owners[0] || "No owner")}${owners.length > 1 ? ` +${owners.length - 1}` : ""}</span>
          <span class="du num ${dueCls(t)}">${fmtDate(t.due, false)}</span>
          <span class="pr num">${t.progress == null ? "—" : t.progress + "%"}</span>
          <span class="up">${line}${t.stale && !(t.blocker && (t.status === "Blocked" || t.decision)) ? ' · <span class="amber">no update for 10+ wd</span>' : ""}</span>
        </button></li>`;
      }).join("")}</ul>` : ""}
    </div>`;
  }).join("")}</div>`;
}

function card(t) {
  const owners = t.owners.filter(Boolean);
  if (t.status === "Completed") return `<button type="button" class="card done" data-task="${esc(t.id)}">${esc(t.task)}</button>`;
  return `<button type="button" class="card${S.task === t.id ? " sel" : ""}" data-task="${esc(t.id)}">
    <span class="card-top"><span class="mono">${esc(t.id)}</span>${tags(t)}${flagHtml(t)}</span>
    <span class="card-title">${esc(t.task)}</span>
    ${t.blocker && (t.status === "Blocked" || t.decision) ? `<span class="card-blk">${esc(t.blocker)}</span>` : ""}
    <span class="card-meta"><span>${esc(owners[0] || "No owner")}${owners.length > 1 ? ` +${owners.length - 1}` : ""}</span><span class="num ${dueCls(t)}">${fmtDate(t.due, false)}</span></span>
  </button>`;
}
function board(list, m) {
  const cols = ["Not Started", "In Progress", "Blocked", "Completed"];
  const lanes = [...groupBy(list, (t) => t.macro).entries()].sort(byAreaOrder(m));
  const na = list.filter((t) => t.status === "N/A").length;
  return `<div class="board-wrap"><div class="board"><div class="bcol-head"></div>${cols.map((c) => `<div class="bcol-head"><span class="pill ${STATUS_CLASS[c]}">${c}</span> <span class="num muted">${list.filter((t) => t.status === c).length}</span></div>`).join("")}
    ${lanes.map(([area, ts]) => `<div class="lane-head">${esc(area || "No area")}<span class="muted num">${ts.filter((t) => t.status === "Completed").length}/${ts.filter((t) => t.applicable).length} done</span></div>${cols.map((c) => `<div class="bcell">${ts.filter((t) => t.status === c).sort(taskOrder).map(card).join("")}</div>`).join("")}`).join("")}
  </div></div>${na ? `<p class="hint">${plural(na, "N/A task")} not shown on the board.</p>` : ""}`;
}

function openingView(m) {
  const o = m.openings.find((x) => x.code === S.opening) || m.openings[0];
  if (!o) return '<p class="empty">No openings in the loaded file.</p>';
  const scope = o.tasks, x = metrics(scope), pct = pctDone(scope);
  const moves = o.dateHistory.length > 1 ? o.dateHistory.slice(1).map((h, i) => `${fmtDate(o.dateHistory[i].date)} → ${fmtDate(h.date)} on ${fmtDate(h.decided)}${h.reason ? ` (${esc(h.reason)})` : ""}`).join("; ") : "";
  const sigLine = [x.blocked && `<b class="red">${x.blocked} blocked</b>`, x.overdue && `<b class="red">${x.overdue} overdue</b>`, x.decisions && `<b class="amber">${x.decisions === 1 ? "1 decision" : x.decisions + " decisions"} waiting</b>`].filter(Boolean);

  const id = `<section class="idcard">
    <div class="id-main">
      <div>
        <div class="eyebrow">${icon(o.type === "New Company" ? "company" : "store")}${esc(o.type)} · <span class="mono">${esc(o.code)}</span></div>
        <h1>${esc(o.location)}</h1>
      </div>
      <div class="idrow">
        ${o.country ? `<span title="Country">${icon("pin")}${esc(o.country)}</span>` : ""}
        ${o.complexity ? `<span title="Complexity (input in OPENINGS)">${cxIcon(o.complexity)}${esc(o.complexity)} complexity</span>` : ""}
        <span title="Opening date">${icon("cal")}${o.delay > 0 ? `<s class="num">${fmtDate(o.baseline)}</s>` : ""}<b class="num">${fmtDate(o.current)}</b>${o.delay > 0 ? `<b class="red num">${signed(o.delay)} wd</b>` : ""}</span>
        <span title="Working days to opening (Mon–Fri)">${icon("clock")}${o.status === "Opened" ? "Opened" : o.remaining == null ? "—" : o.remaining < 0 ? `<span class="red">${-o.remaining} wd past date</span>` : `${o.remaining} wd to opening`}</span>
        ${o.status ? `<span title="Opening status">${icon("flag")}${esc(o.status)}</span>` : ""}
      </div>
      ${scope.length ? `<div style="display:grid;gap:10px">
        <div class="headline"><b class="num">${pct}%</b> complete, ${x.done} of ${x.applicable} tasks.${sigLine.length ? " " + sigLine.join(", ") + "." : " No blockers."}</div>
        ${statusBar(scope, true)}${statusLegend(scope)}</div>` : '<p class="hint">No tasks for this opening in the Action Log yet.</p>'}
      ${moves ? `<p class="hint">Opening date moved: ${moves}.</p>` : ""}
    </div>
    ${attentionList(scope, false)}
  </section>`;

  if (!scope.length) return id;
  const list = filtered(scope);
  const areasInList = [...new Set(list.map((t) => t.macro))];
  const tasks = `<section style="display:grid;gap:14px">
    <div class="sec-head" style="margin:0"><h2>By area</h2><span class="spacer"></span>
      ${S.mode === "outline" ? `<button type="button" class="linkbtn" id="coll-all">${areasInList.every((a) => S.collapsed.includes(a)) ? "Expand all" : "Collapse all"}</button>` : ""}
      <div class="seg-ctl" role="group" aria-label="Task view"><button type="button" data-mode="outline" aria-pressed="${S.mode === "outline"}">Outline</button><button type="button" data-mode="board" aria-pressed="${S.mode === "board"}">Board</button></div>
    </div>
    ${filterBar(scope, { area: true })}
    ${list.length ? (S.mode === "board" ? board(list, m) : outline(list, m)) : '<p class="empty">No tasks match these filters.</p>'}
  </section>`;
  return id + tasks;
}

// ---------------------------------------------------------------- areas (cross-opening)
function areasView(m) {
  const allAreas = [...groupBy(m.tasks, (t) => t.macro).keys()].map((a) => [a]).sort(byAreaOrder(m)).map(([a]) => a);
  const cols = S.f.area.length ? allAreas.filter((a) => S.f.area.includes(a)) : allAreas;
  const ops = m.openings.filter((o) => o.tasks.length).sort((a, b) => (a.current || Infinity) - (b.current || Infinity));
  const cell = (o, a) => {
    const ts = o.tasks.filter((t) => t.macro === a);
    if (!ts.length) return `<td><span class="mx-cell none">·</span></td>`;
    const x = metrics(ts), p = pctDone(ts) ?? 0;
    const on = S.cell && S.cell.code === o.code && S.cell.area === a;
    return `<td><button type="button" class="mx-cell${on ? " on" : ""}" data-cell="${esc(o.code)}|${esc(a)}" style="background:color-mix(in srgb, var(--green) ${Math.round(8 + p * 0.5)}%, var(--surface))" title="${esc(o.location)} · ${esc(a)}: ${x.done} of ${x.applicable} completed${x.blocked ? `, ${x.blocked} blocked` : ""}${x.overdue ? `, ${x.overdue} overdue` : ""}"><span class="num">${x.done}/${x.applicable}</span>${x.blocked || x.overdue ? "<i></i>" : ""}</button></td>`;
  };
  const scope = m.tasks;
  const list = filtered(scope);
  const byOpening = [...groupBy(list, (t) => t.opening?.code || "?").entries()].sort((a, b) => ((m.openings.find((o) => o.code === a[0])?.current) || Infinity) - ((m.openings.find((o) => o.code === b[0])?.current) || Infinity));
  const rows = byOpening.map(([code, ts]) => {
    const o = m.openings.find((x) => x.code === code);
    return `<tr class="grp"><td colspan="8">${esc(o?.location || "Unknown opening")} <span class="muted" style="font-weight:400">· ${fmtDate(o?.current)} · ${o ? daysLeftText(o) : ""} · ${plural(ts.length, "task")}</span></td></tr>` +
      ts.slice().sort((a, b) => byAreaOrder(m)([a.macro], [b.macro]) || taskOrder(a, b)).map((t) => {
        const owners = t.owners.filter(Boolean), top = t.notes[0];
        return `<tr class="row${t.isOpen ? "" : " done"}${S.task === t.id ? " sel" : ""}" data-task="${esc(t.id)}" tabindex="0">
          <td class="nowrap"><span class="mono">${esc(t.id)}</span>${flagHtml(t)}</td>
          <td>${esc(t.macro)}${t.sub ? `<div class="sub">${esc(t.sub)}</div>` : ""}</td>
          <td><span class="tt">${esc(t.task)}</span>${tags(t)}${t.isOpen && t.blocker ? `<div class="sub ${t.status === "Blocked" ? "red" : ""}">${esc(t.blocker)}</div>` : ""}</td>
          <td class="nowrap">${esc(owners[0] || "—")}${owners.length > 1 ? `<div class="sub">${esc(owners.slice(1).join(", "))}</div>` : ""}</td>
          <td class="nowrap num ${dueCls(t)}">${fmtDate(t.due, false)}</td>
          <td><span class="pill ${STATUS_CLASS[t.status] || "st-bad"}">${esc(t.status || "—")}</span></td>
          <td class="num">${t.progress == null ? "—" : t.progress + "%"}</td>
          <td style="max-width:360px">${top ? `${esc(top.text)}<div class="sub">${fmtDate(top.date, false)}</div>` : '<span class="muted">—</span>'}</td>
        </tr>`;
      }).join("");
  }).join("");

  return `<section class="story" style="max-width:none">
      <div class="eyebrow">Across openings</div>
      <h1>${S.f.area.length ? S.f.area.map(esc).join(", ") : "All areas"}</h1>
      <p class="hint" style="font-size:15px">Pick one or more areas to compare them on every opening. Click a cell to see its tasks.</p>
      <div class="area-chips"><button type="button" class="achip" data-achip="" aria-pressed="${!S.f.area.length}">All areas</button>${allAreas.map((a) => `<button type="button" class="achip" data-achip="${esc(a)}" aria-pressed="${S.f.area.includes(a)}">${esc(a || "No area")}</button>`).join("")}</div>
    </section>
    <section>
      <div class="sec-head"><h2>Completed tasks per opening and area</h2><span class="hint">Cell = completed / applicable · greener = more complete · red dot = blocked or overdue</span></div>
      <div class="mx-wrap"><table class="mx"><thead><tr><th></th>${cols.map((a) => `<th>${esc(a)}</th>`).join("")}</tr></thead>
        <tbody>${ops.map((o) => `<tr><th class="rowh" scope="row">${esc(o.location)}</th>${cols.map((a) => cell(o, a)).join("")}</tr>`).join("")}</tbody></table></div>
    </section>
    <section style="display:grid;gap:14px">
      <div class="sec-head" style="margin:0"><h2>Tasks by opening</h2></div>
      ${filterBar(scope, { area: false })}
      ${list.length ? `<div class="xt-wrap"><table class="xt"><thead><tr><th>ID</th><th>Area</th><th>Task</th><th>Owner</th><th>Due</th><th>Status</th><th>Progress</th><th>Latest update</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">No tasks match these filters.</p>'}
    </section>`;
}

// ---------------------------------------------------------------- panel
function renderPanel() {
  const t = S.task && S.model ? S.model.tasks.find((x) => x.id === S.task) : null;
  $("panel").hidden = $("scrim").hidden = !t;
  if (!t) return;
  const owners = t.owners.filter(Boolean);
  const checks = (t.errors.length ? `<div class="box errbox"><b>Data errors</b><ul>${t.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "") +
    (t.warnings.length ? `<div class="box warnbox"><b>Data warnings</b><ul>${t.warnings.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "");
  $("panel").innerHTML = `
    <div class="panel-head">
      <div class="panel-top"><span class="mono muted">${esc(t.id)} · ${esc(t.opening?.location || t.location)} · ${esc(t.macro)}${t.sub ? " · " + esc(t.sub) : ""}</span><button type="button" class="x" id="p-close" aria-label="Close">×</button></div>
      <h3>${esc(t.task)}</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="pill ${STATUS_CLASS[t.status] || "st-bad"}">${esc(t.status || "—")}</span>${tags(t)}</div>
    </div>
    <div class="panel-body">
      ${checks}
      ${t.blocker ? `<div class="box"><div class="eyebrow">${t.status === "Blocked" ? "Blocker" : "Decision needed"}</div><div style="margin-top:4px">${esc(t.blocker)}</div></div>` : ""}
      <dl class="kv">
        <dt>Owner</dt><dd>${esc(owners[0] || "—")}${owners.length > 1 ? `<div class="sub">with ${esc(owners.slice(1).join(", "))}</div>` : ""}</dd>
        <dt>Due</dt><dd class="num ${t.overdue ? "due-over" : ""}">${fmtDate(t.due)}${t.slip ? `<div class="sub">baseline ${fmtDate(t.baselineDue)}, moved ${signed(t.slip)} wd</div>` : ""}</dd>
        <dt>Progress</dt><dd>${t.progress == null ? "—" : `<div class="prog"><div class="track"><span class="fill" style="width:${t.progress}%"></span></div><span class="num">${t.progress}%</span></div>`}</dd>
        <dt>Opened</dt><dd class="num">${fmtDate(t.openDate)}${t.openDate && t.isOpen ? ` <span class="muted">· open for ${wdBetween(t.openDate, TODAY)} wd</span>` : ""}</dd>
        ${t.desc ? `<dt>Description</dt><dd>${esc(t.desc)}</dd>` : ""}
      </dl>
      <section><h2>Updates</h2>
        ${t.notes.length ? `<ol class="tl">${t.notes.map((n) => `<li><span class="d num">${fmtDate(n.date)}${n.type === "Decision" ? '<span class="tag dec">Decision</span>' : ""}</span><span class="t">${esc(n.text)}</span>${n.source === "latest" ? '<span class="s">From Latest Update, not yet in TASK_HISTORY</span>' : ""}</li>`).join("")}</ol>` : '<p class="hint" style="margin-top:8px">No updates recorded yet.</p>'}
      </section>
      <p class="hint">Read-only view. To change this task, edit the Action Log file and load it again.</p>
    </div>`;
  $("p-close").onclick = closePanel;
}
function closePanel() { const id = S.task; S.task = null; renderPanel(); document.querySelectorAll(".sel[data-task]").forEach((r) => r.classList.remove("sel")); const r = id && document.querySelector(`[data-task="${CSS.escape(id)}"]`); if (r) r.focus(); }

// ---------------------------------------------------------------- events
function bindMain() {
  const main = $("main");
  main.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openOpening(b.dataset.open));
  main.querySelectorAll("[data-sig]").forEach((b) => b.onclick = () => { go("areas"); S.f.sig = [b.dataset.sig]; render(); });
  main.querySelectorAll("[data-task]").forEach((r) => {
    const open = () => { S.task = r.dataset.task; main.querySelectorAll(".sel[data-task]").forEach((x) => x.classList.remove("sel")); r.classList.add("sel"); renderPanel(); $("p-close")?.focus(); };
    r.onclick = open; if (r.tagName === "TR") r.onkeydown = (e) => { if (e.key === "Enter") open(); };
  });
  main.querySelectorAll("[data-coll]").forEach((b) => b.onclick = () => { const a = b.dataset.coll; S.collapsed = S.collapsed.includes(a) ? S.collapsed.filter((x) => x !== a) : [...S.collapsed, a]; render(); });
  const ca = $("coll-all");
  if (ca) ca.onclick = () => { const areas = [...main.querySelectorAll("[data-coll]")].map((b) => b.dataset.coll); S.collapsed = areas.every((a) => S.collapsed.includes(a)) ? [] : areas; render(); };
  main.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => { S.mode = b.dataset.mode; remember(); render(); });
  main.querySelectorAll("[data-achip]").forEach((b) => b.onclick = () => { const a = b.dataset.achip; S.cell = null; S.f.area = a === "" ? [] : S.f.area.includes(a) ? S.f.area.filter((x) => x !== a) : [...S.f.area, a]; render(); });
  main.querySelectorAll("[data-cell]").forEach((b) => b.onclick = () => { const [code, area] = b.dataset.cell.split("|"); S.cell = S.cell && S.cell.code === code && S.cell.area === area ? null : { code, area }; render(); });
  main.querySelectorAll("[data-ms]").forEach((b) => b.onclick = () => { S.pop = S.pop === b.dataset.ms ? null : b.dataset.ms; render(); });
  main.querySelectorAll("[data-msv]").forEach((c) => c.onchange = () => { const k = c.dataset.msv; S.f[k] = c.checked ? [...S.f[k], c.value] : S.f[k].filter((v) => v !== c.value); render(); });
  main.querySelectorAll("[data-msclear]").forEach((b) => b.onclick = () => { S.f[b.dataset.msclear] = []; render(); });
  main.querySelectorAll("[data-msclose]").forEach((b) => b.onclick = () => { S.pop = null; render(); });
  main.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { const k = b.dataset.rm; if (k === "cell") S.cell = null; else S.f[k] = S.f[k].filter((v) => v !== b.dataset.v); render(); });
  const fc = $("f-clear"); if (fc) fc.onclick = () => { resetFilters(); render(); };
  const q = $("f-q");
  if (q) q.oninput = () => { S.f.q = q.value; const pos = q.selectionStart; render(); const n = $("f-q"); n.focus(); n.setSelectionRange(pos, pos); };
}
document.addEventListener("click", (e) => {
  if (S.pop && !e.target.closest(".ms")) { S.pop = null; render(); }
  if (S.menu && !e.target.closest(".menu")) { S.menu = false; renderNav(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (S.task) closePanel(); else if (S.pop) { S.pop = null; render(); } else if (S.menu) { S.menu = false; renderNav(); }
});
$("scrim").onclick = closePanel;

function readFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => load(new Uint8Array(r.result), file.name, false);
  r.onerror = () => { $("alert-text").textContent = "The file could not be opened. Export it again as .xlsx and retry."; $("alert").hidden = false; };
  r.readAsArrayBuffer(file);
}
$("file-input").onchange = (e) => { readFile(e.target.files[0]); e.target.value = ""; };
document.addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("drop"); });
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("drop"); });
document.addEventListener("drop", (e) => { e.preventDefault(); document.body.classList.remove("drop"); readFile(e.dataTransfer.files[0]); });

// open on the demo workbook so the page starts in a working state
(function start() {
  const bin = atob(DEMO_B64); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  load(buf, "Demo · GG_Opening_Action_Log.xlsx", true);
})();
</script>
