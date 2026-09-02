// ============================================================
// Cabina di regia
// ============================================================
// NOTA: nessuna autenticazione. Semplificazione da prototipo, non per
// produzione (vedi commento in control.html e policy in schema.sql).
// ============================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SESSION_ID } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const stepEl = document.getElementById("step");
const errEl = document.getElementById("err");

function showStep(step) {
  stepEl.textContent = step;
}

// Imposta current_step sulla sessione demo.
async function setStep(step) {
  errEl.hidden = true;
  const { error } = await supabase
    .from("sessions")
    .update({ current_step: step })
    .eq("id", SESSION_ID);
  if (error) {
    errEl.hidden = false;
    errEl.textContent = "Errore: " + error.message;
  }
  // La UI si aggiorna comunque via realtime; aggiorno subito per reattivita'.
  else showStep(step);
}

document.querySelectorAll("button[data-step]").forEach((b) => {
  b.addEventListener("click", () => setStep(Number(b.dataset.step)));
});

// Lettura iniziale del valore corrente.
async function readStep() {
  const { data, error } = await supabase
    .from("sessions")
    .select("current_step")
    .eq("id", SESSION_ID)
    .single();
  if (!error && data) showStep(data.current_step);
}

// Realtime: mostra sempre il current_step aggiornato.
supabase
  .channel("control-step")
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${SESSION_ID}` },
    (payload) => showStep(payload.new.current_step)
  )
  .subscribe();

readStep();
