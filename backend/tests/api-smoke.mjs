import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(testDir, "../..");
const sourceDb = path.join(projectDir, "dbmigration", "myanalyz.template.sqlite");
const temporaryDir = await mkdtemp(path.join(tmpdir(), "myanalyze-smoke-"));
const testDb = path.join(temporaryDir, "test.sqlite");
const port = 3199;
const api = `http://127.0.0.1:${port}/api`;

await copyFile(sourceDb, testDb);

const server = spawn(process.execPath, [path.join(projectDir, "backend-dist", "index.js")], {
  cwd: projectDir,
  env: { ...process.env, PORT: String(port), MYANALYZE_DB_PATH: testDb },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${api}/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Backend nie wystartował.\n${serverOutput}`);
}

async function request(url, options) {
  const response = await fetch(`${api}${url}`, { ...options, signal: AbortSignal.timeout(10000) });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${options?.method || "GET"} ${url}: ${response.status} ${text}`);
  return body;
}

async function requestExpectStatus(url, expectedStatus, options) {
  const response = await fetch(`${api}${url}`, { ...options, signal: AbortSignal.timeout(10000) });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  assert.equal(response.status, expectedStatus, `${options?.method || "GET"} ${url}: oczekiwano ${expectedStatus}, otrzymano ${response.status} ${text}`);
  return body;
}

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
function nextOccurrence(dayOfMonth, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  let candidate = new Date(year, month, Math.min(dayOfMonth, lastDay));
  const todayLocal = new Date(year, month, now.getDate());
  if (candidate < todayLocal) {
    const nextMonthLastDay = new Date(year, month + 2, 0).getDate();
    candidate = new Date(year, month + 1, Math.min(dayOfMonth, nextMonthLastDay));
  }
  const occurrenceYear = candidate.getFullYear();
  const occurrenceMonth = String(candidate.getMonth() + 1).padStart(2, "0");
  const occurrenceDay = String(candidate.getDate()).padStart(2, "0");
  return `${occurrenceYear}-${occurrenceMonth}-${occurrenceDay}`;
}

function installmentEndDate(startDate, count, requestedPaymentDay) {
  const [year, month, day] = startDate.split("-").map(Number);
  const paymentDay = Number.isInteger(requestedPaymentDay) ? requestedPaymentDay : day;
  const dueDate = (targetYear, targetMonth) => new Date(targetYear, targetMonth, Math.min(paymentDay, new Date(targetYear, targetMonth + 1, 0).getDate()));
  const start = new Date(year, month - 1, day);
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const anchor = start > todayDate ? start : todayDate;
  let firstDue = dueDate(anchor.getFullYear(), anchor.getMonth());
  if (firstDue < anchor) firstDue = dueDate(anchor.getFullYear(), anchor.getMonth() + 1);
  const end = dueDate(firstDue.getFullYear(), firstDue.getMonth() + count - 1);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

const cases = [
  {
    name: "konto",
    endpoint: "/konta",
    payload: { nazwa: "TEST konto", saldo_dostepne: 860, saldo_wlasciwe: 860, typ_depozytu: "konto" },
    updatePayload: { nazwa: "TEST konto po edycji", saldo_dostepne: 860.06, saldo_wlasciwe: 860.06, typ_depozytu: "konto" },
    updatedFields: { nazwa: "TEST konto po edycji", saldo_dostepne: 860.06, saldo_wlasciwe: 860.06 },
  },
  {
    name: "przychód",
    endpoint: "/przychody",
    payload: { nazwa: "TEST przychód", kwota: 100, kategoria: "Inne", data_dodania: today, opis: "smoke test" },
    updatePayload: { nazwa: "TEST przychód po edycji", kwota: 110, kategoria: "Premia", data_dodania: today, opis: "smoke test edited", zrealizowany: false },
    updatedFields: { nazwa: "TEST przychód po edycji", kwota: 110, kategoria: "Premia" },
  },
  {
    name: "wydatek",
    endpoint: "/wydatki",
    payload: { nazwa: "TEST wydatek", kwota: 50, kategoria: "Inne", data_dodania: today, opis: "smoke test" },
    updatePayload: { nazwa: "TEST wydatek po edycji", kwota: 60, kategoria: "Transport", data_dodania: today, opis: "smoke test edited", zrealizowany: false },
    updatedFields: { nazwa: "TEST wydatek po edycji", kwota: 60, kategoria: "Transport" },
  },
  {
    name: "przychód stały",
    endpoint: "/przychody_stale",
    payload: { nazwa: "TEST przychód stały", kwota: 100, kategoria: "Inne", data_od: today, data_do: null, dzien_miesiaca: 1 },
    updatePayload: { nazwa: "TEST przychód stały po edycji", kwota: 120, kategoria: "Premia", data_od: today, data_do: "2099-01-01", dzien_miesiaca: 15 },
    updatedFields: { nazwa: "TEST przychód stały po edycji", kwota: 120, data_do: "2099-01-01", dzien_miesiaca: 15 },
  },
  {
    name: "wydatek stały",
    endpoint: "/wydatki_stale",
    payload: { nazwa: "TEST wydatek stały", kwota: 50, kategoria: "Inne", data_od: today, data_do: null, dzien_miesiaca: 1 },
    updatePayload: { nazwa: "TEST wydatek stały po edycji", kwota: 70, kategoria: "Transport", data_od: today, data_do: "2099-01-01", dzien_miesiaca: 16 },
    updatedFields: { nazwa: "TEST wydatek stały po edycji", kwota: 70, data_do: "2099-01-01", dzien_miesiaca: 16 },
  },
  {
    name: "plan pożyczek",
    endpoint: "/debt-plans",
    payload: { produkt: "TEST karta", typ: "Karta", zadluzenie: 1200, rata_miesieczna: null, ilosc_rat: null, wolny_limit: 300, limit_kredytowy: 1500, recurring_expense_id: null },
    updatePayload: { produkt: "TEST karta po edycji", typ: "Karta", zadluzenie: 1250, rata_miesieczna: null, ilosc_rat: null, wolny_limit: 250, limit_kredytowy: 1500, recurring_expense_id: null },
    updatedFields: { produkt: "TEST karta po edycji", zadluzenie: 1250, wolny_limit: 250, limit_kredytowy: 1500 },
  },
  {
    name: "pożyczka",
    endpoint: "/loans",
    payload: { nazwa: "TEST pożyczka", data_rozpoczecia: today, data_do: "2027-07-23", ilosc_rat: 12, kwota_kapitalu: 1200, kwota_calkowita: 1320, rrso: 10, dzien_splaty: 10, oprocentowanie: 8, prowizja: 20, ubezpieczenie: 10 },
    updatePayload: { nazwa: "TEST pożyczka po edycji", data_rozpoczecia: today, data_do: "2027-05-23", ilosc_rat: 10, kwota_kapitalu: 1200, kwota_calkowita: 1300, rrso: 9, dzien_splaty: 12, oprocentowanie: 7, prowizja: 15, ubezpieczenie: 5, data_dodania: today },
    updatedFields: { nazwa: "TEST pożyczka po edycji", data_do: installmentEndDate(today, 10, 12), ilosc_rat: 10, kwota_calkowita: 1300 },
  },
];

try {
  await waitForServer();
  const cacheProbe = await fetch(`${api}/konta`, { headers: { "If-None-Match": "*" } });
  assert.equal(cacheProbe.status, 200, "API zwróciło 304 i zablokowało odświeżenie formularza po zapisie");
  assert.match(cacheProbe.headers.get("cache-control") || "", /no-store/, "API nie blokuje cache danych użytkownika");
  process.stdout.write("✓ API bez cache 304 po zapisie\n");
  const moduleConfig = await request("/modules-config");
  assert.ok(!moduleConfig.some((module) => module.key === "inwestycje"), "konfiguracja nadal zawiera usunięty moduł Inwestycje");
  await request("/modules-config/manager", { method: "DELETE" });
  const restoredManager = await request("/modules-config/manager", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Manager Finansów",
      icon: "fa-solid fa-wallet",
      description: "Konta, przychody i wydatki w jednym miejscu",
      visible: "1",
      order_index: 1,
    }),
  });
  assert.equal(restoredManager.key, "manager", "konfiguracja nie odtworzyła brakującego modułu podczas zapisu");
  assert.equal(restoredManager.visible, "1", "konfiguracja odtworzyła moduł z błędną widocznością");
  const reorderedModules = await request("/modules-config/order", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ updates: moduleConfig.map((module, index) => ({ key: module.key, order_index: moduleConfig.length - index })) }),
  });
  assert.equal(reorderedModules.length, moduleConfig.length, "atomowy zapis kolejności zgubił moduł");
  process.stdout.write("✓ konfiguracja odtwarza brakujący moduł podczas zapisu\n");
  const removedInvestmentsEndpoint = await fetch(`${api}/inwestycje`);
  assert.equal(removedInvestmentsEndpoint.status, 404, "usunięty endpoint Inwestycje nadal odpowiada");
  process.stdout.write("✓ moduł Inwestycje usunięty z konfiguracji i API\n");
  for (const testCase of cases) {
    const created = await request(testCase.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(testCase.payload),
    });
    assert.ok(created?.id, `${testCase.name}: brak id po dodaniu`);

    if (testCase.endpoint === "/loans") {
      const planCreatedFromCredit = (await request("/debt-plans")).find((row) => String(row.loan_id) === String(created.id));
      assert.ok(planCreatedFromCredit, "kredyty: nie utworzono powiązanego zobowiązania");
    }

    const rows = await request(testCase.endpoint);
    assert.ok(Array.isArray(rows) && rows.some((row) => String(row.id) === String(created.id)), `${testCase.name}: brak encji na liście`);

    await request(`${testCase.endpoint}/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(testCase.updatePayload),
    });
    const rowsAfterUpdate = await request(testCase.endpoint);
    const updated = rowsAfterUpdate.find((row) => String(row.id) === String(created.id));
    assert.ok(updated, `${testCase.name}: encja zniknęła po edycji`);
    for (const [field, expected] of Object.entries(testCase.updatedFields)) {
      const actual = updated[field];
      if (typeof expected === "number") assert.equal(Number(actual), expected, `${testCase.name}: błędne pole ${field} po edycji`);
      else assert.equal(actual, expected, `${testCase.name}: błędne pole ${field} po edycji`);
    }
    if (testCase.endpoint === '/przychody' || testCase.endpoint === '/wydatki') {
      assert.equal(updated.zrealizowany, false, `${testCase.name}: zwykła edycja błędnie oznaczyła rekord jako zrealizowany`);
    }

    if (testCase.endpoint === "/konta") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const accountLogs = await request("/app-activity-logs");
      const updateLog = accountLogs.find((log) => log.action_type === "UPDATE" && log.entity_type === "konta" && String(log.entity_id) === String(created.id));
      assert.ok(updateLog, "konto: brak logu edycji");
      assert.equal(Number(JSON.parse(updateLog.old_data).saldo_dostepne), Number(testCase.payload.saldo_dostepne), "konto: błędny stan przed zmianą");
      assert.equal(Number(JSON.parse(updateLog.new_data).saldo_dostepne), Number(testCase.updatePayload.saldo_dostepne), "konto: błędny stan po zmianie");
      assert.match(updateLog.comment, /Zwiększono saldo dostępne/, "konto: komentarz nie opisuje zmiany salda");
    }

    await request(`${testCase.endpoint}/${created.id}`, { method: "DELETE" });
    const rowsAfterDelete = await request(testCase.endpoint);
    assert.ok(!rowsAfterDelete.some((row) => String(row.id) === String(created.id)), `${testCase.name}: encja nadal istnieje po usunięciu`);
    process.stdout.write(`✓ ${testCase.name} (dodanie, edycja, usunięcie)\n`);
  }


  // Wspólne etykiety użytkownika: jedna etykieta może klasyfikować przychody i wydatki.
  const sharedLabel = await request('/custom-transaction-types', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'TEST Vinted' }),
  });
  assert.ok(sharedLabel?.id, 'etykiety: brak id po dodaniu');
  await requestExpectStatus('/custom-transaction-types', 409, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'test vinted' }),
  });

  const labeledIncome = await request('/przychody', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST etykieta przychód', kwota: 111, kategoria: 'Inne', data_dodania: today, custom_type_id: sharedLabel.id }),
  });
  const labeledExpense = await request('/wydatki', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST etykieta wydatek', kwota: 22, kategoria: 'Inne', data_dodania: today, custom_type_id: sharedLabel.id }),
  });
  let labeledIncomeRow = (await request('/przychody')).find((row) => String(row.id) === String(labeledIncome.id));
  let labeledExpenseRow = (await request('/wydatki')).find((row) => String(row.id) === String(labeledExpense.id));
  assert.equal(Number(labeledIncomeRow?.custom_type_id), Number(sharedLabel.id), 'etykiety: ręczny przychód nie zapisał etykiety');
  assert.equal(Number(labeledExpenseRow?.custom_type_id), Number(sharedLabel.id), 'etykiety: ręczny wydatek nie zapisał tej samej etykiety');
  assert.equal(labeledIncomeRow?.custom_type_name, 'TEST Vinted', 'etykiety: GET przychodów nie zwraca nazwy etykiety');
  assert.equal(labeledExpenseRow?.custom_type_name, 'TEST Vinted', 'etykiety: GET wydatków nie zwraca nazwy etykiety');

  await request(`/przychody/${labeledIncome.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST etykieta przychód', kwota: 111, kategoria: 'Inne', data_dodania: today, zrealizowany: false, custom_type_id: null }),
  });
  labeledIncomeRow = (await request('/przychody')).find((row) => String(row.id) === String(labeledIncome.id));
  assert.equal(labeledIncomeRow?.custom_type_id, null, 'etykiety: ręczna edycja nie potrafi wyczyścić etykiety przychodu');

  await request('/przychody/bulk-classification', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [labeledIncome.id], custom_type_id: sharedLabel.id, category: 'Premia' }),
  });
  await request('/wydatki/bulk-classification', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [labeledExpense.id], custom_type_id: sharedLabel.id, category: 'Transport' }),
  });
  labeledIncomeRow = (await request('/przychody')).find((row) => String(row.id) === String(labeledIncome.id));
  labeledExpenseRow = (await request('/wydatki')).find((row) => String(row.id) === String(labeledExpense.id));
  assert.equal(Number(labeledIncomeRow?.custom_type_id), Number(sharedLabel.id), 'etykiety: bulk przychodu zgubił etykietę');
  assert.equal(Number(labeledExpenseRow?.custom_type_id), Number(sharedLabel.id), 'etykiety: bulk wydatku zgubił etykietę');
  assert.equal(labeledIncomeRow?.kategoria, 'Premia', 'etykiety: bulk przychodu nie zmienił kategorii');
  assert.equal(labeledExpenseRow?.kategoria, 'Transport', 'etykiety: bulk wydatku nie zmienił kategorii');

  await request('/custom-transaction-types/import-classification/vinted', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw_type: '', kind: 'income', custom_type_id: sharedLabel.id, category: 'Vinted' }),
  });
  await request('/custom-transaction-types/import-classification/vinted', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw_type: '', kind: 'expense', custom_type_id: sharedLabel.id, category: 'Inne' }),
  });
  let vintedMappings = await request('/custom-transaction-types/import-classification/vinted');
  const vintedIncomeMapping = vintedMappings.find((row) => row.kind === 'income' && row.raw_type === '');
  const vintedExpenseMapping = vintedMappings.find((row) => row.kind === 'expense' && row.raw_type === '');
  assert.equal(Number(vintedIncomeMapping?.custom_type_id), Number(sharedLabel.id), 'mapping importu: przychód nie używa wspólnej etykiety');
  assert.equal(Number(vintedExpenseMapping?.custom_type_id), Number(sharedLabel.id), 'mapping importu: wydatek nie używa wspólnej etykiety');

  await request('/custom-transaction-types/import-classification/vinted', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw_type: '', kind: 'income', custom_type_id: null, category: null }),
  });
  vintedMappings = await request('/custom-transaction-types/import-classification/vinted');
  const clearedVintedIncomeMapping = vintedMappings.find((row) => row.kind === 'income' && row.raw_type === '');
  assert.equal(clearedVintedIncomeMapping?.custom_type_id, null, 'mapping importu: nie można wyczyścić zapamiętanej etykiety');
  assert.equal(clearedVintedIncomeMapping?.category, null, 'mapping importu: nie można wyczyścić zapamiętanej kategorii');

  await request(`/custom-transaction-types/${sharedLabel.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'TEST Vinted', active: false }),
  });
  await requestExpectStatus('/przychody/bulk-classification', 400, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [labeledIncome.id], custom_type_id: sharedLabel.id }),
  });
  labeledExpenseRow = (await request('/wydatki')).find((row) => String(row.id) === String(labeledExpense.id));
  assert.equal(labeledExpenseRow?.custom_type_name, 'TEST Vinted', 'etykiety: dezaktywacja usunęła nazwę z istniejącej transakcji');
  await request(`/custom-transaction-types/${sharedLabel.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'TEST Vinted', active: true }),
  });

  await request(`/przychody/${labeledIncome.id}`, { method: 'DELETE' });
  await request(`/wydatki/${labeledExpense.id}`, { method: 'DELETE' });
  process.stdout.write('✓ wspólne etykiety, bulk edit i czyszczenie mappingu importu\n');

  // Konfiguracja importu i mapowanie zewnętrznych identyfikatorów instrumentów.
  const initialImportSettings = await request('/konta/import-settings');
  const changedImportSettings = await request('/konta/import-settings', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ detectTransferSuggestions: false, transferDateTolerance: 2, autoSelectPlanMatch: false }),
  });
  assert.equal(Number(changedImportSettings.detect_transfer_suggestions), 0, 'ustawienia importu: nie wyłączono sugestii transferów');
  assert.equal(Number(changedImportSettings.transfer_date_tolerance), 2, 'ustawienia importu: nie zapisano tolerancji daty');
  assert.equal(Number(changedImportSettings.auto_select_plan_match), 0, 'ustawienia importu: nie wyłączono auto-match planu');
  await requestExpectStatus('/konta/import-settings', 400, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ detectTransferSuggestions: true, transferDateTolerance: 99, autoSelectPlanMatch: true }),
  });
  await request('/konta/import-settings', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      detectTransferSuggestions: Number(initialImportSettings.detect_transfer_suggestions) === 1,
      transferDateTolerance: Number(initialImportSettings.transfer_date_tolerance),
      autoSelectPlanMatch: Number(initialImportSettings.auto_select_plan_match) === 1,
    }),
  });

  const mappedInstrumentAccountA = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST instrument A', saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: 'konto', institution_name: 'Millennium' }),
  });
  const mappedInstrumentAccountB = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST instrument B', saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: 'konto', institution_name: 'Millennium' }),
  });
  assert.equal(mappedInstrumentAccountA.institution_name, 'Millennium', 'konta: nie zapisano opcjonalnej instytucji');
  await request('/konta/import-identifiers', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: mappedInstrumentAccountA.id, provider: 'millennium', external_identifier: '****3296', instrument_type: 'account', label: 'pierwsze' }),
  });
  await request('/konta/import-identifiers', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: mappedInstrumentAccountB.id, provider: 'millennium', external_identifier: '****3296', instrument_type: 'account', label: 'drugie' }),
  });
  let instrumentMappings = await request('/konta/import-identifiers?provider=millennium&external_identifier=****3296&instrument_type=account');
  assert.equal(instrumentMappings.length, 2, 'mapowanie instrumentów: kolizja zamaskowanego identyfikatora została błędnie zablokowana');
  assert.deepEqual(new Set(instrumentMappings.map((row) => Number(row.account_id))), new Set([Number(mappedInstrumentAccountA.id), Number(mappedInstrumentAccountB.id)]), 'mapowanie instrumentów: lookup zwraca złe konta');
  await request('/konta/import-identifiers', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: mappedInstrumentAccountA.id, provider: 'millennium', external_identifier: '****3296', instrument_type: 'account', label: 'zaktualizowane' }),
  });
  instrumentMappings = await request('/konta/import-identifiers?provider=millennium&external_identifier=****3296&instrument_type=account');
  assert.equal(instrumentMappings.find((row) => Number(row.account_id) === Number(mappedInstrumentAccountA.id))?.label, 'zaktualizowane', 'mapowanie instrumentów: ponowny zapis nie zaktualizował etykiety');
  await requestExpectStatus('/konta/import-identifiers', 400, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: mappedInstrumentAccountA.id, provider: 'Millennium S.A.', external_identifier: 'x', instrument_type: 'account' }),
  });
  await request(`/konta/${mappedInstrumentAccountA.id}`, { method: 'DELETE' });
  await request(`/konta/${mappedInstrumentAccountB.id}`, { method: 'DELETE' });
  process.stdout.write('✓ ustawienia importu i opcjonalne mapowanie instrumentów\n');

  const importAccount = await request("/konta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST import CSV", saldo_dostepne: 500, saldo_wlasciwe: 500, typ_depozytu: "konto" }),
  });
  const importPayload = {
    source: "CSV bankowy",
    transactions: [
      { sourceKey: "test-expense-row", name: "TEST sklep", amount: -25.5, date: today, occurredAt: `${today}T08:15:30`, category: "Jedzenie", currency: "PLN", transactionType: "card_payment", customTypeId: sharedLabel.id, excludeFromAnalysis: true },
      { sourceKey: "test-income-row", name: "TEST zwrot", amount: 10, date: today, occurredAt: `${today}T09:20:40`, category: "Inne", currency: "PLN", transactionType: "transfer_in" },
    ],
  };
  await requestExpectStatus(`/konta/${importAccount.id}/import-transactions`, 400, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions: [{ ...importPayload.transactions[0], sourceKey: "bad-date", date: "2026-02-30" }] }),
  });
  await requestExpectStatus(`/konta/${importAccount.id}/import-transactions`, 400, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions: [{ ...importPayload.transactions[0], sourceKey: "bad-currency", currency: "EUR" }] }),
  });
  const firstImport = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(importPayload),
  });
  assert.deepEqual(firstImport, { importedExpenses: 1, importedIncomes: 1, duplicates: 0, matchedPlans: 0, reconciledExisting: 0, linkedTransfers: 0, refreshedTransactions: 0 }, "import CSV: błędny wynik pierwszego importu");
  const duplicatePreview = await request(`/konta/${importAccount.id}/import-transactions/check-duplicates`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceKeys: importPayload.transactions.map((row) => row.sourceKey) }),
  });
  assert.deepEqual(new Set(duplicatePreview.duplicateSourceKeys), new Set(["test-expense-row", "test-income-row"]), "import CSV: podgląd nie rozpoznał wcześniejszych wpisów");
  const secondImport = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...importPayload, source: "zmienione źródło klienta" }),
  });
  assert.deepEqual(secondImport, { importedExpenses: 0, importedIncomes: 0, duplicates: 2, matchedPlans: 0, reconciledExisting: 0, linkedTransfers: 0, refreshedTransactions: 0 }, "import CSV: ponowny import utworzył duplikaty");

  const pendingFirst = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{ sourceKey: 'test-pending-to-completed', name: 'TEST pending status', amount: -17, date: today, category: 'Inne', currency: 'PLN', transactionType: 'card_payment', bankStatus: 'pending' }] }),
  });
  assert.equal(pendingFirst.importedExpenses, 1, 'status importu: pending nie został zapisany');
  const pendingCompleted = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{ sourceKey: 'test-pending-to-completed', name: 'TEST pending status', amount: -17, date: today, category: 'Inne', currency: 'PLN', transactionType: 'card_payment', bankStatus: 'completed' }] }),
  });
  assert.equal(pendingCompleted.refreshedTransactions, 1, 'status importu: pending → completed nie odświeżył operacji');
  const pendingCompletedRow = (await request('/wydatki')).find((row) => row.nazwa === 'TEST pending status' && String(row.account_id) === String(importAccount.id));
  assert.equal(pendingCompletedRow?.import_status, 'completed', 'status importu: pending → completed ma błędny status');
  assert.equal(pendingCompletedRow?.zrealizowany, true, 'status importu: pending → completed nie oznaczył operacji jako wykonanej');
  const accountAfterImport = (await request("/konta")).find((row) => String(row.id) === String(importAccount.id));
  assert.equal(Number(accountAfterImport.saldo_dostepne), 500, "import CSV zmienił saldo dostępne konta");
  assert.equal(Number(accountAfterImport.saldo_wlasciwe), 500, "import CSV zmienił saldo rzeczywiste konta");
  let importedExpense = (await request("/wydatki")).find((row) => row.nazwa === "TEST sklep" && row.import_fingerprint && String(row.account_id) === String(importAccount.id));
  const importedIncome = (await request("/przychody")).find((row) => row.import_fingerprint && String(row.account_id) === String(importAccount.id));
  assert.equal(importedExpense?.zrealizowany, true, "import CSV: wydatek nie jest wykonany");
  assert.equal(importedIncome?.zrealizowany, true, "import CSV: przychód nie jest wykonany");
  assert.equal(importedExpense?.transaction_type, "card_payment", "import CSV: wydatek zgubił typ transakcji");
  assert.equal(Number(importedExpense?.excluded_from_analysis), 1, "import CSV: wykluczenie transferu z analizy nie zostało zapisane");
  assert.equal(importedIncome?.transaction_type, "transfer_in", "import CSV: przychód zgubił typ transakcji");
  assert.equal(Number(importedIncome?.excluded_from_analysis), 0, "import CSV: niepotwierdzony transfer został automatycznie wyłączony z analizy");
  assert.equal(Number(importedExpense?.custom_type_id), Number(sharedLabel.id), "import CSV: operacja zgubiła etykietę użytkownika");
  const importLogs = (await request("/app-activity-logs")).filter((log) => log.entity_type === "konta" && String(log.entity_id) === String(importAccount.id));
  const importedExpenseLog = importLogs.find((log) => log.action_type === "IMPORT_EXPENSE" && JSON.parse(log.metadata).transaction_id === importedExpense.id);
  const importedIncomeLog = importLogs.find((log) => log.action_type === "IMPORT_INCOME");
  assert.match(importedExpenseLog?.comment ?? "", /IMPORT.*25\.50 PLN.*Płatność kartą.*TEST import CSV/, "import CSV: brak czytelnego logu wydatku");
  assert.match(importedIncomeLog?.comment ?? "", /IMPORT.*10\.00 PLN.*Przelew przychodzący.*TEST import CSV/, "import CSV: brak czytelnego logu przychodu");
  assert.match(String(importedExpenseLog?.timestamp), /08:15:30/, "import CSV: log wydatku nie zachował czasu operacji");
  assert.match(String(importedIncomeLog?.timestamp), /09:20:40/, "import CSV: log przychodu nie zachował czasu operacji");
  assert.equal(importedExpenseLog?.old_data, null, "import CSV: pole przed zmianą powinno pozostać puste");
  assert.equal(importedExpenseLog?.new_data, null, "import CSV: pole po zmianie powinno pozostać puste");
  const summaryImportLog = importLogs.find((log) => log.action_type === "IMPORT_BANK_STATEMENT" && JSON.parse(log.metadata).transactions?.some((row) => row.transaction_id === importedExpense.id));
  const summaryMetadata = JSON.parse(summaryImportLog.metadata);
  assert.equal(summaryMetadata.transactions.length, 2, "import CSV: log zbiorczy nie zawiera szczegółów pozycji");

  const repeatedBase = { name: "TEST myjnia", amount: -12.3, date: today, occurredAt: `${today}T11:00:00`, category: "Inne", currency: "PLN", transactionType: "card_payment" };
  const repeatedFour = [1, 2, 3, 4].map((occurrence) => ({ ...repeatedBase, sourceKey: occurrence === 1 ? "test-myjnia" : `test-myjnia\u001eoccurrence:${occurrence}` }));
  const repeatedFirstImport = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: repeatedFour }),
  });
  assert.equal(repeatedFirstImport.importedExpenses, 4, "import CSV: identyczne operacje z jednego wyciągu nie zostały zapisane osobno");
  const repeatedFive = [...repeatedFour, { ...repeatedBase, sourceKey: "test-myjnia\u001eoccurrence:5" }];
  const repeatedNextImport = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: repeatedFive }),
  });
  assert.equal(repeatedNextImport.importedExpenses, 1, "import CSV: piąte wystąpienie fingerprintu nie zostało dodane");
  assert.equal(repeatedNextImport.duplicates, 4, "import CSV: ponowny wyciąg nie rozpoznał czterech wcześniej zapisanych wystąpień");
  const unnamedImport = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: [{ sourceKey: "test-no-description", name: "", amount: -3, date: today, category: "Inne", currency: "PLN", transactionType: null }] }),
  });
  assert.equal(unnamedImport.importedExpenses, 1, "import CSV: brak opisu zablokował poprawną operację");
  assert.ok((await request("/wydatki")).some((row) => row.nazwa === "Operacja bankowa" && String(row.account_id) === String(importAccount.id)), "import CSV: nie zastosowano fallbacku nazwy");

  await request(`/wydatki/${importedExpense.id}`, { method: "DELETE" });
  const previewAfterDelete = await request(`/konta/${importAccount.id}/import-transactions/check-duplicates`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceKeys: [importPayload.transactions[0].sourceKey] }),
  });
  assert.deepEqual(previewAfterDelete.duplicateSourceKeys, [], "import CSV: usunięty rekord nadal jest traktowany jako zaimportowany");
  const reimportAfterDelete = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: [importPayload.transactions[0]] }),
  });
  assert.deepEqual(reimportAfterDelete, { importedExpenses: 1, importedIncomes: 0, duplicates: 0, matchedPlans: 0, reconciledExisting: 0, linkedTransfers: 0, refreshedTransactions: 0 }, "import CSV: nie można ponownie zaimportować usuniętego rekordu");
  importedExpense = (await request("/wydatki")).find((row) =>
    row.nazwa === importPayload.transactions[0].name &&
    String(row.account_id) === String(importAccount.id),
  );

  const plannedIncomeForImport = await request("/przychody", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST plan paczkowy", kwota: 500, kategoria: "Inne", data_dodania: today, pewnosc: "expected", custom_type_id: sharedLabel.id }),
  });
  const partialPlanRow = { sourceKey: "test-partial-plan", name: "TEST paczka", amount: 200, date: today, occurredAt: `${today}T10:00:00`, category: "Inne", currency: "PLN", transactionType: "transfer_in" };
  const planPreview = await request(`/konta/${importAccount.id}/import-transactions/check-duplicates`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceKeys: [partialPlanRow.sourceKey], transactions: [partialPlanRow] }),
  });
  const proposedPlan = planPreview.matchAnalysis?.[0]?.planCandidates?.find((candidate) => String(candidate.planId) === String(plannedIncomeForImport.id));
  assert.equal(proposedPlan?.recommended, true, "import CSV: jednoznaczny plan nie został domyślnie zaproponowany");
  const partialPlanImport = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions: [{ ...partialPlanRow, resolution: "plan", planMatch: { source: "one_time", planId: plannedIncomeForImport.id } }] }),
  });
  assert.equal(partialPlanImport.matchedPlans, 1, "import CSV: nie zapisano rozliczenia planu");
  const importedPartialIncome = (await request("/przychody")).find((row) => row.import_fingerprint && row.nazwa === "TEST paczka");
  const partialAllocations = JSON.parse(importedPartialIncome?.plan_allocations ?? "[]");
  assert.equal(Number(partialAllocations[0]?.planId), Number(plannedIncomeForImport.id), "import CSV: GET nie zwraca powiązanego planu");
  assert.equal(Number(partialAllocations[0]?.allocatedAmount), 200, "import CSV: błędna częściowo rozliczona kwota");


  // P0: importowa allocation zmniejsza dostępną kwotę ręcznej realizacji planu.
  let partiallyAllocatedPlan = (await request("/przychody")).find((row) => String(row.id) === String(plannedIncomeForImport.id));
  assert.equal(Number(partiallyAllocatedPlan?.allocated_to_plan), 200, "Plan↔Actual: plan nie pokazuje 200 zł już rozliczonego importem");
  const allocationRealizationAccount = await request("/konta", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST konto dopłaty planu", saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: "konto" }),
  });
  await requestExpectStatus(`/przychody/realize/${plannedIncomeForImport.id}`, 400, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: allocationRealizationAccount.id, amount: 300.01, realization_date: today }),
  });
  const remainingPlanRealization = await request(`/przychody/realize/${plannedIncomeForImport.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: allocationRealizationAccount.id, amount: 300, realization_date: today }),
  });
  assert.equal(Number(remainingPlanRealization.realized_amount), 300, "Plan↔Actual: ręczna realizacja nie wykorzystała dokładnie pozostałych 300 zł");
  assert.equal(Number(remainingPlanRealization.transaction.custom_type_id), Number(sharedLabel.id), "częściowa realizacja: actual zgubił custom_type_id planu");
  assert.equal(Number(remainingPlanRealization.remaining_transaction?.id), Number(plannedIncomeForImport.id), "Plan↔Actual: ręczna realizacja po imporcie zastąpiła historyczny plan");
  partiallyAllocatedPlan = (await request("/przychody")).find((row) => String(row.id) === String(plannedIncomeForImport.id));
  assert.equal(Number(partiallyAllocatedPlan?.kwota), 500, "Plan↔Actual: pełne rozliczenie allocation zmieniło historyczną kwotę planu");
  assert.equal(Number(partiallyAllocatedPlan?.allocated_to_plan), 500, "Plan↔Actual: import + ręczna realizacja nie dają pełnych 500 zł allocation");
  assert.equal(partiallyAllocatedPlan?.zrealizowany, false, "Plan↔Actual: historyczny plan został błędnie zamieniony w actual");
  await requestExpectStatus(`/przychody/realize/${plannedIncomeForImport.id}`, 409, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: allocationRealizationAccount.id, amount: 1, realization_date: today }),
  });
  const manualAllocatedActual = (await request("/przychody")).find((row) => row.nazwa === "TEST plan paczkowy" && row.zrealizowany && !row.import_fingerprint && String(row.account_id) === String(allocationRealizationAccount.id));
  assert.ok(manualAllocatedActual?.id, "Plan↔Actual: nie znaleziono actual utworzonego z pozostałej części planu");
  assert.equal(JSON.parse(manualAllocatedActual.plan_allocations ?? "[]").length, 1, "Plan↔Actual: ręczny actual nie dostał allocation do planu");
  await request(`/przychody/${manualAllocatedActual.id}`, { method: "DELETE" });
  partiallyAllocatedPlan = (await request("/przychody")).find((row) => String(row.id) === String(plannedIncomeForImport.id));
  assert.equal(Number(partiallyAllocatedPlan?.allocated_to_plan), 200, "cleanup allocation: usunięcie actual nie przywróciło dostępnej części planu");
  await request(`/konta/${allocationRealizationAccount.id}`, { method: "DELETE" });
  process.stdout.write("✓ Plan↔Actual: import ogranicza ręczną realizację, a etykieta i plan historyczny pozostają\n");


  // P0: realize-with-income również respektuje allocations wykonania już przypisane przez import.
  const allocatedSettlementIncomePlan = await request('/przychody', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST income allocation settlement', kwota: 100, kategoria: 'Inne', data_dodania: today, pewnosc: 'expected' }),
  });
  await request(`/konta/${importAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{
      sourceKey: 'test-income-allocation-settlement-import', name: 'TEST income allocation settlement actual', amount: 80, date: today,
      occurredAt: `${today}T10:08:00`, category: 'Inne', currency: 'PLN', transactionType: 'transfer_in',
      resolution: 'plan', planMatches: [{ source: 'one_time', planId: allocatedSettlementIncomePlan.id, amount: 80 }],
    }] }),
  });
  const allocatedSettlementExpensePlan = await request('/wydatki', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST expense allocation settlement', kwota: 50, kategoria: 'Inne', data_dodania: today }),
  });
  await requestExpectStatus(`/wydatki/realize-with-income/${allocatedSettlementExpensePlan.id}`, 400, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ income_id: allocatedSettlementIncomePlan.id, amount: 20.01 }),
  });
  const allocatedSettlement = await request(`/wydatki/realize-with-income/${allocatedSettlementExpensePlan.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ income_id: allocatedSettlementIncomePlan.id, amount: 20 }),
  });
  assert.equal(Number(allocatedSettlement.realized_amount), 20, 'wydatek przychodem/allocation: nie wykorzystano dokładnie pozostałej kwoty przychodu');
  assert.equal(Number(allocatedSettlement.remaining_expense?.kwota), 30, 'wydatek przychodem/allocation: błędnie pomniejszono plan wydatku');
  const allocatedSettlementIncomeAfter = (await request('/przychody')).find((row) => String(row.id) === String(allocatedSettlementIncomePlan.id));
  assert.equal(Number(allocatedSettlementIncomeAfter?.kwota), 100, 'wydatek przychodem/allocation: zmieniono historyczną kwotę planu przychodu');
  assert.equal(Number(allocatedSettlementIncomeAfter?.allocated_to_plan), 100, 'wydatek przychodem/allocation: import 80 + ręczne 20 nie domknęły allocation');
  await requestExpectStatus(`/wydatki/realize-with-income/${allocatedSettlementExpensePlan.id}`, 409, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ income_id: allocatedSettlementIncomePlan.id, amount: 1 }),
  });
  const allocatedSettlementImportedActual = (await request('/przychody')).find((row) => row.nazwa === 'TEST income allocation settlement actual' && row.import_fingerprint);
  await request(`/przychody/${allocatedSettlementImportedActual.id}`, { method: 'DELETE' });
  await request(`/przychody/${allocatedSettlement.income_transaction.id}`, { method: 'DELETE' });
  await request(`/wydatki/${allocatedSettlement.expense_transaction.id}`, { method: 'DELETE' });
  await request(`/przychody/${allocatedSettlementIncomePlan.id}`, { method: 'DELETE' });
  await request(`/wydatki/${allocatedSettlementExpensePlan.id}`, { method: 'DELETE' });
  process.stdout.write('✓ wydatek przychodem respektuje wcześniejsze allocations importu\\n');

  const splitPlanA = await request("/przychody", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nazwa: "TEST część A", kwota: 300, kategoria: "Inne", data_dodania: today, pewnosc: "expected" }) });
  const splitPlanB = await request("/przychody", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nazwa: "TEST część B", kwota: 400, kategoria: "Inne", data_dodania: today, pewnosc: "expected" }) });
  const splitImport = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: [{ sourceKey: "test-split-plan", name: "TEST zbiorczy wpływ", amount: 700, date: today, occurredAt: `${today}T10:15:00`, category: "Inne", currency: "PLN", transactionType: "transfer_in", resolution: "plan", planMatches: [{ source: "one_time", planId: splitPlanA.id, amount: 300 }, { source: "one_time", planId: splitPlanB.id, amount: 400 }] }] }),
  });
  assert.equal(splitImport.matchedPlans, 2, "import CSV: jedna operacja nie rozliczyła kilku planów");
  const importedSplitIncome = (await request("/przychody")).find((row) => row.import_fingerprint && row.nazwa === "TEST zbiorczy wpływ");
  assert.equal(JSON.parse(importedSplitIncome?.plan_allocations ?? "[]").length, 2, "import CSV: nie zwrócono wszystkich powiązań operacji");

  const realizedIncomeForImport = await request("/przychody", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST już wykonany", kwota: 77, kategoria: "Inne", data_dodania: today, pewnosc: "guaranteed" }),
  });
  await request(`/przychody/realize/${realizedIncomeForImport.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ account_id: importAccount.id }),
  });
  const existingRow = { sourceKey: "test-existing-realized", name: "TEST bank wykonany", amount: 77, date: today, occurredAt: `${today}T10:30:00`, category: "Inne", currency: "PLN", transactionType: "transfer_in" };
  const existingPreview = await request(`/konta/${importAccount.id}/import-transactions/check-duplicates`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceKeys: [existingRow.sourceKey], transactions: [existingRow] }),
  });
  const proposedExisting = existingPreview.matchAnalysis?.[0]?.existingCandidates?.find((candidate) => String(candidate.transactionId) === String(realizedIncomeForImport.id));
  assert.equal(proposedExisting?.recommended, true, "import CSV: jednoznaczna wykonana operacja nie została zaproponowana");
  const existingImport = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: [{ ...existingRow, resolution: "existing", existingTransactionId: realizedIncomeForImport.id }] }),
  });
  assert.deepEqual(existingImport, { importedExpenses: 0, importedIncomes: 0, duplicates: 0, matchedPlans: 0, reconciledExisting: 1, linkedTransfers: 0, refreshedTransactions: 0 }, "import CSV: błędne powiązanie z wykonaną operacją");

  const reconciledExistingRow = (await request("/przychody")).find((row) => String(row.id) === String(realizedIncomeForImport.id));
  assert.ok(reconciledExistingRow?.import_fingerprint, "resolution=existing: nie zapisano fingerprintu CSV na istniejącym actual");
  assert.equal(reconciledExistingRow?.import_source, null, "resolution=existing: ręczny actual został błędnie zmieniony w operację importowaną");

  // P1: słabe podobieństwo nazwy pozostaje kandydatem, ale nie może być auto-rekomendacją.
  const conservativePlan = await request("/przychody", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "Abonament Telefon", kwota: 88, kategoria: "Inne", data_dodania: today, pewnosc: "expected" }),
  });
  const conservativePreview = await request(`/konta/${importAccount.id}/import-transactions/check-duplicates`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceKeys: ["test-conservative-name"],
      transactions: [{ sourceKey: "test-conservative-name", name: "Zakupy Spożywcze", amount: 88, date: today, occurredAt: `${today}T10:45:00`, category: "Inne", currency: "PLN", transactionType: "transfer_in" }],
    }),
  });
  const conservativeCandidate = conservativePreview.matchAnalysis?.[0]?.planCandidates?.find((candidate) => String(candidate.planId) === String(conservativePlan.id));
  assert.ok(conservativeCandidate, "konserwatywny matching: kandydat o tej samej kwocie/dacie zniknął z ręcznego wyboru");
  assert.equal(conservativeCandidate.recommended, false, "konserwatywny matching: różna nazwa została automatycznie zarekomendowana");
  await request(`/przychody/${conservativePlan.id}`, { method: "DELETE" });
  process.stdout.write("✓ resolution=existing zachowuje provenance manual oraz konserwatywny auto-match\n");


  // P0: usunięcie planu musi usunąć allocations, w których plan jest targetem, ale zachować actual.
  const cleanupTargetPlan = await request("/przychody", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST cleanup target plan", kwota: 90, kategoria: "Inne", data_dodania: today, pewnosc: "expected" }),
  });
  await request(`/konta/${importAccount.id}/import-transactions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions: [{
      sourceKey: "test-cleanup-target-actual", name: "TEST cleanup target actual", amount: 90, date: today,
      occurredAt: `${today}T10:50:00`, category: "Inne", currency: "PLN", transactionType: "transfer_in",
      resolution: "plan", planMatches: [{ source: "one_time", planId: cleanupTargetPlan.id, amount: 90 }],
    }] }),
  });
  let cleanupTargetActual = (await request("/przychody")).find((row) => row.nazwa === "TEST cleanup target actual" && row.import_fingerprint);
  assert.equal(JSON.parse(cleanupTargetActual?.plan_allocations ?? "[]").length, 1, "cleanup allocation: actual nie ma przygotowanego powiązania do planu");
  await request(`/przychody/${cleanupTargetPlan.id}`, { method: "DELETE" });
  cleanupTargetActual = (await request("/przychody")).find((row) => String(row.id) === String(cleanupTargetActual.id));
  assert.equal(JSON.parse(cleanupTargetActual?.plan_allocations ?? "[]").length, 0, "cleanup allocation: usunięcie planu zostawiło orphan allocation na actual");
  await request(`/przychody/${cleanupTargetActual.id}`, { method: "DELETE" });
  process.stdout.write("✓ cleanup Plan↔Actual usuwa allocations także po stronie target planu\n");

  const creditCardImportAccount = await request("/konta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST karta import CSV", saldo_dostepne: 300, saldo_wlasciwe: -1200, typ_depozytu: "karta_kredytowa", repayment_account_id: importAccount.id }),
  });
  await request(`/konta/${creditCardImportAccount.id}`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST karta import CSV", saldo_dostepne: 300, saldo_wlasciwe: -1200, typ_depozytu: "karta_kredytowa", repayment_account_id: null }),
  });
  let cardAfterRelationEdit = (await request("/konta")).find((row) => String(row.id) === String(creditCardImportAccount.id));
  assert.equal(cardAfterRelationEdit.repayment_account_id, null, "karta: edycja nie usunęła konta spłacającego");
  await request(`/konta/${creditCardImportAccount.id}`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST karta import CSV", saldo_dostepne: 300, saldo_wlasciwe: -1200, typ_depozytu: "karta_kredytowa", repayment_account_id: importAccount.id }),
  });
  cardAfterRelationEdit = (await request("/konta")).find((row) => String(row.id) === String(creditCardImportAccount.id));
  assert.equal(Number(cardAfterRelationEdit.repayment_account_id), Number(importAccount.id), "karta: edycja nie zapisała konta spłacającego");
  const overlappingCardTransaction = { sourceKey: "test-card-overlap", name: "TEST sklep", amount: -25.5, date: today, occurredAt: `${today}T08:16:00`, category: "Jedzenie", currency: "PLN", transactionType: "card_payment" };
  const repaymentCardTransaction = { sourceKey: "test-card-repayment", name: "To PLN", amount: -10, date: today, occurredAt: `${today}T09:21:00`, category: "Transfer własny", currency: "PLN", transactionType: "card_repayment" };
  const crossAccountPreview = await request(`/konta/${creditCardImportAccount.id}/import-transactions/check-duplicates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceKeys: [overlappingCardTransaction.sourceKey, repaymentCardTransaction.sourceKey], transactions: [overlappingCardTransaction, repaymentCardTransaction] }),
  });
  assert.deepEqual(crossAccountPreview.duplicateSourceKeys, [], "import karty: możliwe nakładanie nie powinno być twardym duplikatem");
  const cardOverlap = crossAccountPreview.possibleOverlaps?.find((row) => row.sourceKey === overlappingCardTransaction.sourceKey);
  assert.equal(cardOverlap?.sourceKey, overlappingCardTransaction.sourceKey, "import karty: nie wykryto nakładania transakcji między kontami");
  assert.equal(cardOverlap?.accountName, "TEST import CSV", "import karty: sugestia wskazuje błędne konto");
  assert.equal(crossAccountPreview.possibleOverlaps?.find((row) => row.sourceKey === repaymentCardTransaction.sourceKey)?.reason, "own-transfer", "import karty: relacja konta nie wsparła rozpoznania spłaty");

  const persistedImportCard = (await request("/konta")).find((row) => String(row.id) === String(creditCardImportAccount.id));
  assert.equal(Number(persistedImportCard.repayment_account_id), Number(importAccount.id), "karta: nie zapisano konta spłacającego");
  assert.equal(persistedImportCard.repayment_account_name, "TEST import CSV", "karta: nie zwrócono nazwy konta spłacającego");

  await request(`/konta/${creditCardImportAccount.id}/import-transactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions: [overlappingCardTransaction] }),
  });
  const creditCardAfterImport = (await request("/konta")).find((row) => String(row.id) === String(creditCardImportAccount.id));
  assert.equal(Number(creditCardAfterImport.saldo_dostepne), 300, "import karty zmienił wolny limit/saldo dostępne");
  assert.equal(Number(creditCardAfterImport.saldo_wlasciwe), -1200, "import karty zmienił saldo rzeczywiste/zadłużenie");
  const importedCardExpense = (await request("/wydatki")).find((row) => row.import_fingerprint && String(row.account_id) === String(creditCardImportAccount.id));
  assert.equal(importedCardExpense?.import_source, "CSV karty kredytowej", "import karty nie zachował właściwego źródła");


  // Krytyczne regresje importu: konflikty planu mają zwracać 400, a cross-link ma być odwracalny.
  const conflictPlan = await request('/przychody', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST plan konflikt batcha', kwota: 300, kategoria: 'Inne', data_dodania: today, pewnosc: 'expected' }),
  });
  const conflictRows = [1, 2, 3].map((index) => ({
    sourceKey: `test-plan-conflict-${index}`,
    name: `TEST plan konflikt ${index}`,
    amount: 200,
    date: today,
    occurredAt: `${today}T11:4${index}:00`,
    category: 'Inne',
    currency: 'PLN',
    transactionType: 'transfer_in',
    resolution: 'plan',
    planMatches: [{ source: 'one_time', planId: conflictPlan.id, amount: 200 }],
  }));
  const conflictResponse = await requestExpectStatus(`/konta/${importAccount.id}/import-transactions`, 400, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: conflictRows }),
  });
  assert.match(String(conflictResponse?.error ?? ''), /rozliczona|powiązania|planu/i, 'import CSV: konflikt planu nie zwrócił czytelnego błędu walidacji');
  const conflictNames = new Set(conflictRows.map((row) => row.name));
  assert.ok(!(await request('/przychody')).some((row) => conflictNames.has(row.nazwa) && row.import_fingerprint), 'import CSV: odrzucony batch zostawił częściowo zapisane operacje');
  await request(`/przychody/${conflictPlan.id}`, { method: 'DELETE' });


  // P1: pending/cancelled nie mogą być proponowane jako automatyczna druga strona transferu podczas importu.
  const inactiveOverlapAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST pending overlap', saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: 'konto' }),
  });
  await request(`/konta/${inactiveOverlapAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [
      { sourceKey: 'test-overlap-pending-peer', name: 'TEST pending peer', amount: -44, date: today, occurredAt: `${today}T11:55:00`, category: 'Inne', currency: 'PLN', transactionType: 'transfer_out', bankStatus: 'pending' },
      { sourceKey: 'test-overlap-cancelled-peer', name: 'TEST cancelled peer', amount: 45, date: today, occurredAt: `${today}T11:56:00`, category: 'Inne', currency: 'PLN', transactionType: 'transfer_in', bankStatus: 'cancelled' },
    ] }),
  });
  const inactiveOverlapPreview = await request(`/konta/${importAccount.id}/import-transactions/check-duplicates`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sourceKeys: ['test-overlap-pending-candidate', 'test-overlap-cancelled-candidate'],
      transactions: [
        { sourceKey: 'test-overlap-pending-candidate', name: 'TEST pending candidate', amount: 44, date: today, occurredAt: `${today}T11:57:00`, category: 'Inne', currency: 'PLN', transactionType: 'transfer_in' },
        { sourceKey: 'test-overlap-cancelled-candidate', name: 'TEST cancelled candidate', amount: -45, date: today, occurredAt: `${today}T11:58:00`, category: 'Inne', currency: 'PLN', transactionType: 'transfer_out' },
      ],
    }),
  });
  assert.ok(!inactiveOverlapPreview.possibleOverlaps?.some((row) => row.sourceKey === 'test-overlap-pending-candidate'), 'overlap importu: pending został zaproponowany jako completed transfer');
  assert.ok(!inactiveOverlapPreview.possibleOverlaps?.some((row) => row.sourceKey === 'test-overlap-cancelled-candidate'), 'overlap importu: cancelled został zaproponowany jako completed transfer');
  for (const row of (await request('/wydatki')).filter((item) => String(item.account_id) === String(inactiveOverlapAccount.id))) await request(`/wydatki/${row.id}`, { method: 'DELETE' });
  for (const row of (await request('/przychody')).filter((item) => String(item.account_id) === String(inactiveOverlapAccount.id))) await request(`/przychody/${row.id}`, { method: 'DELETE' });
  await request(`/konta/${inactiveOverlapAccount.id}`, { method: 'DELETE' });
  process.stdout.write('✓ pending/cancelled nie trafiają do automatycznych sugestii transferu\n');

  const transferPeerAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST druga strona transferu', saldo_dostepne: 250, saldo_wlasciwe: 250, typ_depozytu: 'konto' }),
  });
  await request(`/konta/${transferPeerAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{ sourceKey: 'test-transfer-peer-in', name: 'TEST cross wpływ', amount: 55, date: today, occurredAt: `${today}T12:00:00`, category: 'Inne', currency: 'PLN', transactionType: 'transfer_in' }] }),
  });
  let transferPeerIncome = (await request('/przychody')).find((row) => row.nazwa === 'TEST cross wpływ' && String(row.account_id) === String(transferPeerAccount.id));
  assert.ok(transferPeerIncome?.id, 'cross-link: nie utworzono drugiej strony transferu');

  const linkedTransferImport = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{
      sourceKey: 'test-transfer-out-linked', name: 'TEST cross wypływ', amount: -55, date: today, occurredAt: `${today}T12:00:05`,
      category: 'Inne', currency: 'PLN', transactionType: 'transfer_out', resolution: 'transfer',
      transferTarget: { kind: 'income', transactionId: transferPeerIncome.id },
    }] }),
  });
  assert.equal(linkedTransferImport.linkedTransfers, 1, 'cross-link: potwierdzony transfer nie został powiązany');
  let linkedTransferExpense = (await request('/wydatki')).find((row) => row.nazwa === 'TEST cross wypływ' && String(row.account_id) === String(importAccount.id));
  transferPeerIncome = (await request('/przychody')).find((row) => String(row.id) === String(transferPeerIncome.id));
  assert.equal(Number(linkedTransferExpense?.excluded_from_analysis), 0, 'cross-link: transfer nie może zmieniać ręcznego wyłączenia wypływu');
  assert.equal(Number(transferPeerIncome?.excluded_from_analysis), 0, 'cross-link: transfer nie może zmieniać ręcznego wyłączenia wpływu');
  assert.ok(linkedTransferExpense?.transfer_link_id, 'cross-link: GET nie zwraca id powiązania');
  assert.equal(Number(linkedTransferExpense.transfer_link_id), Number(transferPeerIncome.transfer_link_id), 'cross-link: obie strony wskazują inne powiązanie');

  const cancelledLinkedTransfer = await request(`/konta/${importAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{
      sourceKey: 'test-transfer-out-linked', name: 'TEST cross wypływ', amount: -55, date: today, occurredAt: `${today}T12:00:05`,
      category: 'Inne', currency: 'PLN', transactionType: 'transfer_out', bankStatus: 'cancelled', resolution: 'new',
    }] }),
  });
  assert.equal(cancelledLinkedTransfer.refreshedTransactions, 1, 'cross-link/status: zmiana statusu nie odświeżyła istniejącej operacji');
  linkedTransferExpense = (await request('/wydatki')).find((row) => row.nazwa === 'TEST cross wypływ' && String(row.account_id) === String(importAccount.id));
  transferPeerIncome = (await request('/przychody')).find((row) => String(row.id) === String(transferPeerIncome.id));
  assert.equal(linkedTransferExpense?.import_status, 'cancelled', 'cross-link/status: anulowana operacja ma błędny status');
  assert.equal(linkedTransferExpense?.zrealizowany, false, 'cross-link/status: anulowana operacja nadal jest wykonana');
  assert.equal(Number(linkedTransferExpense?.excluded_from_analysis), 1, 'cross-link/status: anulowana operacja powinna pozostać poza analizą');
  assert.equal(linkedTransferExpense?.transfer_link_id, null, 'cross-link/status: anulowanie zostawiło osierocony cross-link');
  assert.equal(Number(transferPeerIncome?.excluded_from_analysis), 0, 'cross-link/status: anulowanie nie przywróciło drugiej strony do analizy');
  assert.equal(transferPeerIncome?.transfer_link_id, null, 'cross-link/status: druga strona nadal wskazuje usunięty link');

  await request(`/konta/${importAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{
      sourceKey: 'test-transfer-out-linked', name: 'TEST cross wypływ', amount: -55, date: today, occurredAt: `${today}T12:00:05`,
      category: 'Inne', currency: 'PLN', transactionType: 'transfer_out', bankStatus: 'completed', resolution: 'new',
    }] }),
  });
  linkedTransferExpense = (await request('/wydatki')).find((row) => row.nazwa === 'TEST cross wypływ' && String(row.account_id) === String(importAccount.id));
  assert.equal(linkedTransferExpense?.zrealizowany, true, 'status importu: completed po cancelled nie przywrócił wykonania');
  assert.equal(Number(linkedTransferExpense?.excluded_from_analysis), 0, 'status importu: completed po cancelled pozostał niesłusznie poza analizą');

  // Same-sign cross-link jest dozwolony tylko dla karty kredytowej i card_repayment.
  const cardRepaymentSource = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST źródło spłaty karty', saldo_dostepne: 500, saldo_wlasciwe: 500, typ_depozytu: 'konto' }),
  });
  await request(`/konta/${cardRepaymentSource.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{ sourceKey: 'test-card-same-sign-source', name: 'TEST spłata źródło', amount: -60, date: today, occurredAt: `${today}T13:00:00`, category: 'Inne', currency: 'PLN', transactionType: 'transfer_out' }] }),
  });
  let cardRepaymentSourceExpense = (await request('/wydatki')).find((row) => row.nazwa === 'TEST spłata źródło' && String(row.account_id) === String(cardRepaymentSource.id));
  assert.ok(cardRepaymentSourceExpense?.id, 'spłata karty: brak operacji źródłowej');

  await requestExpectStatus(`/konta/${creditCardImportAccount.id}/import-transactions`, 400, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{
      sourceKey: 'test-card-same-sign-invalid', name: 'TEST zwykły zakup -60', amount: -60, date: today, occurredAt: `${today}T13:00:05`,
      category: 'Inne', currency: 'PLN', transactionType: 'card_payment', resolution: 'transfer',
      transferTarget: { kind: 'expense', transactionId: cardRepaymentSourceExpense.id },
    }] }),
  });
  assert.ok(!(await request('/wydatki')).some((row) => row.nazwa === 'TEST zwykły zakup -60' && String(row.account_id) === String(creditCardImportAccount.id)), 'spłata karty: odrzucony same-sign link zostawił transakcję po rollbacku');

  const validCardRepaymentLink = await request(`/konta/${creditCardImportAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{
      sourceKey: 'test-card-same-sign-valid', name: 'TEST spłata karta -60', amount: -60, date: today, occurredAt: `${today}T13:00:10`,
      category: 'Inne', currency: 'PLN', transactionType: 'card_repayment', resolution: 'transfer',
      transferTarget: { kind: 'expense', transactionId: cardRepaymentSourceExpense.id },
    }] }),
  });
  assert.equal(validCardRepaymentLink.linkedTransfers, 1, 'spłata karty: prawidłowy expense↔expense nie został powiązany');
  let linkedCardRepayment = (await request('/wydatki')).find((row) => row.nazwa === 'TEST spłata karta -60' && String(row.account_id) === String(creditCardImportAccount.id));
  cardRepaymentSourceExpense = (await request('/wydatki')).find((row) => String(row.id) === String(cardRepaymentSourceExpense.id));
  assert.equal(Number(linkedCardRepayment?.excluded_from_analysis), 0, 'spłata karty: cross-link nie może zmieniać ręcznego wyłączenia strony karty');
  assert.equal(Number(cardRepaymentSourceExpense?.excluded_from_analysis), 0, 'spłata karty: cross-link nie może zmieniać ręcznego wyłączenia strony rachunku');
  const cardRepaymentLinkId = Number(linkedCardRepayment?.transfer_link_id);
  assert.ok(Number.isInteger(cardRepaymentLinkId) && cardRepaymentLinkId > 0, 'spłata karty: brak id cross-linku');
  await request(`/konta/import-transfers/${cardRepaymentLinkId}`, { method: 'DELETE' });
  linkedCardRepayment = (await request('/wydatki')).find((row) => String(row.id) === String(linkedCardRepayment.id));
  cardRepaymentSourceExpense = (await request('/wydatki')).find((row) => String(row.id) === String(cardRepaymentSourceExpense.id));
  assert.equal(Number(linkedCardRepayment?.excluded_from_analysis), 0, 'cross-link: ręczne odpięcie nie przywróciło strony karty');
  assert.equal(Number(cardRepaymentSourceExpense?.excluded_from_analysis), 0, 'cross-link: ręczne odpięcie nie przywróciło strony rachunku');
  assert.equal(linkedCardRepayment?.transfer_link_id, null, 'cross-link: ręczne odpięcie zostawiło link po stronie karty');
  const manualCardRepaymentLink = await request('/konta/import-transfers', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'expense', transactionId: linkedCardRepayment.id, counterpartKind: 'expense', counterpartId: cardRepaymentSourceExpense.id }),
  });
  assert.ok(manualCardRepaymentLink?.id, 'spłata karty: ręczny expense↔expense card_repayment został błędnie zablokowany');
  await request(`/konta/import-transfers/${manualCardRepaymentLink.id}`, { method: 'DELETE' });


  // P0/P1: manualny cross-link po imporcie ma być elastyczny i atomowo zmienialny.
  const manualLinkIncome = await request('/przychody', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST manual link źródło', kwota: 10, kategoria: 'Inne', data_dodania: today }),
  });
  const manualLinkExpenseA = await request('/wydatki', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST manual link A', kwota: 999, kategoria: 'Inne', data_dodania: today }),
  });
  const manualLinkExpenseB = await request('/wydatki', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST manual link B', kwota: 1, kategoria: 'Inne', data_dodania: today }),
  });
  const manualLink = await request('/konta/import-transfers', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'income', transactionId: manualLinkIncome.id, counterpartKind: 'expense', counterpartId: manualLinkExpenseA.id }),
  });
  let manualIncomeRow = (await request('/przychody')).find((row) => String(row.id) === String(manualLinkIncome.id));
  let manualExpenseARow = (await request('/wydatki')).find((row) => String(row.id) === String(manualLinkExpenseA.id));
  assert.equal(Number(manualIncomeRow?.excluded_from_analysis), 0, 'manual cross-link: źródło nie może zmieniać ręcznego wyłączenia z analiz');
  assert.equal(Number(manualExpenseARow?.excluded_from_analysis), 0, 'manual cross-link: nietypowa kwota musi być dozwolona bez zmiany ręcznego wyłączenia');
  assert.equal(Number(manualIncomeRow?.transfer_link_id), Number(manualLink.id), 'manual cross-link: GET nie pokazuje utworzonego linku');
  const manualLinkIncomeB = await request('/przychody', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST manual link drugi przychód', kwota: 10, kategoria: 'Inne', data_dodania: today }),
  });
  await requestExpectStatus('/konta/import-transfers', 409, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'income', transactionId: manualLinkIncomeB.id, counterpartKind: 'income', counterpartId: manualLinkIncome.id }),
  });
  await requestExpectStatus('/konta/import-transfers', 409, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'expense', transactionId: manualLinkExpenseA.id, counterpartKind: 'expense', counterpartId: manualLinkExpenseB.id }),
  });
  await requestExpectStatus(`/konta/import-transfers/${manualLink.id}`, 409, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'income', transactionId: manualLinkIncome.id, counterpartKind: 'income', counterpartId: manualLinkIncome.id }),
  });
  manualIncomeRow = (await request('/przychody')).find((row) => String(row.id) === String(manualLinkIncome.id));
  manualExpenseARow = (await request('/wydatki')).find((row) => String(row.id) === String(manualLinkExpenseA.id));
  assert.equal(Number(manualIncomeRow?.transfer_link_id), Number(manualLink.id), 'manual cross-link PATCH: nieudana zmiana utraciła stare powiązanie');
  assert.equal(Number(manualExpenseARow?.transfer_link_id), Number(manualLink.id), 'manual cross-link PATCH: rollback nie przywrócił drugiej strony');
  const changedManualLink = await request(`/konta/import-transfers/${manualLink.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'income', transactionId: manualLinkIncome.id, counterpartKind: 'expense', counterpartId: manualLinkExpenseB.id }),
  });
  manualExpenseARow = (await request('/wydatki')).find((row) => String(row.id) === String(manualLinkExpenseA.id));
  let manualExpenseBRow = (await request('/wydatki')).find((row) => String(row.id) === String(manualLinkExpenseB.id));
  assert.equal(Number(manualExpenseARow?.excluded_from_analysis), 0, 'manual cross-link PATCH: poprzednia druga strona pozostała wyłączona');
  assert.equal(manualExpenseARow?.transfer_link_id, null, 'manual cross-link PATCH: poprzednia druga strona nadal ma link');
  assert.equal(Number(manualExpenseBRow?.transfer_link_id), Number(changedManualLink.id), 'manual cross-link PATCH: nowa druga strona nie została powiązana');
  await request(`/konta/import-transfers/${changedManualLink.id}`, { method: 'DELETE' });
  manualIncomeRow = (await request('/przychody')).find((row) => String(row.id) === String(manualLinkIncome.id));
  manualExpenseBRow = (await request('/wydatki')).find((row) => String(row.id) === String(manualLinkExpenseB.id));
  assert.equal(Number(manualIncomeRow?.excluded_from_analysis), 0, 'manual cross-link DELETE: źródło nie wróciło do analiz');
  assert.equal(Number(manualExpenseBRow?.excluded_from_analysis), 0, 'manual cross-link DELETE: druga strona nie wróciła do analiz');
  await request(`/przychody/${manualLinkIncome.id}`, { method: 'DELETE' });
  await request(`/przychody/${manualLinkIncomeB.id}`, { method: 'DELETE' });
  await request(`/wydatki/${manualLinkExpenseA.id}`, { method: 'DELETE' });
  await request(`/wydatki/${manualLinkExpenseB.id}`, { method: 'DELETE' });
  process.stdout.write('✓ ręczny cross-link: create/change/rollback/unlink bez heurystycznych blokad\n');

  // Korekta błędnego przypisania importu: konto można zmienić bez dotykania sald i provenance.
  const correctionTargetAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST konto korekty importu', saldo_dostepne: 321, saldo_wlasciwe: 321, typ_depozytu: 'konto' }),
  });
  const importSourceBeforeCorrection = (await request('/konta')).find((row) => String(row.id) === String(importAccount.id));
  const correctionTargetBefore = (await request('/konta')).find((row) => String(row.id) === String(correctionTargetAccount.id));
  const incomeFingerprintBefore = importedIncome.import_fingerprint;
  const partialFingerprintBefore = importedPartialIncome.import_fingerprint;
  await request('/przychody/bulk-account', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [importedIncome.id, importedPartialIncome.id], account_id: correctionTargetAccount.id }),
  });
  const correctedIncomes = await request('/przychody');
  const correctedImportedIncome = correctedIncomes.find((row) => String(row.id) === String(importedIncome.id));
  const correctedPartialIncome = correctedIncomes.find((row) => String(row.id) === String(importedPartialIncome.id));
  assert.equal(Number(correctedImportedIncome?.account_id), Number(correctionTargetAccount.id), 'korekta konta importu: przychód nie został przeniesiony');
  assert.equal(Number(correctedPartialIncome?.account_id), Number(correctionTargetAccount.id), 'korekta konta importu: bulk nie przeniósł wszystkich przychodów');
  assert.equal(correctedImportedIncome?.import_fingerprint, incomeFingerprintBefore, 'korekta konta importu: zmieniono fingerprint');
  assert.equal(correctedPartialIncome?.import_fingerprint, partialFingerprintBefore, 'korekta konta importu: bulk zmienił fingerprint');
  const importSourceAfterCorrection = (await request('/konta')).find((row) => String(row.id) === String(importAccount.id));
  const correctionTargetAfter = (await request('/konta')).find((row) => String(row.id) === String(correctionTargetAccount.id));
  assert.equal(Number(importSourceAfterCorrection?.saldo_dostepne), Number(importSourceBeforeCorrection?.saldo_dostepne), 'korekta konta importu: zmieniono saldo starego konta');
  assert.equal(Number(correctionTargetAfter?.saldo_dostepne), Number(correctionTargetBefore?.saldo_dostepne), 'korekta konta importu: zmieniono saldo nowego konta');
  await request('/wydatki/bulk-account', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [importedExpense.id], account_id: correctionTargetAccount.id }),
  });
  const correctedImportedExpense = (await request('/wydatki')).find((row) => String(row.id) === String(importedExpense.id));
  assert.equal(Number(correctedImportedExpense?.account_id), Number(correctionTargetAccount.id), 'korekta konta importu: wydatek nie został przeniesiony');
  assert.equal(Number(correctedImportedExpense?.custom_type_id), Number(sharedLabel.id), 'korekta konta importu: zgubiono etykietę');
  await requestExpectStatus('/przychody/bulk-account', 409, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [realizedIncomeForImport.id], account_id: correctionTargetAccount.id }),
  });
  const reconciledAfterRejectedMove = (await request('/przychody')).find((row) => String(row.id) === String(realizedIncomeForImport.id));
  assert.equal(Number(reconciledAfterRejectedMove?.account_id), Number(importAccount.id), 'korekta konta importu: manualny actual po resolution=existing został przeniesiony bez korekty salda');
  const duplicatePreviewAfterCorrection = await request(`/konta/${importAccount.id}/import-transactions/check-duplicates`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceKeys: [importPayload.transactions[1].sourceKey] }),
  });
  assert.ok(duplicatePreviewAfterCorrection.duplicateSourceKeys.includes(importPayload.transactions[1].sourceKey), 'korekta konta importu: przeniesienie rekordu zepsuło ochronę przed ponownym importem');
  process.stdout.write('✓ korekta konta importu: bulk/single semantics, brak zmiany sald i zachowany fingerprint\n');

  await request(`/wydatki/${linkedTransferExpense.id}`, { method: 'DELETE' });
  await request(`/przychody/${transferPeerIncome.id}`, { method: 'DELETE' });
  await request(`/konta/${transferPeerAccount.id}`, { method: 'DELETE' });
  await request(`/wydatki/${linkedCardRepayment.id}`, { method: 'DELETE' });
  await request(`/wydatki/${cardRepaymentSourceExpense.id}`, { method: 'DELETE' });
  await request(`/konta/${cardRepaymentSource.id}`, { method: 'DELETE' });
  process.stdout.write('✓ krytyczne regresje importu: rollback planu, statusy i cross-linki\n');

  await request(`/wydatki/${importedCardExpense.id}`, { method: "DELETE" });
  await request(`/wydatki/${importedExpense.id}`, { method: "DELETE" });
  await request(`/przychody/${importedIncome.id}`, { method: "DELETE" });
  await request(`/przychody/${importedPartialIncome.id}`, { method: "DELETE" });
  await request(`/przychody/${importedSplitIncome.id}`, { method: "DELETE" });
  await request(`/przychody/${plannedIncomeForImport.id}`, { method: "DELETE" });
  await request(`/przychody/${splitPlanA.id}`, { method: "DELETE" });
  await request(`/przychody/${splitPlanB.id}`, { method: "DELETE" });
  await request(`/przychody/${realizedIncomeForImport.id}`, { method: "DELETE" });
  await request(`/konta/${importAccount.id}`, { method: "DELETE" });
  await request(`/konta/${correctionTargetAccount.id}`, { method: "DELETE" });
  const cardAfterRepaymentAccountDelete = (await request("/konta")).find((row) => String(row.id) === String(creditCardImportAccount.id));
  assert.equal(cardAfterRepaymentAccountDelete.repayment_account_id, null, "karta: usunięcie konta spłacającego zostawiło osieroconą relację");
  await request(`/konta/${creditCardImportAccount.id}`, { method: "DELETE" });
  process.stdout.write("✓ import CSV (konto i karta, relacja spłaty, brak zmiany salda, duplikaty i nakładanie)\n");

  const linkedRecurringExpense = await request("/wydatki_stale", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST rata powiązana", kwota: 127.39, kategoria: "Kredyt", data_od: today, data_do: "2099-01-01", dzien_miesiaca: 10 }),
  });
  assert.ok(!(await request("/debt-plans")).some((row) => String(row.recurring_expense_id) === String(linkedRecurringExpense.id)), "etykieta/kategoria: sam tekst Kredyt nie może automatycznie tworzyć zobowiązania");
  const linkedDebtPlan = await request("/debt-plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ produkt: "TEST rata powiązana", typ: "Raty", zadluzenie: 1273.9, rata_miesieczna: 127.39, ilosc_rat: 10, recurring_expense_mode: "link", recurring_expense_id: linkedRecurringExpense.id, data_od: today, dzien_miesiaca: 10 }),
  });
  assert.equal(String(linkedDebtPlan.recurring_expense_id), String(linkedRecurringExpense.id), "jawne powiązanie: zobowiązanie nie przyjęło wskazanego stałego wydatku");
  assert.equal(Number(linkedDebtPlan.rata_miesieczna), 127.39, "jawne powiązanie: rata nie została pobrana ze stałego wydatku");
  await request(`/wydatki_stale/${linkedRecurringExpense.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST rata powiązana", kwota: 144.3, kategoria: "Inne", data_od: today, data_do: "2099-01-01", dzien_miesiaca: 10 }),
  });
  const linkedDebtPlanAfterExpenseEdit = (await request("/debt-plans")).find((row) => String(row.id) === String(linkedDebtPlan.id));
  assert.equal(Number(linkedDebtPlanAfterExpenseEdit.rata_miesieczna), 144.3, "jawne powiązanie: zmiana stałego wydatku nie odświeżyła raty po zmianie kategorii/etykiety");
  await request(`/debt-plans/${linkedDebtPlan.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ produkt: "TEST plan po edycji", typ: "Raty", zadluzenie: 1146.55, rata_miesieczna: 155.4, ilosc_rat: 8, recurring_expense_mode: "keep", recurring_expense_id: linkedRecurringExpense.id }),
  });
  const linkedExpenseAfterPlanEdit = (await request("/wydatki_stale")).find((row) => String(row.id) === String(linkedRecurringExpense.id));
  assert.equal(linkedExpenseAfterPlanEdit.nazwa, "TEST plan po edycji", "jawne powiązanie: nazwa nie odświeżyła stałego wydatku");
  assert.equal(Number(linkedExpenseAfterPlanEdit.kwota), 155.4, "jawne powiązanie: rata nie odświeżyła stałego wydatku");
  await request(`/debt-plans/${linkedDebtPlan.id}`, { method: "DELETE" });
  assert.ok(!(await request("/wydatki_stale")).some((row) => String(row.id) === String(linkedRecurringExpense.id)), "jawne powiązanie: usunięcie planu nie usunęło powiązanego stałego wydatku");

  const debtPlanWithInstallment = await request("/debt-plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ produkt: "TEST pożyczka tworząca wydatek", typ: "Kredyt", zadluzenie: 900, rata_miesieczna: 90, ilosc_rat: 10, wolny_limit: null, limit_kredytowy: null, recurring_expense_id: null, data_od: today, data_do: "2099-01-01", dzien_miesiaca: 12 }),
  });
  assert.ok(debtPlanWithInstallment.recurring_expense_id, "plan pożyczek: plan z ratą nie utworzył stałego wydatku");
  const expenseCreatedFromPlan = (await request("/wydatki_stale")).find((row) => String(row.id) === String(debtPlanWithInstallment.recurring_expense_id));
  assert.equal(expenseCreatedFromPlan.kategoria, "Inne", "zobowiązania: techniczne pole legacy kategorii nowej raty powinno pozostać neutralne");
  assert.equal(Number(expenseCreatedFromPlan.kwota), 90, "plan pożyczek: utworzony stały wydatek ma błędną kwotę");
  assert.equal(Number(expenseCreatedFromPlan.dzien_miesiaca), 12, "plan pożyczek: utworzony stały wydatek ma błędny dzień miesiąca");
  const creditCreatedFromPlan = (await request("/loans")).find((row) => String(row.id) === String(debtPlanWithInstallment.loan_id));
  assert.ok(creditCreatedFromPlan, "zobowiązania: nowy wpis nie pojawił się w Kredytach");
  assert.equal(creditCreatedFromPlan.data_rozpoczecia, today, "zobowiązania: data od nie trafiła do Kredytu");
  assert.equal(creditCreatedFromPlan.data_do, installmentEndDate(today, 10, 12), "zobowiązania: data zakończenia nie została wyliczona z liczby rat");
  assert.equal(Number(creditCreatedFromPlan.dzien_splaty), 12, "zobowiązania: dzień spłaty nie trafił do Kredytu");
  assert.equal(creditCreatedFromPlan.kwota_kapitalu, null, "zobowiązania: dodatkowy kapitał Kredytu nie pozostał pusty");
  await request(`/loans/${creditCreatedFromPlan.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...creditCreatedFromPlan, nazwa: "TEST zobowiązanie uzupełniane", kwota_kapitalu: 500 }),
  });
  const partiallyCompletedCredit = (await request("/loans")).find((row) => String(row.id) === String(creditCreatedFromPlan.id));
  assert.equal(Number(partiallyCompletedCredit.kwota_kapitalu), 500, "kredyty: nie można uzupełniać pustych pól pojedynczo");
  assert.equal(partiallyCompletedCredit.data_rozpoczecia, today, "kredyty: częściowa edycja zgubiła datę rozpoczęcia");
  const planAfterPartialCreditEdit = (await request("/debt-plans")).find((row) => String(row.id) === String(debtPlanWithInstallment.id));
  assert.equal(planAfterPartialCreditEdit.produkt, "TEST zobowiązanie uzupełniane", "kredyty: częściowa edycja nie odświeżyła Zobowiązania");
  const expenseAfterPartialCreditEdit = (await request("/wydatki_stale")).find((row) => String(row.id) === String(expenseCreatedFromPlan.id));
  assert.equal(expenseAfterPartialCreditEdit.nazwa, "TEST zobowiązanie uzupełniane", "kredyty: edycja nie odświeżyła powiązanego stałego wydatku");
  await request(`/wydatki_stale/${expenseCreatedFromPlan.id}`, { method: "DELETE" });
  const planAfterExpenseDelete = (await request("/debt-plans")).find((row) => String(row.id) === String(debtPlanWithInstallment.id));
  assert.ok(planAfterExpenseDelete, "zobowiązania: usunięcie stałego wydatku usunęło powiązany Kredyt");
  assert.equal(planAfterExpenseDelete.recurring_expense_id, null, "zobowiązania: usunięty stały wydatek pozostał powiązany");
  await request(`/debt-plans/${debtPlanWithInstallment.id}`, { method: "DELETE" });
  assert.ok(!(await request("/loans")).some((row) => String(row.id) === String(debtPlanWithInstallment.loan_id)), "zobowiązania: usunięcie wpisu zostawiło powiązany Kredyt");

  const expenseToAdopt = await request("/wydatki_stale", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST rata do powiązania", kwota: 500, kategoria: "Kredyt", data_od: today, data_do: "2099-01-01", dzien_miesiaca: 15 }),
  });
  const creditAdoptingExpense = await request("/loans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST kredyt powiązany", typ: "Kredyt", data_rozpoczecia: today, ilosc_rat: 12, kwota_kapitalu: 6000, kwota_calkowita: 6000, kwota_raty: 500, rrso: 8, dzien_splaty: 15, oprocentowanie: 7, prowizja: 0, ubezpieczenie: 0, recurring_expense_mode: "link", recurring_expense_id: expenseToAdopt.id }),
  });
  const adoptedPlan = (await request("/debt-plans")).find((row) => String(row.loan_id) === String(creditAdoptingExpense.id));
  assert.equal(String(adoptedPlan.recurring_expense_id), String(expenseToAdopt.id), "kredyt: wskazany stały wydatek nie został jawnie powiązany");
  await request(`/wydatki_stale/${expenseToAdopt.id}`, { method: "DELETE" });
  assert.ok((await request("/loans")).some((row) => String(row.id) === String(creditAdoptingExpense.id)), "kredyt: usunięcie powiązanego wydatku usunęło kredyt");
  await request(`/loans/${creditAdoptingExpense.id}`, { method: "DELETE" });

  const creditWithoutExpense = await request("/loans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST kredyt bez wydatku", typ: "Kredyt", data_rozpoczecia: today, ilosc_rat: 6, kwota_kapitalu: 600, kwota_calkowita: 600, kwota_raty: 100, rrso: 0, dzien_splaty: 10, oprocentowanie: 0, prowizja: 0, ubezpieczenie: 0, recurring_expense_mode: "none" }),
  });
  const planWithoutExpense = (await request("/debt-plans")).find((row) => String(row.loan_id) === String(creditWithoutExpense.id));
  assert.equal(planWithoutExpense.recurring_expense_id, null, "kredyt: wyłączony wydatek stały został mimo to utworzony");
  await request(`/loans/${creditWithoutExpense.id}`, { method: "DELETE" });
  process.stdout.write("✓ kredyt/zobowiązanie ↔ stały wydatek przez jawną relację, niezależnie od etykiety\n");

  const integratedCredit = await request("/loans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST kredyt zintegrowany", typ: "Kredyt", data_rozpoczecia: today, data_do: "2027-04-23", ilosc_rat: 9, kwota_kapitalu: 1000, kwota_calkowita: 9999, kwota_raty: 127.39, rrso: 8, dzien_splaty: 10, oprocentowanie: 7, prowizja: 0, ubezpieczenie: 0 }),
  });
  assert.equal(Number(integratedCredit.kwota_calkowita), 9999, "kredyty: ręczna korekta zadłużenia została nadpisana iloczynem rat");
  let integratedPlan = (await request("/debt-plans")).find((row) => String(row.loan_id) === String(integratedCredit.id));
  assert.ok(integratedPlan, "kredyty: rekord nie pojawił się w planie Pożyczki");
  assert.equal(Number(integratedPlan.zadluzenie), 9999, "kredyty: plan ma inne zadłużenie niż moduł Kredyty");
  const expenseCreatedFromCredit = (await request("/wydatki_stale")).find((row) => String(row.id) === String(integratedPlan.recurring_expense_id));
  assert.ok(expenseCreatedFromCredit, "kredyty: rata nie pojawiła się w Stałych wydatkach");
  assert.equal(expenseCreatedFromCredit.kategoria, "Inne", "kredyty: automatyczna rata powinna mieć neutralne techniczne pole kategorii");
  assert.equal(Number(expenseCreatedFromCredit.kwota), 127.39, "kredyty: stały wydatek ma błędną ratę");
  assert.equal(expenseCreatedFromCredit.data_od, today, "kredyty: stały wydatek ma błędną datę od");
  assert.equal(expenseCreatedFromCredit.data_do, installmentEndDate(today, 9, 10), "kredyty: stały wydatek ma błędną datę do");
  assert.equal(Number(expenseCreatedFromCredit.dzien_miesiaca), 10, "kredyty: stały wydatek ma błędny dzień płatności");
  await request(`/debt-plans/${integratedPlan.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ produkt: "TEST hipoteka zintegrowana", typ: "Kredyt hipoteczny", zadluzenie: 250000, rata_miesieczna: 2000, ilosc_rat: 240, recurring_expense_id: null, kwota_kapitalu: 240000, rrso: 5.2, oprocentowanie: 4.5, prowizja: 500, ubezpieczenie: 100 }),
  });
  let integratedLoan = (await request("/loans")).find((row) => String(row.id) === String(integratedCredit.id));
  assert.equal(integratedLoan.typ, "Kredyt hipoteczny", "kredyty: typ nie zsynchronizował się z planu");
  assert.equal(Number(integratedLoan.kwota_calkowita), 250000, "hipoteka: ręczne zadłużenie zostało nadpisane iloczynem rat");
  assert.equal(Number(integratedLoan.kwota_kapitalu), 240000, "wspólny formularz: kapitał nie trafił do Kredytów");
  assert.equal(Number(integratedLoan.rrso), 5.2, "wspólny formularz: RRSO nie trafiło do Kredytów");
  assert.equal(Number(integratedLoan.oprocentowanie), 4.5, "wspólny formularz: oprocentowanie nie trafiło do Kredytów");
  assert.equal(Number(integratedLoan.prowizja), 500, "wspólny formularz: prowizja nie trafiła do Kredytów");
  assert.equal(Number(integratedLoan.ubezpieczenie), 100, "wspólny formularz: ubezpieczenie nie trafiło do Kredytów");
  await request(`/loans/${integratedCredit.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...integratedLoan, data_rozpoczecia: "2026-09-15", data_do: "2046-08-15", dzien_splaty: 15 }),
  });
  integratedLoan = (await request("/loans")).find((row) => String(row.id) === String(integratedCredit.id));
  assert.equal(integratedLoan.data_rozpoczecia, "2026-09-15", "hipoteka: data rozpoczęcia nie została zapisana");
  assert.equal(integratedLoan.data_do, "2046-08-15", "hipoteka: data zakończenia nie została zapisana");
  assert.equal(Number(integratedLoan.dzien_splaty), 15, "hipoteka: dzień spłaty nie został zapisany");
  const expenseAfterMortgageDates = (await request("/wydatki_stale")).find((row) => String(row.id) === String(integratedPlan.recurring_expense_id));
  assert.equal(expenseAfterMortgageDates.data_od, "2026-09-15", "hipoteka: data od nie zsynchronizowała się ze Stałym wydatkiem");
  assert.equal(expenseAfterMortgageDates.data_do, "2046-08-15", "hipoteka: data do nie zsynchronizowała się ze Stałym wydatkiem");
  assert.equal(Number(expenseAfterMortgageDates.dzien_miesiaca), 15, "hipoteka: dzień spłaty nie zsynchronizował się ze Stałym wydatkiem");
  integratedPlan = (await request("/debt-plans")).find((row) => String(row.id) === String(integratedPlan.id));
  assert.equal(integratedPlan.limit_kredytowy, null, "hipoteka: limit karty nie został wyczyszczony");
  await requestExpectStatus(`/debt-plans/${integratedPlan.id}`, 409, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ produkt: "TEST karta zintegrowana", typ: "Karta kredytowa", zadluzenie: 1200, rata_miesieczna: 100, ilosc_rat: 12, wolny_limit: 300, limit_kredytowy: 1500, recurring_expense_id: null }),
  });
  integratedPlan = (await request("/debt-plans")).find((row) => String(row.id) === String(integratedPlan.id));
  assert.equal(integratedPlan.typ, "Kredyt hipoteczny", "walidacja typów: odrzucona edycja zmieniła hipotekę w kartę");
  await request(`/loans/${integratedCredit.id}`, { method: "DELETE" });
  assert.ok(!(await request("/debt-plans")).some((row) => String(row.id) === String(integratedPlan.id)), "kredyty: usunięcie kredytu zostawiło osierocony plan");
  process.stdout.write("✓ Kredyty ↔ Pożyczki, typy, wyliczane zadłużenie i wymagane limity karty\n");

  const queueDay = new Date().getDate() < 28 ? new Date().getDate() + 1 : 1;
  const expectedOccurrence = nextOccurrence(queueDay);
  const queuedRecurringIncome = await request("/przychody_stale", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST kolejka stałego przychodu", kwota: 321.45, kategoria: "Wynagrodzenie", data_od: today, data_do: "2099-01-01", dzien_miesiaca: queueDay }),
  });
  let generatedIncomes = (await request("/przychody")).filter((row) => row.nazwa === "TEST kolejka stałego przychodu");
  assert.equal(generatedIncomes.length, 1, "stały przychód: nie utworzono dokładnie jednego najbliższego wpływu");
  assert.equal(generatedIncomes[0].data_dodania, expectedOccurrence, "stały przychód: wygenerowano wpływ na błędny termin");
  assert.equal(Number(generatedIncomes[0].kwota), 321.45, "stały przychód: wygenerowano wpływ z błędną kwotą");
  assert.equal(generatedIncomes[0].transaction_type, "top_up", "stały przychód: nowy wpływ nie ma typu Zasilenie");
  assert.equal(generatedIncomes[0].generated_from_recurring, true, "stały przychód: wygenerowany wpływ nie ma informacji o źródle");
  const queuedIncomeAccount = await request("/konta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST konto kolejki", saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: "konto" }),
  });
  await request(`/przychody/realize/${generatedIncomes[0].id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: queuedIncomeAccount.id, amount: 21.45 }),
  });
  generatedIncomes = (await request("/przychody")).filter((row) => row.nazwa === "TEST kolejka stałego przychodu");
  const queuedIncomeRemainder = generatedIncomes.find((row) => !row.zrealizowany);
  assert.equal(Number(queuedIncomeRemainder?.kwota), 300, "stały przychód: generator przywrócił kwotę po częściowej realizacji");
  for (const row of generatedIncomes) await request(`/przychody/${row.id}`, { method: "DELETE" });
  generatedIncomes = (await request("/przychody")).filter((row) => row.nazwa === "TEST kolejka stałego przychodu");
  assert.equal(generatedIncomes.length, 0, "stały przychód: usunięty wpływ odtworzył się w tym samym terminie");
  const recurringAfterDismiss = (await request("/przychody_stale")).find((row) => String(row.id) === String(queuedRecurringIncome.id));
  assert.ok(recurringAfterDismiss.occurrence_overrides.some((override) => override.date === expectedOccurrence && override.status === "dismissed"), "stały przychód: prognoza nie dostała informacji o pominiętym wystąpieniu");
  await request(`/przychody_stale/${queuedRecurringIncome.id}`, { method: "DELETE" });
  await request(`/konta/${queuedIncomeAccount.id}`, { method: "DELETE" });
  process.stdout.write("✓ stały przychód → najbliższy wpływ, częściowa realizacja i brak regeneracji\n");

  await requestExpectStatus('/konta/999999999', 404, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'Nieistniejące konto', saldo_dostepne: 10, saldo_wlasciwe: 10, typ_depozytu: 'konto' }),
  });
  process.stdout.write('✓ konto: brak fałszywego sukcesu dla nieistniejącego rekordu\n');
  await requestExpectStatus('/konta/999999999', 404, { method: 'DELETE' });
  await requestExpectStatus('/wydatki/999999999', 404, { method: 'DELETE' });
  await requestExpectStatus('/modules-config/__missing_module__', 404, { method: 'DELETE' });
  await requestExpectStatus('/app-activity-logs/999999999', 404, { method: 'DELETE' });
  process.stdout.write('✓ DELETE: brak fałszywego sukcesu dla nieistniejących rekordów\n');

  const virtualWallet = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST wirtualny portfel', saldo_dostepne: 250, saldo_wlasciwe: 250, typ_depozytu: 'wirtualny_portfel' }),
  });
  assert.equal(virtualWallet.typ_depozytu, 'wirtualny_portfel', 'wirtualny portfel: nie zapisano nowego typu konta');
  await requestExpectStatus('/konta', 400, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST karta z portfelem', saldo_dostepne: 100, saldo_wlasciwe: -900, typ_depozytu: 'karta_kredytowa', repayment_account_id: virtualWallet.id }),
  });
  await request(`/konta/${virtualWallet.id}`, { method: 'DELETE' });
  process.stdout.write('✓ wirtualny portfel: zwykłe saldo i blokada powiązania z produktem kredytowym\n');

  const cardCreatedFromPlan = await request('/debt-plans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST karta od zobowiązania', typ: 'Karta kredytowa', zadluzenie: 0, rata_miesieczna: null, ilosc_rat: null, wolny_limit: 113.21, limit_kredytowy: 3000, recurring_expense_id: null, data_od: today, oprocentowanie: 18.5 }),
  });
  assert.ok(cardCreatedFromPlan.account_id, 'karta z Zobowiązań: nie utworzono powiązanego konta');
  assert.equal(cardCreatedFromPlan.data_od, today, 'karta z Zobowiązań: nie zapisano opcjonalnej daty rozpoczęcia');
  assert.equal(Number(cardCreatedFromPlan.oprocentowanie), 18.5, 'karta z Zobowiązań: nie zapisano opcjonalnego oprocentowania');
  await request(`/debt-plans/${cardCreatedFromPlan.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST karta od zobowiązania', typ: 'Karta kredytowa', zadluzenie: 0, rata_miesieczna: null, ilosc_rat: null, wolny_limit: 115.21, limit_kredytowy: 3000, recurring_expense_id: null, data_od: today, oprocentowanie: 18.5 }),
  });
  const accountCreatedFromPlan = (await request('/konta')).find((row) => String(row.id) === String(cardCreatedFromPlan.account_id));
  assert.equal(Number(accountCreatedFromPlan.saldo_dostepne), 115.21, 'karta z Zobowiązań: wolny limit nie odświeżył salda dostępnego');
  assert.equal(Number(accountCreatedFromPlan.saldo_wlasciwe), -2884.79, 'karta z Zobowiązań: saldo rzeczywiste nie jest wolnym limitem minus limit karty');
  assert.equal(Number(accountCreatedFromPlan.limit_kredytowy), 3000, 'karta z Zobowiązań: depozyt nie zwraca jawnego limitu karty');
  await request(`/debt-plans/${cardCreatedFromPlan.id}`, { method: 'DELETE' });
  await request(`/konta/${cardCreatedFromPlan.account_id}`, { method: 'DELETE' });
  process.stdout.write('✓ karta kredytowa: Zobowiązanie → Konto i synchronizacja limitów\n');

  const creditCardAccount = await request('/konta', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST karta kredytowa', saldo_dostepne: 110.21, saldo_wlasciwe: -2890.79, typ_depozytu: 'karta_kredytowa' }),
  });
  let persistedCreditCard = (await request('/konta')).find((row) => String(row.id) === String(creditCardAccount.id));
  assert.equal(Number(persistedCreditCard.saldo_dostepne), 110.21, 'karta kredytowa: błędne saldo dostępne');
  assert.equal(Number(persistedCreditCard.saldo_wlasciwe), -2890.79, 'karta kredytowa: ujemne saldo rzeczywiste nie zostało zapisane');
  let accountDebtPlan = (await request('/debt-plans')).find((row) => String(row.account_id) === String(creditCardAccount.id));
  assert.ok(accountDebtPlan, 'karta kredytowa: konto nie pojawiło się w tabie Kredyty');
  assert.equal(Number(accountDebtPlan.wolny_limit), 110.21, 'karta kredytowa: wolny limit nie odpowiada środkom dostępnym konta');
  assert.equal(Number(accountDebtPlan.limit_kredytowy), 3001, 'karta kredytowa: limit nie został wyprowadzony z sald konta');
  assert.equal(Number(persistedCreditCard.limit_kredytowy), 3001, 'karta kredytowa: depozyt nie zwraca jawnego limitu karty');
  assert.equal(Number(accountDebtPlan.zadluzenie), 2890.79, 'karta kredytowa: zadłużenie nie odpowiada saldu rzeczywistemu');
  await request(`/debt-plans/${accountDebtPlan.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST karta kredytowa', typ: 'Karta kredytowa', zadluzenie: 0, rata_miesieczna: null, ilosc_rat: null, wolny_limit: 100, limit_kredytowy: 3000, recurring_expense_id: null }),
  });
  persistedCreditCard = (await request('/konta')).find((row) => String(row.id) === String(creditCardAccount.id));
  assert.equal(Number(persistedCreditCard.saldo_dostepne), 100, 'karta kredytowa: zmiana wolnego limitu nie odświeżyła konta');
  assert.equal(Number(persistedCreditCard.saldo_wlasciwe), -2900, 'karta kredytowa: saldo rzeczywiste nie zostało wyliczone jako wolny limit minus limit');
  assert.equal(Number(persistedCreditCard.limit_kredytowy), 3000, 'karta kredytowa: depozyt pokazuje nieaktualny limit karty');
  await request(`/konta/${creditCardAccount.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST karta kredytowa', saldo_dostepne: 90.21, saldo_wlasciwe: 0, typ_depozytu: 'karta_kredytowa' }),
  });
  persistedCreditCard = (await request('/konta')).find((row) => String(row.id) === String(creditCardAccount.id));
  assert.equal(Number(persistedCreditCard.saldo_wlasciwe), -2909.79, 'karta kredytowa: edycja ujemnego salda rzeczywistego nie została zapisana');
  await request(`/konta/${creditCardAccount.id}/adjustment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: 'expense', title: 'TEST zakup kartą', amount: 20, date: today, transaction_type: 'card_payment' }),
  });
  await request(`/konta/${creditCardAccount.id}/adjustment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: 'income', title: 'TEST zwrot na kartę', amount: 5, date: today, transaction_type: 'refund' }),
  });
  persistedCreditCard = (await request('/konta')).find((row) => String(row.id) === String(creditCardAccount.id));
  accountDebtPlan = (await request('/debt-plans')).find((row) => String(row.account_id) === String(creditCardAccount.id));
  assert.equal(Number(persistedCreditCard.saldo_dostepne), 75.21, 'karta kredytowa: operacje +/- nie zmieniły wolnego limitu');
  assert.equal(Number(persistedCreditCard.saldo_wlasciwe), -2924.79, 'karta kredytowa: operacje +/- nie zmieniły salda rzeczywistego');
  assert.equal(Number(accountDebtPlan.wolny_limit), 75.21, 'karta kredytowa: operacje +/- nie zsynchronizowały wolnego limitu zobowiązania');
  assert.equal(Number(accountDebtPlan.zadluzenie), 2924.79, 'karta kredytowa: operacje +/- nie zsynchronizowały zadłużenia');
  const adjustedCardLoan = (await request('/loans')).find((row) => String(row.id) === String(accountDebtPlan.loan_id));
  assert.equal(Number(adjustedCardLoan.kwota_calkowita), 2924.79, 'karta kredytowa: operacje +/- nie zsynchronizowały zadłużenia w Kredytach');
  const cardExpense = (await request('/wydatki')).find((row) => row.nazwa === 'TEST zakup kartą' && String(row.account_id) === String(creditCardAccount.id));
  const cardRefund = (await request('/przychody')).find((row) => row.nazwa === 'TEST zwrot na kartę' && String(row.account_id) === String(creditCardAccount.id));
  assert.equal(Number(cardExpense?.zrealizowany), 1, 'karta kredytowa: wydatek +/- nie został zapisany jako zrealizowany');
  assert.equal(Number(cardRefund?.zrealizowany), 1, 'karta kredytowa: zwrot +/- nie został zapisany jako zrealizowany');
  await request(`/konta/${creditCardAccount.id}`, { method: 'DELETE' });
  accountDebtPlan = (await request('/debt-plans')).find((row) => String(row.account_id) === String(creditCardAccount.id));
  assert.equal(accountDebtPlan, undefined, 'karta kredytowa: usunięcie konta zostawiło osierocony wpis w Kredytach');
  process.stdout.write('✓ karta kredytowa: salda, edycja i szybkie księgowanie +/-\n');

  const realizationAccount = await request("/konta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST realizacja", saldo_dostepne: 1000, saldo_wlasciwe: 1000, typ_depozytu: "konto" }),
  });
  const realizationIncome = await request("/przychody", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST realizacja przychodu", kwota: 100, kategoria: "Inne", data_dodania: today }),
  });
  const incomeResult = await request(`/przychody/realize/${realizationIncome.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: realizationAccount.id }),
  });
  assert.equal(incomeResult.transaction.zrealizowany, true, "realizacja przychodu: brak statusu zrealizowany");
  assert.equal(Number(incomeResult.account.saldo_dostepne), 1100, "realizacja przychodu: błędne saldo dostępne");
  assert.equal(Number(incomeResult.account.saldo_wlasciwe), 1100, "realizacja przychodu: błędne saldo rzeczywiste");
  await requestExpectStatus(`/przychody/${realizationIncome.id}`, 409, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "Niedozwolona edycja", kwota: 1, kategoria: "Inne", data_dodania: today, zrealizowany: true }),
  });
  await requestExpectStatus(`/przychody/realize/${realizationIncome.id}`, 409, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: realizationAccount.id }),
  });
  const accountAfterDuplicateIncome = (await request('/konta')).find((row) => String(row.id) === String(realizationAccount.id));
  assert.equal(Number(accountAfterDuplicateIncome.saldo_dostepne), 1100, 'podwójna realizacja przychodu zmieniła saldo');

  const realizationExpense = await request("/wydatki", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST realizacja wydatku", kwota: 40, kategoria: "Inne", data_dodania: today }),
  });
  const expenseResult = await request(`/wydatki/realize/${realizationExpense.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: realizationAccount.id }),
  });
  assert.equal(expenseResult.transaction.zrealizowany, true, "realizacja wydatku: brak statusu zrealizowany");
  assert.equal(Number(expenseResult.account.saldo_dostepne), 1060, "realizacja wydatku: błędne saldo dostępne");
  assert.equal(Number(expenseResult.account.saldo_wlasciwe), 1060, "realizacja wydatku: błędne saldo rzeczywiste");
  await requestExpectStatus(`/wydatki/${realizationExpense.id}`, 409, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "Niedozwolona edycja", kwota: 1, kategoria: "Inne", data_dodania: today, zrealizowany: true }),
  });
  await requestExpectStatus(`/wydatki/realize/${realizationExpense.id}`, 409, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: realizationAccount.id }),
  });
  const accountAfterDuplicateExpense = (await request('/konta')).find((row) => String(row.id) === String(realizationAccount.id));
  assert.equal(Number(accountAfterDuplicateExpense.saldo_dostepne), 1060, 'podwójna realizacja wydatku zmieniła saldo');

  const realizationLogs = await request("/app-activity-logs");
  assert.equal(realizationLogs.filter((log) => log.action_type === "Realizacja Przychodu" && String(log.entity_id) === String(realizationAccount.id)).length, 1, "realizacja przychodu: log powinien powstać dokładnie raz");
  assert.equal(realizationLogs.filter((log) => log.action_type === "Realizacja Wydatku" && String(log.entity_id) === String(realizationAccount.id)).length, 1, "realizacja wydatku: log powinien powstać dokładnie raz");
  await request(`/przychody/${realizationIncome.id}`, { method: "DELETE" });
  await request(`/wydatki/${realizationExpense.id}`, { method: "DELETE" });
  await request(`/konta/${realizationAccount.id}`, { method: "DELETE" });
  process.stdout.write("✓ atomowa realizacja oraz blokada edycji zrealizowanego przychodu i wydatku\n");

  const partialAccount = await request("/konta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST częściowa realizacja", saldo_dostepne: 500, saldo_wlasciwe: 500, typ_depozytu: "wirtualny_portfel" }),
  });
  const partialIncome = await request("/przychody", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST Vinted częściowo", kwota: 1800, kategoria: "Inne", data_dodania: "2026-01-15", pewnosc: "guaranteed" }),
  });
  await requestExpectStatus(`/przychody/realize/${partialIncome.id}`, 400, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: partialAccount.id, amount: 1800.01 }),
  });
  const partialIncomeResult = await request(`/przychody/realize/${partialIncome.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: partialAccount.id, amount: "200,00", realization_date: today }),
  });
  assert.equal(partialIncomeResult.partial, true, "częściowy przychód: odpowiedź nie oznacza podziału");
  assert.equal(Number(partialIncomeResult.transaction.kwota), 200, "częściowy przychód: błędna kwota historii");
  assert.equal(partialIncomeResult.transaction.zrealizowany, true, "częściowy przychód: część nie jest zrealizowana");
  assert.equal(partialIncomeResult.transaction.data_dodania, today, "częściowy przychód: zrealizowana część nie dostała daty realizacji");
  assert.equal(partialIncomeResult.transaction.pewnosc, "guaranteed", "częściowy przychód: zrealizowana część zgubiła pewność wpływu");
  assert.equal(Number(partialIncomeResult.remaining_transaction.kwota), 1600, "częściowy przychód: błędna kwota pozostała");
  assert.equal(partialIncomeResult.remaining_transaction.zrealizowany, false, "częściowy przychód: plan zamknięto zbyt wcześnie");
  assert.equal(partialIncomeResult.remaining_transaction.data_dodania, "2026-01-15", "częściowy przychód: pozostały plan zgubił pierwotną datę");
  assert.equal(Number(partialIncomeResult.account.saldo_dostepne), 700, "częściowy przychód: błędne saldo konta");

  const incomePaidExpense = await request("/wydatki", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST wydatek przychodem", kwota: 330, kategoria: "Inne", data_dodania: today }),
  });
  const accountBeforeIncomeSettlement = (await request("/konta")).find((row) => String(row.id) === String(partialAccount.id));
  const firstIncomeSettlement = await request(`/wydatki/realize-with-income/${incomePaidExpense.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ income_id: partialIncome.id, amount: 100 }),
  });
  assert.equal(Number(firstIncomeSettlement.expense_transaction.kwota), 100, "wydatek przychodem: błędna część wydatku");
  assert.equal(Number(firstIncomeSettlement.remaining_expense.kwota), 230, "wydatek przychodem: błędny pozostały wydatek");
  assert.equal(Number(firstIncomeSettlement.remaining_income.kwota), 1500, "wydatek przychodem: błędny pozostały przychód");
  await requestExpectStatus(`/wydatki/realize-with-income/${incomePaidExpense.id}`, 400, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ income_id: partialIncome.id, amount: 230.01 }),
  });
  const finalIncomeSettlement = await request(`/wydatki/realize-with-income/${incomePaidExpense.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ income_id: partialIncome.id, amount: 230 }),
  });
  assert.equal(finalIncomeSettlement.expense_transaction.zrealizowany, true, "wydatek przychodem: wydatek nie został domknięty");
  assert.equal(finalIncomeSettlement.remaining_expense, null, "wydatek przychodem: po pełnym rozliczeniu został plan");
  assert.equal(Number(finalIncomeSettlement.remaining_income.kwota), 1270, "wydatek przychodem: przychód pomniejszono błędnie");
  const accountAfterIncomeSettlement = (await request("/konta")).find((row) => String(row.id) === String(partialAccount.id));
  assert.equal(Number(accountAfterIncomeSettlement.saldo_dostepne), Number(accountBeforeIncomeSettlement.saldo_dostepne), "wydatek przychodem zmienił saldo konta");
  const partialLogs = await request("/app-activity-logs");
  assert.equal(partialLogs.filter((log) => log.action_type === "Realizacja Wydatku Przychodem" && String(log.entity_id) === String(incomePaidExpense.id)).length, 2, "wydatek przychodem: brakuje historii obu rozliczeń");
  for (const row of (await request("/przychody")).filter((item) => item.nazwa === "TEST Vinted częściowo")) await request(`/przychody/${row.id}`, { method: "DELETE" });
  for (const row of (await request("/wydatki")).filter((item) => item.nazwa === "TEST wydatek przychodem")) await request(`/wydatki/${row.id}`, { method: "DELETE" });
  await request(`/konta/${partialAccount.id}`, { method: "DELETE" });
  process.stdout.write("✓ częściowa realizacja oraz atomowe rozliczenie wydatku przychodem\n");

  const limitCard = await request("/konta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST limit karty", saldo_dostepne: 200, saldo_wlasciwe: -2800, typ_depozytu: "karta_kredytowa" }),
  });
  const overLimitExpense = await request("/wydatki", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST ponad limit", kwota: 200.01, kategoria: "Inne", data_dodania: today }),
  });
  await requestExpectStatus(`/wydatki/realize/${overLimitExpense.id}`, 400, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: limitCard.id }),
  });
  let cardAfterOperation = (await request("/konta")).find((row) => String(row.id) === String(limitCard.id));
  assert.equal(Number(cardAfterOperation.saldo_dostepne), 200, "karta kredytowa: odrzucony wydatek zmienił wolny limit");
  const cardIncome = await request("/przychody", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST wpływ na kartę", kwota: 50, kategoria: "Inne", data_dodania: today }),
  });
  await request(`/przychody/realize/${cardIncome.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: limitCard.id }),
  });
  cardAfterOperation = (await request("/konta")).find((row) => String(row.id) === String(limitCard.id));
  const cardPlanAfterOperation = (await request("/debt-plans")).find((row) => String(row.account_id) === String(limitCard.id));
  assert.equal(Number(cardAfterOperation.saldo_dostepne), 250, "karta kredytowa: wpływ nie zwiększył wolnego limitu");
  assert.equal(Number(cardAfterOperation.saldo_wlasciwe), -2750, "karta kredytowa: wpływ nie zmniejszył zadłużenia");
  assert.equal(Number(cardPlanAfterOperation.limit_kredytowy), 3000, "karta kredytowa: operacja zmieniła umowny limit karty");

  assert.equal(Number(cardPlanAfterOperation.wolny_limit), 250, "karta kredytowa: wpływ nie zsynchronizował wolnego limitu w debt_plans");
  assert.equal(Number(cardPlanAfterOperation.zadluzenie), 2750, "karta kredytowa: wpływ nie zsynchronizował zadłużenia w debt_plans");

  const successfulCardExpense = await request("/wydatki", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST zakup kartą sync", kwota: 25, kategoria: "Inne", data_dodania: today }),
  });
  await request(`/wydatki/realize/${successfulCardExpense.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: limitCard.id }),
  });
  cardAfterOperation = (await request("/konta")).find((row) => String(row.id) === String(limitCard.id));
  let syncedCardPlan = (await request("/debt-plans")).find((row) => String(row.account_id) === String(limitCard.id));
  assert.equal(Number(cardAfterOperation.saldo_dostepne), 225, "karta sync: zwykły wydatek nie zmniejszył wolnego limitu");
  assert.equal(Number(syncedCardPlan.wolny_limit), 225, "karta sync: debt_plans nie dostał salda po zwykłym wydatku");
  assert.equal(Number(syncedCardPlan.zadluzenie), 2775, "karta sync: debt_plans ma błędne zadłużenie po zwykłym wydatku");

  const cardRecurringExpense = await request('/wydatki_stale', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST recurring karta sync', kwota: 10, kategoria: 'Inne', data_od: today, data_do: '2099-01-01', dzien_miesiaca: now.getDate() }),
  });
  const cardRecurringResult = await request(`/wydatki_stale/realize/${cardRecurringExpense.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: limitCard.id, occurrence_date: today }),
  });
  cardAfterOperation = (await request('/konta')).find((row) => String(row.id) === String(limitCard.id));
  syncedCardPlan = (await request('/debt-plans')).find((row) => String(row.account_id) === String(limitCard.id));
  assert.equal(Number(cardAfterOperation.saldo_dostepne), 215, 'karta sync: recurring expense nie zmienił wolnego limitu');
  assert.equal(Number(syncedCardPlan.wolny_limit), 215, 'karta sync: recurring expense nie zsynchronizował debt_plans');
  assert.equal(Number(syncedCardPlan.zadluzenie), 2785, 'karta sync: recurring expense ustawił błędne zadłużenie');

  await request(`/konta/${limitCard.id}/adjustment`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: 'income', title: 'TEST korekta karta sync', amount: 15, date: today, transaction_type: 'refund' }),
  });
  cardAfterOperation = (await request('/konta')).find((row) => String(row.id) === String(limitCard.id));
  syncedCardPlan = (await request('/debt-plans')).find((row) => String(row.account_id) === String(limitCard.id));
  assert.equal(Number(cardAfterOperation.saldo_dostepne), 230, 'karta sync: szybka korekta nie zmieniła wolnego limitu');
  assert.equal(Number(syncedCardPlan.zadluzenie), 2770, 'karta sync: szybka korekta nie zmieniła debt_plans');

  const cardTransferSource = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST źródło transfer karta sync', saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: 'konto' }),
  });
  const cardTransferTarget = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST cel transfer karta sync', saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: 'konto' }),
  });
  await request('/konta/transfer', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromId: cardTransferSource.id, toId: limitCard.id, amount: 20 }),
  });
  await request('/konta/transfer', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromId: limitCard.id, toId: cardTransferTarget.id, amount: 5 }),
  });
  cardAfterOperation = (await request('/konta')).find((row) => String(row.id) === String(limitCard.id));
  syncedCardPlan = (await request('/debt-plans')).find((row) => String(row.account_id) === String(limitCard.id));
  assert.equal(Number(cardAfterOperation.saldo_dostepne), 245, 'karta sync: transfery do/z karty dały błędne saldo');
  assert.equal(Number(syncedCardPlan.wolny_limit), 245, 'karta sync: transfery nie zsynchronizowały debt_plans');
  assert.equal(Number(syncedCardPlan.zadluzenie), 2755, 'karta sync: transfery dały błędne zadłużenie');

  // Ręczna korekta jest celowo permissive: może ustawić także nadpłatę ponad limit, ale modele muszą pozostać spójne.
  await request(`/konta/${limitCard.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST limit karty', saldo_dostepne: 3050, saldo_wlasciwe: 1234, typ_depozytu: 'karta_kredytowa', repayment_account_id: null }),
  });
  cardAfterOperation = (await request('/konta')).find((row) => String(row.id) === String(limitCard.id));
  syncedCardPlan = (await request('/debt-plans')).find((row) => String(row.account_id) === String(limitCard.id));
  assert.equal(Number(cardAfterOperation.saldo_dostepne), 3050, 'karta sync: ręczna korekta wolnego limitu została zablokowana lub zmieniona');
  assert.equal(Number(cardAfterOperation.saldo_wlasciwe), 50, 'karta sync: ręczna korekta nie wyliczyła salda właściwego z limitu');
  assert.equal(Number(syncedCardPlan.wolny_limit), 3050, 'karta sync: ręczna korekta nie trafiła do debt_plans');
  assert.equal(Number(syncedCardPlan.zadluzenie), 0, 'karta sync: nadpłata ręczna utworzyła ujemne zadłużenie');

  await request(`/wydatki/${successfulCardExpense.id}`, { method: 'DELETE' });
  await request(`/wydatki/${cardRecurringResult.transaction.id}`, { method: 'DELETE' });
  await request(`/wydatki_stale/${cardRecurringExpense.id}`, { method: 'DELETE' });
  const quickCardAdjustment = (await request('/przychody')).find((row) => row.nazwa === 'TEST korekta karta sync' && String(row.account_id) === String(limitCard.id));
  if (quickCardAdjustment?.id) await request(`/przychody/${quickCardAdjustment.id}`, { method: 'DELETE' });
  await request(`/konta/${cardTransferSource.id}`, { method: 'DELETE' });
  await request(`/konta/${cardTransferTarget.id}`, { method: 'DELETE' });
  await request(`/wydatki/${overLimitExpense.id}`, { method: "DELETE" });
  await request(`/przychody/${cardIncome.id}`, { method: "DELETE" });
  await request(`/konta/${limitCard.id}`, { method: "DELETE" });
  process.stdout.write("✓ karta kredytowa: wolny limit i niezmienny limit umowny\n");

  const installmentPaymentAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST konto spłaty planu', saldo_dostepne: 2000, saldo_wlasciwe: 2000, typ_depozytu: 'konto' }),
  });
  const installmentCard = await request('/debt-plans', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST karta planu', typ: 'Karta kredytowa', zadluzenie: 0, wolny_limit: 1398.37, limit_kredytowy: 3000 }),
  });
  const cardBeforePlan = (await request('/konta')).find((row) => String(row.id) === String(installmentCard.account_id));
  const installmentPlan = await request('/debt-plans', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST plan ratalny', typ: 'Plan ratalny', zadluzenie: 0, rata_miesieczna: 127.39, ilosc_rat: 8, linked_card_account_id: installmentCard.account_id, one_time_fee: 19.99, data_od: today, dzien_miesiaca: 10 }),
  });
  assert.equal(Number(installmentPlan.zadluzenie), 1019.12, 'plan ratalny: nie wyliczono pozostałej kwoty jako rata × liczba rat');
  assert.equal(installmentPlan.linked_card_name, 'TEST karta planu', 'plan ratalny: brak nazwy powiązanej karty');
  assert.equal(Number(installmentPlan.one_time_fee), 19.99, 'plan ratalny: nie zapisano opłaty jednorazowej');
  let cardWithPlan = (await request('/konta')).find((row) => String(row.id) === String(installmentCard.account_id));
  assert.equal(Number(cardWithPlan.saldo_dostepne), Number(cardBeforePlan.saldo_dostepne), 'plan ratalny: utworzenie zmieniło saldo karty');
  assert.equal(Number(cardWithPlan.installment_plan_debt), 1019.12, 'plan ratalny: karta nie zwraca kwoty planów');
  await requestExpectStatus(`/konta/${installmentCard.account_id}`, 409, { method: 'DELETE' });
  assert.ok((await request('/debt-plans')).some((row) => String(row.id) === String(installmentPlan.id)), 'plan ratalny: próba usunięcia karty usunęła aktywny plan');
  await requestExpectStatus(`/debt-plans/${installmentPlan.id}/pay-installment`, 400, { method: 'POST' });
  const payment = await request(`/debt-plans/${installmentPlan.id}/pay-installment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account_id: installmentPaymentAccount.id }) });
  assert.equal(Number(payment.paid), 127.39, 'plan ratalny: spłacono złą kwotę raty');
  assert.equal(Number(payment.plan.zadluzenie), 891.73, 'plan ratalny: błędne zadłużenie po racie');
  assert.equal(Number(payment.plan.ilosc_rat), 7, 'plan ratalny: błędna liczba rat po spłacie');
  cardWithPlan = (await request('/konta')).find((row) => String(row.id) === String(installmentCard.account_id));
  assert.equal(Number(cardWithPlan.saldo_dostepne), 1525.76, 'plan ratalny: rata nie uwolniła limitu karty');
  assert.equal(Number(cardWithPlan.saldo_wlasciwe), -1474.24, 'plan ratalny: niespójne saldo rzeczywiste karty');
  assert.equal(Number(cardWithPlan.installment_plan_debt), 891.73, 'plan ratalny: agregat karty nie zmniejszył się po racie');
  assert.equal(Number(cardWithPlan.repayment_account_id), Number(installmentPaymentAccount.id), 'plan ratalny: wybrane konto nie zostało zapamiętane przy karcie');
  let paymentAccountAfterInstallment = (await request('/konta')).find((row) => String(row.id) === String(installmentPaymentAccount.id));
  assert.equal(Number(paymentAccountAfterInstallment.saldo_dostepne), 1872.61, 'plan ratalny: rata nie obciążyła wybranego konta');
  let installmentLogs = (await request('/app-activity-logs')).filter((log) => log.action_type === 'INSTALLMENT_PLAN_PAYMENT' && String(log.entity_id) === String(installmentCard.account_id));
  assert.equal(installmentLogs.length, 1, 'plan ratalny: spłata nie utworzyła dokładnie jednego logu historii karty');
  for (let installmentNumber = 2; installmentNumber <= 8; installmentNumber += 1) {
    await request(`/debt-plans/${installmentPlan.id}/pay-installment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account_id: installmentPaymentAccount.id }) });
  }
  const completedPlan = (await request('/debt-plans')).find((row) => String(row.id) === String(installmentPlan.id));
  assert.equal(Number(completedPlan.zadluzenie), 0, 'plan ratalny: ostatnia rata nie zamknęła zadłużenia');
  assert.equal(Number(completedPlan.ilosc_rat), 0, 'plan ratalny: ostatnia rata nie wyzerowała liczby rat');
  assert.equal(completedPlan.recurring_expense_id, null, 'plan ratalny: po spłacie pozostało powiązanie stałego wydatku');
  assert.ok(!(await request('/wydatki_stale')).some((row) => String(row.id) === String(installmentPlan.recurring_expense_id)), 'plan ratalny: po spłacie pozostał stały wydatek');
  cardWithPlan = (await request('/konta')).find((row) => String(row.id) === String(installmentCard.account_id));
  assert.equal(Number(cardWithPlan.saldo_dostepne), 2417.49, 'plan ratalny: pełna spłata uwolniła złą część limitu');
  assert.equal(Number(cardWithPlan.saldo_wlasciwe), -582.51, 'plan ratalny: saldo karty po pełnej spłacie jest niespójne');
  paymentAccountAfterInstallment = (await request('/konta')).find((row) => String(row.id) === String(installmentPaymentAccount.id));
  assert.equal(Number(paymentAccountAfterInstallment.saldo_dostepne), 980.88, 'plan ratalny: pełna spłata obciążyła konto złą kwotą');
  installmentLogs = (await request('/app-activity-logs')).filter((log) => log.action_type === 'INSTALLMENT_PLAN_PAYMENT' && String(log.entity_id) === String(installmentCard.account_id));
  assert.equal(installmentLogs.length, 8, 'plan ratalny: historia nie zawiera jednej pozycji na każdą ratę');
  await request(`/debt-plans/${installmentPlan.id}`, { method: 'DELETE' });
  await request(`/konta/${installmentCard.account_id}`, { method: 'DELETE' });
  await request(`/konta/${installmentPaymentAccount.id}`, { method: 'DELETE' });
  process.stdout.write('✓ plan ratalny: relacja, brak podwójnego salda, spłata i historia\n');


  // P0: rata większa niż bieżące zadłużenie karty ma spłacić plan, ale uwolnić limit tylko do limitu umownego.
  const cappedInstallmentPaymentAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST konto capped installment', saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: 'konto' }),
  });
  const nearlyPaidCard = await request('/debt-plans', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST karta prawie spłacona', typ: 'Karta kredytowa', zadluzenie: 10, rata_miesieczna: null, ilosc_rat: null, wolny_limit: 2990, limit_kredytowy: 3000, recurring_expense_id: null, data_od: today }),
  });
  const cappedInstallment = await request('/debt-plans', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST rata większa niż dług karty', typ: 'Plan ratalny', zadluzenie: 0, rata_miesieczna: 50, ilosc_rat: 1, linked_card_account_id: nearlyPaidCard.account_id, one_time_fee: 0, data_od: today, dzien_miesiaca: 10 }),
  });
  const cappedPayment = await request(`/debt-plans/${cappedInstallment.id}/pay-installment`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: cappedInstallmentPaymentAccount.id }),
  });
  assert.equal(Number(cappedPayment.paid), 50, 'plan ratalny cap: z konta spłacono inną kwotę niż rata planu');
  const nearlyPaidCardAccount = (await request('/konta')).find((row) => String(row.id) === String(nearlyPaidCard.account_id));
  const nearlyPaidCardPlan = (await request('/debt-plans')).find((row) => String(row.id) === String(nearlyPaidCard.id));
  const cappedInstallmentAfter = (await request('/debt-plans')).find((row) => String(row.id) === String(cappedInstallment.id));
  const cappedPaymentAccountAfter = (await request('/konta')).find((row) => String(row.id) === String(cappedInstallmentPaymentAccount.id));
  assert.equal(Number(nearlyPaidCardAccount.saldo_dostepne), 3000, 'plan ratalny cap: rata przebiła limit karty zamiast zatrzymać się na 3000');
  assert.equal(Number(nearlyPaidCardAccount.saldo_wlasciwe), 0, 'plan ratalny cap: karta po spłacie ma niespójne saldo właściwe');
  assert.equal(Number(nearlyPaidCardPlan.zadluzenie), 0, 'plan ratalny cap: główny debt plan karty nie został zsynchronizowany');
  assert.equal(Number(cappedInstallmentAfter.zadluzenie), 0, 'plan ratalny cap: pojedyncza rata nie zamknęła planu');
  assert.equal(Number(cappedPaymentAccountAfter.saldo_dostepne), 50, 'plan ratalny cap: konto płatnicze nie zostało obciążone pełną ratą 50 zł');
  await request(`/debt-plans/${cappedInstallment.id}`, { method: 'DELETE' });
  await request(`/debt-plans/${nearlyPaidCard.id}`, { method: 'DELETE' });
  await request(`/konta/${nearlyPaidCard.account_id}`, { method: 'DELETE' });
  await request(`/konta/${cappedInstallmentPaymentAccount.id}`, { method: 'DELETE' });
  process.stdout.write('✓ plan ratalny nie przebija limitu prawie spłaconej karty\n');


  // P0: drugi endpoint spłaty korzysta z tej samej mutacji debt planu i poprawnie domyka recurring expense.
  const genericDebtPaymentAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST konto spłaty długu', saldo_dostepne: 500, saldo_wlasciwe: 500, typ_depozytu: 'konto' }),
  });
  const genericDebt = await request('/debt-plans', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST spłata wspólnym helperem', typ: 'Dług', zadluzenie: 250, rata_miesieczna: 100, ilosc_rat: 3, recurring_expense_id: null, data_od: today, dzien_miesiaca: 10 }),
  });
  const genericRecurringExpenseId = genericDebt.recurring_expense_id;
  const debtPayment1 = await request(`/debt-plans/${genericDebt.id}/pay-debt-installment`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account_id: genericDebtPaymentAccount.id }),
  });
  assert.equal(Number(debtPayment1.paid), 100, 'spłata długu: pierwsza rata ma złą kwotę');
  assert.equal(Number(debtPayment1.plan.zadluzenie), 150, 'spłata długu: pierwszy zapis debtAfter jest błędny');
  await request(`/debt-plans/${genericDebt.id}/pay-debt-installment`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account_id: genericDebtPaymentAccount.id }),
  });
  const debtPayment3 = await request(`/debt-plans/${genericDebt.id}/pay-debt-installment`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account_id: genericDebtPaymentAccount.id }),
  });
  assert.equal(Number(debtPayment3.paid), 50, 'spłata długu: ostatnia rata nie została ograniczona do pozostałego zadłużenia');
  assert.equal(Number(debtPayment3.plan.zadluzenie), 0, 'spłata długu: ostatnia rata nie zamknęła zadłużenia');
  assert.equal(debtPayment3.plan.recurring_expense_id, null, 'spłata długu: po zamknięciu pozostał recurring_expense_id');
  const genericDebtPaymentAccountAfter = (await request('/konta')).find((row) => String(row.id) === String(genericDebtPaymentAccount.id));
  assert.equal(Number(genericDebtPaymentAccountAfter.saldo_dostepne), 250, 'spłata długu: konto zostało obciążone inną sumą niż 250 zł');
  if (genericRecurringExpenseId != null) assert.ok(!(await request('/wydatki_stale')).some((row) => String(row.id) === String(genericRecurringExpenseId)), 'spłata długu: zamknięty debt plan zostawił stały wydatek');
  await request(`/debt-plans/${genericDebt.id}`, { method: 'DELETE' });
  await request(`/konta/${genericDebtPaymentAccount.id}`, { method: 'DELETE' });
  process.stdout.write('✓ wspólny debtPlanPayment obsługuje także zwykły dług i ostatnią niepełną ratę\n');

  await requestExpectStatus("/loans", 400, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST błędne daty", typ: "Kredyt", data_rozpoczecia: "2027-02-01", data_do: "2027-01-01", ilosc_rat: 2, kwota_kapitalu: 200, kwota_raty: 100, rrso: 0, dzien_splaty: 1, oprocentowanie: 0, prowizja: 0, ubezpieczenie: 0 }),
  });
  await requestExpectStatus("/wydatki_stale", 400, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST błędne daty", kwota: 100, kategoria: "Kredyt", data_od: "2027-02-01", data_do: "2027-01-01", dzien_miesiaca: 1 }),
  });
  await requestExpectStatus("/przychody_stale", 400, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nazwa: "TEST błędne daty", kwota: 100, kategoria: "Inne", data_od: "2027-02-01", data_do: "2027-01-01", dzien_miesiaca: 1 }),
  });
  process.stdout.write("✓ walidacja kolejności dat kredytu i wpisów stałych\n");

  for (const endpoint of ["/przychody", "/wydatki"]) {
    await requestExpectStatus(endpoint, 400, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ nazwa: "TEST błędna kwota", kwota: "abc", kategoria: "Inne", data_dodania: today }),
    });
    await requestExpectStatus(endpoint, 400, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ nazwa: "TEST błędna data", kwota: 10, kategoria: "Inne", data_dodania: "2026-02-30" }),
    });
    await requestExpectStatus(endpoint, 400, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ nazwa: "TEST kwota ponad limit", kwota: 10_000_000, kategoria: "Inne", data_dodania: today }),
    });
  }
  for (const endpoint of ["/przychody_stale", "/wydatki_stale"]) {
    await requestExpectStatus(endpoint, 400, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ nazwa: "TEST błędny wpis", kwota: -1, kategoria: "Inne", data_od: today, dzien_miesiaca: 32 }),
    });
  }
  process.stdout.write("✓ wspólna walidacja kwot, dat i dnia miesiąca\n");

  const recurringAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST realizacja stałych', saldo_dostepne: 100, saldo_wlasciwe: 0, typ_depozytu: 'konto' }),
  });
  const recurringLabel = await request('/custom-transaction-types', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'TEST stała etykieta' }),
  });
  const recurringIncome = await request('/przychody_stale', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST stały wpływ', kwota: 10, kategoria: 'Inne', custom_type_id: recurringLabel.id, data_od: today, data_do: '2099-01-01', dzien_miesiaca: now.getDate() }),
  });
  const recurringExpense = await request('/wydatki_stale', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST stałe obciążenie', kwota: 20, kategoria: 'Inne', custom_type_id: recurringLabel.id, data_od: today, data_do: '2099-01-01', dzien_miesiaca: now.getDate() }),
  });
  const recurringIncomeRowBeforeRealize = (await request('/przychody_stale')).find((row) => String(row.id) === String(recurringIncome.id));
  const recurringExpenseRowBeforeRealize = (await request('/wydatki_stale')).find((row) => String(row.id) === String(recurringExpense.id));
  assert.equal(Number(recurringIncomeRowBeforeRealize?.custom_type_id), Number(recurringLabel.id), 'stały przychód: reguła nie zachowała etykiety');
  assert.equal(recurringIncomeRowBeforeRealize?.custom_type_name, 'TEST stała etykieta', 'stały przychód: GET nie zwraca nazwy etykiety');
  assert.equal(Number(recurringExpenseRowBeforeRealize?.custom_type_id), Number(recurringLabel.id), 'stały wydatek: reguła nie zachowała etykiety');
  assert.equal(recurringExpenseRowBeforeRealize?.custom_type_name, 'TEST stała etykieta', 'stały wydatek: GET nie zwraca nazwy etykiety');
  const recurringIncomeResult = await request(`/przychody_stale/realize/${recurringIncome.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: recurringAccount.id, occurrence_date: today }),
  });
  const recurringExpenseResult = await request(`/wydatki_stale/realize/${recurringExpense.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: recurringAccount.id, occurrence_date: today }),
  });
  await requestExpectStatus(`/przychody_stale/realize/${recurringIncome.id}`, 409, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: recurringAccount.id, occurrence_date: today }),
  });
  const recurringAccountAfter = (await request('/konta')).find((row) => String(row.id) === String(recurringAccount.id));
  assert.equal(Number(recurringAccountAfter.saldo_dostepne), 90, 'wpisy stałe: saldo dostępne zostało zmienione więcej niż raz');
  assert.equal(Number(recurringAccountAfter.saldo_wlasciwe), -10, 'wpisy stałe: saldo właściwe o wartości zero zostało błędnie zastąpione saldem dostępnym');
  assert.equal(recurringIncomeResult.transaction.zrealizowany, true, 'stały przychód: nie utworzono zrealizowanej transakcji');
  assert.equal(recurringExpenseResult.transaction.zrealizowany, true, 'stały wydatek: nie utworzono zrealizowanej transakcji');
  assert.equal(Number(recurringIncomeResult.transaction.custom_type_id), Number(recurringLabel.id), 'stały przychód: realizacja zgubiła etykietę');
  assert.equal(Number(recurringExpenseResult.transaction.custom_type_id), Number(recurringLabel.id), 'stały wydatek: realizacja zgubiła etykietę');
  const recurringLogs = (await request('/app-activity-logs')).filter((log) => String(log.entity_id) === String(recurringIncome.id) || String(log.entity_id) === String(recurringExpense.id));
  assert.ok(recurringLogs.some((log) => log.action_type === 'RECURRING_INCOME_REALIZED'), 'stały przychód: brak osobnego wpisu historii');
  assert.ok(recurringLogs.some((log) => log.action_type === 'RECURRING_EXPENSE_REALIZED'), 'stały wydatek: brak osobnego wpisu historii');
  const recurringIncomeLog = recurringLogs.find((log) => log.action_type === 'RECURRING_INCOME_REALIZED');
  await request(`/app-activity-logs/${recurringIncomeLog.id}`, { method: 'DELETE' });
  await requestExpectStatus(`/przychody_stale/realize/${recurringIncome.id}`, 409, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: recurringAccount.id, occurrence_date: today }),
  });
  await request(`/przychody/${recurringIncomeResult.transaction.id}`, { method: 'DELETE' });
  await request(`/wydatki/${recurringExpenseResult.transaction.id}`, { method: 'DELETE' });
  await request(`/przychody_stale/${recurringIncome.id}`, { method: 'DELETE' });
  await request(`/wydatki_stale/${recurringExpense.id}`, { method: 'DELETE' });
  await request(`/custom-transaction-types/${recurringLabel.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'TEST stała etykieta', active: false }),
  });
  await request(`/konta/${recurringAccount.id}`, { method: 'DELETE' });
  process.stdout.write('✓ atomowa i idempotentna realizacja wpisów stałych zachowuje etykiety i osobną historię\n');


  // P0/P1: historyczna realizacja bez wcześniejszej queue musi zapisać customized override.
  const historicalRecurringDateObject = new Date(now.getFullYear(), now.getMonth() - 2, Math.min(now.getDate(), 20));
  const historicalRecurringDate = `${historicalRecurringDateObject.getFullYear()}-${String(historicalRecurringDateObject.getMonth() + 1).padStart(2, '0')}-${String(historicalRecurringDateObject.getDate()).padStart(2, '0')}`;
  const historicalRecurringAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST historyczne recurring', saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: 'konto' }),
  });
  const historicalRecurringRule = await request('/przychody_stale', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST historyczny stały wpływ', kwota: 33, kategoria: 'Inne', data_od: historicalRecurringDate, data_do: '2099-01-01', dzien_miesiaca: historicalRecurringDateObject.getDate() }),
  });
  const historicalRecurringResult = await request(`/przychody_stale/realize/${historicalRecurringRule.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: historicalRecurringAccount.id, occurrence_date: historicalRecurringDate }),
  });
  let historicalRecurringActual = (await request('/przychody')).find((row) => String(row.id) === String(historicalRecurringResult.transaction.id));
  assert.equal(historicalRecurringActual?.generated_from_recurring, true, 'historyczne recurring: actual bez wcześniejszej queue nie został powiązany z regułą');
  assert.equal(historicalRecurringActual?.recurring_queue_status, 'customized', 'historyczne recurring: brak customized override dla ręcznie zrealizowanej historycznej daty');
  await request(`/przychody_stale/${historicalRecurringRule.id}`, { method: 'DELETE' });
  historicalRecurringActual = (await request('/przychody')).find((row) => String(row.id) === String(historicalRecurringResult.transaction.id));
  assert.ok(historicalRecurringActual?.id, 'historyczne recurring: usunięcie reguły skasowało zrealizowaną historię');
  assert.equal(historicalRecurringActual.generated_from_recurring, false, 'historyczne recurring: usunięcie reguły zostawiło osieroczoną queue');
  await request(`/przychody/${historicalRecurringActual.id}`, { method: 'DELETE' });
  await request(`/konta/${historicalRecurringAccount.id}`, { method: 'DELETE' });

  // P0: usunięcie recurring rule czyści allocation targetu i wygenerowane scheduled transakcje.
  const recurringAllocationImportAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST konto recurring allocation', saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: 'konto' }),
  });
  const recurringAllocationRule = await request('/wydatki_stale', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST recurring allocation cleanup', kwota: 80, kategoria: 'Inne', data_od: today, data_do: '2099-01-01', dzien_miesiaca: now.getDate() }),
  });
  await request(`/konta/${recurringAllocationImportAccount.id}/import-transactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [{
      sourceKey: 'test-recurring-allocation-actual', name: 'TEST recurring allocation actual', amount: -80, date: today,
      occurredAt: `${today}T15:10:00`, category: 'Inne', currency: 'PLN', transactionType: 'direct_debit',
      resolution: 'plan', planMatches: [{ source: 'recurring', planId: recurringAllocationRule.id, occurrenceDate: today, amount: 80 }],
    }] }),
  });
  let recurringAllocationActual = (await request('/wydatki')).find((row) => row.nazwa === 'TEST recurring allocation actual' && row.import_fingerprint);
  assert.equal(JSON.parse(recurringAllocationActual?.plan_allocations ?? '[]').length, 1, 'recurring cleanup: nie utworzono allocation do recurring planu');
  const scheduledRecurringRow = (await request('/wydatki')).find((row) => row.nazwa === 'TEST recurring allocation cleanup' && row.generated_from_recurring && !row.zrealizowany);
  assert.ok(scheduledRecurringRow?.id, 'recurring cleanup: brak scheduled transaction do sprawdzenia cleanupu');
  const recurringCleanupPeer = await request('/przychody', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST recurring cleanup peer', kwota: 1234, kategoria: 'Inne', data_dodania: today }),
  });
  const recurringCleanupLink = await request('/konta/import-transfers', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'expense', transactionId: scheduledRecurringRow.id, counterpartKind: 'income', counterpartId: recurringCleanupPeer.id }),
  });
  assert.ok(recurringCleanupLink.id, 'recurring cleanup: nie utworzono testowego cross-linku dla scheduled transaction');
  await request(`/wydatki_stale/${recurringAllocationRule.id}`, { method: 'DELETE' });
  recurringAllocationActual = (await request('/wydatki')).find((row) => String(row.id) === String(recurringAllocationActual.id));
  const recurringCleanupPeerAfter = (await request('/przychody')).find((row) => String(row.id) === String(recurringCleanupPeer.id));
  assert.equal(JSON.parse(recurringAllocationActual?.plan_allocations ?? '[]').length, 0, 'recurring cleanup: usunięcie reguły zostawiło allocation na imported actual');
  assert.ok(!(await request('/wydatki')).some((row) => String(row.id) === String(scheduledRecurringRow.id)), 'recurring cleanup: scheduled transaction pozostała po usunięciu reguły');
  assert.equal(recurringCleanupPeerAfter?.transfer_link_id, null, 'recurring cleanup: usunięcie scheduled transaction zostawiło cross-link po drugiej stronie');
  assert.equal(Number(recurringCleanupPeerAfter?.excluded_from_analysis), 0, 'recurring cleanup: counterpart nie wrócił do analiz po usunięciu reguły');
  await request(`/wydatki/${recurringAllocationActual.id}`, { method: 'DELETE' });
  await request(`/przychody/${recurringCleanupPeer.id}`, { method: 'DELETE' });
  await request(`/konta/${recurringAllocationImportAccount.id}`, { method: 'DELETE' });
  process.stdout.write('✓ recurring: historical customized + cleanup queue/allocation/cross-link\n');

  const scheduleCredit = await request('/loans', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST harmonogram kredytu', typ: 'Kredyt', data_rozpoczecia: today, data_do: '2099-01-01', ilosc_rat: 12, kwota_kapitalu: 1000, kwota_calkowita: 1200, kwota_raty: 100, rrso: 0, dzien_splaty: 10, oprocentowanie: 0, prowizja: 0, ubezpieczenie: 0 }),
  });
  assert.equal(scheduleCredit.data_do, installmentEndDate(today, 12, 10), 'kredyt: data zakończenia nie została skorygowana do liczby rat');
  const ensuredSchedule = await request(`/loans/${scheduleCredit.id}/ensure-schedule`, { method: 'POST' });
  assert.equal(Number(ensuredSchedule.paymentsCount), 12, 'kredyt: nie utworzono 12 rat harmonogramu');
  const scheduleRows = await request(`/loan_payments/loan/${scheduleCredit.id}`);
  if (scheduleRows.length > 0) {
    await requestExpectStatus(`/loan_payments/pay/${scheduleRows[0].id}`, 409, { method: 'POST' });
  }
  assert.equal(scheduleRows.length, 12, 'kredyt: endpoint rat zwrócił niepełny harmonogram');
  assert.equal(scheduleRows.at(-1).due_date, installmentEndDate(today, 12, 10), 'kredyt: ostatnia rata ma błędną datę');
  await request(`/loans/${scheduleCredit.id}`, { method: 'DELETE' });
  process.stdout.write('✓ kredyt: automatyczna data zakończenia i harmonogram rat\n');

  const historicalStartDate = new Date(now.getFullYear(), now.getMonth() - 4, Math.min(now.getDate(), 28));
  const historicalStart = `${historicalStartDate.getFullYear()}-${String(historicalStartDate.getMonth() + 1).padStart(2, '0')}-${String(historicalStartDate.getDate()).padStart(2, '0')}`;
  const historicalCredit = await request('/loans', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST kredyt historyczny', typ: 'Kredyt', data_rozpoczecia: historicalStart, ilosc_rat: 8, kwota_kapitalu: 800, kwota_calkowita: 800, kwota_raty: 100, rrso: 0, dzien_splaty: now.getDate(), oprocentowanie: 0, prowizja: 0, ubezpieczenie: 0 }),
  });
  assert.equal(historicalCredit.data_do, installmentEndDate(historicalStart, 8, now.getDate()), 'kredyt historyczny: koniec nie został policzony od najbliższej pozostałej raty');
  await request(`/loans/${historicalCredit.id}/ensure-schedule`, { method: 'POST' });
  const historicalRows = await request(`/loan_payments/loan/${historicalCredit.id}`);
  assert.equal(historicalRows.length, 8, 'kredyt historyczny: harmonogram nie odpowiada liczbie pozostałych rat');
  assert.ok(historicalRows.every((row) => row.due_date >= today), 'kredyt historyczny: utworzono niezapłacone raty z przeszłości');
  await request(`/loans/${historicalCredit.id}`, { method: 'DELETE' });
  process.stdout.write('✓ kredyt historyczny: harmonogram zawiera tylko raty pozostałe\n');

  const adjustmentAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST szybkie saldo', saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: 'konto' }),
  });
  await request(`/konta/${adjustmentAccount.id}/adjustment`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: 'income', title: 'TEST zasilenie', amount: 375, date: today, transaction_type: 'top_up' }),
  });
  await request(`/konta/${adjustmentAccount.id}/adjustment`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: 'expense', title: 'TEST obciążenie', amount: 75, date: today, transaction_type: 'other' }),
  });
  // Równoległe zapisy sprawdzają kolejkę pojedynczego połączenia SQLite.
  await Promise.all(Array.from({ length: 10 }, (_, index) => request(`/konta/${adjustmentAccount.id}/adjustment`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: 'income', title: `TEST równoległe ${index + 1}`, amount: 1, date: today, transaction_type: 'top_up' }),
  })));
  const accountAfterAdjustments = (await request('/konta')).find((row) => String(row.id) === String(adjustmentAccount.id));
  assert.equal(Number(accountAfterAdjustments.saldo_dostepne), 410, 'szybkie saldo: operacje lub zapis równoległy dały błędne saldo');
  const quickIncome = (await request('/przychody')).find((row) => row.nazwa === 'TEST zasilenie');
  const quickExpense = (await request('/wydatki')).find((row) => row.nazwa === 'TEST obciążenie');
  assert.equal(quickIncome?.zrealizowany, true, 'szybkie saldo: zasilenie nie jest zrealizowanym przychodem');
  assert.equal(quickIncome?.transaction_type, 'top_up', 'szybkie saldo: zasilenie zgubiło typ');
  assert.equal(quickExpense?.zrealizowany, true, 'szybkie saldo: obciążenie nie jest zrealizowanym wydatkiem');
  await requestExpectStatus(`/konta/${adjustmentAccount.id}`, 409, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST szybkie saldo', saldo_dostepne: 410, saldo_wlasciwe: 410, typ_depozytu: 'karta_kredytowa' }),
  });
  await request(`/konta/${adjustmentAccount.id}`, { method: 'DELETE' });
  process.stdout.write('✓ szybkie +/−, zrealizowane transakcje i równoległe zapisy bez konfliktu SQLite\n');

  const transferSource = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST przelew źródło', saldo_dostepne: 500, saldo_wlasciwe: 500, typ_depozytu: 'konto' }),
  });
  const transferTarget = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST przelew cel', saldo_dostepne: 200, saldo_wlasciwe: 200, typ_depozytu: 'konto' }),
  });
  await request('/konta/transfer', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromId: transferSource.id, toId: transferTarget.id, amount: 100 }),
  });
  let accountsAfterTransfer = await request('/konta');
  assert.equal(Number(accountsAfterTransfer.find((row) => row.id === transferSource.id).saldo_dostepne), 400, 'przelew: błędne saldo źródła');
  assert.equal(Number(accountsAfterTransfer.find((row) => row.id === transferTarget.id).saldo_dostepne), 300, 'przelew: błędne saldo celu');
  await requestExpectStatus('/konta/transfer', 400, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromId: transferSource.id, toId: transferTarget.id, amount: 9999 }),
  });
  await requestExpectStatus('/konta/transfer', 400, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromId: String(transferSource.id), toId: transferSource.id, amount: 10 }),
  });
  accountsAfterTransfer = await request('/konta');
  assert.equal(Number(accountsAfterTransfer.find((row) => row.id === transferSource.id).saldo_dostepne), 400, 'odrzucony przelew zmienił saldo źródła');
  assert.equal(Number(accountsAfterTransfer.find((row) => row.id === transferTarget.id).saldo_dostepne), 300, 'odrzucony przelew zmienił saldo celu');
  await request(`/konta/${transferSource.id}`, { method: 'DELETE' });
  await request(`/konta/${transferTarget.id}`, { method: 'DELETE' });
  process.stdout.write('✓ atomowy przelew i rollback odrzuconej operacji\n');

  let detailedDebtPlan = await request('/debt-plans', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST szczegóły kredytu', typ: 'Kredyt', zadluzenie: 500, rata_miesieczna: 100, ilosc_rat: 5, data_od: today, dzien_miesiaca: 10, kwota_kapitalu: 450, rrso: 0, oprocentowanie: 0, prowizja: 0, ubezpieczenie: 0 }),
  });
  assert.ok(detailedDebtPlan.loan_id, 'szczegóły kredytu: nie utworzono modelu kredytu');
  assert.equal(Number(detailedDebtPlan.rrso), 0, 'szczegóły kredytu: nie zapisano RRSO 0');
  await request(`/debt-plans/${detailedDebtPlan.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST szczegóły kredytu', typ: 'Kredyt', zadluzenie: 500, rata_miesieczna: 100, ilosc_rat: 5, data_od: today, dzien_miesiaca: 10, kwota_kapitalu: 450, rrso: 7.5, oprocentowanie: 6.25, prowizja: 12.5, ubezpieczenie: 8.75 }),
  });
  detailedDebtPlan = (await request('/debt-plans')).find((row) => String(row.id) === String(detailedDebtPlan.id));
  assert.equal(Number(detailedDebtPlan.rrso), 7.5, 'szczegóły kredytu: edycja RRSO nie została utrwalona');
  assert.equal(Number(detailedDebtPlan.oprocentowanie), 6.25, 'szczegóły kredytu: edycja oprocentowania nie została utrwalona');
  assert.equal(Number(detailedDebtPlan.prowizja), 12.5, 'szczegóły kredytu: edycja prowizji nie została utrwalona');
  assert.equal(Number(detailedDebtPlan.ubezpieczenie), 8.75, 'szczegóły kredytu: edycja ubezpieczenia nie została utrwalona');
  const simpleDebtPlan = await request('/debt-plans', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produkt: 'TEST prosty dług', typ: 'Dług', zadluzenie: 300, rrso: 15, oprocentowanie: 10, prowizja: 20, ubezpieczenie: 30 }),
  });
  assert.equal(simpleDebtPlan.loan_id, null, 'prosty dług: utworzono zbędny model kredytu');
  assert.equal(simpleDebtPlan.rrso, null, 'prosty dług: zwrócono nieobsługiwane szczegóły kredytowe');
  await request(`/debt-plans/${simpleDebtPlan.id}`, { method: 'DELETE' });
  await request(`/debt-plans/${detailedDebtPlan.id}`, { method: 'DELETE' });
  process.stdout.write('✓ szczegóły kredytu zapisują się, a prosty dług nie udaje kredytu\n');

  const goalAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST konto celu', saldo_dostepne: 800, saldo_wlasciwe: 800, typ_depozytu: 'konto' }),
  });
  const settings = await request('/financial-goal-settings');
  assert.equal(Number(settings.financial_floor), 1000, 'cele: brak domyślnej finansowej podłogi');
  await requestExpectStatus('/financial-goal-settings/1', 400, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ financialFloor: 1500, dailyLivingBudget: 50, threshold1: 1000, threshold2: 3000, threshold3: 5000, allocation1: 100, allocation2: 70, allocation3: 50 }),
  });
  await requestExpectStatus('/financial-goal-settings/1', 400, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ financialFloor: 1000, dailyLivingBudget: 50, threshold1: 3000, threshold2: 2000, threshold3: 5000, allocation1: 100, allocation2: 70, allocation3: 50 }),
  });
  await requestExpectStatus('/financial-goal-settings/1', 400, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ financialFloor: 1000, dailyLivingBudget: 50, paydayCycleStartDay: 32, threshold1: 1000, threshold2: 3000, threshold3: 5000, allocation1: 100, allocation2: 70, allocation3: 50 }),
  });
  await request('/financial-goal-settings/1', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ financialFloor: 1200, dailyLivingBudget: 50, paydayCycleStartDay: 25, threshold1: 1200, threshold2: 3000, threshold3: 5000, allocation1: 100, allocation2: 70, allocation3: 50 }),
  });
  const savedPlanningSettings = await request('/financial-goal-settings');
  assert.equal(Number(savedPlanningSettings.daily_living_budget), 50, 'planowanie: nie zapisano budżetu bieżącego / dzień');
  assert.equal(Number(savedPlanningSettings.payday_cycle_start_day), 25, 'planowanie: nie zapisano dnia początku okresu wypłatowego');
  let financialGoal = await request('/financial-goals', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'TEST cel', type: 'travel', targetAmount: 2000, allocatedAmount: 200, dueDate: '2027-06-01', priority: 'high', status: 'active', accountId: goalAccount.id, includeAccountBalance: true, note: 'smoke' }),
  });
  assert.equal(Number(financialGoal.kwota_docelowa), 2000, 'cele: nie zapisano kwoty docelowej');
  assert.equal(Number(financialGoal.include_account_balance), 1, 'cele: nie zapisano uwzględniania salda depozytu');
  await request(`/financial-goals/${financialGoal.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'TEST cel po edycji', type: 'travel', targetAmount: 2000, allocatedAmount: 500, dueDate: '2027-06-01', priority: 'high', status: 'active', accountId: goalAccount.id, includeAccountBalance: true, note: 'smoke' }),
  });
  financialGoal = (await request('/financial-goals')).find((row) => String(row.id) === String(financialGoal.id));
  assert.equal(Number(financialGoal.kwota_przypisana), 500, 'cele: nie zapisano postępu celu');
  assert.equal(financialGoal.account_name, 'TEST konto celu', 'cele: nie zwrócono powiązanego depozytu');
  await request(`/konta/${goalAccount.id}`, { method: 'DELETE' });
  financialGoal = (await request('/financial-goals')).find((row) => String(row.id) === String(financialGoal.id));
  assert.equal(financialGoal.account_id, null, 'cele: usunięcie depozytu zostawiło osierocone powiązanie');
  assert.equal(Number(financialGoal.include_account_balance), 0, 'cele: usunięcie depozytu pozostawiło aktywne uwzględnianie salda');
  await request(`/financial-goals/${financialGoal.id}`, { method: 'DELETE' });
  await request('/financial-goal-settings/1', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ financialFloor: 1000, dailyLivingBudget: 0, paydayCycleStartDay: 10, threshold1: 1000, threshold2: 3000, threshold3: 5000, allocation1: 100, allocation2: 70, allocation3: 50 }),
  });
  const potentialIncome = await request('/przychody', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST potencjalny wpływ', kwota: 123, kategoria: 'Inne', data_dodania: today, pewnosc: 'potential' }),
  });
  assert.equal(potentialIncome.pewnosc, 'potential', 'przychody: nie zapisano poziomu pewności');
  const guaranteedIncome = await request('/przychody', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST pewny wpływ', kwota: 321, kategoria: 'Inne', data_dodania: today, pewnosc: 'guaranteed' }),
  });
  assert.equal(guaranteedIncome.pewnosc, 'guaranteed', 'przychody: nie zapisano pewnego wpływu');
  await request(`/przychody/${potentialIncome.id}`, { method: 'DELETE' });
  await request(`/przychody/${guaranteedIncome.id}`, { method: 'DELETE' });
  process.stdout.write('✓ cele, ustawienia, powiązanie depozytu i pewność przychodu\n');

  const periodSnapshot = await request('/financial-period-snapshots', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ periodStart: '2026-08-10', periodEnd: '2026-09-09', realLiquidity: 2500, financialFloor: 1000, consumerDebt: 500, mortgageDebt: 100000, goalsAllocated: 800 }),
  });
  assert.equal(Number(periodSnapshot.real_liquidity), 2500, 'historia: nie zapisano płynności');
  await request('/financial-period-snapshots', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ periodStart: '2026-08-10', periodEnd: '2026-09-09', realLiquidity: 2700, financialFloor: 1000, consumerDebt: 450, mortgageDebt: 99500, goalsAllocated: 900 }),
  });
  const periodSnapshots = await request('/financial-period-snapshots');
  assert.equal(periodSnapshots.length, 1, 'historia: aktualizacja okresu utworzyła duplikat');
  assert.equal(Number(periodSnapshots[0].real_liquidity), 2700, 'historia: nie zaktualizowano stanu okresu');
  process.stdout.write('✓ ręczna historia okresów wypłatowych\n');

  const auditRaceAccount = await request('/konta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST kolejność audytu', saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: 'konto' }),
  });
  const updateAuditAccount = (balance) => request(`/konta/${auditRaceAccount.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nazwa: 'TEST kolejność audytu', saldo_dostepne: balance, saldo_wlasciwe: balance, typ_depozytu: 'konto' }),
  });
  await Promise.all([updateAuditAccount(150), updateAuditAccount(200)]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const auditRaceLogs = (await request(`/app-activity-logs?entity_type=konta&entity_id=${auditRaceAccount.id}`))
    .filter((log) => log.action_type === 'UPDATE')
    .sort((left, right) => Number(left.id) - Number(right.id));
  assert.equal(auditRaceLogs.length, 2, 'audyt równoległych zapisów: brak dwóch logów edycji');
  const firstAuditAfter = JSON.parse(auditRaceLogs[0].new_data);
  const secondAuditBefore = JSON.parse(auditRaceLogs[1].old_data);
  assert.equal(Number(secondAuditBefore.saldo_dostepne), Number(firstAuditAfter.saldo_dostepne), 'audyt równoległych zapisów: drugi stan przed nie wynika z pierwszego zapisu');
  await request(`/konta/${auditRaceAccount.id}`, { method: 'DELETE' });
  process.stdout.write('✓ kolejność audytu równoległych mutacji\n');

  await new Promise((resolve) => setTimeout(resolve, 200));
  const logs = await request("/app-activity-logs");
  assert.ok(Array.isArray(logs) && logs.length >= cases.length, "logi audytowe nie zostały utworzone");
  process.stdout.write(`✓ logi aktywności (${logs.length})\n`);

  const backupResponse = await fetch(`${api}/backup`, { signal: AbortSignal.timeout(10000) });
  assert.ok(backupResponse.ok, `backup SQLite: ${backupResponse.status}`);
  assert.match(backupResponse.headers.get("content-disposition") || "", /MyAnalyze-backup-\d{4}-\d{2}-\d{2}\.sqlite/, "backup SQLite: brak nazwy pliku");
  const backupBytes = new Uint8Array(await backupResponse.arrayBuffer());
  const sqliteHeader = new TextDecoder().decode(backupBytes.slice(0, 16));
  assert.equal(sqliteHeader, "SQLite format 3\0", "backup SQLite: pobrany plik nie jest bazą SQLite");
  process.stdout.write("✓ kompletna kopia bazy SQLite\n");
} finally {
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(temporaryDir, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
