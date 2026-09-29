"""Genera il workbook Action Log (Fase 3) come .xlsx da importare in Google Sheets.

Le formule usano funzioni Google Sheets (ARRAYFORMULA, BYROW, REGEXREPLACE):
il file e' pensato per essere convertito in Google Sheet, non usato in Excel.
Specifica: docs/golden-goose-opening/01-action-log-spec.md
"""
import sys
from datetime import date, datetime

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = sys.argv[1] if len(sys.argv) > 1 else "GG_Opening_Action_Log.xlsx"
MAXR = 1000  # righe coperte da validazioni e formattazione

D = lambda s: datetime.strptime(s, "%d/%m/%y").date()
DT = lambda s: datetime.strptime(s, "%d/%m/%y %H:%M")

# ---------- stile ----------
INK = "2B2622"
HDR_IN = PatternFill("solid", fgColor="EFE9DF")    # colonne di input
HDR_AUTO = PatternFill("solid", fgColor="E4E1DC")  # colonne calcolate / automatiche
DEMO = PatternFill("solid", fgColor="FFF4CC")      # valori demo da sostituire
F_HDR = Font(bold=True, color=INK)
F_HDR_AUTO = Font(bold=True, italic=True, color="6B645C")
DATE_FMT = "dd mmm yyyy"
DT_FMT = "dd mmm yyyy hh:mm"


def sheet(wb, title, headers, auto_cols=(), widths=None, tab=None):
    ws = wb.create_sheet(title)
    for i, h in enumerate(headers, 1):
        c = ws.cell(1, i, h)
        auto = get_column_letter(i) in auto_cols
        c.fill = HDR_AUTO if auto else HDR_IN
        c.font = F_HDR_AUTO if auto else F_HDR
        c.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 24
    for col, w in (widths or {}).items():
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "A2"
    if tab:
        ws.sheet_properties.tabColor = tab
    return ws


def dv_list(ws, src, rng, allow_blank=True):
    dv = DataValidation(type="list", formula1=src, allow_blank=allow_blank,
                        showErrorMessage=True, errorStyle="stop",
                        errorTitle="Valore non valido",
                        error="Scegli un valore dall'elenco.")
    ws.add_data_validation(dv)
    dv.add(rng)


def dv_date(ws, rng):
    dv = DataValidation(type="date", operator="greaterThan", formula1="36526",
                        allow_blank=True, showErrorMessage=True, errorStyle="stop",
                        errorTitle="Data non valida", error="Inserisci una data (es. 15/10/2026).")
    ws.add_data_validation(dv)
    dv.add(rng)


def fmt(ws, col, number_format, first=2, last=None):
    last = last or ws.max_row
    for r in range(first, last + 1):
        ws[f"{col}{r}"].number_format = number_format


wb = Workbook()
wb.remove(wb.active)

# =====================================================================
# ACTION_LOG
# =====================================================================
AL_H = ["Task ID", "Opening Type", "Location", "Macro Area", "Sub Area", "Task", "Description",
        "Status", "Progress %", "Owner 1 (Lead)", "Owner 2", "Owner 3", "Task Open Date",
        "Due Date", "Latest Update", "Latest Update Date", "Update History", "Blocker / Decision",
        "Decision Required", "Critical for Opening", "Check", "Baseline Due Date",
        "Last Modified", "Last Modified By"]
al = sheet(wb, "ACTION_LOG", AL_H, auto_cols=("Q", "U", "V", "W", "X"), tab="B08D57",
           widths={"A": 12, "B": 13, "C": 19, "D": 22, "E": 14, "F": 44, "G": 30, "H": 13,
                   "I": 11, "J": 15, "K": 13, "L": 13, "M": 13, "N": 13, "O": 46, "P": 13,
                   "Q": 34, "R": 36, "S": 10, "T": 10, "U": 34, "V": 13, "W": 17, "X": 14})

NS, NC = "New Store", "New Company"
AMS, MAD, DXB, IST = "Amsterdam Airport", "Madrid Airport", "Dubai Airport", "Istanbul Airport"
CZ, KSA = "Czech Republic", "Saudi Arabia"

# (ID, type, location, macro, sub, task, desc, status, prog, o1, o2, o3, open, due,
#  latest update, lu date, blocker/decision, decision req, critical, baseline due)
TASKS = [
    ("AMS-001", NS, AMS, "Contract", "", "Sign concession agreement with Schiphol", "Concession agreement incl. revenue share and fit-out timeline", "Completed", 100, "G. Conti", "", "", "02/03/26", "30/06/26", "Countersigned copy archived", "02/07/26", "", False, True, "30/06/26"),
    ("AMS-002", NS, AMS, "Store Planning", "", "Final layout approval by airport authority", "Rev. C layout incl. fire exits and storage", "In Progress", 50, "L. Bianchi", "", "", "16/03/26", "17/10/26", "Rev. C submitted, feedback expected wk 41", "24/09/26", "", False, True, "30/09/26"),
    ("AMS-003", NS, AMS, "HR", "", "Airport access passes for store staff", "Request passes for SM + 6 SA via Schiphol security", "Blocked", 25, "S. Moretti", "L. Bianchi", "", "15/09/26", "15/10/26", "Waiting for Schiphol security feedback", "29/09/26", "Pass request needs final staff list; recruitment not closed", False, True, "15/10/26"),
    ("AMS-004", NS, AMS, "HR", "", "Recruit store team (SM + 6 SA)", "", "In Progress", 75, "S. Moretti", "", "", "01/07/26", "10/10/26", "SM hired; 2 SA offers pending", "22/09/26", "", False, True, "30/09/26"),
    ("AMS-005", NS, AMS, "IT", "POS", "POS installation and store code setup", "", "Not Started", 0, "M. Ferri", "", "", "01/09/26", "20/11/26", "", "", "", False, True, "20/11/26"),
    ("AMS-006", NS, AMS, "IT", "Connectivity", "Airside fibre line activation", "Only airport-approved providers allowed airside", "In Progress", 25, "M. Ferri", "", "", "01/09/26", "31/10/26", "Two airport-approved providers quoted", "25/09/26", "Choose provider: lead time vs cost", True, True, "31/10/26"),
    ("AMS-007", NS, AMS, "Logistics & Customs", "", "Define airside delivery and customs regime", "", "In Progress", 25, "A. Greco", "", "", "10/09/26", "24/10/26", "Customs broker briefed", "19/09/26", "Duty-free or duty-paid assortment?", True, True, "24/10/26"),
    ("AMS-008", NS, AMS, "Compliance & Labelling", "", "Validate NL labelling requirements", "", "Not Started", 0, "F. Riva", "", "", "01/09/26", "25/09/26", "", "", "", False, False, "25/09/26"),
    ("AMS-009", NS, AMS, "Finance & Administration", "", "Cash handling agreement with airport", "", "Completed", 75, "E. Galli", "", "", "01/07/26", "15/09/26", "Agreement signed", "12/09/26", "", False, False, "15/09/26"),
    ("AMS-010", NS, AMS, "Store Planning", "", "Shopfitting completion", "", "Not Started", 0, "L. Bianchi", "", "", "01/09/26", "20/12/26", "", "", "", False, True, "20/12/26"),
    ("MAD-001", NS, MAD, "Contract", "", "Sign lease with Aena", "", "Completed", 100, "G. Conti", "", "", "02/02/26", "30/04/26", "Signed lease filed", "28/04/26", "", False, True, "30/04/26"),
    ("MAD-002", NS, MAD, "Store Planning", "", "Shopfitting works", "", "In Progress", 75, "L. Bianchi", "", "", "02/03/26", "23/10/26", "Joinery installed; lighting next week", "25/09/26", "", False, True, "02/10/26"),
    ("MAD-003", NS, MAD, "IT", "POS", "POS and payment terminals installation", "", "In Progress", 50, "M. Ferri", "", "", "01/06/26", "16/10/26", "Terminals shipped, installation booked 12/10", "24/09/26", "", False, True, "16/10/26"),
    ("MAD-004", NS, MAD, "HR", "", "Store team training at HQ", "", "Not Started", 0, "S. Moretti", "", "", "01/07/26", "23/10/26", "", "", "", False, False, "23/10/26"),
    ("MAD-005", NS, MAD, "Allocation & Replenishment", "", "First allocation for opening stock", "", "In Progress", 25, "D. Serra", "R. Marino", "", "01/08/26", "16/10/26", "Draft allocation shared with Retail", "23/09/26", "Confirm opening assortment depth (sizes)", True, True, "16/10/26"),
    ("DXB-001", NS, DXB, "Corporate / Legal", "", "Agreement with duty-free operator", "", "Blocked", 50, "C. Villa", "G. Conti", "", "16/03/26", "30/09/26", "Operator requests revised revenue share", "23/09/26", "Revenue share not agreed; escalation to Commercial Director", True, True, "31/07/26"),
    ("DXB-002", NS, DXB, "IT", "Connectivity", "Network connection via airport provider", "", "Not Started", 0, "M. Ferri", "", "", "01/09/26", "15/11/26", "", "", "", False, True, "15/11/26"),
    ("DXB-003", NS, DXB, "Logistics & Customs", "", "Bonded warehouse flow", "", "In Progress", 25, "A. Greco", "", "", "01/07/26", "31/10/26", "First call with freight forwarder", "10/09/26", "", False, True, "31/10/26"),
    ("DXB-004", NS, DXB, "Compliance & Labelling", "", "Arabic labelling compliance", "", "Completed", 100, "F. Riva", "", "", "01/06/26", "15/09/26", "Labels approved by operator", "11/09/26", "", False, False, "15/09/26"),
    ("CZE-CO-001", NC, CZ, "Corporate / Legal", "", "Company incorporation (s.r.o.)", "", "Completed", 100, "C. Villa", "", "", "04/05/26", "31/07/26", "Registered in Commercial Register", "24/07/26", "", False, True, "31/07/26"),
    ("CZE-CO-002", NC, CZ, "Finance & Administration", "", "Open local bank account", "", "In Progress", 50, "E. Galli", "", "", "03/08/26", "16/10/26", "KYC documents submitted to bank", "21/09/26", "", False, True, "16/10/26"),
    ("CZE-CO-003", NC, CZ, "Finance & Administration", "", "VAT registration", "", "Not Started", 0, "E. Galli", "", "", "03/08/26", "30/10/26", "", "", "", False, True, "30/10/26"),
    ("CZE-CO-004", NC, CZ, "HR", "", "Payroll provider selection", "", "In Progress", 25, "S. Moretti", "E. Galli", "", "01/09/26", "06/11/26", "Two providers shortlisted", "18/09/26", "Choose between the two shortlisted payroll providers", True, False, "06/11/26"),
    ("IST-001", NS, IST, "Store Planning", "", "Layout approval by airport", "", "Completed", 100, "L. Bianchi", "", "", "02/03/26", "31/07/26", "Approved by DHMI", "29/07/26", "", False, True, "31/07/26"),
    ("IST-002", NS, IST, "IT", "ERP (SAP)", "Create store in SAP (plant, pricing)", "", "In Progress", 50, "M. Ferri", "", "", "01/08/26", "23/10/26", "Plant created; pricing conditions pending", "24/09/26", "", False, True, "23/10/26"),
    ("IST-003", NS, IST, "Indirect Materials", "", "Packaging and shopping bags order", "", "In Progress", 75, "P. Costa", "", "", "01/07/26", "09/10/26", "Order confirmed, delivery wk 40", "22/09/26", "", False, False, "09/10/26"),
    ("IST-004", NS, IST, "Retail", "", "Visual merchandising plan", "", "Not Started", 0, "R. Marino", "", "", "01/09/26", "06/11/26", "", "", "", False, False, "06/11/26"),
    ("KSA-CO-001", NC, KSA, "Corporate / Legal", "", "MISA investment license", "", "Blocked", 25, "C. Villa", "", "", "02/03/26", "15/10/26", "Second request for documents from MISA", "18/09/26", "Awaiting MISA response on documentation", False, True, "30/06/26"),
    ("KSA-CO-002", NC, KSA, "Corporate / Legal", "", "Commercial registration (CR)", "", "Not Started", 0, "C. Villa", "C Villa", "", "02/03/26", "13/11/26", "", "", "", False, True, "31/08/26"),
]

for r, t in enumerate(TASKS, 2):
    (tid, typ, loc, mac, sub, task, desc, st, pr, o1, o2, o3, op, due, lu, lud,
     blk, dec, crit, bdue) = t
    row = {"A": tid, "B": typ, "C": loc, "D": mac, "E": sub or None, "F": task, "G": desc or None,
           "H": st, "I": pr, "J": o1, "K": o2 or None, "L": o3 or None, "M": D(op), "N": D(due),
           "O": lu or None, "P": D(lud) if lud else None, "R": blk or None, "S": dec, "T": crit,
           "V": D(bdue), "W": DT("29/09/26 09:00"), "X": "Demo data"}
    for col, v in row.items():
        al[f"{col}{r}"] = v

# --- formule ACTION_LOG (una sola formula per colonna, nell'intestazione) ---
TH = "TASK_HISTORY"
al["Q1"] = (
    '={"Update History";BYROW(A2:A,LAMBDA(id,IF(id="","",IFERROR(TEXTJOIN(CHAR(10),TRUE,'
    f'SORT(FILTER(TEXT({TH}!B2:B,"dd/mm/yy")&" – "&IF({TH}!F2:F="Decision","DECISION: ","")&{TH}!J2:J,'
    f'{TH}!D2:D=id,{TH}!J2:J<>""),FILTER({TH}!B2:B,{TH}!D2:D=id,{TH}!J2:J<>""),FALSE,'
    f'FILTER({TH}!C2:C,{TH}!D2:D=id,{TH}!J2:J<>""),FALSE)),""))))}}'
)

OPEN = '(H2:H<>"Completed")*(H2:H<>"N/A")'
CHECKS = [
    # --- errori ---
    ('(A2:A="")*(F2:F<>"")', "⛔ Task ID mancante"),
    ('(A2:A<>"")*(COUNTIF(A2:A,A2:A)>1)', "⛔ Task ID duplicato"),
    ('(A2:A<>"")*(IFERROR((MID(A2:A,LEN(A2:A)-3,1)<>"-")+ISERROR(VALUE(RIGHT(A2:A,3))),1)>0)', "⛔ Formato Task ID"),
    ('((B2:B="")+(C2:C="")+(D2:D="")+(F2:F="")+(H2:H="")+(I2:I="")>0)', "⛔ Campi obbligatori mancanti"),
    ('(B2:B<>"")*(C2:C<>"")*(COUNTIFS(OPENINGS!B2:B,B2:B,OPENINGS!C2:C,C2:C)=0)', "⛔ Type + Location inesistente"),
    ('(A2:A<>"")*(COUNTIFS(OPENINGS!A2:A,IFERROR(LEFT(A2:A,LEN(A2:A)-4),"#"),OPENINGS!B2:B,B2:B,OPENINGS!C2:C,C2:C)=0)', "⛔ Prefisso ID ≠ Opening"),
    ('(D2:D<>"")*IF(E2:E="",COUNTIF(AREAS!A2:A,D2:D)=0,COUNTIFS(AREAS!A2:A,D2:D,AREAS!B2:B,E2:E)=0)', "⛔ Macro / Sub Area non valida"),
    ('(H2:H<>"")*(COUNTIF(LISTS!A2:A,H2:H)=0)', "⛔ Status non valido"),
    ('(I2:I<>"")*(COUNTIF(LISTS!B2:B,I2:I)=0)', "⛔ Progress non valido"),
    ('((J2:J<>"")*(COUNTIF(OWNERS!A2:A,J2:J)=0)+(K2:K<>"")*(COUNTIF(OWNERS!A2:A,K2:K)=0)+(L2:L<>"")*(COUNTIF(OWNERS!A2:A,L2:L)=0)>0)', "⛔ Owner non in OWNERS"),
    ('((M2:M<>"")*NOT(ISNUMBER(M2:M))+(N2:N<>"")*NOT(ISNUMBER(N2:N))+(P2:P<>"")*NOT(ISNUMBER(P2:P))>0)', "⛔ Data non valida"),
    ('(J2:J="")*((K2:K<>"")+(L2:L<>"")>0)', "⛔ Owner 2/3 senza Owner 1"),
    # --- warning ---
    (f'{OPEN}*(J2:J="")', "⚠ Owner 1 mancante"),
    (f'{OPEN}*(N2:N="")', "⚠ Due Date mancante"),
    ('(H2:H="Completed")*(I2:I<>100)', "⚠ Completed con Progress < 100%"),
    ('(I2:I=100)*(H2:H<>"Completed")', "⚠ 100% ma non Completed"),
    ('((H2:H="Blocked")+(S2:S=TRUE)>0)*(R2:R="")', "⚠ Blocker / Decision vuoto"),
    ('(H2:H="N/A")*(O2:O="")', "⚠ N/A senza motivazione"),
    ('(O2:O<>"")*(P2:P="")', "⚠ Latest Update senza data"),
    ('(IFERROR((M2:M>TODAY())+(P2:P>TODAY()),0)>0)', "⚠ Data futura"),
    ('(M2:M<>"")*(N2:N<>"")*(M2:M>N2:N)', "⚠ Open Date dopo Due Date"),
    (f'(T2:T=TRUE)*{OPEN}*(N2:N<>"")*(N2:N>SUMIFS(OPENINGS!J2:J,OPENINGS!B2:B,B2:B,OPENINGS!C2:C,C2:C))', "⚠ Critico con scadenza oltre l'apertura"),
    ('((J2:J<>"")*((J2:J=K2:K)+(J2:J=L2:L))+(K2:K<>"")*(K2:K=L2:L)>0)', "⚠ Owner ripetuto"),
]
msgs = "&".join(f'IF({c},"{m} · ","")' for c, m in CHECKS)
al["U1"] = (
    '={"Check";ARRAYFORMULA(IF((A2:A="")*(F2:F=""),"",'
    f'REGEXREPLACE(REGEXREPLACE({msgs}&"|"," · \\|$",""),"^\\|$","OK")))}}'
)

for col in "MNPV":
    fmt(al, col, DATE_FMT)
fmt(al, "W", DT_FMT)
fmt(al, "I", '0"%"')

dv_list(al, "=LISTS!$H$2:$H$3", f"B2:B{MAXR}")
dv_list(al, "=LISTS!$L$2:$L$60", f"C2:C{MAXR}")
dv_list(al, "=LISTS!$M$2:$M$60", f"D2:D{MAXR}")
dv_list(al, "=LISTS!$N$2:$N$60", f"E2:E{MAXR}")
dv_list(al, "=LISTS!$A$2:$A$6", f"H2:H{MAXR}", allow_blank=False)
dv_list(al, "=LISTS!$B$2:$B$6", f"I2:I{MAXR}", allow_blank=False)
dv_list(al, "=OWNERS!$A$2:$A$200", f"J2:L{MAXR}")
dv_date(al, f"M2:N{MAXR}")
dv_date(al, f"P2:P{MAXR}")
dv_list(al, '"TRUE,FALSE"', f"S2:T{MAXR}")

# formattazione condizionale (solo sullo stesso foglio)
RNG = f"A2:T{MAXR}"
def cf(ws, rng, formula, font=None, fill=None, stop=False):
    ws.conditional_formatting.add(rng, FormulaRule(formula=[formula.lstrip("=")], font=font, fill=fill, stopIfTrue=stop))

for st, bg, fg in [("Blocked", "F6D5D1", "8E1B14"), ("In Progress", "E1EAF4", "1F4A73"),
                   ("Completed", "DCEEDF", "1E6B34"), ("Not Started", "EEEDEA", "5E5953"),
                   ("N/A", "F4F3F1", "9A948C")]:
    cf(al, f"H2:H{MAXR}", f'$H2="{st}"', font=Font(color=fg, bold=True), fill=PatternFill("solid", bgColor=bg))
cf(al, f"N2:N{MAXR}", '=AND($N2<>"",$N2<TODAY(),$H2<>"Completed",$H2<>"N/A")',
   font=Font(color="B42318", bold=True))
cf(al, RNG, '=OR($H2="Completed",$H2="N/A")', font=Font(color="9A948C"))
cf(al, f"U2:U{MAXR}", '=LEFT($U2,1)="⛔"', font=Font(color="8E1B14", bold=True), fill=PatternFill("solid", bgColor="FBE3E0"))
cf(al, f"U2:U{MAXR}", '=LEFT($U2,1)="⚠"', font=Font(color="7A4A00"), fill=PatternFill("solid", bgColor="FDF0D5"))
cf(al, f"U2:U{MAXR}", '=$U2="OK"', font=Font(color="1E6B34"))

for r in range(2, len(TASKS) + 2):
    for col in "ABCDEFGHIJKLMNOPRSTUVWX":
        al[f"{col}{r}"].alignment = Alignment(vertical="top")
al.freeze_panes = "G2"
al.auto_filter.ref = f"A1:X{MAXR}"
# gruppi di colonne: G, K:L, Q comprimibili (vista SAL); V:X tecniche chiuse
al.column_dimensions.group("G", "G", outline_level=1, hidden=False)
al.column_dimensions.group("K", "L", outline_level=1, hidden=False)
al.column_dimensions.group("Q", "Q", outline_level=1, hidden=False)
al.column_dimensions.group("V", "X", outline_level=1, hidden=True)

# =====================================================================
# TASK_HISTORY
# =====================================================================
TH_H = ["History ID", "Event Date", "Recorded At", "Task ID", "Entry Type", "Note Type", "Field",
        "Previous Value", "New Value", "Note", "Author", "Source", "Session ID", "Verification", "Check"]
th = sheet(wb, TH, TH_H, auto_cols=("A", "C", "L", "N", "O"), tab="8C857C",
           widths={"A": 11, "B": 13, "C": 17, "D": 12, "E": 11, "F": 10, "G": 13, "H": 16,
                   "I": 16, "J": 52, "K": 12, "L": 9, "M": 22, "N": 12, "O": 26})

S22, S29 = "SESSION-20260922-001", "SESSION-20260929-001"
HIST = [
    # event, recorded, task, entry, note type, field, prev, new, note, author, source, session, verif
    ("15/09/26", "15/09/26 09:10", "AMS-003", "Created", "", "", "", "", "", "T. Simoni", "App", "", ""),
    ("15/09/26", "15/09/26 09:12", "AMS-003", "Note", "Update", "", "", "", "Process started with Schiphol security office", "T. Simoni", "App", "", ""),
    ("22/09/26", "22/09/26 10:14", "AMS-003", "Note", "Update", "", "", "", "Documentation template received from Schiphol", "T. Simoni", "App", S22, "Verified"),
    ("22/09/26", "22/09/26 10:20", "AMS-004", "Change", "", "Progress %", "50", "75", "", "T. Simoni", "App", S22, "Verified"),
    ("22/09/26", "22/09/26 10:21", "AMS-004", "Note", "Update", "", "", "", "SM hired; 2 SA offers pending", "T. Simoni", "App", S22, "Verified"),
    ("22/09/26", "22/09/26 10:26", "AMS-002", "Change", "", "Due Date", "30/09/2026", "17/10/2026", "", "T. Simoni", "App", S22, "Verified"),
    ("15/09/26", "15/09/26 16:02", "AMS-002", "Note", "Update", "", "", "", "Rev. B rejected: storage area too small", "T. Simoni", "App", "", ""),
    ("24/09/26", "24/09/26 17:40", "AMS-002", "Note", "Update", "", "", "", "Rev. C submitted, feedback expected wk 41", "T. Simoni", "App", "", ""),
    ("02/07/26", "02/07/26 11:00", "AMS-001", "Note", "Update", "", "", "", "Countersigned copy archived", "T. Simoni", "App", "", ""),
    ("25/09/26", "25/09/26 12:05", "AMS-006", "Note", "Update", "", "", "", "Two airport-approved providers quoted", "T. Simoni", "App", "", ""),
    ("19/09/26", "19/09/26 15:30", "AMS-007", "Note", "Update", "", "", "", "Customs broker briefed", "T. Simoni", "App", "", ""),
    ("12/09/26", "12/09/26 10:00", "AMS-009", "Note", "Update", "", "", "", "Agreement signed", "T. Simoni", "App", "", ""),
    ("28/04/26", "28/04/26 09:30", "MAD-001", "Note", "Update", "", "", "", "Signed lease filed", "T. Simoni", "App", "", ""),
    ("11/09/26", "11/09/26 14:00", "MAD-002", "Note", "Update", "", "", "", "Shopfitter on site, works started", "T. Simoni", "App", "", ""),
    ("22/09/26", "22/09/26 10:40", "MAD-002", "Change", "", "Due Date", "02/10/2026", "23/10/2026", "", "T. Simoni", "App", S22, "Verified"),
    ("25/09/26", "25/09/26 18:10", "MAD-002", "Note", "Update", "", "", "", "Joinery installed; lighting next week", "T. Simoni", "App", "", ""),
    ("24/09/26", "24/09/26 11:15", "MAD-003", "Note", "Update", "", "", "", "Terminals shipped, installation booked 12/10", "T. Simoni", "App", "", ""),
    ("26/09/26", "26/09/26 08:55", "MAD-003", "Change", "", "Owner 1 (Lead)", "A. Greco", "M. Ferri", "Rilevato nel foglio", "", "Sheet", "", ""),
    ("22/09/26", "22/09/26 10:45", "MAD-005", "Note", "Decision", "", "", "", "Opening stock to follow Madrid T4 benchmark depth", "T. Simoni", "App", S22, "Verified"),
    ("23/09/26", "23/09/26 09:20", "MAD-005", "Note", "Update", "", "", "", "Draft allocation shared with Retail", "T. Simoni", "App", "", ""),
    ("09/09/26", "09/09/26 10:00", "DXB-001", "Note", "Update", "", "", "", "Draft agreement received from operator", "T. Simoni", "App", "", ""),
    ("23/09/26", "23/09/26 16:45", "DXB-001", "Note", "Update", "", "", "", "Operator requests revised revenue share", "T. Simoni", "App", "", ""),
    ("29/09/26", "29/09/26 10:31", "DXB-001", "Change", "", "Status", "In Progress", "Blocked", "", "T. Simoni", "App", S29, "Verified"),
    ("10/09/26", "10/09/26 11:00", "DXB-003", "Note", "Update", "", "", "", "First call with freight forwarder", "T. Simoni", "App", "", ""),
    ("11/09/26", "11/09/26 09:00", "DXB-004", "Note", "Update", "", "", "", "Labels approved by operator", "T. Simoni", "App", "", ""),
    ("24/07/26", "24/07/26 12:00", "CZE-CO-001", "Note", "Update", "", "", "", "Registered in Commercial Register", "T. Simoni", "App", "", ""),
    ("21/09/26", "21/09/26 15:00", "CZE-CO-002", "Note", "Update", "", "", "", "KYC documents submitted to bank", "T. Simoni", "App", "", ""),
    ("18/09/26", "18/09/26 10:30", "CZE-CO-004", "Note", "Update", "", "", "", "Two providers shortlisted", "T. Simoni", "App", "", ""),
    ("29/07/26", "29/07/26 09:00", "IST-001", "Note", "Update", "", "", "", "Approved by DHMI", "T. Simoni", "App", "", ""),
    ("24/09/26", "24/09/26 13:30", "IST-002", "Note", "Update", "", "", "", "Plant created; pricing conditions pending", "T. Simoni", "App", "", ""),
    ("22/09/26", "22/09/26 12:00", "IST-003", "Note", "Update", "", "", "", "Order confirmed, delivery wk 40", "T. Simoni", "App", "", ""),
    ("04/09/26", "04/09/26 10:00", "KSA-CO-001", "Note", "Update", "", "", "", "Application filed with MISA", "T. Simoni", "App", "", ""),
    ("18/09/26", "18/09/26 17:00", "KSA-CO-001", "Note", "Update", "", "", "", "Second request for documents from MISA", "T. Simoni", "App", "", ""),
    ("29/09/26", "29/09/26 10:42", "AMS-003", "Change", "", "Status", "In Progress", "Blocked", "", "T. Simoni", "App", S29, "Verified"),
    ("29/09/26", "29/09/26 10:47", "AMS-003", "Note", "Update", "", "", "", "Waiting for Schiphol security feedback", "T. Simoni", "App", S29, "Verified"),
    ("29/09/26", "29/09/26 10:55", "AMS-006", "Change", "", "Decision Required", "FALSE", "TRUE", "", "T. Simoni", "App", S29, "Verified"),
]
for i, h in enumerate(HIST, 1):
    ev, rec, tid, et, nt, fld, pv, nv, note, au, src, sess, ver = h
    r = i + 1
    vals = [f"H-{i:06d}", D(ev), DT(rec), tid, et, nt or None, fld or None, pv or None, nv or None,
            note or None, au or None, src, sess or None, ver or None]
    for c, v in enumerate(vals, 1):
        cell = th.cell(r, c, v)
        if isinstance(v, str) and c in (8, 9):
            cell.number_format = "@"
fmt(th, "B", DATE_FMT)
fmt(th, "C", DT_FMT)
fmt(th, "H", "@")
fmt(th, "I", "@")
th["O1"] = ('={"Check";ARRAYFORMULA(IF(D2:D="","",IF(COUNTIF(ACTION_LOG!A2:A,D2:D)=0,'
            '"⛔ Task ID inesistente",IF(B2:B="","⛔ Event Date mancante","OK"))))}')
dv_list(th, "=ACTION_LOG!$A$2:$A$1000", f"D2:D{MAXR}")
dv_date(th, f"B2:B{MAXR}")
dv_list(th, "=LISTS!$D$2:$D$5", f"E2:E{MAXR}")
dv_list(th, "=LISTS!$C$2:$C$3", f"F2:F{MAXR}")
dv_list(th, "=LISTS!$E$2:$E$3", f"L2:L{MAXR}")
dv_list(th, "=LISTS!$F$2:$F$6", f"N2:N{MAXR}")
cf(th, f"O2:O{MAXR}", '=LEFT($O2,1)="⛔"', font=Font(color="8E1B14", bold=True), fill=PatternFill("solid", bgColor="FBE3E0"))
th.freeze_panes = "E2"
th.auto_filter.ref = f"A1:O{MAXR}"

# =====================================================================
# OPENINGS
# =====================================================================
OP_H = ["Opening Code", "Opening Type", "Location", "Country", "Complexity", "Project Start Date",
        "Opening Status", "Related Opening", "Baseline Opening Date", "Current Opening Date",
        "Delay (wd)", "Postponements", "Days Elapsed (wd)", "Planned Duration (wd)",
        "Days Remaining (wd)", "Next Task ID", "Check"]
op = sheet(wb, "OPENINGS", OP_H, auto_cols=tuple("IJKLMNOPQ"), tab="D8CBB3",
           widths={"A": 12, "B": 13, "C": 19, "D": 18, "E": 11, "F": 14, "G": 13, "H": 12,
                   "I": 15, "J": 15, "K": 10, "L": 13, "M": 13, "N": 15, "O": 14, "P": 13, "Q": 26})
OPENINGS = [
    # code, type, location, country, complexity, start, status, related, baseline date
    ("CZE-CO", NC, CZ, "Czech Republic", "Medium", "04/05/26", "Confirmed", "CZE"),
    ("ARG-CO", NC, "Argentina", "Argentina", "High", "01/06/26", "Tentative", "ARG"),
    ("KSA-CO", NC, KSA, "Saudi Arabia", "High", "02/03/26", "Confirmed", "KSA"),
    ("HUN-CO", NC, "Hungary", "Hungary", "Medium", "15/06/26", "Tentative", "HUN"),
    ("SBH-CO", NC, "Saint Barth", "Saint Barthélemy", "High", "16/03/26", "Confirmed", "SBH"),
    ("IST", NS, IST, "Turkey", "Medium", "02/03/26", "Confirmed", ""),
    ("COL", NS, "Colombia", "Colombia", "High", "01/06/26", "Tentative", ""),
    ("ROU", NS, "Romania", "Romania", "Medium", "04/05/26", "Tentative", ""),
    ("PER", NS, "Peru", "Peru", "High", "01/07/26", "Tentative", ""),
    ("AMS", NS, AMS, "Netherlands", "Medium", "01/03/26", "Confirmed", ""),
    ("KSA", NS, KSA, "Saudi Arabia", "High", "01/04/26", "Tentative", "KSA-CO"),
    ("SIN", NS, "Singapore Airport", "Singapore", "Medium", "15/04/26", "Confirmed", ""),
    ("CZE", NS, CZ, "Czech Republic", "Medium", "15/06/26", "Tentative", "CZE-CO"),
    ("HUN", NS, "Hungary", "Hungary", "Medium", "01/07/26", "Tentative", "HUN-CO"),
    ("MAD", NS, MAD, "Spain", "Low", "02/02/26", "Confirmed", ""),
    ("SBH", NS, "Saint Barth", "Saint Barthélemy", "High", "04/05/26", "Confirmed", "SBH-CO"),
    ("ARG", NS, "Argentina", "Argentina", "High", "03/08/26", "Tentative", "ARG-CO"),
    ("DXB", NS, DXB, "United Arab Emirates", "Medium", "16/03/26", "Confirmed", ""),
    ("URY", NS, "Uruguay", "Uruguay", "Medium", "01/09/26", "Tentative", ""),
]
for r, o in enumerate(OPENINGS, 2):
    code, typ, loc, ctry, cx, start, status, rel = o
    for c, v in enumerate([code, typ, loc, ctry, cx, D(start), status, rel or None], 1):
        cell = op.cell(r, c, v)
        if c in (5, 6, 7):
            cell.fill = DEMO
fmt(op, "F", DATE_FMT)
fmt(op, "I", DATE_FMT)
fmt(op, "J", DATE_FMT)

ODH = "OPENING_DATE_HISTORY"
op["I1"] = (f'={{"Baseline Opening Date";ARRAYFORMULA(IF(A2:A="","",IFERROR(VLOOKUP(A2:A,'
            f'FILTER({ODH}!B2:E,{ODH}!C2:C="Baseline"),4,FALSE),"")))}}')
op["J1"] = (f'={{"Current Opening Date";ARRAYFORMULA(IF(A2:A="","",IFERROR(VLOOKUP(A2:A,'
            f'SORT(FILTER({ODH}!B2:E,{ODH}!B2:B<>""),FILTER({ODH}!D2:D,{ODH}!B2:B<>""),FALSE,'
            f'FILTER(ROW({ODH}!B2:B),{ODH}!B2:B<>""),FALSE),4,FALSE),"")))}}')
op["K1"] = ('={"Delay (wd)";MAP(I2:I,J2:J,LAMBDA(base,cur,IF(OR(base="",cur=""),"",'
            'IF(cur>=base,NETWORKDAYS(base,cur)-1,-(NETWORKDAYS(cur,base)-1)))))}')
op["L1"] = f'={{"Postponements";ARRAYFORMULA(IF(A2:A="","",COUNTIFS({ODH}!B2:B,A2:A,{ODH}!C2:C,"Change")))}}'
op["M1"] = ('={"Days Elapsed (wd)";MAP(F2:F,G2:G,J2:J,LAMBDA(start,stat,cur,IF(OR(start="",cur=""),"",'
            'IF(stat="Opened",NETWORKDAYS(start,cur),NETWORKDAYS(start,TODAY())))))}')
op["N1"] = '={"Planned Duration (wd)";MAP(F2:F,J2:J,LAMBDA(start,cur,IF(OR(start="",cur=""),"",NETWORKDAYS(start,cur))))}'
op["O1"] = ('={"Days Remaining (wd)";MAP(G2:G,J2:J,LAMBDA(stat,cur,IF(cur="","",IF(stat="Opened",0,'
            'IF(cur>=TODAY(),NETWORKDAYS(TODAY(),cur)-1,-(NETWORKDAYS(cur,TODAY())-1))))))}')
op["P1"] = ('={"Next Task ID";ARRAYFORMULA(IF(A2:A="","",'
            'A2:A&"-"&TEXT(COUNTIF(ACTION_LOG!A2:A,A2:A&"-???")+1,"000")))}')
op["Q1"] = ('={"Check";ARRAYFORMULA(IF(A2:A="","",IF(COUNTIF(A2:A,A2:A)>1,"⛔ Codice duplicato",'
            'IF(COUNTIFS(B2:B,B2:B,C2:C,C2:C)>1,"⛔ Type + Location duplicato",'
            f'IF(COUNTIFS({ODH}!B2:B,A2:A,{ODH}!C2:C,"Baseline")<>1,"⛔ Serve una (sola) riga Baseline","OK")))))}}')
dv_list(op, "=LISTS!$H$2:$H$3", f"B2:B{MAXR}")
dv_list(op, "=LISTS!$J$2:$J$4", f"E2:E{MAXR}")
dv_date(op, f"F2:F{MAXR}")
dv_list(op, "=LISTS!$I$2:$I$5", f"G2:G{MAXR}")
dv_list(op, "=OPENINGS!$A$2:$A$200", f"H2:H{MAXR}")
cf(op, f"Q2:Q{MAXR}", '=LEFT($Q2,1)="⛔"', font=Font(color="8E1B14", bold=True), fill=PatternFill("solid", bgColor="FBE3E0"))
cf(op, f"K2:K{MAXR}", '=AND(ISNUMBER($K2),$K2>0)', font=Font(color="B42318", bold=True))
op.freeze_panes = "D2"

# =====================================================================
# OPENING_DATE_HISTORY
# =====================================================================
OD_H = ["Change ID", "Opening Code", "Entry Type", "Decided On", "New Opening Date",
        "Previous Date", "Shift (wd)", "Reason", "Recorded By", "Session ID"]
od = sheet(wb, ODH, OD_H, auto_cols=("F", "G"), tab="8C857C",
           widths={"A": 10, "B": 13, "C": 11, "D": 13, "E": 16, "F": 14, "G": 10, "H": 44,
                   "I": 12, "J": 22})
BASE = {"CZE-CO": "15/12/26", "ARG-CO": "26/02/27", "KSA-CO": "30/09/26", "HUN-CO": "29/01/27",
        "SBH-CO": "30/10/26", "IST": "20/11/26", "COL": "15/03/27", "ROU": "10/02/27",
        "PER": "20/04/27", "AMS": "30/11/26", "KSA": "25/01/27", "SIN": "05/12/26",
        "CZE": "26/02/27", "HUN": "26/03/27", "MAD": "16/10/26", "SBH": "18/12/26",
        "ARG": "14/05/27", "DXB": "14/11/26", "URY": "11/06/27"}
ROWS = [(code, "Baseline", o[5], BASE[code], "Initial plan", "T. Simoni", "")
        for o in OPENINGS for code in [o[0]]]
ROWS += [
    ("KSA-CO", "Change", "15/05/26", "31/10/26", "Commercial registration delayed", "T. Simoni", ""),
    ("AMS", "Change", "12/06/26", "15/12/26", "Airport unit handover delayed", "T. Simoni", "SESSION-20260612-001"),
    ("MAD", "Change", "20/07/26", "06/11/26", "Landlord works delayed", "T. Simoni", ""),
    ("DXB", "Change", "03/09/26", "12/12/26", "Duty-free operator agreement pending", "T. Simoni", ""),
    ("KSA-CO", "Change", "10/09/26", "30/11/26", "MISA license pending", "T. Simoni", ""),
]
for i, (code, et, dec, new, reason, by, sess) in enumerate(ROWS, 1):
    for c, v in enumerate([f"OD-{i:03d}", code, et, D(dec), D(new)], 1):
        od.cell(i + 1, c, v)
    od.cell(i + 1, 8, reason)
    od.cell(i + 1, 9, by)
    od.cell(i + 1, 10, sess or None)
    od.cell(i + 1, 5).fill = DEMO
fmt(od, "D", DATE_FMT)
fmt(od, "E", DATE_FMT)
fmt(od, "F", DATE_FMT)
od["F1"] = ('={"Previous Date";BYROW(B2:E,LAMBDA(r,IF(INDEX(r,1,2)<>"Change","",'
            'LET(prevdec,MAXIFS(D2:D,B2:B,INDEX(r,1,1),D2:D,"<"&INDEX(r,1,3)),'
            'IF(prevdec=0,"",SUMIFS(E2:E,B2:B,INDEX(r,1,1),D2:D,prevdec))))))}')
od["G1"] = ('={"Shift (wd)";MAP(C2:C,E2:E,F2:F,LAMBDA(typ,newd,prevd,IF(OR(typ<>"Change",prevd=""),"",'
            'IF(newd>=prevd,NETWORKDAYS(prevd,newd)-1,-(NETWORKDAYS(newd,prevd)-1)))))}')
dv_list(od, "=OPENINGS!$A$2:$A$200", f"B2:B{MAXR}")
dv_list(od, "=LISTS!$K$2:$K$3", f"C2:C{MAXR}")
dv_date(od, f"D2:E{MAXR}")
cf(od, f"H2:H{MAXR}", '=AND($C2="Change",$H2="")', fill=PatternFill("solid", bgColor="FDF0D5"))
od.auto_filter.ref = f"A1:J{MAXR}"

# =====================================================================
# SESSIONS
# =====================================================================
SE_H = ["Session ID", "Started At", "Ended At", "Session Type", "Openings in Scope", "Run By",
        "Changes", "Verified", "Mismatches", "Exported At"]
se = sheet(wb, "SESSIONS", SE_H, auto_cols=tuple("ABCGHIJ"), tab="8C857C",
           widths={"A": 22, "B": 17, "C": 17, "D": 12, "E": 20, "F": 12, "G": 10, "H": 10, "I": 11, "J": 17})
for r, s in enumerate([(S22, "22/09/26 10:00", "22/09/26 11:05", "SAL", "AMS, MAD", "T. Simoni", "22/09/26 11:07"),
                       (S29, "29/09/26 10:30", "29/09/26 11:15", "SAL", "AMS, DXB", "T. Simoni", "")], 2):
    sid, a, b, typ, scope, by, exp = s
    for c, v in enumerate([sid, DT(a), DT(b), typ, scope, by], 1):
        se.cell(r, c, v)
    if exp:
        se.cell(r, 10, DT(exp))
for col in "BCJ":
    fmt(se, col, DT_FMT)
se["G1"] = f'={{"Changes";ARRAYFORMULA(IF(A2:A="","",COUNTIF({TH}!M2:M,A2:A)))}}'
se["H1"] = f'={{"Verified";ARRAYFORMULA(IF(A2:A="","",COUNTIFS({TH}!M2:M,A2:A,{TH}!N2:N,"Verified")))}}'
se["I1"] = f'={{"Mismatches";ARRAYFORMULA(IF(A2:A="","",COUNTIFS({TH}!M2:M,A2:A,{TH}!N2:N,"Mismatch")))}}'
dv_list(se, "=LISTS!$G$2:$G$4", f"D2:D{MAXR}")
cf(se, f"I2:I{MAXR}", '=AND(ISNUMBER($I2),$I2>0)', font=Font(color="8E1B14", bold=True), fill=PatternFill("solid", bgColor="FBE3E0"))

# =====================================================================
# AREAS
# =====================================================================
ar = sheet(wb, "AREAS", ["Macro Area", "Sub Area", "Sort Order", "Active"], tab="D8CBB3",
           widths={"A": 26, "B": 16, "C": 10, "D": 8})
AREAS = [("Corporate / Legal", "")] + [("Contract", "")] + [
    ("IT", s) for s in ["ERP (SAP)", "POS", "IT Hardware", "CRM", "Connectivity", "Telephony"]] + [
    (m, "") for m in ["Finance & Administration", "Logistics & Customs", "Compliance & Labelling", "HR",
                      "Store Planning", "Indirect Materials", "Allocation & Replenishment",
                      "General Services", "Retail"]]
for r, (m, s) in enumerate(AREAS, 2):
    ar.cell(r, 1, m)
    ar.cell(r, 2, s or None)
    ar.cell(r, 3, r - 1)
    ar.cell(r, 4, True)
dv_list(ar, '"TRUE,FALSE"', f"D2:D{MAXR}")

# =====================================================================
# OWNERS
# =====================================================================
ow = sheet(wb, "OWNERS", ["Owner Name", "Function", "Organisation", "Email", "Active"], tab="D8CBB3",
           widths={"A": 16, "B": 26, "C": 15, "D": 28, "E": 8})
OWNERS = [("T. Simoni", "PMO"), ("G. Conti", "Real Estate"), ("C. Villa", "Corporate / Legal"),
          ("L. Bianchi", "Store Planning"), ("S. Moretti", "HR"), ("M. Ferri", "IT"),
          ("A. Greco", "Logistics & Customs"), ("F. Riva", "Compliance & Labelling"),
          ("E. Galli", "Finance & Administration"), ("D. Serra", "Allocation & Replenishment"),
          ("R. Marino", "Retail"), ("P. Costa", "Indirect Materials")]
for r, (n, f) in enumerate(OWNERS, 2):
    for c, v in enumerate([n, f, "Golden Goose", None, True], 1):
        cell = ow.cell(r, c, v)
        if c <= 2:
            cell.fill = DEMO
dv_list(ow, "=LISTS!$O$2:$O$3", f"C2:C{MAXR}")
dv_list(ow, '"TRUE,FALSE"', f"E2:E{MAXR}")

# =====================================================================
# LISTS
# =====================================================================
ls = sheet(wb, "LISTS", ["Status", "Progress %", "Note Type", "Entry Type", "Source", "Verification",
                         "Session Type", "Opening Type", "Opening Status", "Complexity",
                         "Date Entry Type", "Locations", "Macro Areas", "Sub Areas", "Organisation"],
           auto_cols=("L", "M", "N"), tab="8C857C",
           widths={c: 16 for c in "ABCDEFGHIJKLMNO"})
LISTS = {
    "A": ["Not Started", "In Progress", "Blocked", "Completed", "N/A"],
    "B": [0, 25, 50, 75, 100],
    "C": ["Update", "Decision"],
    "D": ["Created", "Snapshot", "Note", "Change"],
    "E": ["App", "Sheet"],
    "F": ["Verified", "Pending", "Mismatch", "Error", "Superseded"],
    "G": ["SAL", "Review", "Ad-hoc"],
    "H": [NS, NC],
    "I": ["Tentative", "Confirmed", "Opened", "Cancelled"],
    "J": ["Low", "Medium", "High"],
    "K": ["Baseline", "Change"],
    "O": ["Golden Goose", "External"],
}
for col, vals in LISTS.items():
    for r, v in enumerate(vals, 2):
        ls[f"{col}{r}"] = v
ls["L2"] = '=SORT(UNIQUE(FILTER(OPENINGS!C2:C,OPENINGS!C2:C<>"")))'
ls["M2"] = '=UNIQUE(FILTER(AREAS!A2:A,AREAS!A2:A<>""))'
ls["N2"] = '=FILTER(AREAS!B2:B,AREAS!B2:B<>"")'


# =====================================================================
# Le formule non sopravvivono alla conversione xlsx -> Google Sheets:
# nel .xlsx resta solo l'intestazione, le formule vanno in setup_formulas.gs
# (unica fonte delle formule, eseguita una volta dentro il Google Sheet).
# =====================================================================
import json
import re

FORMULAS = []
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and cell.value.startswith("="):
                FORMULAS.append((ws.title, cell.coordinate, cell.value))
                m = re.match(r'^=\{"([^"]+)";', cell.value)
                cell.value = m.group(1) if m else None


def js_formulas(formulas):
    """Array JS solo ASCII e righe corte: sopravvive a qualsiasi copia-incolla."""
    out = ["["]
    for sheet_name, cell, f in formulas:
        parts = [json.dumps(f[i:i + 70]) for i in range(0, len(f), 70)]
        out.append("    [%s, %s," % (json.dumps(sheet_name), json.dumps(cell)))
        out.append("      " + " +\n      ".join(parts) + "],")
    out.append("  ]")
    return "\n".join(out)

GS = """/**
 * GG Opening Action Log - setup una tantum (Fase 3).
 * Generato da build_action_log.py: non modificare a mano.
 * Estensioni > Apps Script > incolla > Salva > Esegui setupActionLog.
 */
function setupActionLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = (n) => ss.getSheetByName(n);

  // 1. Formule (sintassi Google, indipendente dalla lingua del foglio)
  const F = %s;
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
""" % js_formulas(FORMULAS)

gs_path = OUT.rsplit("/", 1)[0] + "/setup_formulas.gs" if "/" in OUT else "setup_formulas.gs"
with open(gs_path, "w") as fh:
    fh.write(GS)
print("formulas", len(FORMULAS), "->", gs_path)

wb.save(OUT)
print("saved", OUT)
