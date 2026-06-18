// lib/stateContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, Application, Incident, UserProfile, generateMetricsHistory } from './mockDb';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface AppContextType {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  selectedOrg: string;
  setSelectedOrg: (org: string) => void;
  toasts: Toast[];
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeToast: (id: string) => void;
  applications: Application[];
  refreshApplications: () => void;
  incidents: Incident[];
  refreshIncidents: () => void;
  activeIncidentCount: number;
  triggerCpuSpikeSimulation: () => void;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  // Load initial data
  useEffect(() => {
    // Read theme from localStorage or default to dark
    const savedTheme = localStorage.getItem('querypulse_theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      setTheme('dark');
    }

    // Read session to populate user
    const hasSession = document.cookie.includes('querypulse_session=');
    if (hasSession) {
      setUserState(db.getUserProfile());
      setSelectedOrg(db.getUserProfile().orgName);
    }

    setApplications(db.getApplications());
    setIncidents(db.getIncidents());
  }, []);

  // Sync theme changes with DOM element
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('querypulse_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setUser = (newUser: UserProfile | null) => {
    setUserState(newUser);
    if (newUser) {
      setSelectedOrg(newUser.orgName);
    }
  };

  const addToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto-remove toast after 4s
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const refreshApplications = () => {
    setApplications(db.getApplications());
  };

  const refreshIncidents = () => {
    setIncidents(db.getIncidents());
  };

  const activeIncidentCount = incidents.filter(i => i.status === 'ACTIVE').length;

  const logout = () => {
    // Delete cookie
    document.cookie = 'querypulse_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    setUserState(null);
    window.location.href = '/login';
  };

  // Simulate a live telemetry spike update (e.g. periodically triggers a warning in background)
  const triggerCpuSpikeSimulation = () => {
    db.tuneIncident('inc-1', false); // reset to active spike
    refreshIncidents();
    refreshApplications();
    addToast('Simulated telemetry event: production CPU spike detected on billing-service!', 'error');
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        user,
        setUser,
        selectedOrg,
        setSelectedOrg,
        toasts,
        addToast,
        removeToast,
        applications,
        refreshApplications,
        incidents,
        refreshIncidents,
        activeIncidentCount,
        triggerCpuSpikeSimulation,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
