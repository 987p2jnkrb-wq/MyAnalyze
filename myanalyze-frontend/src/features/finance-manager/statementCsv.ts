export function normalizeStatementHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl-PL")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function delimiterFor(text: string): string {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, candidate) => {
    const count = firstLine.split(candidate).length;
    return count > best.count ? { delimiter: candidate, count } : best;
  }, { delimiter: ",", count: 0 }).delimiter;
}

export function parseCsv(text: string, separator?: string): string[][] {
  const delimiter = separator || delimiterFor(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("Plik CSV zawiera niezamknięte pole w cudzysłowie.");
  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

export function statementColumnIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const exact = headers.indexOf(alias);
    if (exact >= 0) return exact;
  }
  for (const alias of aliases) {
    const partial = headers.findIndex((header) => header.includes(alias));
    if (partial >= 0) return partial;
  }
  return -1;
}

export function parseStatementAmount(value: string): number | null {
  let normalized = value.trim().replace(/[−–-]/g, "-").replace(/\s|\u00a0/g, "");
  if (!normalized) return null;
  const negativeParentheses = normalized.startsWith("(") && normalized.endsWith(")");
  normalized = normalized.replace(/[()]/g, "").replace(/[^0-9,.-]/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negativeParentheses ? -Math.abs(parsed) : parsed;
}

function validDate(year: number, month: number, day: number): boolean {
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseStatementDate(value: string): string | null {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, year, month, day] = iso;
    return validDate(Number(year), Number(month), Number(day)) ? `${year}-${month}-${day}` : null;
  }
  const european = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!european) return null;
  const [, day, month, year] = european;
  if (!validDate(Number(year), Number(month), Number(day))) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseStatementOccurredAt(value: string, date: string): string {
  const time = value.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!time) return `${date}T12:00:00`;
  const hour = Number(time[1]);
  const minute = Number(time[2]);
  const second = Number(time[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) return `${date}T12:00:00`;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

export async function readStatementFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("windows-1250").decode(bytes);
  } catch {
    return utf8;
  }
}
