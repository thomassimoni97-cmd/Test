// ============================================================
// Pagina partecipante
// ============================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SESSION_ID } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Dati demo: 5 domande ----------
// type: "scale" (1-5) oppure "choice" (A/B/C/D)
const QUESTIONS = [
  {
    n: 1, value: "Trasparenza",
    text: "Quanto ti riconosci nel valore della trasparenza?",
    type: "scale", low: "Per niente", high: "Moltissimo",
  },
  {
    n: 2, value: "Collaborazione",
    text: "Quando lavori con altre persone, quale comportamento ti rappresenta di più?",
    type: "choice",
    options: {
      A: "Condivido subito idee e informazioni",
      B: "Prima ascolto e poi intervengo",
      C: "Preferisco lavorare in autonomia",
      D: "Cerco soprattutto di coordinare il gruppo",
    },
  },
  {
    n: 3, value: "Coraggio",
    text: "Quanto sei disposto a prendere una posizione anche quando è scomoda?",
    type: "scale", low: "Per niente", high: "Moltissimo",
  },
  {
    n: 4, value: "Innovazione",
    text: "Di fronte a un problema nuovo, cosa fai più spontaneamente?",
    type: "choice",
    options: {
      A: "Provo rapidamente una nuova soluzione",
      B: "Analizzo bene il problema prima di agire",
      C: "Cerco il confronto con altre persone",
      D: "Parto da qualcosa che ha già funzionato",
    },
  },
  {
    n: 5, value: "Responsabilità",
    text: "Se qualcosa non va come previsto nel tuo progetto, qual è la tua prima reazione?",
    type: "choice",
    options: {
      A: "Mi assumo subito la responsabilità",
      B: "Cerco di capire cosa è successo",
      C: "Coinvolgo il gruppo per trovare una soluzione",
      D: "Cerco subito un'alternativa operativa",
    },
  },
];

// ---------- Archetipi ----------
const ARCHETYPES = {
  pioneer: {
    name: "Il Pioniere",
    description: "Ti muovono iniziativa, coraggio e sperimentazione. Preferisci provare, imparare e correggere piuttosto che aspettare che tutto sia perfetto.",
  },
  connector: {
    name: "Il Connettore",
    description: "Credi nel confronto e nella forza delle relazioni. Tendi a coinvolgere le persone, condividere informazioni e costruire soluzioni insieme agli altri.",
  },
  reflective: {
    name: "Il Riflessivo",
    description: "Ti piace comprendere prima di agire. Osservi, analizzi e cerchi coerenza nelle decisioni, privilegiando consapevolezza e solidità.",
  },
};

// ============================================================
// Logica di scoring (unica funzione, facile da modificare).
// Ogni risposta assegna punti a pioneer / connector / reflective.
// Vince chi ha piu' punti. In caso di parita': pioneer > connector > reflective.
// (Non ha valore psicometrico: serve solo a dimostrare il funzionamento.)
// ============================================================
function computeArchetype(answers) {
  const score = { pioneer: 0, connector: 0, reflective: 0 };

  // Q1 Trasparenza (scala 1-5): apertura -> connector, chiusura -> reflective
  const q1 = Number(answers[1]) || 0;
  if (q1 >= 4) score.connector += 2;
  else if (q1 <= 2) score.reflective += 2;
  else { score.connector += 1; score.reflective += 1; }

  // Q2 Collaborazione
  const q2 = { A: "connector", B: "reflective", C: "pioneer", D: "connector" }[answers[2]];
  if (q2) score[q2] += 2;

  // Q3 Coraggio (scala 1-5): alto -> pioneer, basso -> reflective
  const q3 = Number(answers[3]) || 0;
  if (q3 >= 4) score.pioneer += 2;
  else if (q3 <= 2) score.reflective += 2;
  else score.pioneer += 1;

  // Q4 Innovazione
  const q4 = { A: "pioneer", B: "reflective", C: "connector", D: "reflective" }[answers[4]];
  if (q4) score[q4] += 2;

  // Q5 Responsabilita'
  const q5 = { A: "pioneer", B: "reflective", C: "connector", D: "pioneer" }[answers[5]];
  if (q5) score[q5] += 2;

  // Vincitore con priorita' in caso di parita'.
  const order = ["pioneer", "connector", "reflective"];
  let winner = order[0];
  for (const k of order) {
    if (score[k] > score[winner]) winner = k;
  }
  return winner;
}

// ============================================================
// Stato locale (localStorage): participant_id + risposte
// ============================================================
function getParticipantId() {
  let id = localStorage.getItem("participant_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("participant_id", id);
  }
  return id;
}
const participantId = getParticipantId();

function loadAnswers() {
  try { return JSON.parse(localStorage.getItem("answers")) || {}; }
  catch { return {}; }
}
function saveAnswers(a) {
  localStorage.setItem("answers", JSON.stringify(a));
}

let answers = loadAnswers();     // { 1: "4", 2: "A", ... }
let globalStep = 0;              // sincronizzato da Supabase
let currentView = "welcome";    // "welcome" | 1..5 | "result"

// ============================================================
// DOM
// ============================================================
const nav = document.getElementById("nav");
const views = {
  welcome: document.getElementById("view-welcome"),
  question: document.getElementById("view-question"),
  result: document.getElementById("view-result"),
};

// ---------- Navigazione (stato: done / available / locked) ----------
function renderNav() {
  const started = globalStep >= 1 || allAnswered();
  nav.hidden = !started;
  if (!started) return;

  nav.innerHTML = "";
  for (const q of QUESTIONS) {
    const b = document.createElement("button");
    b.textContent = q.n;
    const answered = answers[q.n] !== undefined;
    const unlocked = q.n <= globalStep;

    if (answered) b.classList.add("done");
    else if (unlocked) b.classList.add("available");
    else b.classList.add("locked");

    if (currentView === q.n) b.classList.add("current");

    // Cliccabile se sbloccata o gia' risposta. Bloccata = non cliccabile.
    if (unlocked || answered) {
      b.addEventListener("click", () => showQuestion(q.n));
    } else {
      b.disabled = true;
    }
    nav.appendChild(b);
  }
}

// ---------- Mostra una schermata ----------
function show(view) {
  currentView = view;
  views.welcome.hidden = view !== "welcome";
  views.question.hidden = typeof view !== "number";
  views.result.hidden = view !== "result";
  renderNav();
}

// ---------- Render domanda ----------
function showQuestion(n) {
  const q = QUESTIONS.find((x) => x.n === n);
  if (!q) return;

  document.getElementById("q-value").textContent = "Valore: " + q.value;
  document.getElementById("q-text").textContent = q.text;
  const container = document.getElementById("q-answer");
  container.innerHTML = "";

  const current = answers[n];

  if (q.type === "scale") {
    const scale = document.createElement("div");
    scale.className = "scale";
    for (let v = 1; v <= 5; v++) {
      const btn = document.createElement("button");
      btn.className = "option";
      btn.textContent = v;
      if (String(current) === String(v)) btn.classList.add("selected");
      btn.addEventListener("click", () => setAnswer(n, String(v)));
      scale.appendChild(btn);
    }
    container.appendChild(scale);

    const legend = document.createElement("div");
    legend.className = "scale-legend";
    legend.innerHTML = `<span>1 = ${q.low}</span><span>5 = ${q.high}</span>`;
    container.appendChild(legend);
  } else {
    const opts = document.createElement("div");
    opts.className = "options";
    for (const key of Object.keys(q.options)) {
      const btn = document.createElement("button");
      btn.className = "option";
      btn.textContent = `${key}. ${q.options[key]}`;
      if (current === key) btn.classList.add("selected");
      btn.addEventListener("click", () => setAnswer(n, key));
      opts.appendChild(btn);
    }
    container.appendChild(opts);
  }

  document.getElementById("q-feedback").hidden = current === undefined;
  updateNextButton(n);
  show(n);
}

function updateNextButton(n) {
  const btn = document.getElementById("q-next");
  // Suggerisce la prossima domanda sbloccata e non ancora risposta.
  const next = QUESTIONS.find((q) => q.n <= globalStep && answers[q.n] === undefined && q.n !== n);
  if (answers[n] !== undefined && next) {
    btn.hidden = false;
    btn.textContent = "Vai alla domanda " + next.n;
    btn.onclick = () => showQuestion(next.n);
  } else {
    btn.hidden = true;
  }
}

// ---------- Salvataggio risposta ----------
function setAnswer(n, value) {
  answers[n] = value;
  saveAnswers(answers);

  // Best effort: sincronizza su Supabase (non blocca la UI).
  supabase.from("answers").insert({
    participant_id: participantId,
    question_id: n,
    answer: value,
  }).then(({ error }) => { if (error) console.warn("insert answer:", error.message); });

  // Se ha completato tutte e 5 -> risultato. Altrimenti resta sulla domanda.
  if (allAnswered()) {
    showResult();
  } else {
    showQuestion(n); // ridisegna con la selezione + feedback
  }
}

function allAnswered() {
  return QUESTIONS.every((q) => answers[q.n] !== undefined);
}

// ---------- Risultato + email ----------
let currentArchetypeKey = null;

function showResult() {
  currentArchetypeKey = computeArchetype(answers);
  const a = ARCHETYPES[currentArchetypeKey];
  document.getElementById("r-name").textContent = a.name;
  document.getElementById("r-desc").textContent = a.description;
  show("result");
}

async function sendResult() {
  const name = document.getElementById("r-nome").value.trim();
  const email = document.getElementById("r-email").value.trim();
  const fb = document.getElementById("r-feedback");
  const btn = document.getElementById("r-send");

  if (!name || !email) {
    fb.hidden = false; fb.className = "feedback err";
    fb.textContent = "Inserisci nome ed email.";
    return;
  }

  const a = ARCHETYPES[currentArchetypeKey];
  btn.disabled = true;
  fb.hidden = false; fb.className = "feedback"; fb.textContent = "Invio in corso…";

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        name,
        email,
        archetype: a.name,
        description: a.description,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    fb.className = "feedback ok";
    fb.textContent = "Fatto! Controlla la tua casella email.";
  } catch (e) {
    console.error(e);
    btn.disabled = false;
    fb.className = "feedback err";
    fb.textContent = "Invio non riuscito. Riprova.";
  }
}
document.getElementById("r-send").addEventListener("click", sendResult);

// ============================================================
// Sincronizzazione con Supabase (lettura + realtime)
// ============================================================
async function readStep() {
  const { data, error } = await supabase
    .from("sessions")
    .select("current_step")
    .eq("id", SESSION_ID)
    .single();
  if (!error && data) applyStep(data.current_step);
}

// Aggiorna lo stato senza forzare cambio schermata:
// aggiorna solo la disponibilita' nella navigazione.
function applyStep(step) {
  globalStep = step ?? 0;
  renderNav();
  // Se sono su una domanda e resta valida, non tocco la schermata.
  if (typeof currentView === "number") updateNextButton(currentView);
  // Aggiorno l'hint della schermata di benvenuto.
  if (currentView === "welcome" && globalStep >= 1) {
    document.getElementById("welcome-hint").textContent =
      "Una domanda è disponibile. Toccala qui sopra per rispondere.";
  }
}

function subscribeRealtime() {
  supabase
    .channel("session-step")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${SESSION_ID}` },
      (payload) => applyStep(payload.new.current_step)
    )
    .subscribe();
}

// Se la connessione torna disponibile, rileggo lo stato (no polling continuo).
window.addEventListener("online", readStep);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") readStep();
});

// ============================================================
// Avvio
// ============================================================
async function init() {
  // Se ho gia' risposto a tutto (es. refresh dopo aver finito) -> risultato.
  if (allAnswered()) {
    showResult();
  } else {
    show("welcome");
  }
  await readStep();       // 1. leggo current_step
  subscribeRealtime();    // 2. mi iscrivo ai cambiamenti realtime
}
init();
