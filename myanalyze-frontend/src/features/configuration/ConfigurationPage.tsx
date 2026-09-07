import React from "react";
import { DatabaseBackup, Save, Settings2 } from "lucide-react";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import Modal from "../../components/Modal";
import ModulePage from "../../components/ModulePage";
import { useToast } from "../../context/ToastContext";
import { applyAppTheme, loadAppSettings, saveAppSettings, type AppSettings } from "../../utils/appSettings";
import apiClient from "../../utils/apiClient";
import ModulesConfigTable from "./ModulesConfigTable";
import CustomTransactionTypesConfig from "./CustomTransactionTypesConfig";
import Button from "../../components/Button";

type SettingKey = "language" | "theme" | "currency" | "username" | "modules" | "customTypes" | "backup";
interface SettingRow { id: SettingKey; name: string; description: string; value: string; }

function displayValue(row: SettingRow): string {
  if (row.id === "language") return "Polski";
  if (row.id === "theme") return row.value === "dark" ? "Ciemny" : "Jasny";
  if (row.id === "username") return row.value || "Nie ustawiono";
  if (row.id === "modules") return "Otwórz zarządzanie modułami";
  if (row.id === "customTypes") return "Zarządzaj etykietami";
  if (row.id === "backup") return "Pobierz bazę SQLite";
  return row.value;
}

export default function ConfigurationPage() {
  const initialSettings = React.useMemo(loadAppSettings, []);
  const [settings, setSettings] = React.useState<AppSettings>(initialSettings);
  const [showModules, setShowModules] = React.useState(false);
  const [showCustomTypes, setShowCustomTypes] = React.useState(false);
  const [downloadingBackup, setDownloadingBackup] = React.useState(false);
  const persistedThemeRef = React.useRef(initialSettings.theme);
  const { showToast } = useToast();

  React.useEffect(() => () => {
    applyAppTheme(persistedThemeRef.current);
  }, []);

  const updateTheme = React.useCallback((theme: AppSettings["theme"]) => {
    setSettings((current) => ({ ...current, theme }));
  }, []);
  const save = () => {
    const normalized = { ...settings, username: settings.username.trim() };
    saveAppSettings(normalized);
    applyAppTheme(normalized.theme);
    setSettings(normalized);
    persistedThemeRef.current = normalized.theme;
    showToast("Ustawienia aplikacji zostały zapisane.", "success");
  };
  const downloadBackup = async () => {
    setDownloadingBackup(true);
    try {
      const response = await apiClient.get<Blob>("/backup", { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `MyAnalyze-backup-${new Date().toISOString().slice(0, 10)}.sqlite`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast("Kopia bazy danych została pobrana.", "success");
    } catch {
      showToast("Nie udało się pobrać kopii bazy danych.", "error");
    } finally {
      setDownloadingBackup(false);
    }
  };

  const rows = React.useMemo<SettingRow[]>(() => [
    { id: "language", name: "Język aplikacji", description: "Język etykiet i komunikatów interfejsu.", value: settings.language },
    { id: "theme", name: "Motyw aplikacji", description: "Wygląd aplikacji. Zmiana zostanie zastosowana po zapisaniu ustawień.", value: settings.theme },
    { id: "currency", name: "Waluta domyślna", description: "Waluta kwot, podsumowań i eksportów.", value: settings.currency },
    { id: "username", name: "Imię użytkownika / alias", description: "Opcjonalna lokalna nazwa użytkownika.", value: settings.username },
    { id: "modules", name: "Moduły aplikacji", description: "Nazwy, opisy, ikony, widoczność i kolejność kafelków strony startowej.", value: "" },
    { id: "customTypes", name: "Etykiety transakcji", description: "Wspólne etykiety przychodów i wydatków używane w imporcie, filtrach i raportach.", value: "" },
    { id: "backup", name: "Kopia zapasowa", description: "Pobierz kompletną kopię danych aplikacji jako plik SQLite.", value: "" },
  ], [settings]);

  const columns = React.useMemo<DataGridColumn<SettingRow>[]>(() => [
    { key: "name", label: "Ustawienie", value: (row) => row.name, width: 260, hideable: false },
    { key: "description", label: "Opis", value: (row) => row.description, width: 520 },
    {
      key: "value", label: "Wartość", value: displayValue, width: 340,
      render: (row) => {
        if (row.id === "language") return <select aria-label="Język aplikacji" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={settings.language} onChange={() => undefined}><option value="pl">Polski</option></select>;
        if (row.id === "theme") return <select aria-label="Motyw aplikacji" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={settings.theme} onChange={(event) => updateTheme(event.target.value as AppSettings["theme"])}><option value="light">Jasny</option><option value="dark">Ciemny</option></select>;
        if (row.id === "currency") return <select aria-label="Waluta domyślna" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={settings.currency} onChange={() => undefined}><option value="PLN">PLN</option></select>;
        if (row.id === "username") return <input aria-label="Imię użytkownika lub alias" maxLength={60} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="Nie ustawiono" value={settings.username} onChange={(event) => setSettings((current) => ({ ...current, username: event.target.value }))} />;
        if (row.id === "modules") return <Button tone="primary" onClick={() => setShowModules(true)}><Settings2 size={18} aria-hidden="true" />Zarządzaj modułami</Button>;
        if (row.id === "customTypes") return <Button tone="secondary" onClick={() => setShowCustomTypes(true)}><Settings2 size={18} aria-hidden="true" />Zarządzaj etykietami</Button>;
        return <Button tone="neutral" disabled={downloadingBackup} onClick={() => void downloadBackup()}><DatabaseBackup size={18} aria-hidden="true" />{downloadingBackup ? "Tworzenie kopii…" : "Pobierz bazę SQLite"}</Button>;
      },
    },
  ], [downloadingBackup, settings, updateTheme]);

  return <ModulePage title="Konfiguracja" maxWidth={1280}>
    <DataGrid gridId="application-settings" rows={rows} columns={columns} getRowId={(row) => row.id} preserveRowOrder showFooter={false} toolbar={<Button tone="primary" onClick={save}><Save size={18} aria-hidden="true" />Zapisz ustawienia</Button>} />
    <Modal open={showModules} onClose={() => setShowModules(false)} title="Zarządzaj modułami aplikacji" description="Zmień nazwę, opis, ikonę, widoczność lub kolejność modułów." size="full"><ModulesConfigTable /></Modal>
    <Modal open={showCustomTypes} onClose={() => setShowCustomTypes(false)} title="Etykiety transakcji" description="Etykieta jest wspólna dla przychodów i wydatków i nie zmienia logiki finansowej operacji." size="lg"><CustomTransactionTypesConfig /></Modal>
  </ModulePage>;
}
