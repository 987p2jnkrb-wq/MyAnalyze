import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import apiClient from "../utils/apiClient";
import { AppActivityLog, AppActivityLogContextType } from "./app-activity-log-types";

const AppActivityLogContext = createContext<AppActivityLogContextType | undefined>(undefined);

export const useAppActivityLogContext = () => {
  const ctx = useContext(AppActivityLogContext);
  if (!ctx) throw new Error("useAppActivityLogContext must be used within AppActivityLogProvider");
  return ctx;
};

export const AppActivityLogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<AppActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<AppActivityLog[]>("/app-activity-logs");
      setLogs(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch {
      setError("Nie udało się pobrać logów z serwera.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  return (
    <AppActivityLogContext.Provider value={{ logs, loading, error, fetchLogs }}>
      {children}
    </AppActivityLogContext.Provider>
  );
};
