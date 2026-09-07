import { HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { WelcomePage } from "./features/WelcomePage";
import { FinanceManagerPage } from "./features/finance-manager/index";
import { ExpenseProvider } from "./context/ExpenseContext";
import { IncomeProvider } from "./context/IncomeContext";
import { IncomeStaleProvider } from "./context/IncomeStaleContext";
import { ExpenseStaleProvider } from "./context/ExpenseStaleContext";
import ConfigurationPage from "./features/configuration/ConfigurationPage";
import AppActivityLogModule from "./features/WelcomePage/AppActivityLogModule";
import { ToastProvider, useToast } from "./context/ToastContext";
import { setToastFunction } from "./utils/apiClient";
import { AccountProvider } from "./context/AccountContext";
import { ToastType } from "./context/toast-types";
import { useEffect } from "react";
import { AppPresentationProvider, useAppPresentation } from "./i18n";

const AppContent = () => {
  useAppPresentation();
  const { showToast } = useToast();
  useEffect(() => {
    setToastFunction((message, type, duration) => showToast(message, type as ToastType, duration));
    return () => setToastFunction(null);
  }, [showToast]);

  return (
    <ExpenseProvider>
        <IncomeProvider>
          <IncomeStaleProvider>
            <ExpenseStaleProvider>
              <AccountProvider>
                <HashRouter>
                  <Routes>
                    <Route path="/" element={<WelcomePage />} />
                    <Route path="/wydatki" element={<Navigate to="/manager?tab=expenses" replace />} />
                    <Route path="/przychody" element={<Navigate to="/manager?tab=incomes" replace />} />
                    <Route path="/wydatki-stale" element={<Navigate to="/manager?tab=expenses&view=recurring" replace />} />
                    <Route path="/przychody-stale" element={<Navigate to="/manager?tab=incomes&view=recurring" replace />} />
                    <Route path="/saldo" element={<Navigate to="/manager?tab=accounts" replace />} />
                    <Route path="/finanse" element={<FinanceManagerPage />} />
                    <Route path="/manager" element={<FinanceManagerPage />} />
                    <Route path="/konfiguracja" element={<ConfigurationPage />} />
                    <Route path="/financial-summary" element={<Navigate to="/manager?tab=summary" replace />} />
                    <Route path="/logi-aplikacji" element={<AppActivityLogModule />} />
                    <Route path="/podsumowanie-finansowe" element={<Navigate to="/manager?tab=summary" replace />} />
                    <Route path="/loans" element={<Navigate to="/manager?tab=credits" replace />} />
                    <Route path="/app-activity-log" element={<AppActivityLogModule />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </HashRouter>
              </AccountProvider>
            </ExpenseStaleProvider>
          </IncomeStaleProvider>
        </IncomeProvider>
      </ExpenseProvider>
  );
};

const App = () => (
  <AppPresentationProvider>
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  </AppPresentationProvider>
);

export default App;
