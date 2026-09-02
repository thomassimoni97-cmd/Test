# Conference Quiz — MVP

Web experience mobile-first per conferenza. 5 domande sui valori aziendali,
sbloccate dalla regia in realtime, con archetipo finale inviato via email.

Stack: **HTML + CSS + JavaScript vanilla** (ES modules), **Supabase** (Database,
Realtime, Edge Function), **Resend** per l'email. Nessun framework, nessun build.

## File

```
/index.html      pagina partecipante
/control.html    cabina di regia
/style.css       stile (mobile first)
/config.js       SUPABASE_URL + SUPABASE_ANON_KEY
/app.js          logica partecipante (domande, scoring, realtime, email)
/control.js      logica regia (sblocco domande)
/schema.sql      tabelle + RLS + realtime
/supabase/functions/send-result/index.ts   Edge Function (Resend)
```

---

## 1. Creare il progetto Supabase

1. Vai su https://supabase.com → **New project**. Scegli nome e password DB.
2. Aspetta il provisioning (~2 min).
3. **SQL Editor** → **New query** → incolla tutto `schema.sql` → **Run**.
   Crea le tabelle `sessions` (con la riga `demo`) e `answers`, le RLS policy
   e abilita il realtime su `sessions`.

## 2. Abilitare Realtime su `sessions`

`schema.sql` lo fa già con:
`alter publication supabase_realtime add table public.sessions;`

Verifica (facoltativo) da UI: **Database → Replication → `supabase_realtime`**
e controlla che `sessions` sia inclusa.

## 3. Inserire SUPABASE_URL e SUPABASE_ANON_KEY

In **Project Settings → API** copia:
- **Project URL** → `SUPABASE_URL`
- **anon public** key → `SUPABASE_ANON_KEY`

Incollali in `config.js`. (La anon key è pubblica: la sicurezza sta nelle RLS.)

## 4. Configurare RESEND_API_KEY

1. Crea un account su https://resend.com e genera una **API key**.
2. Impostala come secret della Edge Function (NON nel frontend):
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
   ```
   (oppure Dashboard → **Edge Functions → send-result → Secrets**.)
3. Il mittente di default è `onboarding@resend.dev` (funziona subito per i
   test). Per la produzione verifica un tuo dominio su Resend e cambia il
   campo `from` in `supabase/functions/send-result/index.ts`.

## 5. Deploy della Edge Function

Con la [Supabase CLI](https://supabase.com/docs/guides/cli):
```bash
supabase login
supabase link --project-ref <PROJECT_REF>   # il ref è nell'URL del progetto
supabase functions deploy send-result
```
La function sarà a `https://<PROJECT_REF>.supabase.co/functions/v1/send-result`.

## 6. Test in locale

Servono file serviti via HTTP (gli ES module non funzionano con `file://`):
```bash
python3 -m http.server 5173
```
Poi apri:
- Partecipante: http://localhost:5173/index.html
- Regia:        http://localhost:5173/control.html

Prova lo scenario: la regia clicca **Domanda 1** → sul partecipante compare la
domanda 1 disponibile; avanza fino a 5; completa le risposte; invia l'email.
Per simulare un ingresso in ritardo apri `index.html` in un'altra finestra
quando `current_step` è già 3.

## 7. Deploy su Netlify

È un sito statico: nessun build.
- **Drag & drop**: trascina la cartella su https://app.netlify.com/drop.
- **oppure** collega il repo GitHub: build command *vuoto*, publish directory `.`.

La cartella `supabase/` non serve al sito statico (è solo il sorgente della
Edge Function, già deployata su Supabase): puoi lasciarla, viene ignorata.

Il QR code per i partecipanti deve puntare all'URL Netlify di `index.html`.
Tieni `control.html` per te.

---

### Nota sicurezza (prototipo)
Le RLS permettono a chiunque con la anon key di aggiornare `current_step` e
inserire `answers`, senza login. È **intenzionale** per la demo. In produzione:
regia autenticata (service role o Supabase Auth) e policy più strette.
