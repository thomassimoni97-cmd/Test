# Golden Goose — Retail Opening Management
## Fase 1 · Specifica Action Log (APPROVATA)

Stato: **approvata** · Data: 29/09/2026 · Prototipo (Claude Artifact) — non architettura di produzione.

---

## 0. Principi non negoziabili

1. **Unica fonte di verità operativa = ACTION_LOG (Google Sheets).** L'app è un'interfaccia di lettura/scrittura, non conserva dati propri.
2. **Ogni informazione vive in un solo posto.** Stato corrente → ACTION_LOG. Storico → TASK_HISTORY / OPENING_DATE_HISTORY. Tutto il resto è vista calcolata.
3. **Storici append-only.** Le righe non si modificano né si cancellano.
4. **Nessuna correzione automatica dei dati di progetto.** Il sistema segnala, l'utente decide.
5. **Ogni scrittura dell'app viene riletta e verificata.**
6. **Derivati solo se deterministici e dichiarati come tali.**
7. **Meno funzioni, più semplicità, stabilità e sicurezza nell'uso.**

---

## 1. Architettura del workbook (8 fogli)

| Sheet | Ruolo | Scrive |
|---|---|---|
| `ACTION_LOG` | Stato corrente dei task (una tabella unica per tutte le aperture) | Utente + App |
| `TASK_HISTORY` | Storico append-only di note e modifiche | App (+ utente come fallback) |
| `OPENINGS` | Anagrafica aperture + metriche tempi calcolate | Utente (input) / formule |
| `OPENING_DATE_HISTORY` | Storico append-only delle date di apertura (baseline + slittamenti) | Utente / App |
| `SESSIONS` | Testata delle sessioni di lavoro (SAL) | App |
| `AREAS` | Macro Area + Sub Area | Utente |
| `OWNERS` | Anagrafica owner | Utente |
| `LISTS` | Valori chiusi (Status, Progress, Note Type, Session Type, Opening Type, Opening Status, Complexity) | Bloccato |

Nessuna tab per singolo store: si usano **filter view** salvati (uno per apertura + "SAL", "Blocked + Decision", "Critical open", "My tasks").

---

## 2. ACTION_LOG

| # | Colonna | Tipo | Input | Obbl. | Validazione / regole | App |
|---|---|---|---|---|---|---|
| A | `Task ID` | Testo | App alla creazione / manuale alla creazione (copiando `Next Task ID` da OPENINGS) | Sì | Univoco, formato `CODICE-###`, immutabile, **mai formula**. Protetto dopo la creazione | R (W solo in creazione) |
| B | `Opening Type` | Enum | M | Sì | Dropdown: New Store / New Company | R/W alla creazione |
| C | `Location` | Enum | M | Sì | Dropdown da OPENINGS. Coppia B+C deve esistere in OPENINGS | R/W alla creazione |
| D | `Macro Area` | Enum | M | Sì | Dropdown da AREAS | R/W |
| E | `Sub Area` | Enum | M | No | Dropdown da AREAS. Coppia D+E deve esistere | R/W |
| F | `Task` | Testo breve | M | Sì | ~80 caratteri | R/W |
| G | `Description` | Testo lungo | M | No | — | R/W |
| H | `Status` | Enum | M | Sì | Not Started / In Progress / Blocked / Completed / N/A | R/W |
| I | `Progress %` | Numero | M | Sì | 0 / 25 / 50 / 75 / 100 | R/W |
| J | `Owner 1 (Lead)` | Enum | M | Sì* | Dropdown OWNERS. Responsabile unico | R/W |
| K | `Owner 2` | Enum | M | No | Dropdown OWNERS | R/W |
| L | `Owner 3` | Enum | M | No | Dropdown OWNERS | R/W |
| M | `Task Open Date` | Data | Auto alla creazione, modificabile | Sì | Data valida, non futura | R/W |
| N | `Due Date` | Data | M | Sì* | Data valida | R/W |
| O | `Latest Update` | Testo | M (foglio e app) | No | — | R/W |
| P | `Latest Update Date` | Data | M nel foglio (`Ctrl/Cmd+;`), auto dall'app | Se O compilato | Data valida, non futura | R/W |
| Q | `Update History` | Formula | Auto | — | Tutte le note da TASK_HISTORY, più recente in alto, formato `dd/mm/yy – testo` | R |
| R | `Blocker / Decision` | Testo | M | Condizionale | Obbligatorio se Status = Blocked o Decision Required = TRUE | R/W |
| S | `Decision Required` | Checkbox | M | No | Booleano | R/W |
| T | `Critical for Opening` | Checkbox | M | No | Booleano | R/W |
| U | `Check` | Formula | Auto | — | ARRAYFORMULA unica in intestazione. Esito: OK / ⚠ Warning / ⛔ Error + motivo | R |
| V | `Baseline Due Date` | Data | Auto alla creazione | — | Tecnica, protetta | R (W in creazione) |
| W | `Last Modified` | Datetime | Auto (app) | — | Tecnica. Token di concorrenza | R/W |
| X | `Last Modified By` | Testo | Auto (app) | — | Tecnica | R/W |

\* obbligatorio per task aperti (Status ≠ Completed / N/A).

**Formattazione foglio:** riga 1 e colonne A–F congelate · date `dd mmm yyyy` · G, O, Q in "clip" · colonne V–X raggruppate e chiuse · formattazione condizionale solo su Status, Due Date scaduta (task aperto), riga grigia se Completed / N/A · protezione "con avviso" su A, Q, U, V–X · nessuna cella unita, nessuna riga vuota, **nessuna cancellazione di righe** (task non più necessario → `N/A` + nota).

**Filter view "SAL":** nasconde G, K, L, Q.

---

## 3. TASK_HISTORY

Una riga = un evento atomico (una nota, oppure una modifica di un campo).

| Colonna | Descrizione | Esempio |
|---|---|---|
| `History ID` | ID univoco evento | `H-000412` |
| `Event Date` | Data del fatto (data della nota come inserita dall'utente, o data di rilevamento) | `29/09/2026` |
| `Recorded At` | Timestamp di sistema della scrittura della riga | `29/09/2026 10:47` |
| `Task ID` | Task di riferimento | `AMS-003` |
| `Entry Type` | `Created` / `Snapshot` / `Note` / `Change` | `Change` |
| `Note Type` | Solo per Note: `Update` / `Decision` | `Update` |
| `Field` | Campo modificato | `Status` |
| `Previous Value` | Valore precedente | `In Progress` |
| `New Value` | Valore nuovo | `Blocked` |
| `Note` | Testo nota | Waiting for Schiphol security feedback |
| `Author` | Autore (se noto) | `T. Simoni` |
| `Source` | `App` / `Sheet` | `App` |
| `Session ID` | Vuoto se fuori sessione | `SESSION-20260929-001` |
| `Verification` | `Verified` / `Pending` / `Mismatch` / `Error` / `Superseded` | `Verified` |

**Inserimento manuale minimo (fallback):** `Task ID`, `Event Date`, `Note`. Il resto può restare vuoto; `Entry Type` vuoto con `Note` compilata = Note.

### 3.1 Sincronizzazione foglio → storico (all'apertura dell'app)

Campi tracciati: `Status`, `Progress %`, `Owner 1–3`, `Due Date`, `Latest Update` (+ `Latest Update Date`).

- **Prima lettura di un task** senza storico → riga `Snapshot` con i valori iniziali (punto di partenza del confronto).
- **Valore nel foglio ≠ ultimo valore registrato** → nuova riga `Change`, `Source = Sheet`, `Event Date` = data di rilevamento, `Author` vuoto.
- **Latest Update nel foglio ≠ ultima nota registrata** → nuova riga `Note`, `Source = Sheet`, `Event Date` = `Latest Update Date` inserita dall'utente. Se la data manca: nessuna data inventata, Warning.
- Limite dichiarato (prototipo): autore e momento esatto delle modifiche manuali non sono noti; modifiche multiple tra due aperture dell'app perdono i valori intermedi. **Fase 2:** trigger `onEdit` (Apps Script) registra in tempo reale.

### 3.2 Verifica

- Ogni scrittura dell'app: scrivi → rileggi la riga (per Task ID) → `Verified` / `Mismatch` / `Error`.
- Fine sessione: ri-verifica dell'**ultima** modifica per coppia Task + Field; le precedenti nella stessa sessione diventano `Superseded`.

---

## 4. SESSIONS (Session Change Log)

Il Session Change Log **non è un foglio separato**: è `TASK_HISTORY` filtrato per `Session ID` + questa testata. L'export "Export Session Changes" genera il file dalla vista (formato da decidere in fase 7–8).

| Colonna | Esempio |
|---|---|
| `Session ID` | `SESSION-20260929-001` |
| `Started At` / `Ended At` | `29/09/2026 10:30` / `11:45` |
| `Session Type` | `SAL` / `Review` / `Ad-hoc` |
| `Openings in Scope` | `AMS, MAD` |
| `Run By` | `T. Simoni` |
| `Changes` / `Verified` / `Mismatches` | `12 / 12 / 0` |
| `Exported At` | `29/09/2026 11:47` |

---

## 5. OPENINGS

| Colonna | Tipo | Input |
|---|---|---|
| `Opening Code` | Testo univoco (= prefisso Task ID) | M |
| `Opening Type` | New Store / New Company | M |
| `Location` | Nome (es. "Amsterdam Airport", "Czech Republic"; se 2 store nello stesso paese → "Saudi Arabia – Riyadh") | M |
| `Country` | Testo | M |
| `Complexity` | Low / Medium / High (giudizio, non calcolo) | M |
| `Project Start Date` | Data kick-off | M |
| `Opening Status` | Tentative / Confirmed / Opened / Cancelled | M |
| `Related Opening` | Es. `CZE` ↔ `CZE-CO` | M |
| `Baseline Opening Date` | = riga Baseline in OPENING_DATE_HISTORY | Formula |
| `Current Opening Date` | = ultima riga in OPENING_DATE_HISTORY | Formula |
| `Delay (wd)` | Current − Baseline, giorni lavorativi | Formula |
| `Postponements` | N. righe Change | Formula |
| `Days Elapsed (wd)` | `NETWORKDAYS(Start, oggi)`; se Opened: `NETWORKDAYS(Start, Current)` | Formula |
| `Planned Duration (wd)` | `NETWORKDAYS(Start, Current)` | Formula |
| `Days Remaining (wd)` | `NETWORKDAYS(oggi, Current) − 1` | Formula |
| `Next Task ID` | Prossimo ID libero | Formula |

**Regola giorni:** tutte le durate del sistema (openings e task) in **giorni lavorativi** (esclusi sabato/domenica; festività nazionali non considerate).

**Codici proposti:** New Company `CZE-CO`, `ARG-CO`, `KSA-CO`, `HUN-CO`, `SBH-CO` · New Store `IST`, `COL`, `ROU`, `PER`, `AMS`, `KSA`, `SIN`, `CZE`, `HUN`, `MAD`, `SBH`, `ARG`, `DXB`, `URY`.

## 6. OPENING_DATE_HISTORY

La data di apertura **non si modifica in OPENINGS**: si aggiunge una riga qui.

| `Change ID` | `Opening Code` | `Entry Type` | `Decided On` | `New Opening Date` | `Previous Date` (formula) | `Shift (wd)` (formula) | `Reason` | `Recorded By` | `Session ID` |
|---|---|---|---|---|---|---|---|---|---|
| OD-001 | AMS | Baseline | 15/03/2026 | 30/11/2026 | — | — | Initial plan | T. Simoni | — |
| OD-014 | AMS | Change | 12/06/2026 | 15/12/2026 | 30/11/2026 | +11 | Airport unit handover delayed | T. Simoni | SESSION-20260612-001 |

Esempio metriche AMS al 29/09/2026 (start 01/03/2026): Delay **+11 wd** · Postponements 1 · Days Elapsed **152** · Planned Duration 207 (baseline 196) · Days Remaining 55.

## 7. AREAS

| Macro Area | Sub Area |
|---|---|
| IT | ERP (SAP) · POS · IT Hardware · CRM · Connectivity · Telephony |
| Corporate / Legal | — |
| Contract | — |
| Finance & Administration | — |
| Logistics & Customs | — |
| Compliance & Labelling | — |
| HR | — |
| Store Planning | — |
| Indirect Materials | — |
| Allocation & Replenishment | — |
| General Services | — |
| Retail | — |

Colonne: `Macro Area` · `Sub Area` · `Sort Order` · `Active`. Avanzamento aggregato per Macro Area con drill-down su Sub Area.

## 8. OWNERS

`Owner Name` (univoco) · `Function` · `Organisation` (Golden Goose / External) · `Email` · `Active`. Lista controllata; un nuovo owner si aggiunge qui.

---

## 9. Controlli di qualità dati (colonna `Check`)

**⛔ Error** — Task ID mancante / duplicato / formato errato · prefisso Task ID non coerente con Opening Type + Location · coppia Type + Location inesistente · coppia Macro + Sub Area inesistente · Status / Progress / Owner non validi · date non valide · Owner 2–3 senza Owner 1 · riga TASK_HISTORY con Task ID inesistente · opening senza riga Baseline.

**⚠ Warning** — task aperto senza Owner 1 o Due Date · Completed con Progress < 100 · Progress 100 non Completed · Blocked o Decision Required senza `Blocker / Decision` · Latest Update senza data · data futura in Task Open Date / Latest Update Date · Task Open Date > Due Date · task critico con Due Date oltre la Current Opening Date · stesso owner ripetuto nella riga · slittamento apertura senza Reason.

## 10. Project signals (calcolati dall'app, non sono errori)

Overdue · in scadenza a breve · Blocked · Decision Required · Critico non completato · nessun update da X giorni lavorativi · Due Date slittata rispetto alla Baseline. Soglie da confermare in Fase 2.

---

## 11. Regole di scrittura dell'app

- Righe individuate **sempre per Task ID**, mai per numero di riga.
- Prima di scrivere: confronto `Last Modified` letto vs attuale → se diverso, conflitto mostrato all'utente.
- Nuovo task: ID calcolato leggendo il foglio al momento della scrittura; default Status `Not Started`, Progress 0, Task Open Date oggi, Baseline Due Date = Due Date; riga `Created` in TASK_HISTORY.
- L'app non modifica: Task ID, Opening Type/Location (dopo la creazione), colonne formula.

## 12. Note UX già fissate (per Fase 5)

- **Note nell'HTML:** box a lato del task con timeline; ultima nota in nero, precedenti in grigio (niente barrato). Click sulla tab → inserimento nuova nota + data (default oggi). Nient'altro.
- Filtro Owner nell'app cerca su Owner 1–3.

## 13. Open point

| # | Tema | Stato |
|---|---|---|
| OP-1 | **Checklist standard / TEMPLATE per apertura** — l'utente fornirà le informazioni. **Da richiedere all'inizio della Fase 3.** | Aperto |
| OP-2 | Trigger `onEdit` per tracciamento manuale in tempo reale | Fase 2 produzione |
| OP-3 | Festività nazionali nei giorni lavorativi | Escluso per ora |
| OP-4 | Formato export Session Changes | Fase 7–8 |
| OP-5 | Collegamento reale a Google Sheets dall'Artifact vs simulazione | Da verificare in Fase 4/6 |

---

## 14. Esempi — Amsterdam Airport (opening 15/12/2026)

| Task ID | Type | Location | Macro | Sub | Task | Status | % | Owner 1 | Owner 2 | Open | Due | Latest Update | Blocker / Decision | Dec | Crit | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AMS-001 | New Store | Amsterdam Airport | Contract | — | Sign concession agreement with Schiphol | Completed | 100 | G. Conti | | 02/03/26 | 30/06/26 | Countersigned copy archived (02/07/26) | | | ☑ | OK |
| AMS-002 | New Store | Amsterdam Airport | Store Planning | — | Final layout approval by airport authority | In Progress | 50 | L. Bianchi | | 16/03/26 | 17/10/26 | Rev. C submitted, feedback wk 41 (24/09/26) | | | ☑ | OK |
| AMS-003 | New Store | Amsterdam Airport | HR | — | Airport access passes for store staff | Blocked | 25 | S. Moretti | L. Bianchi | 15/09/26 | 15/10/26 | Waiting for Schiphol security feedback (29/09/26) | Pass request needs final staff list | | ☑ | OK |
| AMS-004 | New Store | Amsterdam Airport | HR | — | Recruit store team (SM + 6 SA) | In Progress | 75 | S. Moretti | | 01/07/26 | 10/10/26 | SM hired; 2 SA offers pending (22/09/26) | | | ☑ | OK |
| AMS-005 | New Store | Amsterdam Airport | IT | POS | POS installation and store code setup | Not Started | 0 | M. Ferri | | 01/09/26 | 20/11/26 | | | | ☑ | OK |
| AMS-006 | New Store | Amsterdam Airport | IT | Connectivity | Airside fibre line activation | In Progress | 25 | M. Ferri | | 01/09/26 | 31/10/26 | Two airport-approved providers quoted (25/09/26) | Choose provider: lead time vs cost | ☑ | ☑ | OK |
| AMS-007 | New Store | Amsterdam Airport | Logistics & Customs | — | Define airside delivery and customs regime | In Progress | 25 | A. Greco | | 10/09/26 | 24/10/26 | Customs broker briefed (19/09/26) | Duty-free or duty-paid assortment? | ☑ | ☑ | OK |
| AMS-008 | New Store | Amsterdam Airport | Compliance & Labelling | — | Validate NL labelling requirements | Not Started | 0 | F. Riva | | 01/09/26 | 25/09/26 | | | | | OK *(signal: overdue)* |
| AMS-009 | New Store | Amsterdam Airport | Finance & Administration | — | Cash handling agreement with airport | Completed | 75 | E. Galli | | 01/07/26 | 15/09/26 | Agreement signed (12/09/26) | | | | ⚠ Completed < 100% |
| AMS-010 | New Store | Amsterdam Airport | Store Planning | — | Shopfitting completion | Not Started | 0 | L. Bianchi | | 01/09/26 | 20/12/26 | | | | ☑ | ⚠ Critical due after opening |
