// Demo dataset. Dates are generated relative to an anchor ("today") so the demo stays meaningful
// whenever it is loaded. Amsterdam Airport is event-sourced: tasks start in an initial state and a
// script of dated events is replayed through the same mutation rules the app uses, and three weekly
// SALs are confirmed along the way (so baselines, history and minutes are all consistent).

import { addDays } from 'date-fns';
import { addDaysISO, daysBetween, toISODate } from './dates';
import { buildSalSnapshot, detectChanges, firstSalBaseline, parseSnapshot, renderText, standardTemplate } from './minutes';
import { applyStorePatch, applyTaskPatch, blankTask, createdHistory, noteHistory } from './mutations';
import {
  DEFAULT_SETTINGS,
  serializeArea,
  serializeHistory,
  serializeOwner,
  serializeSal,
  serializeSettings,
  serializeStore,
  serializeTask,
  type RawTables,
} from './schema';
import { CORE_STATUS, type Area, type HistoryEntry, type Owner, type RiskLevel, type SalRecord, type Store, type Task, type TaskPatch } from './types';

const SYSTEM_USER = 'PMO Admin';

export const SEED_AREAS: Omit<Area, 'rev'>[] = [
  ['CORP', 'Corporate / Legal', ''],
  ['CON', 'Contract', ''],
  ['IT', 'IT', 'IT'],
  ['SAP', 'SAP', 'IT'],
  ['ERP', 'ERP', 'IT'],
  ['POS', 'POS', 'IT'],
  ['ITH', 'IT Hardware', 'IT'],
  ['CRM', 'CRM', 'IT'],
  ['NET', 'Connectivity', 'IT'],
  ['TEL', 'Telephony', 'IT'],
  ['FIN', 'Finance & Administration', ''],
  ['LOG', 'Logistics & Customs', ''],
  ['CMP', 'Compliance & Labelling', ''],
  ['HR', 'HR', ''],
  ['SP', 'Store Planning', ''],
  ['IM', 'Indirect Materials', ''],
  ['AR', 'Allocation & Replenishment', ''],
  ['GS', 'General Services', ''],
  ['RET', 'Retail', ''],
].map(([Area_ID, Area_Name, Group], i) => ({ Area_ID, Area_Name, Group, Order: (i + 1) * 10, Active: true }));

export const SEED_OWNERS: Omit<Owner, 'rev'>[] = [
  ['Marco Ferri', 'Legal & Corporate Affairs'],
  ['Giulia Rinaldi', 'Real Estate & Contracts'],
  ['Luca Bernardi', 'IT Retail Systems'],
  ['Andrea Colombo', 'SAP / ERP'],
  ['Francesca Moretti', 'POS & Store Systems'],
  ['Stefano Galli', 'IT Infrastructure'],
  ['Chiara De Luca', 'CRM & Clienteling'],
  ['Paolo Marchetti', 'Finance & Administration'],
  ['Roberto Villa', 'Tax & Treasury'],
  ['Elena Conti', 'Logistics & Customs'],
  ['Davide Fontana', 'Compliance & Labelling'],
  ['Nicoletta Bisaro', 'HR'],
  ['Alessandro Riva', 'Store Planning'],
  ['Sara Lombardi', 'Procurement / Indirect Materials'],
  ['Matteo Greco', 'Allocation & Replenishment'],
  ['Valentina Costa', 'General Services'],
  ['Martina Ricci', 'Retail Concept & VM'],
  ['Federico Mancini', 'Retail Operations'],
  ['Laura Bianchi', 'Retail Opening PMO'],
  ['Giorgio Sala', 'Retail Opening PMO'],
  ['Sophie van Dijk', 'Store Manager – Amsterdam'],
  ['Omar Al-Harbi', 'Country Manager – KSA'],
].map(([Name, Function], i) => ({
  Owner_ID: `OWN-${String(i + 1).padStart(3, '0')}`,
  Name,
  Email: `${Name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ +/g, '.')}@goldengoose.example`,
  Function,
  Active: true,
}));

const AREA_OWNER: Record<string, string> = {
  CORP: 'Marco Ferri', CON: 'Giulia Rinaldi', IT: 'Luca Bernardi', SAP: 'Andrea Colombo', ERP: 'Andrea Colombo',
  POS: 'Francesca Moretti', ITH: 'Stefano Galli', CRM: 'Chiara De Luca', NET: 'Stefano Galli', TEL: 'Stefano Galli',
  FIN: 'Paolo Marchetti', LOG: 'Elena Conti', CMP: 'Davide Fontana', HR: 'Nicoletta Bisaro', SP: 'Alessandro Riva',
  IM: 'Sara Lombardi', AR: 'Matteo Greco', GS: 'Valentina Costa', RET: 'Martina Ricci',
};

/** Program plan, expressed as absolute dates relative to the reference date 2026-09-28. */
const REF = '2026-09-28';
interface StoreDef {
  id: string; name: string; country: string; city: string; type: string; program: 'New Company' | 'New Store';
  opening: string; ods: 'Confirmed' | 'Tentative' | 'TBD'; risk: RiskLevel; pm: string; health: number; status?: string;
}
const STORE_DEFS: StoreDef[] = [
  { id: 'CZC', name: 'Czech Republic', country: 'Czech Republic', city: 'Prague', type: 'Company Opening', program: 'New Company', opening: '2026-11-02', ods: 'Confirmed', risk: 'Low', pm: 'Giorgio Sala', health: 0.92 },
  { id: 'HUC', name: 'Hungary', country: 'Hungary', city: 'Budapest', type: 'Company Opening', program: 'New Company', opening: '2026-12-01', ods: 'Confirmed', risk: 'Medium', pm: 'Giorgio Sala', health: 0.8 },
  { id: 'KSC', name: 'Saudi Arabia', country: 'Saudi Arabia', city: 'Riyadh', type: 'Company Opening', program: 'New Company', opening: '2027-01-15', ods: 'Tentative', risk: 'High', pm: 'Laura Bianchi', health: 0.62 },
  { id: 'ARC', name: 'Argentina', country: 'Argentina', city: 'Buenos Aires', type: 'Company Opening', program: 'New Company', opening: '2027-03-01', ods: 'Tentative', risk: 'Medium', pm: 'Giorgio Sala', health: 0.75 },
  { id: 'SBC', name: 'Saint Barth', country: 'Saint Barthélemy', city: 'Gustavia', type: 'Company Opening', program: 'New Company', opening: '2027-05-15', ods: 'TBD', risk: 'Low', pm: 'Laura Bianchi', health: 0.85 },

  { id: 'IST', name: 'Istanbul Airport', country: 'Turkey', city: 'Istanbul', type: 'Airport Store', program: 'New Store', opening: '2026-11-20', ods: 'Confirmed', risk: 'Medium', pm: 'Federico Mancini', health: 0.82 },
  { id: 'BOG', name: 'Colombia', country: 'Colombia', city: 'Bogotá', type: 'Standard Store', program: 'New Store', opening: '2026-12-10', ods: 'Confirmed', risk: 'Low', pm: 'Giorgio Sala', health: 0.9 },
  { id: 'BUC', name: 'Romania', country: 'Romania', city: 'Bucharest', type: 'Standard Store', program: 'New Store', opening: '2027-01-28', ods: 'Confirmed', risk: 'Low', pm: 'Federico Mancini', health: 0.93 },
  { id: 'LIM', name: 'Peru', country: 'Peru', city: 'Lima', type: 'Standard Store', program: 'New Store', opening: '2027-02-20', ods: 'Tentative', risk: 'Medium', pm: 'Giorgio Sala', health: 0.78 },
  { id: 'AMS', name: 'Amsterdam Airport', country: 'Netherlands', city: 'Amsterdam Schiphol', type: 'Airport Store', program: 'New Store', opening: '2027-03-05', ods: 'Confirmed', risk: 'Medium', pm: 'Laura Bianchi', health: 0.8 },
  { id: 'RUH', name: 'Saudi Arabia', country: 'Saudi Arabia', city: 'Riyadh', type: 'Standard Store', program: 'New Store', opening: '2027-03-25', ods: 'Tentative', risk: 'High', pm: 'Laura Bianchi', health: 0.6 },
  { id: 'SIN', name: 'Singapore Airport', country: 'Singapore', city: 'Singapore Changi', type: 'Airport Store', program: 'New Store', opening: '2027-04-15', ods: 'Tentative', risk: 'Medium', pm: 'Federico Mancini', health: 0.7 },
  { id: 'PRG', name: 'Czech Republic', country: 'Czech Republic', city: 'Prague', type: 'Standard Store', program: 'New Store', opening: '2027-04-30', ods: 'Confirmed', risk: 'Low', pm: 'Giorgio Sala', health: 0.9 },
  { id: 'BUD', name: 'Hungary', country: 'Hungary', city: 'Budapest', type: 'Standard Store', program: 'New Store', opening: '2027-05-20', ods: 'Tentative', risk: 'Low', pm: 'Giorgio Sala', health: 0.88 },
  { id: 'MAD', name: 'Madrid Airport', country: 'Spain', city: 'Madrid Barajas', type: 'Airport Store', program: 'New Store', opening: '2027-06-15', ods: 'Tentative', risk: 'Low', pm: 'Federico Mancini', health: 0.9 },
  { id: 'SBH', name: 'Saint Barth', country: 'Saint Barthélemy', city: 'Gustavia', type: 'Standard Store', program: 'New Store', opening: '2027-07-01', ods: 'TBD', risk: 'Medium', pm: 'Laura Bianchi', health: 0.8 },
  { id: 'BUE', name: 'Argentina', country: 'Argentina', city: 'Buenos Aires', type: 'Standard Store', program: 'New Store', opening: '2027-09-10', ods: 'TBD', risk: 'Low', pm: 'Giorgio Sala', health: 0.85 },
  { id: 'DXB', name: 'Dubai Airport', country: 'United Arab Emirates', city: 'Dubai', type: 'Airport Store', program: 'New Store', opening: '2027-10-15', ods: 'TBD', risk: 'Low', pm: 'Federico Mancini', health: 0.9 },
  { id: 'MVD', name: 'Uruguay', country: 'Uruguay', city: 'Montevideo', type: 'Standard Store', program: 'New Store', opening: '2027-12-01', ods: 'TBD', risk: 'Low', pm: 'Giorgio Sala', health: 0.9 },
];

// generic task templates: [area, title, start (days before opening), due (days before opening), weight]
type Tpl = [string, string, number, number, number?];
const STORE_TPL: Tpl[] = [
  ['CORP', 'Local entity / branch registration check', 200, 150],
  ['CON', 'Lease / concession contract signature', 220, 150, 3],
  ['IT', 'IT project kick-off with local partners', 180, 165],
  ['SAP', 'Store master data set-up in SAP', 120, 90],
  ['SAP', 'Set-up and testing of flows', 90, 40],
  ['ERP', 'Customs and transport flows alignment', 120, 80],
  ['POS', 'POS installation and configuration', 60, 15, 2],
  ['ITH', 'Hardware purchase and shipment', 100, 45],
  ['CRM', 'Salesforce users and clienteling set-up', 60, 20],
  ['NET', 'Internet line activation', 120, 30],
  ['TEL', 'Mobile devices and SIM activation', 45, 10],
  ['FIN', 'Bank account, cash handling and payment terminals', 150, 60],
  ['LOG', 'First merchandise shipment', 60, 14],
  ['CMP', 'Labelling and local compliance check', 90, 45],
  ['HR', 'Recruiting store team', 150, 45, 2],
  ['HR', 'Training and onboarding', 40, 7],
  ['SP', 'Store design approval', 240, 180],
  ['SP', 'Construction works', 150, 20, 3],
  ['IM', 'Indirect materials orders', 75, 25],
  ['AR', 'Opening allocation plan', 60, 20],
  ['GS', 'Cleaning, maintenance and security services', 60, 15],
  ['RET', 'Store Manager opening plan', 45, 5],
];
const AIRPORT_TPL: Tpl[] = [
  ['HR', 'Airport access passes for store staff', 90, 20, 2],
  ['POS', 'Airport systems integration (sales reporting)', 120, 40, 2],
];
const COMPANY_TPL: Tpl[] = [
  ['CORP', 'Company incorporation and articles of association', 240, 150, 3],
  ['CORP', 'Appointment of local directors and authorized signatories', 180, 120],
  ['CON', 'Registered office agreement', 120, 75],
  ['FIN', 'Tax registrations (VAT, corporate tax)', 150, 90],
  ['FIN', 'Local auditor and accountant appointment', 120, 60],
  ['FIN', 'Bank account opening', 120, 75],
  ['SAP', 'Company code set-up in SAP', 100, 40, 2],
  ['ERP', 'Intercompany flows configuration', 90, 30],
  ['HR', 'Local payroll provider and employment contracts', 120, 45],
  ['HR', 'Country Manager recruiting', 180, 90],
  ['LOG', 'Import license and customs registration', 150, 60, 2],
  ['CMP', 'Local compliance and labelling requirements', 120, 45],
  ['IT', 'IT, email and network set-up for the local entity', 60, 20],
];
const BLOCKER_TEXT: Record<string, string> = {
  CON: 'Landlord has not returned the signed contract',
  LOG: 'Import license pending with local authorities',
  FIN: 'Bank requires additional KYC documents from HQ',
  HR: 'Work permits pending for expatriate staff',
  CORP: 'Notarial documents require apostille',
  SP: 'Building permit awaiting municipality approval',
  NET: 'Telecom provider has no availability before opening',
  CMP: 'Local labelling rules not yet confirmed by authority',
  SAP: 'Waiting for fiscal printer certification',
  IM: 'Orders waiting for customer code',
};
const DECISION_TEXT: Record<string, string> = {
  CON: 'Accept landlord request for turnover-based rent',
  SP: 'Approve extra budget for MEP works',
  HR: 'Approve salary bands above local benchmark',
  LOG: 'Choose between direct import and local distributor',
  FIN: 'Select local auditor',
  RET: 'Confirm opening assortment depth',
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────────── Amsterdam Airport storyline ─────────────────────────────

interface AmsDef {
  id: string; area: string; title: string; desc?: string; start: number; due: number; owner: string; sec?: string;
  status?: string; p?: number; risk?: RiskLevel; pr?: RiskLevel; w?: number; dep?: string; blocker?: string; decision?: string; created?: number;
}
const AMS: AmsDef[] = [
  { id: 'CORP-001', area: 'CORP', title: 'Change of local company representative / authorized signatory', desc: 'Replace the local managing director as authorized signatory of Golden Goose Netherlands B.V.: notarial deed and Chamber of Commerce (KvK) filing.', start: -40, due: 5, owner: 'Marco Ferri', risk: 'Medium', pr: 'High' },
  { id: 'CORP-002', area: 'CORP', title: 'Power of attorney for Store Manager (local operations)', start: 10, due: 60, owner: 'Marco Ferri', pr: 'Medium' },
  { id: 'CORP-003', area: 'CORP', title: 'Local VAT and EORI registration check', start: -42, due: -15, owner: 'Roberto Villa', status: CORE_STATUS.inProgress, p: 50 },
  { id: 'CON-001', area: 'CON', title: 'Concession contract review and signature – Schiphol', desc: 'Contract under review with Schiphol Commercial; signature expected around end of September. Signature is a prerequisite for job offers and the construction permit.', start: -60, due: 2, owner: 'Giulia Rinaldi', status: CORE_STATUS.inProgress, p: 50, risk: 'High', pr: 'High', w: 3 },
  { id: 'CON-002', area: 'CON', title: 'Assess impact of contract signature on recruiting and construction permit', start: -20, due: 7, owner: 'Giulia Rinaldi', sec: 'Nicoletta Bisaro', dep: 'AMS-CON-001', risk: 'Medium' },
  { id: 'CON-003', area: 'CON', title: 'Landlord fit-out guidelines sign-off', start: -42, due: -12, owner: 'Alessandro Riva', status: CORE_STATUS.inProgress, p: 60 },
  { id: 'IT-001', area: 'IT', title: 'IT project kick-off with Schiphol IT', start: -45, due: -30, owner: 'Luca Bernardi', status: CORE_STATUS.inProgress, p: 80 },
  { id: 'IT-002', area: 'IT', title: 'Airport IT integration requirements (network security, VLAN, firewall)', start: -30, due: -4, owner: 'Luca Bernardi', status: CORE_STATUS.inProgress, p: 20, risk: 'Medium', pr: 'High', w: 2 },
  { id: 'IT-003', area: 'IT', title: 'Cybersecurity assessment for airport network connection', start: 0, due: 30, owner: 'Luca Bernardi', risk: 'Medium', created: -2 },
  { id: 'SAP-001', area: 'SAP', title: 'Store master data set-up in SAP (plant, storage locations)', start: -35, due: -14, owner: 'Andrea Colombo', status: CORE_STATUS.inProgress, p: 40 },
  { id: 'SAP-002', area: 'SAP', title: 'Set-up and testing of flows (sales, replenishment, returns)', start: -20, due: 20, owner: 'Andrea Colombo', w: 2 },
  { id: 'SAP-003', area: 'SAP', title: 'Duty-free pricing conditions and tax codes in SAP', start: 10, due: 40, owner: 'Andrea Colombo', sec: 'Roberto Villa' },
  { id: 'ERP-001', area: 'ERP', title: 'Handling company meeting to clarify customs and transport flows', start: -25, due: -5, owner: 'Andrea Colombo', sec: 'Elena Conti' },
  { id: 'ERP-002', area: 'ERP', title: 'Bonded-stock flow configuration (airside)', start: -5, due: 35, owner: 'Andrea Colombo', dep: 'AMS-ERP-001' },
  { id: 'POS-001', area: 'POS', title: 'POS integration with airport systems (sales reporting to Schiphol)', start: -30, due: 30, owner: 'Francesca Moretti', status: CORE_STATUS.inProgress, p: 10, risk: 'High', pr: 'High', w: 2 },
  { id: 'POS-002', area: 'POS', title: 'Boarding-pass scanning integration', start: 20, due: 75, owner: 'Francesca Moretti', risk: 'Medium' },
  { id: 'POS-003', area: 'POS', title: 'Payment terminals (PSP) contract for the Netherlands', start: -35, due: -6, owner: 'Francesca Moretti', status: CORE_STATUS.inProgress, p: 20, risk: 'Medium' },
  { id: 'ITH-001', area: 'ITH', title: 'Hardware purchase (POS, back-office PCs, printers)', start: -20, due: 25, owner: 'Stefano Galli', status: CORE_STATUS.onHold, p: 10, blocker: 'Awaiting budget release for hardware PO' },
  { id: 'ITH-002', area: 'ITH', title: 'Check additional documentation required for hardware shipment', start: -10, due: 3, owner: 'Stefano Galli', sec: 'Elena Conti', status: CORE_STATUS.inProgress, p: 20, risk: 'Medium' },
  { id: 'CRM-001', area: 'CRM', title: 'Salesforce users for store team', desc: 'Salesforce user creation and clienteling set-up waiting for Retail ticket.', start: -15, due: 10, owner: 'Chiara De Luca', risk: 'Medium' },
  { id: 'CRM-002', area: 'CRM', title: 'Customer journey set-up (travel retail)', start: 5, due: 50, owner: 'Chiara De Luca', dep: 'AMS-CRM-001', status: CORE_STATUS.onHold },
  { id: 'NET-001', area: 'NET', title: 'Internet line activation', start: -25, due: 25, owner: 'Stefano Galli', status: CORE_STATUS.inProgress, p: 10 },
  { id: 'NET-002', area: 'NET', title: 'In-store network and Wi-Fi design', start: 15, due: 70, owner: 'Stefano Galli' },
  { id: 'TEL-001', area: 'TEL', title: 'Order Apple devices for store team', desc: 'To be ordered once the local team structure is confirmed.', start: 0, due: 45, owner: 'Stefano Galli', dep: 'AMS-HR-002', status: CORE_STATUS.onHold },
  { id: 'TEL-002', area: 'TEL', title: 'SIM activation coordinated with Store Manager', start: 60, due: 100, owner: 'Stefano Galli', sec: 'Sophie van Dijk' },
  { id: 'FIN-001', area: 'FIN', title: 'Identify local auditors for statutory requirements', start: -30, due: -2, owner: 'Paolo Marchetti', status: CORE_STATUS.inProgress, p: 20, risk: 'Medium' },
  { id: 'FIN-002', area: 'FIN', title: 'Local bank account and cash-in-transit service', start: -40, due: -3, owner: 'Paolo Marchetti', sec: 'Roberto Villa', status: CORE_STATUS.inProgress, p: 70 },
  { id: 'FIN-003', area: 'FIN', title: 'Store budget and capex approval', start: -42, due: -28, owner: 'Paolo Marchetti', status: CORE_STATUS.inProgress, p: 90, w: 2 },
  { id: 'LOG-001', area: 'LOG', title: 'Handling company discussion on customs and merchandise flow', start: -25, due: 8, owner: 'Elena Conti', status: CORE_STATUS.inProgress, p: 20, risk: 'Medium' },
  { id: 'LOG-002', area: 'LOG', title: 'Customs warehouse (bonded) authorization', start: -10, due: 40, owner: 'Elena Conti', status: CORE_STATUS.inProgress, p: 10, risk: 'High', pr: 'High', w: 2 },
  { id: 'LOG-003', area: 'LOG', title: 'First merchandise shipment planning', start: 60, due: 120, owner: 'Elena Conti', sec: 'Matteo Greco' },
  { id: 'CMP-001', area: 'CMP', title: 'Meeting with airport representatives on compliance and labelling', start: -20, due: -3, owner: 'Davide Fontana', risk: 'Medium' },
  { id: 'CMP-002', area: 'CMP', title: 'Product labelling requirements check (NL/EN)', start: 10, due: 50, owner: 'Davide Fontana' },
  { id: 'CMP-003', area: 'CMP', title: 'Cosmetics and allergen labelling for travel products', start: 0, due: 45, owner: 'Davide Fontana', sec: 'Matteo Greco', risk: 'Medium', created: -3 },
  { id: 'HR-001', area: 'HR', title: 'Define store organization chart', start: -42, due: -20, owner: 'Nicoletta Bisaro', status: CORE_STATUS.inProgress, p: 70 },
  { id: 'HR-002', area: 'HR', title: 'Recruiting store team (Store Manager + 8 Sales Associates)', desc: 'Recruiting activities ongoing via local agency.', start: -35, due: -8, owner: 'Nicoletta Bisaro', status: CORE_STATUS.inProgress, p: 20, risk: 'Medium', pr: 'High', w: 2 },
  { id: 'HR-003', area: 'HR', title: 'Airport access passes for store staff', desc: 'Access passes may require significant lead time (background screening 6–8 weeks).', start: -5, due: 40, owner: 'Nicoletta Bisaro', risk: 'High', pr: 'High', w: 2 },
  { id: 'HR-004', area: 'HR', title: 'Job offers to selected candidates', desc: 'Job offers are impacted by the concession contract signature.', start: -10, due: 12, owner: 'Nicoletta Bisaro', dep: 'AMS-CON-001', status: CORE_STATUS.onHold, risk: 'High' },
  { id: 'HR-005', area: 'HR', title: 'Country blacklist verification for candidates', start: -12, due: 6, owner: 'Nicoletta Bisaro', sec: 'Marco Ferri', status: CORE_STATUS.inProgress, p: 20, risk: 'Medium' },
  { id: 'HR-006', area: 'HR', title: 'Training plan and onboarding at Milan HQ', start: 60, due: 110, owner: 'Nicoletta Bisaro' },
  { id: 'SP-001', area: 'SP', title: 'Store design final approval', start: -60, due: -25, owner: 'Alessandro Riva', status: CORE_STATUS.inProgress, p: 90 },
  { id: 'SP-002', area: 'SP', title: 'Construction permit submission to Schiphol', start: -20, due: 4, owner: 'Alessandro Riva', dep: 'AMS-CON-001', status: CORE_STATUS.inProgress, p: 40, risk: 'High', pr: 'High', w: 2 },
  { id: 'SP-003', area: 'SP', title: 'Construction start on site', start: 21, due: 100, owner: 'Alessandro Riva', risk: 'Medium', pr: 'High', w: 3, dep: 'AMS-SP-002' },
  { id: 'SP-004', area: 'SP', title: 'Contractor access pass process', start: -15, due: 14, owner: 'Alessandro Riva', sec: 'Valentina Costa', status: CORE_STATUS.inProgress, p: 30, risk: 'Medium' },
  { id: 'SP-005', area: 'SP', title: 'Furniture production and delivery', start: 30, due: 130, owner: 'Alessandro Riva', risk: 'Medium', w: 2 },
  { id: 'IM-001', area: 'IM', title: 'Indirect materials orders (packaging, shopping bags, consumables)', desc: 'Orders waiting for customer code.', start: -20, due: 12, owner: 'Sara Lombardi', status: CORE_STATUS.inProgress, p: 20 },
  { id: 'IM-002', area: 'IM', title: 'Store consumables list', start: -30, due: -9, owner: 'Sara Lombardi', status: CORE_STATUS.inProgress, p: 50 },
  { id: 'AR-001', area: 'AR', title: 'Travel products and assortment coordination', start: -20, due: 30, owner: 'Matteo Greco', sec: 'Martina Ricci', status: CORE_STATUS.inProgress, p: 20, risk: 'Medium' },
  { id: 'AR-002', area: 'AR', title: 'Opening allocation plan', start: 40, due: 110, owner: 'Matteo Greco' },
  { id: 'GS-001', area: 'GS', title: 'Cleaning and maintenance supplier discussions', start: -15, due: 20, owner: 'Valentina Costa', status: CORE_STATUS.inProgress, p: 20 },
  { id: 'GS-002', area: 'GS', title: 'Security and alarm service', start: 20, due: 80, owner: 'Valentina Costa' },
  { id: 'RET-001', area: 'RET', title: 'Travel concept definition', start: -40, due: 15, owner: 'Martina Ricci', status: CORE_STATUS.inProgress, p: 30, risk: 'Medium', pr: 'High' },
  { id: 'RET-002', area: 'RET', title: 'Store Manager onboarding and opening plan', start: 30, due: 130, owner: 'Federico Mancini' },
  { id: 'RET-003', area: 'RET', title: 'Opening event and PR activation', start: 60, due: 150, owner: 'Martina Ricci' },
];

interface Ev { day: number; h: number; m?: number; id: string; patch?: TaskPatch; note?: string; by?: string }
const EVENTS: Ev[] = [
  { day: -31, h: 16, id: 'IT-001', patch: { Status: 'Completed' }, by: 'Luca Bernardi' },
  { day: -30, h: 10, id: 'CORP-001', patch: { Progress_Percentage: 20 } },
  { day: -29, h: 15, id: 'FIN-003', patch: { Status: 'Completed' } },
  { day: -26, h: 11, id: 'SP-001', patch: { Status: 'Completed' }, note: 'Store design approved by Schiphol design committee' },
  { day: -24, h: 14, id: 'SAP-001', patch: { Progress_Percentage: 80 } },
  { day: -21, h: 9, id: 'HR-001', patch: { Status: 'Completed' } },
  // SAL 1 (first SAL, recap) at D-21 11:30
  { day: -20, h: 10, id: 'CON-001', patch: { Progress_Percentage: 65 }, note: 'Second round of legal comments sent to Schiphol' },
  { day: -20, h: 16, id: 'RET-003', patch: { Status: 'N/A' }, note: 'Not planned for airport store (landlord restrictions on events)' },
  { day: -19, h: 9, id: 'ERP-001', patch: { Status: 'In Progress', Progress_Percentage: 30 } },
  { day: -18, h: 12, id: 'IT-002', patch: { Progress_Percentage: 40 } },
  { day: -17, h: 10, id: 'CORP-003', patch: { Status: 'Completed' } },
  { day: -17, h: 15, id: 'RET-001', patch: { Progress_Percentage: 50 } },
  { day: -16, h: 9, id: 'CORP-001', patch: { Progress_Percentage: 40 }, note: 'Draft notarial deed shared with local notary' },
  { day: -16, h: 11, id: 'HR-002', patch: { Progress_Percentage: 40 } },
  { day: -16, h: 17, id: 'POS-001', patch: { Progress_Percentage: 25 } },
  { day: -15, h: 10, id: 'CRM-001', patch: { Status: 'On Hold', Blocker: 'Waiting for Retail ticket to be raised' } },
  { day: -15, h: 11, id: 'SAP-002', patch: { Progress_Percentage: 20 } },
  { day: -15, h: 14, id: 'POS-003', patch: { Progress_Percentage: 50 } },
  { day: -15, h: 16, id: 'LOG-001', patch: { Progress_Percentage: 40 } },
  // SAL 2 at D-14 11:30
  { day: -14, h: 15, id: 'IM-001', patch: { Status: 'Blocked', Blocker: 'Orders waiting for customer code from Finance' } },
  { day: -14, h: 16, id: 'NET-001', patch: { Progress_Percentage: 30 }, note: 'Airport representatives contacted for internet activation' },
  { day: -13, h: 10, id: 'CON-002', patch: { Progress_Percentage: 30 } },
  { day: -13, h: 12, id: 'AR-001', patch: { Decision_Required: 'Confirm travel-exclusive capsule quantities with Merchandising' } },
  { day: -12, h: 9, id: 'CON-001', patch: { Progress_Percentage: 80 } },
  { day: -12, h: 11, id: 'SAP-001', patch: { Status: 'Completed' }, by: 'Andrea Colombo' },
  { day: -12, h: 15, id: 'FIN-001', patch: { Progress_Percentage: 50 } },
  { day: -11, h: 10, id: 'SP-002', patch: { Progress_Percentage: 70 }, note: 'Permit file ready; submission subject to contract signature' },
  { day: -10, h: 9, id: 'CON-003', patch: { Status: 'Completed' } },
  { day: -10, h: 11, id: 'HR-004', patch: { Decision_Required: 'Authorize job offers before concession contract signature?', Risk_Level: 'High' } },
  { day: -10, h: 16, id: 'POS-001', patch: { Progress_Percentage: 40 } },
  { day: -9, h: 10, id: 'IM-002', patch: { Status: 'Completed' } },
  { day: -9, h: 12, id: 'CORP-001', patch: { Progress_Percentage: 60 } },
  { day: -9, h: 14, id: 'RET-001', patch: { Progress_Percentage: 60 } },
  { day: -9, h: 16, id: 'LOG-002', patch: { Progress_Percentage: 25 } },
  { day: -8, h: 11, id: 'SAP-002', patch: { Progress_Percentage: 35 } },
  // SAL 3 at D-7 11:30  — everything below feeds today's minutes
  { day: -6, h: 10, id: 'ERP-001', patch: { Status: 'Completed' }, note: 'Meeting held with handling company: customs and transport flows clarified, minutes shared' },
  { day: -6, h: 15, id: 'LOG-001', patch: { Progress_Percentage: 60 }, note: 'Handling company confirmed airside delivery windows' },
  { day: -5, h: 9, id: 'CON-001', patch: { Decision_Required: 'Approve final rent-escalation clause before signature' }, note: 'Legal comments returned to Schiphol; final version expected 29 Sep' },
  { day: -5, h: 11, id: 'FIN-002', patch: { Status: 'Completed' } },
  { day: -5, h: 14, id: 'GS-001', patch: { Owner: 'Sara Lombardi', Progress_Percentage: 40 }, note: 'Procurement takes over the supplier tender' },
  { day: -4, h: 10, id: 'SAP-002', patch: { Progress_Percentage: 50 }, note: 'Test cycle 1 passed for sales flow; replenishment flow testing next week' },
  { day: -4, h: 15, id: 'ITH-001', patch: { Status: 'In Progress', Blocker: '', Progress_Percentage: 30 }, note: 'Budget released: hardware purchase can proceed, PO issued to supplier' },
  { day: -3, h: 9, id: 'CORP-001', patch: { Progress_Percentage: 75 }, note: 'Notary appointment fixed for 2 Oct; KvK filing to follow' },
  { day: -3, h: 11, id: 'FIN-001', patch: { Decision_Required: 'Select statutory auditor between the two shortlisted firms' }, note: 'Two proposals received; fee comparison in shared folder' },
  { day: -3, h: 16, id: 'AR-001', patch: { Decision_Required: '', Progress_Percentage: 40 }, note: 'Capsule quantities confirmed by Merchandising' },
  { day: -2, h: 9, id: 'HR-002', patch: { Progress_Percentage: 70, Due_Date: '+2' as unknown as string }, note: 'Waiting for final candidate confirmation', by: 'Nicoletta Bisaro' },
  { day: -2, h: 11, id: 'IT-002', patch: { Status: 'Blocked', Blocker: 'Waiting for confirmation from Airport IT regarding integration requirements', Risk_Level: 'High' }, note: 'Escalated to Schiphol IT service manager' },
  { day: -2, h: 15, id: 'NET-001', patch: { Progress_Percentage: 40 }, note: 'Schiphol Telecom confirmed site survey on 6 Oct' },
  { day: -1, h: 10, id: 'POS-001', patch: { Due_Date: '+44' as unknown as string }, note: 'Schiphol interface spec v2 received; development re-planned with vendor' },
  { day: -1, h: 12, id: 'ERP-002', patch: { Progress_Percentage: 15 } },
  { day: -1, h: 14, id: 'CMP-001', note: 'Meeting request sent twice; awaiting Schiphol availability' },
  { day: -1, h: 16, id: 'SP-004', patch: { Blocker: 'Contractor badge applications rejected: missing certificates of conduct (VOG)', Risk_Level: 'High' } },
  { day: 0, h: 8, m: 40, id: 'HR-005', note: 'First 5 candidates cleared; 4 pending' },
];

// ───────────────────────────── builder ─────────────────────────────

export function buildSeed(anchor: Date = new Date()) {
  const base = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const today = toISODate(base);
  const d = (n: number) => addDaysISO(today, n);
  const at = (day: number, h = 10, m = 0) => {
    const x = addDays(base, day);
    x.setHours(h, m, 0, 0);
    return x;
  };
  const shift = (abs: string) => d(daysBetween(REF, abs));

  const settings = structuredClone(DEFAULT_SETTINGS);
  const areas: Area[] = SEED_AREAS.map((a) => ({ ...a, rev: '' }));
  const owners: Owner[] = SEED_OWNERS.map((o) => ({ ...o, rev: '' }));
  const history: HistoryEntry[] = [];
  const sals: SalRecord[] = [];
  const tasks: Task[] = [];

  const stores: Store[] = STORE_DEFS.map((s) => ({
    Store_ID: s.id,
    Store_Name: s.name,
    Country: s.country,
    City: s.city,
    Store_Type: s.type,
    Opening_Date: shift(s.opening),
    Opening_Date_Status: s.ods,
    Program_Type: s.program,
    Overall_Status: 'In Progress',
    Overall_Progress: 0,
    Risk_Level: s.id === 'AMS' ? 'Medium' : s.risk,
    Project_Manager: s.pm,
    Last_Update: at(-7, 9).toISOString(),
    Version: 1,
    rev: '',
  }));
  const storeById = new Map(stores.map((s) => [s.Store_ID, s]));

  // ── generic stores ──
  let r: () => number;
  for (const def of STORE_DEFS) {
    if (def.id === 'AMS') continue;
    r = rng(def.id.charCodeAt(0) * 7919 + def.id.charCodeAt(1) * 104729 + def.id.charCodeAt(2));
    const opening = shift(def.opening);
    const tpl = def.program === 'New Company' ? COMPANY_TPL : [...STORE_TPL, ...(def.type === 'Airport Store' ? AIRPORT_TPL : [])];
    const counters: Record<string, number> = {};
    let blockers = 0;
    let decisions = 0;
    for (const [area, title, startBefore, dueBefore, weight] of tpl) {
      counters[area] = (counters[area] ?? 0) + 1;
      const id = `${def.id}-${area}-${String(counters[area]).padStart(3, '0')}`;
      const jitter = Math.round((r() - 0.5) * 10);
      const start = addDaysISO(opening, -startBefore + jitter);
      const due = addDaysISO(opening, -dueBefore + jitter);
      const createdDay = Math.min(-20 - Math.floor(r() * 25), daysBetween(today, start) - 5);
      const created = at(Math.max(createdDay, -60), 9, Math.floor(r() * 50));
      let status: string = CORE_STATUS.notStarted;
      let progress = 0;
      let risk: RiskLevel = 'Low';
      let blocker = '';
      let decision = '';
      let completedDate = '';
      if (due < today) {
        if (r() < def.health) {
          status = CORE_STATUS.completed;
          progress = 100;
          const cd = addDaysISO(due, Math.round((r() - 0.7) * 8));
          completedDate = cd > today ? today : cd;
        } else {
          status = r() < 0.3 && blockers < 2 ? CORE_STATUS.blocked : CORE_STATUS.inProgress;
          progress = 40 + Math.floor(r() * 45);
          risk = r() < 0.5 ? 'High' : 'Medium';
        }
      } else if (start <= today) {
        const span = Math.max(1, daysBetween(start, due));
        const frac = daysBetween(start, today) / span;
        progress = Math.max(5, Math.min(95, Math.round((frac * (0.6 + r() * 0.7)) * 100 / 5) * 5));
        status = r() < 0.08 ? CORE_STATUS.onHold : CORE_STATUS.inProgress;
        if (r() > def.health + 0.1 && blockers < 2) status = CORE_STATUS.blocked;
        risk = daysBetween(today, due) < 21 && progress < 50 ? 'Medium' : 'Low';
      }
      if (status === CORE_STATUS.blocked) {
        blockers++;
        blocker = BLOCKER_TEXT[area] ?? 'Waiting for external confirmation';
        risk = 'High';
      }
      if (status !== CORE_STATUS.completed && DECISION_TEXT[area] && r() > def.health + 0.05 && decisions < 2) {
        decisions++;
        decision = DECISION_TEXT[area];
      }
      const t = blankTask(
        {
          Task_ID: id, Store_ID: def.id, Area: area, Task_Title: title, Start_Date: start, Due_Date: due,
          Owner: AREA_OWNER[area], Status: status, Progress_Percentage: progress, Risk_Level: risk,
          Priority: weight && weight > 1 ? 'High' : 'Medium', Task_Weight: weight ?? 1, Blocker: blocker, Decision_Required: decision,
          Completed_Date: completedDate, Created_At: created.toISOString(),
        },
        { user: SYSTEM_USER, now: created },
      );
      tasks.push(t);
      history.push(createdHistory(t, { user: SYSTEM_USER, now: created }));
      // a plausible trail of changes
      if (status === CORE_STATUS.completed) {
        const when = at(Math.max(daysBetween(today, completedDate), -55), 10 + Math.floor(r() * 7), Math.floor(r() * 59));
        if (when > created) history.push(hist(t, 'Status', CORE_STATUS.inProgress, CORE_STATUS.completed, when, t.Owner));
      } else if (status !== CORE_STATUS.notStarted) {
        const when = at(-Math.floor(r() * 12), 9 + Math.floor(r() * 9), Math.floor(r() * 59));
        if (when > created) {
          history.push(hist(t, 'Progress_Percentage', String(Math.max(0, progress - 15 - Math.floor(r() * 3) * 5)), String(progress), when, SYSTEM_USER));
          if (status === CORE_STATUS.blocked) history.push(hist(t, 'Status', CORE_STATUS.inProgress, CORE_STATUS.blocked, new Date(when.getTime() + 60000), SYSTEM_USER));
          if (blocker) history.push(hist(t, 'Blocker', '', blocker, new Date(when.getTime() + 90000), SYSTEM_USER));
          if (r() < 0.35) history.push({ ...noteHistory(t, genericNote(area, r), { user: t.Owner, now: new Date(when.getTime() + 120000) }) });
        }
      }
      t.Last_Update = history.filter((h) => h.Task_ID === t.Task_ID).map((h) => h.Timestamp).sort().pop() ?? t.Last_Update;
    }
  }

  // ── Amsterdam Airport: event-sourced ──
  const ams = storeById.get('AMS')!;
  const amsTasks = new Map<string, Task>();
  const created0 = at(-42, 9, 5);
  const pending = AMS.filter((a) => a.created !== undefined);
  for (const a of AMS) {
    if (a.created !== undefined) continue;
    amsTasks.set(a.id, makeAms(a, created0));
  }
  function makeAms(a: AmsDef, when: Date): Task {
    const t = blankTask(
      {
        Task_ID: `AMS-${a.id}`, Store_ID: 'AMS', Area: a.area, Task_Title: a.title, Description: a.desc ?? '',
        Start_Date: d(a.start), Due_Date: d(a.due), Owner: a.owner, Secondary_Owner: a.sec ?? '', Status: a.status ?? CORE_STATUS.notStarted,
        Progress_Percentage: a.p ?? 0, Risk_Level: a.risk ?? 'Low', Priority: a.pr ?? 'Medium', Task_Weight: a.w ?? 1, Dependency: a.dep ?? '',
        Blocker: a.blocker ?? '', Decision_Required: a.decision ?? '',
      },
      { user: SYSTEM_USER, now: when },
    );
    history.push(createdHistory(t, { user: SYSTEM_USER, now: when }));
    return t;
  }

  const salTimes = [-21, -14, -7];
  type Step = { when: Date; run: () => void };
  const steps: Step[] = [];
  for (const ev of EVENTS) {
    steps.push({
      when: at(ev.day, ev.h, ev.m ?? 0),
      run: () => {
        const now = at(ev.day, ev.h, ev.m ?? 0);
        const task = amsTasks.get(ev.id);
        if (!task) return;
        const user = ev.by ?? SYSTEM_USER;
        let cur = task;
        if (ev.patch) {
          const patch = { ...ev.patch };
          if (typeof patch.Due_Date === 'string' && /^[+-]\d+$/.test(patch.Due_Date)) patch.Due_Date = d(parseInt(patch.Due_Date, 10));
          const res = applyTaskPatch(cur, patch, { user, now });
          cur = res.task;
          history.push(...res.history);
        }
        if (ev.note) history.push(noteHistory(cur, ev.note, { user, now: new Date(now.getTime() + 1000) }));
        amsTasks.set(ev.id, cur);
      },
    });
  }
  for (const a of pending) {
    steps.push({ when: at(a.created!, 10, 15), run: () => amsTasks.set(a.id, makeAms(a, at(a.created!, 10, 15))) });
  }
  steps.push({
    when: at(-2, 17, 30),
    run: () => {
      const res = applyStorePatch(ams, { Risk_Level: 'High' }, { user: SYSTEM_USER, now: at(-2, 17, 30) });
      Object.assign(ams, res.store);
      history.push(...res.history);
    },
  });
  for (const day of salTimes) {
    steps.push({
      when: at(day, 11, 30),
      run: () => {
        const now = at(day, 11, 30);
        const salDate = toISODate(now);
        const cur = [...amsTasks.values()];
        const prev = sals[sals.length - 1];
        const baseline = prev
          ? { mode: 'diff' as const, timestamp: prev.Confirmation_Timestamp, snapshot: parseSnapshot(prev.Snapshot_JSON), previousSalDate: prev.SAL_Date, previousSalId: prev.SAL_ID, isFirst: false }
          : firstSalBaseline({});
        const data = detectChanges({ store: ams, tasks: cur, history, areas, settings, baseline, now, today: salDate });
        const doc = standardTemplate.build(data);
        const generated = renderText(doc);
        if (day === -7) doc.comments = 'Next SAL confirmed for next Monday. Contract signature to be escalated to Retail Director if not signed by 30 Sep.';
        const snapshot = buildSalSnapshot(ams, cur, areas, settings, salDate);
        sals.push({
          SAL_ID: `SAL-AMS-${salDate.replace(/-/g, '')}`,
          Store_ID: 'AMS',
          SAL_Date: salDate,
          Previous_SAL_Date: prev?.SAL_Date ?? '',
          Baseline_Timestamp: prev?.Confirmation_Timestamp ?? '',
          Generation_Timestamp: new Date(now.getTime() - 4 * 60000).toISOString(),
          Confirmation_Timestamp: now.toISOString(),
          Generated_Minutes: generated,
          Final_Minutes: renderText(doc),
          Confirmed: true,
          Created_By: SYSTEM_USER,
          Minutes_JSON: JSON.stringify({ doc, included: data.areas.flatMap((a) => a.items.map((i) => ({ taskId: i.task.Task_ID, area: a.area.Area_ID, signals: i.signals }))) }),
          Snapshot_JSON: JSON.stringify(snapshot),
        });
      },
    });
  }
  steps.sort((a, b) => a.when.getTime() - b.when.getTime());
  for (const s of steps) s.run();
  tasks.push(...amsTasks.values());

  // store progress cache + last update
  for (const s of stores) {
    const st = tasks.filter((t) => t.Store_ID === s.Store_ID && !t.Archived && t.Status !== CORE_STATUS.na);
    s.Overall_Progress = st.length ? Math.round(st.reduce((n, t) => n + (t.Status === CORE_STATUS.completed ? 100 : t.Progress_Percentage), 0) / st.length) : 0;
    const last = history.filter((h) => h.Store_ID === s.Store_ID).map((h) => h.Timestamp).sort().pop();
    if (last) s.Last_Update = last;
  }

  history.sort((a, b) => a.Timestamp.localeCompare(b.Timestamp));
  return { stores, tasks, history, areas, owners, sals, settings, today };
}

function hist(t: Task, field: string, prev: string, next: string, when: Date, by: string): HistoryEntry {
  return {
    History_ID: `H-${t.Task_ID}-${field.slice(0, 3).toUpperCase()}-${when.getTime().toString(36)}`.toUpperCase(),
    Task_ID: t.Task_ID,
    Store_ID: t.Store_ID,
    Timestamp: when.toISOString(),
    Field_Changed: field,
    Previous_Value: prev,
    New_Value: next,
    Note: '',
    Updated_By: by,
  };
}

function genericNote(area: string, r: () => number): string {
  const notes: Record<string, string[]> = {
    CON: ['Landlord feedback received on draft', 'Final draft shared with Legal'],
    HR: ['Shortlist of candidates shared with Retail', 'Second-round interviews scheduled'],
    LOG: ['Forwarder quotation received', 'Customs broker appointed'],
    SP: ['Contractor tender closed; 3 offers received', 'Site survey completed'],
    FIN: ['KYC documents sent to bank', 'Draft budget shared with Controlling'],
    SAP: ['Test scripts prepared', 'Configuration transported to QA'],
    IT: ['Local IT partner onboarded'],
    NET: ['Provider survey scheduled'],
  };
  const list = notes[area] ?? ['Follow-up call held with local team', 'Waiting for feedback from local partner'];
  return list[Math.floor(r() * list.length)];
}

/** Raw tables ready to be written to Google Sheets or the local JSON store. */
export function buildSeedTables(anchor: Date = new Date()): RawTables {
  const s = buildSeed(anchor);
  return {
    STORES: s.stores.map(serializeStore),
    TASKS: s.tasks.map(serializeTask),
    TASK_HISTORY: s.history.map(serializeHistory),
    AREAS: s.areas.map(serializeArea),
    OWNERS: s.owners.map(serializeOwner),
    SAL_HISTORY: s.sals.map(serializeSal),
    SETTINGS: serializeSettings(s.settings),
  };
}

