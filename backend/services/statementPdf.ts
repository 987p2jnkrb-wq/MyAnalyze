import pdfParse from 'pdf-parse';

export interface StatementPdfTextCell {
  text: string;
  x: number;
  width: number;
}

export interface StatementPdfTextRow {
  y: number;
  text: string;
  cells: StatementPdfTextCell[];
}

export interface StatementPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  rows: StatementPdfTextRow[];
}

export interface StatementPdfExtraction {
  text: string;
  pageCount: number;
  pages: StatementPdfPage[];
}

interface PdfJsTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function rowsFromItems(items: PdfJsTextItem[]): StatementPdfTextRow[] {
  const positioned = items
    .map((item) => ({
      text: cleanText(item.str),
      x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0),
      width: Math.max(0, Number(item.width ?? 0)),
    }))
    .filter((item) => item.text && Number.isFinite(item.x) && Number.isFinite(item.y));

  // PDF text is positioned bottom-up. Items rendered on the same visual line
  // often differ by fractions of a point, so use a small tolerance instead of
  // assuming an exact y coordinate.
  positioned.sort((left, right) => right.y - left.y || left.x - right.x);
  const lineGroups: Array<{ y: number; items: typeof positioned }> = [];
  for (const item of positioned) {
    const line = lineGroups.find((candidate) => Math.abs(candidate.y - item.y) <= 2.25);
    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
    } else {
      lineGroups.push({ y: item.y, items: [item] });
    }
  }

  return lineGroups
    .sort((left, right) => right.y - left.y)
    .map((line) => {
      const cells = line.items
        .sort((left, right) => left.x - right.x)
        .map((item) => ({ text: item.text, x: item.x, width: item.width }));
      return { y: line.y, text: cells.map((cell) => cell.text).join(' ').replace(/\s+/g, ' ').trim(), cells };
    })
    .filter((row) => row.text);
}

type PdfParseOptions = NonNullable<Parameters<typeof pdfParse>[1]>;
type PdfParsePageRenderer = NonNullable<PdfParseOptions["pagerender"]>;
type PdfParsePageData = Parameters<PdfParsePageRenderer>[0];

interface PdfJsViewportLike {
  width?: number;
  height?: number;
}

interface PdfJsPageLike {
  pageNumber?: number;
  getViewport: (options: { scale: number } | number) => PdfJsViewportLike;
  getTextContent: (options?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }) => Promise<{ items?: PdfJsTextItem[] }>;
}

function pageViewport(page: PdfJsPageLike): PdfJsViewportLike {
  try {
    return page.getViewport({ scale: 1 });
  } catch {
    // Older PDF.js builds used getViewport(scale). Keep extraction compatible
    // without changing the statement classification rules.
    return page.getViewport(1);
  }
}

export async function extractStatementPdf(buffer: Buffer): Promise<StatementPdfExtraction> {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Plik nie jest prawidłowym dokumentem PDF.');
  }

  const pages: StatementPdfPage[] = [];
  const pagerender: PdfParsePageRenderer = async (pageData: PdfParsePageData) => {
    const page = pageData as unknown as PdfJsPageLike;
    const viewport = pageViewport(page);
    const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    pages.push({
      pageNumber: Number(page.pageNumber ?? pages.length + 1),
      width: Number(viewport?.width ?? 0),
      height: Number(viewport?.height ?? 0),
      rows: rowsFromItems(content?.items ?? []),
    });
    // pdf-parse normally concatenates page text. We build it ourselves from
    // positioned rows so the same ordering is used by preview and detection.
    return '';
  };
  const data = await pdfParse(buffer, { pagerender });

  pages.sort((left, right) => left.pageNumber - right.pageNumber);
  const text = pages.map((page) => page.rows.map((row) => row.text).join('\n')).join('\n\f\n').trim();
  if (!text) throw new Error('PDF nie zawiera możliwej do odczytania warstwy tekstowej.');
  return { text, pageCount: Number(data.numpages || pages.length), pages };
}
