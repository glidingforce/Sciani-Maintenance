import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import type { Contact, DateOnly, Task } from '../types';
import { describeFilters, reportCounts, selectReportTasks, toRow, type ReportFilters } from '../lib/report';
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
  { key: 'title', header: 'Task', width: 48 },
  { key: 'area', header: 'Area / equipment', width: 28 },
  { key: 'responsible', header: 'Responsible', width: 32 },
  { key: 'status', header: 'Status · priority', width: 32 },
  { key: 'due', header: 'Work due', width: 22 },
  { key: 'next', header: 'Next action · follow-up', width: 56 },
  { key: 'mgmt', header: 'Blocker · management action', width: 55 },
] as const;

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
  pages: number;
}

export async function buildReport(tasks: Task[], contacts: Contact[], filters: ReportFilters, today: DateOnly, now = new Date()): Promise<ReportResult> {
  const selected = selectReportTasks(tasks, contacts, filters, today);
  const counts = reportCounts(selected, today);
  const rows = selected.map((t) => toRow(t, contacts, today));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  setupFonts(doc);
  doc.setProperties({ title: 'Scinai Facility Maintenance: Open Tasks', subject: 'Maintenance report', creator: 'Scinai Maintenance' });
  const pageW = doc.internal.pageSize.getWidth();
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
  doc.text('Facility Maintenance: Open Tasks', MARGIN + 36, y + 7);
  doc.setFont('Rubik', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Generated ${generated} (Israel time)`, pageW - MARGIN, y + 7, { align: 'right' });
  y += 16;

  const filterText = describeFilters(filters);
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const scope = filterText.length ? `Filters: ${filterText.join(' · ')}` : 'Scope: all unfinished tasks, including waiting, blocked and unscheduled work (no filters).';
  y += drawText(doc, scope, MARGIN, y, pageW - 2 * MARGIN) * 4.2;

  // Summary counts
  const boxes: [string, number, boolean][] = [
    ['Open', counts.open, false],
    ['Overdue', counts.overdue, counts.overdue > 0],
    ['High priority', counts.high, false],
    ['Waiting', counts.waiting, false],
    ['Blocked', counts.blocked, counts.blocked > 0],
  ];
  const boxW = 40;
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
    doc.text(label, x + 14, y + 8.3);
  });
  doc.setFontSize(7.5);
  doc.text('Waiting = waiting on someone else. Blocked = a blocker is recorded. A task can be both.', MARGIN, y + 18);
  y += 22;

  // ---- Table ----
  const body = rows.map((r) => ({
    title: r.title,
    area: r.area,
    responsible: r.responsible,
    status: `${r.status}\n${r.priority} priority`,
    due: r.due ? `${fmt(r.due)}${r.overdue ? '\nOverdue' : ''}` : 'Not scheduled',
    next: [r.nextAction, r.followUp ? `Follow-up: ${fmt(r.followUp)}` : ''].filter(Boolean).join('\n'),
    mgmt: [r.blocker ? `Blocker: ${r.blocker}` : '', r.managementAction ? `Management action: ${r.managementAction}` : ''].filter(Boolean).join('\n'),
    _overdue: r.overdue,
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
    didParseCell: (data: CellHookData) => {
      if (data.section !== 'body') return;
      const key = data.column.dataKey as string;
      const raw = String((data.row.raw as Record<string, unknown>)[key] ?? '');
      const width = (COLS.find((c) => c.key === key)?.width ?? 30) - 2 * PAD - 0.6;
      doc.setFont('Rubik', key === 'title' ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      const { lines, rtl } = layout(doc, raw, width);
      data.cell.text = lines;
      data.cell.styles.halign = rtl ? 'right' : 'left';
      if (key === 'title') data.cell.styles.fontStyle = 'bold';
      if (key === 'due' && (data.row.raw as { _overdue: boolean })._overdue) data.cell.styles.textColor = OVERDUE;
      if (key === 'due' && raw === 'Not scheduled') data.cell.styles.textColor = MUTED;
    },
    didDrawPage: () => {
      // Compact running header on continuation pages.
      if (doc.getNumberOfPages() > 1) {
        doc.setFont('Rubik', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...PLUM);
        doc.text('Scinai · Facility Maintenance: Open Tasks', MARGIN, MARGIN + 4);
        doc.setFont('Rubik', 'normal');
        doc.setTextColor(...MUTED);
        doc.text(`Generated ${generated}`, pageW - MARGIN, MARGIN + 4, { align: 'right' });
      }
    },
  });

  if (rows.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('No unfinished tasks match these filters.', MARGIN, y + 16);
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
    pages,
  };
}
