import React from "react";
import Button from "../../components/Button";
import { parseCsv } from "./statementCsv";
import { detectStatementColumns, type StatementColumnMapping, type StatementCsvLayout } from "./statementImport";

const fields: Array<[keyof StatementColumnMapping, string]> = [
  ["date", "Data operacji *"], ["amount", "Kwota ze znakiem (+ wpływ, − wydatek)"],
  ["debit", "Osobna kwota wydatku"], ["credit", "Osobna kwota przychodu"],
  ["description", "Opis / nazwa"], ["currency", "Waluta"], ["counterparty", "Kontrahent"],
  ["type", "Rodzaj operacji"], ["externalId", "Unikalne ID bankowe (opcjonalnie)"],
  ["instrument", "Rachunek / karta w pliku"], ["status", "Status bankowy"],
  ["startedDate", "Data rozpoczęcia / autoryzacji"], ["fee", "Prowizja do odjęcia od kwoty"],
];

export default function StatementCsvMapping({ text, currency, busy, onApply }: {
  text: string; currency: string; busy: boolean; onApply: (layout: StatementCsvLayout) => Promise<void>;
}) {
  const [separator, setSeparator] = React.useState("");
  const [headerRow, setHeaderRow] = React.useState(0);
  const [overrides, setOverrides] = React.useState<Partial<StatementColumnMapping>>({});
  const parsed = React.useMemo(() => {
    try { return { rows: parseCsv(text, separator), error: "" }; }
    catch (error) { return { rows: [], error: error instanceof Error ? error.message : "Nie można odczytać CSV." }; }
  }, [text, separator]);
  const headers = parsed.rows[headerRow] ?? [];
  const mapping = { ...detectStatementColumns(headers), ...overrides };
  const ready = headers.length > 0 && mapping.date >= 0 && (mapping.amount >= 0 || mapping.debit >= 0 || mapping.credit >= 0)
    && !(mapping.debit >= 0 && mapping.debit === mapping.credit)
    && !(mapping.fee >= 0 && [mapping.amount, mapping.debit, mapping.credit].includes(mapping.fee));
  const inputClass = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
  return <details className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
    <summary className="cursor-pointer font-semibold text-blue-900">Dopasuj kolumny CSV - inny układ lub błędny podgląd</summary>
    <p className="mt-2 text-sm text-slate-600">Wskaż znaczenie kolumn. Wymagana jest data oraz kwota ze znakiem albo osobne wpływy/wydatki. Pozostałe pola są opcjonalne. Ustawienia dotyczą tego pliku.</p>
    <fieldset disabled={busy} className="mt-3 space-y-3 disabled:opacity-60">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>Separator<select className={inputClass} value={separator} onChange={event => { setSeparator(event.target.value); setHeaderRow(0); setOverrides({}); }}><option value="">Automatycznie</option><option value=";">Średnik (;)</option><option value=",">Przecinek (,)</option><option value={"\t"}>Tabulator</option><option value="|">Pionowa kreska (|)</option></select></label>
        <label>Wiersz nagłówków<input className={inputClass} type="number" min={1} max={Math.max(1, parsed.rows.length - 1)} value={headerRow + 1} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value < parsed.rows.length) { setHeaderRow(value - 1); setOverrides({}); } }} /><span className="text-xs text-slate-500">Liczone po pominięciu pustych wierszy. Wybierz dalszy wiersz, jeśli plik zaczyna się opisem wyciągu.</span></label>
      </div>
      {parsed.error && <p role="alert" className="text-sm text-red-700">{parsed.error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([field, label]) => <label key={field} className="min-w-0 text-sm text-slate-700">{label}<select className={inputClass} value={mapping[field]} onChange={event => {
          const value = Number(event.target.value);
          setOverrides(current => ({ ...current, [field]: value, ...(value >= 0 && field === "amount" ? { debit: -1, credit: -1 } : {}), ...(value >= 0 && (field === "debit" || field === "credit") ? { amount: -1 } : {}) }));
        }}><option value={-1}>{field === "currency" ? `Brak kolumny - ${currency}` : "Nie używaj"}</option>{headers.map((header, index) => <option key={index} value={index}>{index + 1}. {header || "Bez nazwy"}</option>)}</select><span className="mt-1 block break-words text-xs text-slate-500">Przykład: {mapping[field] < 0 ? "-" : parsed.rows[headerRow + 1]?.[mapping[field]] || "(puste)"}</span></label>)}
      </div>
      <p className="text-xs text-slate-600">Kwoty: 123,45 lub 123.45. Daty: RRRR-MM-DD lub DD.MM.RRRR. Brak opisu nie blokuje importu. Nie przypisuj salda jako kwoty. Prowizję wybierz tylko, jeśli nie jest już zawarta w kwocie. ID musi oznaczać konkretną operację, nie numer konta.</p>
      {!ready && <p className="text-sm text-amber-800">Wybierz datę i kwotę. Wpływy, wydatki i prowizja muszą korzystać z różnych kolumn.</p>}
      <p className="text-xs text-slate-600">Zastosowanie odtworzy podgląd i zaznaczenie z pliku. Dotychczasowe zmiany w podglądzie zostaną zastąpione. Nic nie zostanie zapisane w bazie przed kliknięciem „Importuj”.</p>
      <Button size="sm" tone="primary" disabled={!ready || busy} onClick={() => void onApply({ separator, headerRow, columns: mapping })}>{busy ? "Odczytywanie…" : "Zastosuj i sprawdź podgląd"}</Button>
    </fieldset>
  </details>;
}
