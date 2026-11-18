import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import type { Contact, DateOnly, Task } from '../types';
import { closedRow, closedWindowStart, describeFilters, reportCounts, selectClosedTasks, selectReportTasks, toRow, type ReportFilters } from '../lib/report';
import { RUBIK_BOLD, RUBIK_REGULAR } from './fonts';
import { isRtl, toVisual } from './bidi';
import logoUrl from '../assets/scinai-logo.png';

const PLUM: [number, number, number] = [76, 16, 69];
const INK: [number, number, number] = [52, 44, 52];
const MUTED: [number, number, number] = [107, 97, 105];
const OVERDUE: [number, number, number] = [163, 36, 59];
const LINE: [number, number, number] = [234, 226, 231];
const PALE: [number, number, number] = [244, 230, 235];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Date-only values are formatted from their text: no time-zone conversion can shift them. */
const fmt = (d?: DateOnly) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '');

const MARGIN = 12;
const PAD = 1.8;
// Landscape A4 is 297 mm wide: 273 mm of table.
const COLS = [
  { key: 'title', header: 'Record · category', width: 44 },
  { key: 'equip', header: 'Equipment · room · area', width: 34 },
  { key: 'responsible', header: 'Responsible', width: 28 },
  { key: 'status', header: 'Status · priority', width: 28 },
  { key: 'due', header: 'Work due', width: 23 },
  { key: 'opened', header: 'Opened', width: 23 },
  { key: 'next', header: 'Next action · follow-up', width: 47 },
  { key: 'mgmt', header: 'Blocker · management action', width: 46 },
] as const;

const CLOSED_COLS = [
  { key: 'title', header: 'Record · category', width: 45 },
  { key: 'equip', header: 'Equipment · room · area', width: 36 },
  { key: 'responsible', header: 'Responsible', width: 27 },
  { key: 'priority', header: 'Priority', width: 18 },
  { key: 'opened', header: 'Opened', width: 22 },
  { key: 'closed', header: 'Closed', width: 22 },
  { key: 'days', header: 'Days open', width: 18 },
  { key: 'outcome', header: 'Outcome', width: 24 },
  { key: 'completion', header: 'Work done · resolution', width: 61 },
] as const;

const daysText = (n: number) => (n === 1 ? '1 day' : `${n} days`);

function setupFonts(doc: jsPDF) {
  doc.addFileToVFS('Rubik-Regular.ttf', RUBIK_REGULAR);
  doc.addFont('Rubik-Regular.ttf', 'Rubik', 'normal');
  doc.addFileToVFS('Rubik-Bold.ttf', RUBIK_BOLD);
  doc.addFont('Rubik-Bold.ttf', 'Rubik', 'bold');
  doc.setFont('Rubik', 'normal');
}

/** Wraps each paragraph in logical order, then converts each line to visual order.
 * Returns lines plus whether the cell reads right-to-left. */
function layout(doc: jsPDF, text: string, width: number): { lines: string[]; rtl: boolean } {
  const paragraphs = text.split('\n').filter((p, _i, a) => p || a.length === 1);
  const rtl = paragraphs.length > 0 && isRtl(paragraphs[0]);
  const lines: string[] = [];
  for (const p of paragraphs) {
    const pRtl = isRtl(p);
    for (const l of doc.splitTextToSize(p, width) as string[]) lines.push(toVisual(l, pRtl));
  }
  return { lines, rtl };
}

/** Draws text that may contain Hebrew at (x, y); align "right" means x is the right edge. */
function drawText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, align: 'left' | 'right' = 'left') {
  const { lines } = layout(doc, text, maxWidth);
  doc.text(lines, x, y, { align });
  return lines.length;
}

function makeParseCell(doc: jsPDF) {
  return (cols: readonly { key: string; width: number }[]) => (data: CellHookData) => {
    if (data.section !== 'body') return;
    const key = data.column.dataKey as string;
    const rowRaw = data.row.raw as Record<string, unknown>;
    const raw = String(rowRaw[key] ?? '');
    const width = (cols.find((c) => c.key === key)?.width ?? 30) - 2 * PAD - 0.6;
    doc.setFont('Rubik', key === 'title' ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    const { lines, rtl } = layout(doc, raw, width);
    data.cell.text = lines;
    data.cell.styles.halign = rtl ? 'right' : 'left';
    if (key === 'title') data.cell.styles.fontStyle = 'bold';
    if (key === 'due' && rowRaw._overdue) data.cell.styles.textColor = OVERDUE;
    if (key === 'due' && raw === 'Not scheduled') data.cell.styles.textColor = MUTED;
    if (key === 'opened' && Number(rowRaw._days) >= 14) data.cell.styles.textColor = OVERDUE;
  };
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = logoUrl;
  });
}

export interface ReportResult {
  blob: Blob;
  fileName: string;
  rowCount: number;
  closedCount: number;
  pages: number;
}

export async function buildReport(tasks: Task[], contacts: Contact[], filters: ReportFilters, today: DateOnly, now = new Date()): Promise<ReportResult> {
  const selected = selectReportTasks(tasks, contacts, filters, today);
  const counts = reportCounts(selected, today);
  const rows = selected.map((t) => toRow(t, contacts, today));
  const closed = selectClosedTasks(tasks, contacts, filters, today).map((t) => closedRow(t, contacts, today));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  setupFonts(doc);
  doc.setProperties({ title: 'Scinai Maintenance & Purchasing', subject: 'Maintenance and purchasing report', creator: 'Scinai Maintenance' });
  const pageW = doc.internal.pageSize.getWidth();
  const parseCell = makeParseCell(doc);
  const logo = await loadLogo();
  const generated = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  // ---- First-page header and summary ----
  let y = MARGIN;
  if (logo) doc.addImage(logo, 'PNG', MARGIN, y, 30, 10);
  doc.setFont('Rubik', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PLUM);
  doc.text('Maintenance & Purchasing', MARGIN + 36, y + 7);
  doc.setFont('Rubik', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Generated ${generated} (Israel time)`, pageW - MARGIN, y + 7, { align: 'right' });
  y += 16;

  const filterText = describeFilters(filters);
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const scope = filterText.length ? `Filters: ${filterText.join(' · ')}` : 'Scope: all open maintenance and purchasing records, including waiting, blocked and unscheduled work (no filters).';
  y += drawText(doc, scope, MARGIN, y, pageW - 2 * MARGIN) * 4.2;

  // Summary counts
  const boxes: [string, number, boolean][] = [
    ['Open', counts.open, false],
    ['Overdue', counts.overdue, counts.overdue > 0],
    ['High priority', counts.high, false],
    ['Waiting', counts.waiting, false],
    ['Blocked', counts.blocked, counts.blocked > 0],
    ['Closed, last 7 days', closed.length, false],
  ];
  const boxW = 41;
  boxes.forEach(([label, value, warn], i) => {
    const x = MARGIN + i * (boxW + 4);
    doc.setFillColor(...(warn ? ([251, 236, 239] as [number, number, number]) : PALE));
    doc.roundedRect(x, y, boxW, 13, 1.5, 1.5, 'F');
    doc.setFont('Rubik', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...(warn ? OVERDUE : PLUM));
    doc.text(String(value), x + 4, y + 8.5);
    doc.setFont('Rubik', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(label, x + (value > 99 ? 17 : 13), y + 8.3);
  });
  doc.setFontSize(7.5);
  doc.text('Waiting = waiting on someone else. Blocked = a blocker is recorded. A record can be both.', MARGIN, y + 18);
  y += 22;

  // ---- Table ----
  const body = rows.map((r) => ({
    title: [r.title, r.category, r.reference ? `Ref: ${r.reference}` : ''].filter(Boolean).join('\n'),
    equip: [r.equipment, r.area].filter(Boolean).join('\n'),
    opened: `${fmt(r.opened)}\n${daysText(r.daysOpen)}`,
    responsible: r.responsible,
    status: `${r.status}\n${r.priority} priority`,
    due: r.due ? `${fmt(r.due)}${r.overdue ? '\nOverdue' : ''}` : 'Not scheduled',
    next: [r.nextAction, r.followUp ? `Follow-up: ${fmt(r.followUp)}` : ''].filter(Boolean).join('\n'),
    mgmt: [r.blocker ? `Blocker: ${r.blocker}` : '', r.managementAction ? `Management action: ${r.managementAction}` : ''].filter(Boolean).join('\n'),
    _overdue: r.overdue,
    _days: r.daysOpen,
  }));

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + 12, bottom: MARGIN + 6 },
    columns: COLS.map((c) => ({ header: c.header, dataKey: c.key })),
    body,
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    theme: 'plain',
    styles: { font: 'Rubik', fontSize: 8.5, cellPadding: PAD, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: 'top', overflow: 'linebreak' },
    headStyles: { font: 'Rubik', fontStyle: 'bold', textColor: PLUM, fillColor: PALE, fontSize: 8 },
    columnStyles: Object.fromEntries(COLS.map((c) => [c.key, { cellWidth: c.width }])),
    didParseCell: parseCell(COLS),
  });

  if (rows.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('No open records match these filters.', MARGIN, y + 16);
  }

  // ---- Closed in the last 7 days: its own section on a new page ----
  doc.addPage();
  let cy = MARGIN + 14;
  doc.setFont('Rubik', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...PLUM);
  doc.text(`Closed in the last 7 days (${fmt(closedWindowStart(today))} to ${fmt(today)})`, MARGIN, cy);
  doc.setFont('Rubik', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const closedScope = [filters.category && describeFilters({ ...filters, area: '', responsible: '', priority: '', status: 'all', dueBy: '' })[0], filters.area && `Area / room: ${filters.area}`, filters.responsible && `Responsible: ${filters.responsible}`, filters.priority && `Priority: ${filters.priority}`].filter(Boolean);
  cy += 5;
  doc.text(
    `${closed.length} record${closed.length === 1 ? '' : 's'} closed.${closedScope.length ? ` Filters: ${closedScope.join(' · ')}.` : ''} Status and due-date filters apply to open records only.`,
    MARGIN,
    cy,
  );
  cy += 4;
  if (closed.length === 0) {
    doc.setFontSize(10);
    doc.text('No records were closed in this period.', MARGIN, cy + 8);
  } else {
    autoTable(doc, {
      startY: cy,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN + 12, bottom: MARGIN + 6 },
      columns: CLOSED_COLS.map((c) => ({ header: c.header, dataKey: c.key })),
      body: closed.map((r) => ({
        title: [r.title, r.category, r.reference ? `Ref: ${r.reference}` : ''].filter(Boolean).join('\n'),
        equip: [r.equipment, r.area].filter(Boolean).join('\n'),
        responsible: r.responsible,
        priority: r.priority,
        opened: fmt(r.opened),
        closed: fmt(r.closed),
        days: daysText(r.daysOpen),
        outcome: r.outcome,
        completion: r.completionNote || 'Not recorded',
      })),
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      theme: 'plain',
      styles: { font: 'Rubik', fontSize: 8.5, cellPadding: PAD, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: 'top', overflow: 'linebreak' },
      headStyles: { font: 'Rubik', fontStyle: 'bold', textColor: PLUM, fillColor: [233, 243, 238], fontSize: 8 },
      columnStyles: Object.fromEntries(CLOSED_COLS.map((c) => [c.key, { cellWidth: c.width }])),
      didParseCell: parseCell(CLOSED_COLS),
    });
  }
  // Running header on the closed page(s) too.
  for (let i = 2; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.setFont('Rubik', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PLUM);
    doc.text('Scinai · Facility Maintenance report', MARGIN, MARGIN + 4);
    doc.setFont('Rubik', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${generated}`, pageW - MARGIN, MARGIN + 4, { align: 'right' });
  }

  // Page numbers, drawn after the table so the total is known.
  const pages = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('Rubik', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} of ${pages}`, pageW - MARGIN, pageH - 7, { align: 'right' });
    doc.text('Scinai · internal maintenance report', MARGIN, pageH - 7);
  }

  return {
    blob: doc.output('blob'),
    fileName: `Scinai-maintenance-report-${today}.pdf`,
    rowCount: rows.length,
    closedCount: closed.length,
    pages,
  };
}
