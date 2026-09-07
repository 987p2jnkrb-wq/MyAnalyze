/* eslint-disable react-refresh/only-export-components -- provider and translation helpers intentionally share this module */
import React from "react";
import { EN_UI_CATALOG, type AppLanguage } from "./i18nCatalog";
import { loadAppSettings } from "./utils/appSettings";

export interface AppPresentation {
  language: AppLanguage;
  currency: "PLN" | "EUR" | "USD";
  locale: "pl-PL" | "en-US";
}

const PresentationContext = React.createContext<AppPresentation>({ language: "pl", currency: "PLN", locale: "pl-PL" });

const textSources = new WeakMap<Text, string>();
const attributeSources = new WeakMap<Element, Map<string, string>>();
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "title", "placeholder", "aria-description"] as const;
let bridgeMutation = false;

function isTranslationIgnored(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return Boolean(element?.closest('[data-i18n-ignore="true"]'));
}

function withOriginalWhitespace(original: string, translated: string): string {
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}


function translatePolishMonthYear(value: string): string {
  const months: Record<string, string> = {
    styczeń: "January", luty: "February", marzec: "March", kwiecień: "April", maj: "May", czerwiec: "June",
    lipiec: "July", sierpień: "August", wrzesień: "September", październik: "October", listopad: "November", grudzień: "December",
  };
  const match = value.trim().match(/^([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+)\s+(\d{4})$/);
  if (!match) return value;
  const translated = months[match[1].toLocaleLowerCase("pl-PL")];
  return translated ? `${translated} ${match[2]}` : value;
}

function translateDynamicPolishText(trimmed: string): string | null {
  const rowEdit = trimmed.match(/^(.+) - edycja wiersza (.+)$/);
  if (rowEdit) return `${translateUiText(rowEdit[1])} - row ${rowEdit[2]} edit`;

  const activeFilters = trimmed.match(/^Filtry - aktywne: (\d+)$/);
  if (activeFilters) return `Filters - active: ${activeFilters[1]}`;

  const selectedExport = trimmed.match(/^Eksport CSV - (\d+) zaznaczonych$/);
  if (selectedExport) return `CSV export - ${selectedExport[1]} selected`;

  const selected = trimmed.match(/^(\d+) zaznaczonych$/);
  if (selected) return `${selected[1]} selected`;

  const threshold = trimmed.match(/^Próg (\d+)$/);
  if (threshold) return `Threshold ${threshold[1]}`;

  const allocationThreshold = trimmed.match(/^Alokacja - próg (\d+)$/);
  if (allocationThreshold) return `Allocation - threshold ${allocationThreshold[1]}`;

  const percentTotal = trimmed.match(/^([\d.,]+)% całości$/);
  if (percentTotal) return `${percentTotal[1]}% of total`;

  const monthlyOutstandingIncome = trimmed.match(/^Nierozliczone przychody - (.+)$/);
  if (monthlyOutstandingIncome) return `Outstanding income - ${translatePolishMonthYear(monthlyOutstandingIncome[1])}`;

  const monthlyActualTransactions = trimmed.match(/^Wykonane transakcje - (.+)$/);
  if (monthlyActualTransactions) return `Actual transactions - ${translatePolishMonthYear(monthlyActualTransactions[1])}`;

  const netResultLabel = trimmed.match(/^Wynik netto: (.+)$/);
  if (netResultLabel) return `Net result: ${netResultLabel[1]}`;

  const goalPace = trimmed.match(/^Pilnuj tempa celu „(.+)”$/);
  if (goalPace) return `Keep goal “${goalPace[1]}” on track`;

  const bufferThreshold = trimmed.match(/^Poduszka do progu (.+)$/);
  if (bufferThreshold) return `Emergency fund up to ${bufferThreshold[1]}`;

  const strategyAllocation = trimmed.match(/^([\d.,]+)% strategii × ([\d.,]+)% alokacji aktywnego progu\.$/);
  if (strategyAllocation) return `${strategyAllocation[1]}% of strategy × ${strategyAllocation[2]}% allocation of the active threshold.`;

  const pdfRecognized = trimmed.match(/^PDF: rozpoznano (\d+) operacji \((.+)\)\. Wszystkie dane są tylko podglądem - przed importem możesz poprawić datę, nazwę, kwotę, typ i kontrahenta\.$/);
  if (pdfRecognized) return `PDF: recognized ${pdfRecognized[1]} transactions (${pdfRecognized[2]}). All data is only a preview - you can correct the date, name, amount, type and counterparty before importing.`;

  const oneRecord = trimmed.match(/^(\d+) rekord$/);
  if (oneRecord) return `${oneRecord[1]} record`;
  const fewRecords = trimmed.match(/^(\d+) rekordy$/);
  if (fewRecords) return `${fewRecords[1]} records`;
  const manyRecords = trimmed.match(/^(\d+) rekordów$/);
  if (manyRecords) return `${manyRecords[1]} records`;
  const recordRange = trimmed.match(/^(\d+) z (\d+) rekordów$/);
  if (recordRange) return `${recordRange[1]} of ${recordRange[2]} records`;
  const recordsSelected = trimmed.match(/^(\d+) rekordów · zaznaczono (\d+)$/);
  if (recordsSelected) return `${recordsSelected[1]} records · ${recordsSelected[2]} selected`;

  const welcome = trimmed.match(/^Witaj, (.+)$/);
  if (welcome) return `Welcome, ${welcome[1]}`;

  const moveUp = trimmed.match(/^Przesuń (.+) wyżej$/);
  if (moveUp) return `Move ${moveUp[1]} up`;

  const moveDown = trimmed.match(/^Przesuń (.+) niżej$/);
  if (moveDown) return `Move ${moveDown[1]} down`;

  const changeModuleIcon = trimmed.match(/^Zmień ikonę modułu (.+)$/);
  if (changeModuleIcon) return `Change icon for module ${changeModuleIcon[1]}`;

  const chooseModuleIcon = trimmed.match(/^Wybierz ikonę modułu (.+)$/);
  if (chooseModuleIcon) return `Choose icon for module ${chooseModuleIcon[1]}`;

  const simplePrefixPatterns: Array<[RegExp, string]> = [
    [/^Edytuj (.+)$/, "Edit"],
    [/^Usuń (.+)$/, "Delete"],
    [/^Historia konta - (.+)$/, "Account history -"],
    [/^Zaksięguj operację - (.+)$/, "Post operation -"],
    [/^Importuj CSV\/PDF - (.+)$/, "Import CSV/PDF -"],
    [/^Rola konta (.+) w sugestiach$/, "Account role in suggestions:"],
  ];
  for (const [pattern, prefix] of simplePrefixPatterns) {
    const match = trimmed.match(pattern);
    if (match) return `${prefix} ${match[1]}`;
  }

  const validAmount = trimmed.match(/^(.+) musi być prawidłową kwotą\.$/);
  if (validAmount) return `${translateUiText(validAmount[1], "en")} must be a valid amount.`;

  const greaterThanZero = trimmed.match(/^(.+) musi być większa od zera\.$/);
  if (greaterThanZero) return `${translateUiText(greaterThanZero[1], "en")} must be greater than zero.`;

  const notNegative = trimmed.match(/^(.+) nie może być ujemna\.$/);
  if (notNegative) return `${translateUiText(notNegative[1], "en")} cannot be negative.`;

  const maxAmount = trimmed.match(/^(.+) nie może przekraczać (.+)\.$/);
  if (maxAmount) return `${translateUiText(maxAmount[1], "en")} cannot exceed ${maxAmount[2]}.`;

  const integerRange = trimmed.match(/^(.+) musi mieścić się w zakresie (.+)\.$/);
  if (integerRange) return `${translateUiText(integerRange[1], "en")} must be between ${integerRange[2]}.`;

  const remaining = trimmed.match(/^(.+), pozostało (.+)$/);
  if (remaining) return `${remaining[1]}, remaining ${remaining[2]}`;

  const accountBalance = trimmed.match(/^(.+) · saldo rzeczywiste (.+)$/);
  if (accountBalance) return `${accountBalance[1]} · actual balance ${accountBalance[2]}`;

  const periodSnapshot = trimmed.match(/^Stan tego okresu zapisano (.+)\. Możesz go zaktualizować\.$/);
  if (periodSnapshot) return `This period snapshot was saved ${periodSnapshot[1]}. You can update it.`;

  const strategyTotal = trimmed.match(/^Suma udziałów musi wynosić 100% \(obecnie ([\d.,]+)%\)\.$/);
  if (strategyTotal) return `Shares must total 100% (currently ${strategyTotal[1]}%).`;

  const importTitle = trimmed.match(/^Import wyciągu - (.+)$/);
  if (importTitle) return `Statement import - ${importTitle[1]}`;

  const allCount = trimmed.match(/^Wszystkie: (\d+)$/);
  if (allCount) return `All: ${allCount[1]}`;

  const selectedCount = trimmed.match(/^Wybrano: (\d+)$/);
  if (selectedCount) return `Selected: ${selectedCount[1]}`;

  const importCount = trimmed.match(/^Importuj (\d+)$/);
  if (importCount) return `Import ${importCount[1]}`;

  if (trimmed.startsWith("Prognoza rzeczywistych środków po rezerwie na codzienne wydatki spada poniżej zera.")) {
    const periodDeficit = trimmed.includes("Wydatki okresu również przewyższają wpływy.")
      ? " Period expenses also exceed income."
      : "";
    return `The forecast of available funds after the daily expense reserve falls below zero.${periodDeficit} Review which expenses can be reduced or postponed, or add funds. Forecast shortfall:`;
  }

  return null;
}

export function translateUiText(value: string, language: AppLanguage = loadAppSettings().language): string {
  if (language === "pl") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const exact = EN_UI_CATALOG[trimmed];
  if (exact) return withOriginalWhitespace(value, exact);
  const dynamic = translateDynamicPolishText(trimmed);
  return dynamic ? withOriginalWhitespace(value, dynamic) : value;
}

function translateTextNode(node: Text, language: AppLanguage): void {
  if (isTranslationIgnored(node)) return;
  const current = node.nodeValue ?? "";
  const stored = textSources.get(node);

  if (language === "pl") {
    if (stored !== undefined && current !== stored) node.nodeValue = stored;
    return;
  }

  let source = stored;
  if (source === undefined) {
    source = current;
    textSources.set(node, source);
  } else {
    const expectedTranslation = translateUiText(source, "en");
    if (current !== source && current !== expectedTranslation) {
      source = current;
      textSources.set(node, source);
    }
  }

  const translated = translateUiText(source, "en");
  if (node.nodeValue !== translated) node.nodeValue = translated;
}

function translateAttribute(element: Element, attribute: string, language: AppLanguage): void {
  if (isTranslationIgnored(element)) return;
  const current = element.getAttribute(attribute);
  if (current == null) return;
  let sources = attributeSources.get(element);
  if (!sources) {
    sources = new Map<string, string>();
    attributeSources.set(element, sources);
  }
  const stored = sources.get(attribute);

  if (language === "pl") {
    if (stored !== undefined && current !== stored) element.setAttribute(attribute, stored);
    return;
  }

  let source = stored;
  if (source === undefined) {
    source = current;
    sources.set(attribute, source);
  } else {
    const expectedTranslation = translateUiText(source, "en");
    if (current !== source && current !== expectedTranslation) {
      source = current;
      sources.set(attribute, source);
    }
  }

  const translated = translateUiText(source, "en");
  if (current !== translated) element.setAttribute(attribute, translated);
}

function translateTree(root: Node, language: AppLanguage): void {
  bridgeMutation = true;
  try {
    if (root.nodeType === Node.TEXT_NODE) translateTextNode(root as Text, language);
    if (root.nodeType === Node.ELEMENT_NODE) {
      const element = root as Element;
      for (const attribute of TRANSLATABLE_ATTRIBUTES) translateAttribute(element, attribute, language);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, language);
      else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        if (["SCRIPT", "STYLE", "TEXTAREA"].includes(element.tagName)) {
          node = walker.nextSibling();
          continue;
        }
        for (const attribute of TRANSLATABLE_ATTRIBUTES) translateAttribute(element, attribute, language);
      }
      node = walker.nextNode();
    }
  } finally {
    bridgeMutation = false;
  }
}

function I18nDomBridge({ language }: { language: AppLanguage }) {
  React.useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    translateTree(root, language);

    const observer = new MutationObserver((mutations) => {
      if (bridgeMutation) return;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateTree(mutation.target, language);
        if (mutation.type === "attributes") translateTree(mutation.target, language);
        mutation.addedNodes.forEach((node) => translateTree(node, language));
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...TRANSLATABLE_ATTRIBUTES] });
    return () => observer.disconnect();
  }, [language]);
  return null;
}

export function AppPresentationProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState(() => loadAppSettings());

  React.useEffect(() => {
    const refresh = () => setSettings(loadAppSettings());
    window.addEventListener("myanalyze-settings-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("myanalyze-settings-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const presentation = React.useMemo<AppPresentation>(() => ({
    language: settings.language,
    currency: settings.currency,
    locale: settings.language === "en" ? "en-US" : "pl-PL",
  }), [settings.currency, settings.language]);

  React.useEffect(() => {
    document.documentElement.lang = presentation.language;
  }, [presentation.language]);

  return (
    <PresentationContext.Provider value={presentation}>
      <I18nDomBridge language={presentation.language} />
      {children}
    </PresentationContext.Provider>
  );
}

export function useAppPresentation(): AppPresentation {
  return React.useContext(PresentationContext);
}

export function useUiText(): (value: string) => string {
  const { language } = useAppPresentation();
  return React.useCallback((value: string) => translateUiText(value, language), [language]);
}

export function getAppLocale(): "pl-PL" | "en-US" {
  return loadAppSettings().language === "en" ? "en-US" : "pl-PL";
}
