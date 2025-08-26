"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type LogType = 'info' | 'error' | 'warning';

interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: LogType;
}

interface LogContextType {
  logs: LogEntry[];
  addLog: (message: string, type?: LogType) => void;
  clearLogs: () => void;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export const useLog = (): LogContextType => {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error('useLog должен использоваться внутри LogProvider');
  }
  return context;
};

interface LogProviderProps {
  children: ReactNode;
}

export const LogProvider = ({ children }: LogProviderProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((message: string, type: LogType = 'info') => {
    const newLog: LogEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setLogs(prevLogs => [newLog, ...prevLogs]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const value = { logs, addLog, clearLogs };

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
};