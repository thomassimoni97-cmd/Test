// ============================================================
// Configurazione Supabase (frontend)
// ============================================================
// Sostituisci questi due valori con quelli del TUO progetto Supabase.
// Li trovi in: Dashboard > Project Settings > API
//   - Project URL      -> SUPABASE_URL
//   - anon public key  -> SUPABASE_ANON_KEY
//
// La anon key e' pensata per stare nel frontend: e' pubblica.
// La sicurezza dipende dalle Row Level Security policy (vedi schema.sql).
// La chiave Resend NON sta qui: vive solo nella Edge Function.
// ============================================================

export const SUPABASE_URL = "https://IL-TUO-PROGETTO.supabase.co";
export const SUPABASE_ANON_KEY = "LA-TUA-ANON-KEY";

// id della singola sessione demo (deve combaciare con schema.sql)
export const SESSION_ID = "demo";
