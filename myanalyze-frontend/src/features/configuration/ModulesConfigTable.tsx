import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { createPortal } from "react-dom";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import IconButton from "../../components/IconButton";
import { useToast } from "../../context/ToastContext";
import apiClient from "../../utils/apiClient";
import { mergeModuleConfiguration, type ConfiguredWelcomeModule } from "../WelcomePage/modules";
import { MODULE_ICON_OPTIONS, ModuleIcon } from "../WelcomePage/moduleIconCatalog";

type ModuleConfig = ConfiguredWelcomeModule;

export default function ModulesConfigTable() {
  const [modules, setModules] = React.useState<ModuleConfig[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [iconPicker, setIconPicker] = React.useState<{ moduleKey: string; x: number; y: number } | null>(null);
  const iconPopupRef = React.useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const orderedModules = React.useMemo(() => [...modules].sort((left, right) => left.order_index - right.order_index), [modules]);

  const showSaved = React.useCallback((message = "Zapisano zmiany modułów.") => {
    showToast(message, "success");
  }, [showToast]);

  const fetchModules = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get("/modules-config");
      setModules(mergeModuleConfiguration(response.data));
    } catch {
      showToast("Nie udało się pobrać konfiguracji modułów.", "error");
    } finally { setLoading(false); }
  }, [showToast]);

  React.useEffect(() => { void fetchModules(); }, [fetchModules]);
  React.useEffect(() => {
    if (!iconPicker) return;
    const closeWhenClickingOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !iconPopupRef.current?.contains(event.target)) setIconPicker(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setIconPicker(null); };
    document.addEventListener("mousedown", closeWhenClickingOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeWhenClickingOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [iconPicker]);

  const persistModule = React.useCallback(async (module: ModuleConfig) => {
    const response = await apiClient.put(`/modules-config/${module.key}`, module);
    const saved = response.data && typeof response.data === "object" ? { ...module, ...response.data } : module;
    setModules((current) => current.map((item) => item.key === module.key ? saved : item));
    showSaved();
  }, [showSaved]);

  const saveModule = React.useCallback(async (module: ModuleConfig) => {
    try { await persistModule(module); }
    catch (error) { showToast("Nie udało się zapisać zmian modułu.", "error"); throw error; }
  }, [persistModule, showToast]);

  const toggleVisibility = React.useCallback(async (module: ModuleConfig) => {
    try { await persistModule({ ...module, visible: module.visible === "1" ? "0" : "1" }); }
    catch { showToast("Nie udało się zapisać widoczności modułu.", "error"); }
  }, [persistModule, showToast]);

  const changeIcon = React.useCallback(async (module: ModuleConfig, icon: string) => {
    try { await persistModule({ ...module, icon }); setIconPicker(null); }
    catch { showToast("Nie udało się zapisać ikony modułu.", "error"); }
  }, [persistModule, showToast]);

  const moveModule = React.useCallback(async (moduleKey: string, direction: -1 | 1) => {
    const previousOrder = orderedModules.map((module) => ({ ...module }));
    const nextOrder = orderedModules.map((module) => ({ ...module }));
    const sourceIndex = nextOrder.findIndex((module) => module.key === moduleKey);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= nextOrder.length) return;
    [nextOrder[sourceIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[sourceIndex]];
    nextOrder.forEach((module, index) => { module.order_index = index; });
    setModules(nextOrder);
    try {
      const response = await apiClient.put("/modules-config/order", {
        updates: nextOrder.map(({ key, order_index }) => ({ key, order_index })),
      });
      if (Array.isArray(response.data)) setModules(mergeModuleConfiguration(response.data));
      showSaved("Zapisano kolejność modułów.");
    } catch {
      setModules(previousOrder);
      showToast("Nie udało się zapisać kolejności modułów.", "error");
    }
  }, [orderedModules, showSaved, showToast]);

  const columns = React.useMemo<DataGridColumn<ModuleConfig>[]>(() => [
    { key: "position", label: "#", width: 70, hideable: false, align: "center", value: (module) => orderedModules.findIndex((item) => item.key === module.key) + 1 },
    {
      key: "icon", label: "Ikona", width: 100, hideable: false, align: "center", value: (module) => module.icon,
      render: (module) => <div className="flex justify-center"><button type="button" className="rounded-lg p-2 hover:bg-blue-50" title="Zmień ikonę" aria-label={`Zmień ikonę modułu ${module.name}`} onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setIconPicker((current) => current?.moduleKey === module.key ? null : { moduleKey: module.key, x: Math.max(8, Math.min(rect.left - 120, window.innerWidth - 336)), y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 296)) });
      }}><ModuleIcon value={module.icon} moduleKey={module.key} /></button></div>,
    },
    { key: "name", label: "Nazwa", width: 220, value: (module) => module.name, edit: { value: (module) => module.name, update: (module, value) => ({ ...module, name: String(value) }) } },
    { key: "description", label: "Opis", width: 420, value: (module) => module.description, edit: { value: (module) => module.description, update: (module, value) => ({ ...module, description: String(value) }) } },
    { key: "visible", label: "Widoczny", width: 130, align: "center", value: (module) => module.visible === "1" ? "Tak" : "Nie", render: (module) => <button type="button" className={`rounded-lg border px-3 py-1 font-semibold ${module.visible === "1" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`} onClick={() => void toggleVisibility(module)}>{module.visible === "1" ? "Tak" : "Nie"}</button> },
  ], [orderedModules, toggleVisibility]);

  const iconModule = iconPicker ? orderedModules.find((module) => module.key === iconPicker.moduleKey) : undefined;
  return <div className="flex w-full flex-col gap-2">
    <DataGrid gridId="modules-configuration" rows={orderedModules} columns={columns} getRowId={(module) => module.key} loading={loading} emptyMessage="Brak modułów do skonfigurowania." preserveRowOrder onInlineSave={saveModule} actionsWidth={112} actions={(module) => {
      const index = orderedModules.findIndex((item) => item.key === module.key);
      return <><IconButton label={`Przesuń ${module.name} wyżej`} disabled={index <= 0} onClick={() => void moveModule(module.key, -1)}><ArrowUp size={18} aria-hidden="true" /></IconButton><IconButton label={`Przesuń ${module.name} niżej`} disabled={index < 0 || index >= orderedModules.length - 1} onClick={() => void moveModule(module.key, 1)}><ArrowDown size={18} aria-hidden="true" /></IconButton></>;
    }} />
    {iconPicker && iconModule && createPortal(<div ref={iconPopupRef} role="dialog" aria-label={`Wybierz ikonę modułu ${iconModule.name}`} className="fixed z-[120] w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl" style={{ left: iconPicker.x, top: iconPicker.y, zIndex: 120 }}>
      <div className="mb-2 flex items-center justify-between gap-3"><strong className="text-sm text-slate-800">Wybierz ikonę</strong><button type="button" className="rounded px-2 text-xl text-slate-500 hover:bg-slate-100" aria-label="Zamknij wybór ikony" onClick={() => setIconPicker(null)}>×</button></div>
      <div className="grid max-h-56 gap-1 overflow-y-auto" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>{MODULE_ICON_OPTIONS.map((option) => <button key={option.key} type="button" className={`flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-blue-100 ${iconModule.icon === option.value ? "border-blue-400 bg-blue-50" : "border-transparent"}`} onClick={() => void changeIcon(iconModule, option.value)} title={option.key}><option.Icon className="text-2xl" /></button>)}</div>
    </div>, document.body)}
  </div>;
}
