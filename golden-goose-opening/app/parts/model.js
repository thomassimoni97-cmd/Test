// ---------------------------------------------------------------- utils
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const TODAY = dayOnly(new Date());

function toDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? undefined : dayOnly(v);
  if (typeof v === "number") {
    const u = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return undefined; // present but not a date
}
function toDateTime(v) {
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000)).getTime();
  const d = toDate(v); return d ? d.getTime() : 0;
}
const fmtDate = (d, withYear = true) => d ? `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}${withYear || d.getFullYear() !== TODAY.getFullYear() ? " " + d.getFullYear() : ""}` : "—";
const toBool = (v) => v === true || /^(true|vero|yes|1|x)$/i.test(String(v ?? "").trim());
const str = (v) => (v == null ? "" : String(v).trim());

// working days, Monday to Friday, both ends included (same as NETWORKDAYS)
function networkdays(a, b) {
  if (!a || !b) return null;
  if (a > b) return -networkdays(b, a);
  let n = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
// signed working days from a to b, start day excluded
const wdBetween = (a, b) => (!a || !b ? null : a <= b ? networkdays(a, b) - 1 : -(networkdays(b, a) - 1));
const signed = (n) => (n == null ? "—" : n > 0 ? `+${n}` : String(n));

// ---------------------------------------------------------------- model
const STATUSES = ["Not Started", "In Progress", "Blocked", "Completed", "N/A"];
const STATUS_ORDER = { "Blocked": 0, "In Progress": 1, "Not Started": 2, "Completed": 3, "N/A": 4 };
const STATUS_CLASS = { "Blocked": "st-blocked", "In Progress": "st-progress", "Completed": "st-done", "Not Started": "st-todo", "N/A": "st-na" };
const PROGRESS = [0, 25, 50, 75, 100];
const REQUIRED = {
  ACTION_LOG: ["Task ID", "Opening Type", "Location", "Macro Area", "Task", "Status", "Progress %", "Owner 1 (Lead)", "Due Date"],
  OPENINGS: ["Opening Code", "Opening Type", "Location"],
};

function readSheet(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => str(h));
  const out = rows.slice(1).map((r) => { const o = {}; headers.forEach((h, i) => { if (h) o[h] = r[i]; }); return o; })
    .filter((o) => Object.values(o).some((v) => v != null && v !== ""));
  return { headers, rows: out };
}

function buildModel(wb) {
  const missing = [];
  const sheets = {};
  for (const [name, cols] of Object.entries(REQUIRED)) {
    const s = readSheet(wb, name);
    if (!s) { missing.push(`sheet ${name}`); continue; }
    cols.filter((c) => !s.headers.includes(c)).forEach((c) => missing.push(`${name} › ${c}`));
    sheets[name] = s;
  }
  if (missing.length) throw new Error("This file does not match the Action Log template. Missing: " + missing.join(", ") + ".");
  const hist = readSheet(wb, "TASK_HISTORY")?.rows || [];
  const odh = readSheet(wb, "OPENING_DATE_HISTORY")?.rows || [];
  const areasRows = readSheet(wb, "AREAS")?.rows || null;
  const ownersRows = readSheet(wb, "OWNERS")?.rows || null;

  const areaOrder = new Map();
  const areaPairs = areasRows ? new Set(areasRows.map((r) => `${str(r["Macro Area"])}|${str(r["Sub Area"])}`)) : null;
  const macros = areasRows ? new Set(areasRows.map((r) => str(r["Macro Area"]))) : null;
  (areasRows || []).forEach((r, i) => { const m = str(r["Macro Area"]); if (!areaOrder.has(m)) areaOrder.set(m, i); });
  const owners = ownersRows ? new Set(ownersRows.map((r) => str(r["Owner Name"])).filter(Boolean)) : null;

  // openings + opening date history
  const openings = sheets.OPENINGS.rows.filter((r) => str(r["Opening Code"])).map((r) => {
    const code = str(r["Opening Code"]);
    const hist = odh.filter((h) => str(h["Opening Code"]) === code)
      .map((h, i) => ({ type: str(h["Entry Type"]), decided: toDate(h["Decided On"]) || null, date: toDate(h["New Opening Date"]) || null, reason: str(h["Reason"]), i }))
      .filter((h) => h.date)
      .sort((a, b) => (a.decided - b.decided) || (a.i - b.i));
    const base = hist.find((h) => h.type === "Baseline") || hist[0] || null;
    const cur = hist[hist.length - 1] || null;
    const o = {
      code, type: str(r["Opening Type"]), location: str(r["Location"]), country: str(r["Country"]),
      complexity: str(r["Complexity"]), start: toDate(r["Project Start Date"]) || null, status: str(r["Opening Status"]),
      baseline: base ? base.date : toDate(r["Baseline Opening Date"]) || null,
      current: cur ? cur.date : toDate(r["Current Opening Date"]) || null,
      postponements: hist.filter((h) => h.type === "Change").length, dateHistory: hist, tasks: [],
    };
    o.delay = wdBetween(o.baseline, o.current);
    o.elapsed = o.start ? (o.status === "Opened" ? networkdays(o.start, o.current) : networkdays(o.start, TODAY)) : null;
    o.remaining = o.current ? (o.status === "Opened" ? 0 : wdBetween(TODAY, o.current)) : null;
    return o;
  });
  const byPair = new Map(openings.map((o) => [`${o.type}|${o.location}`, o]));
  const byCode = new Map(openings.map((o) => [o.code, o]));

  // notes per task
  const notesBy = new Map();
  hist.forEach((h) => {
    const id = str(h["Task ID"]); const text = str(h["Note"]);
    if (!id || !text || /^rilevato nel foglio$/i.test(text)) return;
    if (!notesBy.has(id)) notesBy.set(id, []);
    notesBy.get(id).push({ date: toDate(h["Event Date"]) || null, rec: toDateTime(h["Recorded At"]), text, type: str(h["Note Type"]) || "Update", source: str(h["Source"]) });
  });

  const idCount = new Map();
  sheets.ACTION_LOG.rows.forEach((r) => { const id = str(r["Task ID"]); if (id) idCount.set(id, (idCount.get(id) || 0) + 1); });

  const tasks = sheets.ACTION_LOG.rows.map((r) => {
    const raw = { open: r["Task Open Date"], due: r["Due Date"], lud: r["Latest Update Date"] };
    let progress = r["Progress %"];
    if (typeof progress === "number" && progress > 0 && progress <= 1) progress = Math.round(progress * 100);
    const t = {
      id: str(r["Task ID"]), type: str(r["Opening Type"]), location: str(r["Location"]),
      macro: str(r["Macro Area"]), sub: str(r["Sub Area"]), task: str(r["Task"]), desc: str(r["Description"]),
      status: str(r["Status"]), progress: progress === "" || progress == null ? null : Number(progress),
      owners: [str(r["Owner 1 (Lead)"]), str(r["Owner 2"]), str(r["Owner 3"])],
      openDate: toDate(raw.open), due: toDate(raw.due), lu: str(r["Latest Update"]), luDate: toDate(raw.lud),
      blocker: str(r["Blocker / Decision"]), decision: toBool(r["Decision Required"]), critical: toBool(r["Critical for Opening"]),
      baselineDue: toDate(r["Baseline Due Date"]) || null,
    };
    t.opening = byPair.get(`${t.type}|${t.location}`) || null;
    const prefix = t.id.replace(/-\d{3}$/, "");
    const prefOpening = byCode.get(prefix) || null;
    if (!t.opening && prefOpening) t.opening = prefOpening;
    if (t.opening) t.opening.tasks.push(t);
    t.isOpen = t.status !== "Completed" && t.status !== "N/A";
    t.applicable = t.status !== "N/A";

    // timeline: TASK_HISTORY notes + Latest Update if not yet recorded there
    const notes = (notesBy.get(t.id) || []).slice();
    if (t.lu && !notes.some((n) => n.text === t.lu)) notes.push({ date: t.luDate || null, rec: Infinity, text: t.lu, type: "Update", source: "latest" });
    notes.sort((a, b) => ((b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0)) || (b.rec - a.rec));
    t.notes = notes;
    t.lastUpdate = notes.find((n) => n.date)?.date || null;

    // derived signals (project, not data errors)
    t.overdue = t.isOpen && t.due && t.due < TODAY;
    t.dueSoon = t.isOpen && t.due && !t.overdue && wdBetween(TODAY, t.due) <= 5;
    t.stale = t.isOpen && (!t.lastUpdate || wdBetween(t.lastUpdate, TODAY) > 10);
    t.slip = t.baselineDue && t.due ? wdBetween(t.baselineDue, t.due) : null;

    // data quality checks
    const E = [], W = [];
    if (!t.id) E.push("Task ID missing");
    else {
      if (idCount.get(t.id) > 1) E.push("Duplicate Task ID");
      if (!/^[A-Z]+(-[A-Z]+)*-\d{3}$/.test(t.id)) E.push("Task ID format (expected CODE-001)");
    }
    const mand = [["Opening Type", t.type], ["Location", t.location], ["Macro Area", t.macro], ["Task", t.task], ["Status", t.status], ["Progress %", t.progress]];
    const mMiss = mand.filter(([, v]) => v === "" || v == null).map(([k]) => k);
    if (mMiss.length) E.push("Missing: " + mMiss.join(", "));
    if (t.type && t.location && !byPair.has(`${t.type}|${t.location}`)) E.push("Opening Type + Location not in OPENINGS");
    else if (t.id && t.opening && prefix !== t.opening.code) E.push(`ID prefix ≠ opening code (${t.opening.code})`);
    if (t.macro && macros && (t.sub ? !areaPairs.has(`${t.macro}|${t.sub}`) : !macros.has(t.macro))) E.push("Macro / Sub Area not in AREAS");
    if (t.status && !STATUSES.includes(t.status)) E.push(`Invalid status "${t.status}"`);
    if (t.progress != null && !PROGRESS.includes(t.progress)) E.push("Progress must be 0, 25, 50, 75 or 100");
    if (owners) t.owners.filter((o) => o && !owners.has(o)).forEach((o) => E.push(`Owner "${o}" not in OWNERS`));
    if ([raw.open, raw.due, raw.lud].some((v) => toDate(v) === undefined)) E.push("Invalid date");
    if (!t.owners[0] && (t.owners[1] || t.owners[2])) E.push("Owner 2/3 without Owner 1");
    if (t.isOpen && !t.owners[0]) W.push("Owner 1 missing");
    if (t.isOpen && !t.due) W.push("Due Date missing");
    if (t.status === "Completed" && t.progress !== 100) W.push("Completed with progress below 100%");
    if (t.progress === 100 && t.status !== "Completed") W.push("100% but not Completed");
    if ((t.status === "Blocked" || t.decision) && !t.blocker) W.push("Blocker / Decision is empty");
    if (t.status === "N/A" && !t.lu) W.push("N/A without a reason");
    if (t.lu && !t.luDate) W.push("Latest Update without date");
    if ((t.openDate && t.openDate > TODAY) || (t.luDate && t.luDate > TODAY)) W.push("Date in the future");
    if (t.openDate && t.due && t.openDate > t.due) W.push("Open Date after Due Date");
    if (t.critical && t.isOpen && t.due && t.opening?.current && t.due > t.opening.current) W.push("Critical task due after opening date");
    const os = t.owners.filter(Boolean); if (new Set(os).size !== os.length) W.push("Same owner repeated");
    t.errors = E; t.warnings = W;
    return t;
  });

  openings.forEach((o) => { o.m = metrics(o.tasks); });
  return { openings, tasks, areaOrder };
}

function metrics(ts) {
  const app = ts.filter((t) => t.applicable);
  return {
    total: ts.length, applicable: app.length, done: ts.filter((t) => t.status === "Completed").length,
    open: ts.filter((t) => t.isOpen).length, overdue: ts.filter((t) => t.overdue).length,
    blocked: ts.filter((t) => t.status === "Blocked").length, decisions: ts.filter((t) => t.decision && t.isOpen).length,
    critical: ts.filter((t) => t.critical && t.isOpen).length,
    errors: ts.filter((t) => t.errors.length).length, warnings: ts.filter((t) => !t.errors.length && t.warnings.length).length,
  };
}

