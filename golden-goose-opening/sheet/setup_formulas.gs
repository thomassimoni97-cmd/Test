/**
 * GG Opening Action Log - setup una tantum (Fase 3).
 * Generato da build_action_log.py: non modificare a mano.
 * Estensioni > Apps Script > incolla > Salva > Esegui setupActionLog.
 */
function setupActionLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = (n) => ss.getSheetByName(n);

  // 1. Formule (sintassi Google, indipendente dalla lingua del foglio)
  const F = [
      [
        "ACTION_LOG",
        "Q1",
        "={\"Update History\";BYROW(A2:A,LAMBDA(id,IF(id=\"\",\"\",IFERROR(TEXTJOIN(CHAR(10),TRUE,SORT(FILTER(TEXT(TASK_HISTORY!B2:B,\"dd/mm/yy\")&\" – \"&IF(TASK_HISTORY!F2:F=\"Decision\",\"DECISION: \",\"\")&TASK_HISTORY!J2:J,TASK_HISTORY!D2:D=id,TASK_HISTORY!J2:J<>\"\"),FILTER(TASK_HISTORY!B2:B,TASK_HISTORY!D2:D=id,TASK_HISTORY!J2:J<>\"\"),FALSE,FILTER(TASK_HISTORY!C2:C,TASK_HISTORY!D2:D=id,TASK_HISTORY!J2:J<>\"\"),FALSE)),\"\"))))}"
      ],
      [
        "ACTION_LOG",
        "U1",
        "={\"Check\";ARRAYFORMULA(IF((A2:A=\"\")*(F2:F=\"\"),\"\",REGEXREPLACE(REGEXREPLACE(IF((A2:A=\"\")*(F2:F<>\"\"),\"⛔ Task ID mancante · \",\"\")&IF((A2:A<>\"\")*(COUNTIF(A2:A,A2:A)>1),\"⛔ Task ID duplicato · \",\"\")&IF((A2:A<>\"\")*(IFERROR((MID(A2:A,LEN(A2:A)-3,1)<>\"-\")+ISERROR(VALUE(RIGHT(A2:A,3))),1)>0),\"⛔ Formato Task ID · \",\"\")&IF(((B2:B=\"\")+(C2:C=\"\")+(D2:D=\"\")+(F2:F=\"\")+(H2:H=\"\")+(I2:I=\"\")>0),\"⛔ Campi obbligatori mancanti · \",\"\")&IF((B2:B<>\"\")*(C2:C<>\"\")*(COUNTIFS(OPENINGS!B2:B,B2:B,OPENINGS!C2:C,C2:C)=0),\"⛔ Type + Location inesistente · \",\"\")&IF((A2:A<>\"\")*(COUNTIFS(OPENINGS!A2:A,IFERROR(LEFT(A2:A,LEN(A2:A)-4),\"#\"),OPENINGS!B2:B,B2:B,OPENINGS!C2:C,C2:C)=0),\"⛔ Prefisso ID ≠ Opening · \",\"\")&IF((D2:D<>\"\")*IF(E2:E=\"\",COUNTIF(AREAS!A2:A,D2:D)=0,COUNTIFS(AREAS!A2:A,D2:D,AREAS!B2:B,E2:E)=0),\"⛔ Macro / Sub Area non valida · \",\"\")&IF((H2:H<>\"\")*(COUNTIF(LISTS!A2:A,H2:H)=0),\"⛔ Status non valido · \",\"\")&IF((I2:I<>\"\")*(COUNTIF(LISTS!B2:B,I2:I)=0),\"⛔ Progress non valido · \",\"\")&IF(((J2:J<>\"\")*(COUNTIF(OWNERS!A2:A,J2:J)=0)+(K2:K<>\"\")*(COUNTIF(OWNERS!A2:A,K2:K)=0)+(L2:L<>\"\")*(COUNTIF(OWNERS!A2:A,L2:L)=0)>0),\"⛔ Owner non in OWNERS · \",\"\")&IF(((M2:M<>\"\")*NOT(ISNUMBER(M2:M))+(N2:N<>\"\")*NOT(ISNUMBER(N2:N))+(P2:P<>\"\")*NOT(ISNUMBER(P2:P))>0),\"⛔ Data non valida · \",\"\")&IF((J2:J=\"\")*((K2:K<>\"\")+(L2:L<>\"\")>0),\"⛔ Owner 2/3 senza Owner 1 · \",\"\")&IF((H2:H<>\"Completed\")*(H2:H<>\"N/A\")*(J2:J=\"\"),\"⚠ Owner 1 mancante · \",\"\")&IF((H2:H<>\"Completed\")*(H2:H<>\"N/A\")*(N2:N=\"\"),\"⚠ Due Date mancante · \",\"\")&IF((H2:H=\"Completed\")*(I2:I<>100),\"⚠ Completed con Progress < 100% · \",\"\")&IF((I2:I=100)*(H2:H<>\"Completed\"),\"⚠ 100% ma non Completed · \",\"\")&IF(((H2:H=\"Blocked\")+(S2:S=TRUE)>0)*(R2:R=\"\"),\"⚠ Blocker / Decision vuoto · \",\"\")&IF((H2:H=\"N/A\")*(O2:O=\"\"),\"⚠ N/A senza motivazione · \",\"\")&IF((O2:O<>\"\")*(P2:P=\"\"),\"⚠ Latest Update senza data · \",\"\")&IF((IFERROR((M2:M>TODAY())+(P2:P>TODAY()),0)>0),\"⚠ Data futura · \",\"\")&IF((M2:M<>\"\")*(N2:N<>\"\")*(M2:M>N2:N),\"⚠ Open Date dopo Due Date · \",\"\")&IF((T2:T=TRUE)*(H2:H<>\"Completed\")*(H2:H<>\"N/A\")*(N2:N<>\"\")*(N2:N>SUMIFS(OPENINGS!J2:J,OPENINGS!B2:B,B2:B,OPENINGS!C2:C,C2:C)),\"⚠ Critico con scadenza oltre l'apertura · \",\"\")&IF(((J2:J<>\"\")*((J2:J=K2:K)+(J2:J=L2:L))+(K2:K<>\"\")*(K2:K=L2:L)>0),\"⚠ Owner ripetuto · \",\"\")&\"|\",\" · \\|$\",\"\"),\"^\\|$\",\"OK\")))}"
      ],
      [
        "TASK_HISTORY",
        "O1",
        "={\"Check\";ARRAYFORMULA(IF(D2:D=\"\",\"\",IF(COUNTIF(ACTION_LOG!A2:A,D2:D)=0,\"⛔ Task ID inesistente\",IF(B2:B=\"\",\"⛔ Event Date mancante\",\"OK\"))))}"
      ],
      [
        "OPENINGS",
        "I1",
        "={\"Baseline Opening Date\";ARRAYFORMULA(IF(A2:A=\"\",\"\",IFERROR(VLOOKUP(A2:A,FILTER(OPENING_DATE_HISTORY!B2:E,OPENING_DATE_HISTORY!C2:C=\"Baseline\"),4,FALSE),\"\")))}"
      ],
      [
        "OPENINGS",
        "J1",
        "={\"Current Opening Date\";ARRAYFORMULA(IF(A2:A=\"\",\"\",IFERROR(VLOOKUP(A2:A,SORT(FILTER(OPENING_DATE_HISTORY!B2:E,OPENING_DATE_HISTORY!B2:B<>\"\"),FILTER(OPENING_DATE_HISTORY!D2:D,OPENING_DATE_HISTORY!B2:B<>\"\"),FALSE,FILTER(ROW(OPENING_DATE_HISTORY!B2:B),OPENING_DATE_HISTORY!B2:B<>\"\"),FALSE),4,FALSE),\"\")))}"
      ],
      [
        "OPENINGS",
        "K1",
        "={\"Delay (wd)\";MAP(I2:I,J2:J,LAMBDA(base,cur,IF(OR(base=\"\",cur=\"\"),\"\",IF(cur>=base,NETWORKDAYS(base,cur)-1,-(NETWORKDAYS(cur,base)-1)))))}"
      ],
      [
        "OPENINGS",
        "L1",
        "={\"Postponements\";ARRAYFORMULA(IF(A2:A=\"\",\"\",COUNTIFS(OPENING_DATE_HISTORY!B2:B,A2:A,OPENING_DATE_HISTORY!C2:C,\"Change\")))}"
      ],
      [
        "OPENINGS",
        "M1",
        "={\"Days Elapsed (wd)\";MAP(F2:F,G2:G,J2:J,LAMBDA(start,stat,cur,IF(OR(start=\"\",cur=\"\"),\"\",IF(stat=\"Opened\",NETWORKDAYS(start,cur),NETWORKDAYS(start,TODAY())))))}"
      ],
      [
        "OPENINGS",
        "N1",
        "={\"Planned Duration (wd)\";MAP(F2:F,J2:J,LAMBDA(start,cur,IF(OR(start=\"\",cur=\"\"),\"\",NETWORKDAYS(start,cur))))}"
      ],
      [
        "OPENINGS",
        "O1",
        "={\"Days Remaining (wd)\";MAP(G2:G,J2:J,LAMBDA(stat,cur,IF(cur=\"\",\"\",IF(stat=\"Opened\",0,IF(cur>=TODAY(),NETWORKDAYS(TODAY(),cur)-1,-(NETWORKDAYS(cur,TODAY())-1))))))}"
      ],
      [
        "OPENINGS",
        "P1",
        "={\"Next Task ID\";ARRAYFORMULA(IF(A2:A=\"\",\"\",A2:A&\"-\"&TEXT(COUNTIF(ACTION_LOG!A2:A,A2:A&\"-???\")+1,\"000\")))}"
      ],
      [
        "OPENINGS",
        "Q1",
        "={\"Check\";ARRAYFORMULA(IF(A2:A=\"\",\"\",IF(COUNTIF(A2:A,A2:A)>1,\"⛔ Codice duplicato\",IF(COUNTIFS(B2:B,B2:B,C2:C,C2:C)>1,\"⛔ Type + Location duplicato\",IF(COUNTIFS(OPENING_DATE_HISTORY!B2:B,A2:A,OPENING_DATE_HISTORY!C2:C,\"Baseline\")<>1,\"⛔ Serve una (sola) riga Baseline\",\"OK\")))))}"
      ],
      [
        "OPENING_DATE_HISTORY",
        "F1",
        "={\"Previous Date\";BYROW(B2:E,LAMBDA(r,IF(INDEX(r,1,2)<>\"Change\",\"\",LET(prevdec,MAXIFS(D2:D,B2:B,INDEX(r,1,1),D2:D,\"<\"&INDEX(r,1,3)),IF(prevdec=0,\"\",SUMIFS(E2:E,B2:B,INDEX(r,1,1),D2:D,prevdec))))))}"
      ],
      [
        "OPENING_DATE_HISTORY",
        "G1",
        "={\"Shift (wd)\";MAP(C2:C,E2:E,F2:F,LAMBDA(typ,newd,prevd,IF(OR(typ<>\"Change\",prevd=\"\"),\"\",IF(newd>=prevd,NETWORKDAYS(prevd,newd)-1,-(NETWORKDAYS(newd,prevd)-1)))))}"
      ],
      [
        "SESSIONS",
        "G1",
        "={\"Changes\";ARRAYFORMULA(IF(A2:A=\"\",\"\",COUNTIF(TASK_HISTORY!M2:M,A2:A)))}"
      ],
      [
        "SESSIONS",
        "H1",
        "={\"Verified\";ARRAYFORMULA(IF(A2:A=\"\",\"\",COUNTIFS(TASK_HISTORY!M2:M,A2:A,TASK_HISTORY!N2:N,\"Verified\")))}"
      ],
      [
        "SESSIONS",
        "I1",
        "={\"Mismatches\";ARRAYFORMULA(IF(A2:A=\"\",\"\",COUNTIFS(TASK_HISTORY!M2:M,A2:A,TASK_HISTORY!N2:N,\"Mismatch\")))}"
      ],
      [
        "LISTS",
        "L2",
        "=SORT(UNIQUE(FILTER(OPENINGS!C2:C,OPENINGS!C2:C<>\"\")))"
      ],
      [
        "LISTS",
        "M2",
        "=UNIQUE(FILTER(AREAS!A2:A,AREAS!A2:A<>\"\"))"
      ],
      [
        "LISTS",
        "N2",
        "=FILTER(AREAS!B2:B,AREAS!B2:B<>\"\")"
      ]
    ];
  F.forEach(([s, c, f]) => sh(s).getRange(c).setFormula(f));

  // 2. Formati
  const DATE = 'dd mmm yyyy';
  sh('OPENINGS').getRange('I2:J1000').setNumberFormat(DATE);
  sh('OPENINGS').getRange('K2:O1000').setNumberFormat('0');
  sh('OPENING_DATE_HISTORY').getRange('F2:F1000').setNumberFormat(DATE);
  sh('OPENING_DATE_HISTORY').getRange('G2:G1000').setNumberFormat('+0;-0;0');
  ['G2:G1000', 'O2:O1000', 'Q2:Q1000', 'R2:R1000'].forEach((a) =>
    sh('ACTION_LOG').getRange(a).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP));

  // 3. Checkbox
  sh('ACTION_LOG').getRange('S2:T1000').insertCheckboxes();
  sh('AREAS').getRange('D2:D200').insertCheckboxes();
  sh('OWNERS').getRange('E2:E200').insertCheckboxes();

  // 4. Protezioni "solo avviso" (rieseguibile: rimuove quelle create in precedenza)
  ss.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .concat(ss.getProtections(SpreadsheetApp.ProtectionType.SHEET))
    .filter((p) => (p.getDescription() || '').indexOf('GG:') === 0)
    .forEach((p) => p.remove());
  const warnRange = (s, a, d) => sh(s).getRange(a).protect().setDescription('GG: ' + d).setWarningOnly(true);
  const warnSheet = (s, d) => sh(s).protect().setDescription('GG: ' + d).setWarningOnly(true);
  warnRange('ACTION_LOG', 'A2:A1000', 'Task ID immutabile');
  warnRange('ACTION_LOG', 'Q1:Q1000', 'Update History calcolata');
  warnRange('ACTION_LOG', 'U1:X1000', 'Check e colonne tecniche');
  warnRange('OPENINGS', 'I1:Q1000', 'Colonne calcolate');
  warnRange('OPENING_DATE_HISTORY', 'F1:G1000', 'Colonne calcolate');
  warnRange('SESSIONS', 'G1:I1000', 'Conteggi calcolati');
  warnSheet('TASK_HISTORY', 'Storico append-only');
  warnSheet('LISTS', 'Liste chiuse');

  // 5. Verifica: nessuna formula deve restituire un errore
  SpreadsheetApp.flush();
  const bad = [];
  F.forEach(([s, c]) => {
    const r = sh(s).getRange(c);
    const vals = [r.getDisplayValue(), r.offset(1, 0).getDisplayValue()];
    if (vals.some((v) => /^#/.test(v))) bad.push(s + '!' + c + ' -> ' + vals.join(' | '));
  });
  const msg = bad.length ? 'ERRORI: ' + bad.join(' ; ') : 'Setup completato: ' + F.length + ' formule OK';
  Logger.log(msg);
  ss.toast(msg, 'GG Action Log', 15);
}
