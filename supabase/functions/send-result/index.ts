// ============================================================
// Supabase Edge Function: send-result
// ============================================================
// Riceve { name, email, archetype, description } dal frontend e invia
// una email tramite Resend. La API key Resend NON e' mai esposta al
// frontend: viene letta solo dalla variabile ambiente RESEND_API_KEY.
//
// Deno runtime (Supabase Edge Functions).
// ============================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Header CORS: la function e' chiamata dal browser, quindi deve rispondere
// al preflight OPTIONS e permettere l'origine. Per un MVP usiamo "*".
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Preflight CORS.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { name, email, archetype, description } = await req.json();

    if (!name || !email || !archetype) {
      return new Response(JSON.stringify({ error: "Dati mancanti" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const html =
      `Ciao ${name},<br><br>` +
      `grazie per aver partecipato.<br><br>` +
      `Il tuo archetipo è:<br>` +
      `<strong>${archetype}</strong><br><br>` +
      `${description}`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // In produzione usa un dominio verificato su Resend.
        // onboarding@resend.dev funziona subito per i test.
        from: "Conference Quiz <onboarding@resend.dev>",
        to: [email],
        subject: "Il tuo archetipo",
        html,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return new Response(JSON.stringify({ error: "Resend error", detail }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
