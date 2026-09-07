import React from "react";
import { useEffect, useState } from "react";
import apiClient from "../../utils/apiClient";
import { Link } from "react-router-dom";
import { mergeModuleConfiguration, type ConfiguredWelcomeModule } from "./modules";
import { useAccountContext } from "../../context/useAccountContext";
import { formatCurrency } from "../../utils/formatters";
import { ModuleIcon } from "./moduleIconCatalog";
import { loadAppSettings } from "../../utils/appSettings";
import HeaderClock from "../../components/HeaderClock";

const WelcomePage = () => {
  const [username] = useState(() => loadAppSettings().username);
  const { accounts, accountsLoaded, accountsError } = useAccountContext();
  const [modules, setModules] = useState<ConfiguredWelcomeModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [modulesError, setModulesError] = useState(false);

  const loadModules = React.useCallback(async () => {
    setModulesLoading(true);
    try {
      const res = await apiClient.get("/modules-config");
      const merged = mergeModuleConfiguration(res.data)
        .filter((mod) => mod.visible === "1")
        .sort((a, b) => a.order_index - b.order_index);
      setModules(merged);
      setModulesError(false);
    } catch {
      setModules(mergeModuleConfiguration([])
        .filter((mod) => mod.visible === "1")
        .sort((a, b) => a.order_index - b.order_index));
      setModulesError(true);
    } finally {
      setModulesLoading(false);
    }
  }, []);

  useEffect(() => { void loadModules(); }, [loadModules]);

  function getSummaryComponent(modKey: string): React.ReactElement | null {
    switch (modKey) {
      case "manager":
        if (!accountsLoaded) return <span className="mt-3 block text-sm font-semibold text-slate-500">Ładowanie salda…</span>;
        if (accountsError) return <span className="mt-3 block text-sm font-semibold text-amber-700">Saldo chwilowo niedostępne</span>;
        return <span className="mt-3 block text-base font-semibold text-blue-700">Stan konta: {formatCurrency(accounts.filter((account) => account.active !== false).reduce((sum, account) => sum + Number(account.saldo_dostepne || 0), 0))}</span>;
      default:
        return null;
    }
  }

  if (modulesLoading) {
    return <div className="flex justify-center items-center min-h-[300px] text-gray-500">Ładowanie modułów...</div>;
  }

  return (
    <div className="app-page-background flex min-h-screen w-full items-center justify-center pt-16">
      {/* Pasek zegara jak w ModuleHeader, bez przycisku wstecz i bez tytułu */}
      <div className="fixed top-0 left-0 w-full bg-white text-blue-700 shadow-lg z-50 flex justify-between items-center px-6 h-16 border-b border-gray-200">
        <span className="truncate text-sm font-semibold text-blue-800">{username ? `Witaj, ${username}` : "MyAnalyze"}</span>
        <HeaderClock />
      </div>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-8">
        {modulesError && <div role="alert" className="mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>Nie udało się wczytać zapisanej konfiguracji modułów. Pokazuję domyślny układ.</span><button type="button" className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" onClick={() => void loadModules()}>Spróbuj ponownie</button></div>}
        <div
          className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,240px),300px))] justify-center gap-6 transition-all"
        >
          {modules.map((mod, idx) => (
            <Link
              key={`mod-${mod.key}-${idx}`}
              to={mod.route}
              className="flex min-h-64 flex-col items-center rounded-xl bg-white p-6 shadow-lg transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-4"
              aria-label={`Otwórz moduł ${mod.name}`}
            >
              <ModuleIcon value={mod.icon} moduleKey={mod.key} className="mb-4 mt-2 block text-6xl" colored />
              <h2 className="text-2xl font-bold text-gray-800 text-center w-full">{mod.name}</h2>
              <span className="text-gray-400 text-sm mt-2 text-center w-full">{mod.description}</span>
              <div className="money-value">{getSummaryComponent(mod.key)}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WelcomePage;
