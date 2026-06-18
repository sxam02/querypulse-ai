// app/schema-compare/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/lib/stateContext';
import {
  Database,
  Server,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Copy,
  RefreshCw,
  Check,
  Sliders,
  FileCode,
  Activity,
  Layers,
  Settings,
  Flame,
  AlertTriangle,
  Play,
  FileText,
  Terminal as TerminalIcon,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  Edit2,
  Save,
  Zap,
  GitCompareArrows,
  Shield,
  Eye,
  Code2,
  Hash,
  Table2,
  FunctionSquare,
  Box,
  Mail,
  Send,
} from 'lucide-react';
import { CompareResult, CompareResultItem, DatabaseSchemaSnapshot } from '@/lib/services/postgresCompareService';

/* ─── Coinbase Design Tokens (Light / Dark) ─────────────────────────── */
interface CBTokens {
  primary: string; primaryActive: string; primaryDisabled: string;
  ink: string; body: string; muted: string; mutedSoft: string;
  hairline: string; hairlineSoft: string;
  canvas: string; surfaceSoft: string; surfaceStrong: string;
  surfaceDark: string; surfaceDarkEl: string;
  onPrimary: string; onDark: string; onDarkSoft: string;
  up: string; down: string; yellow: string;
}

const LIGHT: CBTokens = {
  primary: '#0052ff', primaryActive: '#003ecc', primaryDisabled: '#a8b8cc',
  ink: '#0a0b0d', body: '#5b616e', muted: '#7c828a', mutedSoft: '#a8acb3',
  hairline: '#dee1e6', hairlineSoft: '#eef0f3',
  canvas: '#ffffff', surfaceSoft: '#f7f7f7', surfaceStrong: '#eef0f3',
  surfaceDark: '#0a0b0d', surfaceDarkEl: '#16181c',
  onPrimary: '#ffffff', onDark: '#ffffff', onDarkSoft: '#a8acb3',
  up: '#05b169', down: '#cf202f', yellow: '#f4b000',
};

const DARK: CBTokens = {
  primary: '#4d8eff', primaryActive: '#3a7aff', primaryDisabled: '#3a4a66',
  ink: '#f0f0f2', body: '#a8acb3', muted: '#7c828a', mutedSoft: '#5b616e',
  hairline: '#2a2d32', hairlineSoft: '#1e2025',
  canvas: '#0a0b0d', surfaceSoft: '#111214', surfaceStrong: '#1a1c20',
  surfaceDark: '#000000', surfaceDarkEl: '#16181c',
  onPrimary: '#ffffff', onDark: '#ffffff', onDarkSoft: '#7c828a',
  up: '#2dd48a', down: '#f05545', yellow: '#f4b000',
};

/* ─── Types ─────────────────────────────────────────────────────────── */
interface DBProfile {
  id: string;
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password?: string;
}

const DEFAULT_PROFILES: DBProfile[] = [
  {
    id: 'prof-staging',
    name: 'Staging Replica (Demo)',
    host: 'demo-source',
    port: '5432',
    database: 'staging_ecommerce',
    username: 'admin',
    password: '••••••••'
  },
  {
    id: 'prof-prod',
    name: 'Production DB (Demo)',
    host: 'demo-destination',
    port: '5432',
    database: 'production_ecommerce',
    username: 'root',
    password: '••••••••'
  }
];

/* ─── Component Icons Map ───────────────────────────────────────────── */
const COMP_META: Record<string, { label: string; desc: string; icon: React.ElementType }> = {
  tables:    { label: 'Tables & Indexes',      desc: 'Columns, constraints, primary/foreign keys, and indexes.', icon: Table2 },
  views:     { label: 'Views',                  desc: 'View definition queries and structures.',                 icon: Eye },
  functions: { label: 'Functions & Procedures', desc: 'Parameters, returns, definitions, and code blocks.',      icon: FunctionSquare },
  triggers:  { label: 'Triggers',               desc: 'Trigger definitions, events, timing, and bound tables.',  icon: Zap },
  types:     { label: 'Types & Enums',          desc: 'User-defined types, domain variables, and enum values.',  icon: Box },
  sequences: { label: 'Sequences',              desc: 'Auto-incrementing sequences, start limits, increments.', icon: Hash },
};

/* ─── Style helpers (will be computed inside component using theme) ── */

/* ═══════════════════════════════════════════════════════════════════════ */
export default function SchemaComparePage() {
  const router = useRouter();
  const { addToast, theme, toggleTheme } = useAppContext();

  const dark = theme === 'dark';
  const CB = dark ? DARK : LIGHT;

  // Theme-aware style helpers
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 48, padding: '14px 16px', borderRadius: 12,
    border: `1px solid ${CB.hairline}`, background: dark ? CB.surfaceSoft : CB.canvas,
    color: CB.ink, fontSize: 16, fontFamily: "'Inter', sans-serif",
    fontWeight: 400, lineHeight: 1.5, outline: 'none', transition: 'border-color 0.15s ease',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: CB.muted, letterSpacing: 0,
    lineHeight: 1.5, marginBottom: 6, display: 'block',
  };
  const pillBtnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44, padding: '12px 24px', borderRadius: 100, background: CB.primary,
    color: CB.onPrimary, fontSize: 16, fontWeight: 600, fontFamily: "'Inter', sans-serif",
    border: 'none', cursor: 'pointer', transition: 'background 0.15s ease', lineHeight: 1.15,
  };
  const pillBtnSecondary: React.CSSProperties = {
    ...pillBtnPrimary, background: CB.surfaceStrong, color: CB.ink,
  };
  const cardStyle: React.CSSProperties = {
    background: dark ? CB.surfaceSoft : CB.canvas, borderRadius: 24,
    border: `1px solid ${CB.hairline}`, overflow: 'hidden',
  };
  const cardDarkStyle: React.CSSProperties = {
    background: CB.surfaceDarkEl, borderRadius: 24, border: 'none', overflow: 'hidden',
  };
  const [mounted, setMounted] = useState(false);
  const [activeParentTab, setActiveParentTab] = useState<'compare' | 'profiles'>('compare');

  // Wizard Step State: 1 = DB Config, 2 = Component Select, 3 = Results
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Connection Profiles State
  const [profiles, setProfiles] = useState<DBProfile[]>([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileHost, setNewProfileHost] = useState('');
  const [newProfilePort, setNewProfilePort] = useState('5432');
  const [newProfileDatabase, setNewProfileDatabase] = useState('');
  const [newProfileUsername, setNewProfileUsername] = useState('');
  const [newProfilePassword, setNewProfilePassword] = useState('');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  // Selected Profiles for Comparison fields
  const [selectedSrcProfileId, setSelectedSrcProfileId] = useState<string>('manual');
  const [selectedDestProfileId, setSelectedDestProfileId] = useState<string>('manual');

  // Connection Parameters (Source & Destination)
  const [srcHost, setSrcHost] = useState('');
  const [srcPort, setSrcPort] = useState('5432');
  const [srcDatabase, setSrcDatabase] = useState('');
  const [srcUsername, setSrcUsername] = useState('');
  const [srcPassword, setSrcPassword] = useState('');

  const [destHost, setDestHost] = useState('');
  const [destPort, setDestPort] = useState('5432');
  const [destDatabase, setDestDatabase] = useState('');
  const [destUsername, setDestUsername] = useState('');
  const [destPassword, setDestPassword] = useState('');

  // Component Selections
  const [selectedComponents, setSelectedComponents] = useState<string[]>([
    'tables', 'views', 'functions', 'triggers', 'types', 'sequences'
  ]);

  // DB test status indicators
  const [testingSource, setTestingSource] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<'idle' | 'connected' | 'failed'>('idle');
  const [sourceError, setSourceError] = useState('');

  const [testingDest, setTestingDest] = useState(false);
  const [destStatus, setDestStatus] = useState<'idle' | 'connected' | 'failed'>('idle');
  const [destError, setDestError] = useState('');

  // Progression loader & terminal console states
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [compareProgress, setCompareProgress] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Live Timing & Estimation States
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const compareProgressRef = useRef(compareProgress);

  useEffect(() => {
    compareProgressRef.current = compareProgress;
  }, [compareProgress]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loadingCompare) {
      const startTime = Date.now();
      setElapsedTime(0);
      setEstimatedTimeRemaining(null);
      interval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        setElapsedTime(elapsed);

        const progress = compareProgressRef.current;
        if (progress >= 10 && elapsed >= 2 && progress < 100) {
          const totalEst = (elapsed / progress) * 100;
          const remaining = Math.max(1, Math.round(totalEst - elapsed));
          setEstimatedTimeRemaining(remaining);
        } else if (progress === 100) {
          setEstimatedTimeRemaining(0);
        } else {
          setEstimatedTimeRemaining(null);
        }
      }, 1000);
    } else {
      setElapsedTime(0);
      setEstimatedTimeRemaining(null);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loadingCompare]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Comparison result states
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareError, setCompareError] = useState('');

  // active item viewer states
  const [activeCompType, setActiveCompType] = useState<string>('tables');
  const [activeDriftTab, setActiveDriftTab] = useState<'missing' | 'extra' | 'different'>('missing');
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [sqlSeparator, setSqlSeparator] = useState<'semicolon' | 'go'>('go');

  // Email delivery states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('QueryPulse Schema Migration Script');
  const [emailBody, setEmailBody] = useState('Please find the attached database schema migration script(s) generated by QueryPulse.');
  const [emailSendType, setEmailSendType] = useState<'entire' | 'components'>('entire');
  const [selectedEmailComponents, setSelectedEmailComponents] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);

  const componentsWithDrifts = useMemo(() => {
    if (!compareResult) return [];
    const compTypes = ['tables', 'views', 'functions', 'triggers', 'types', 'sequences'];
    return compTypes.filter(compKey => {
      const items = (compareResult as any)[compKey] as CompareResultItem[] || [];
      return items.some(item => item.status !== 'identical');
    });
  }, [compareResult]);

  useEffect(() => {
    if (showEmailModal) {
      setSelectedEmailComponents(componentsWithDrifts);
    }
  }, [showEmailModal, componentsWithDrifts]);

  // Load configuration and profiles
  useEffect(() => {
    setMounted(true);

    const fetchProfiles = async () => {
      try {
        const res = await fetch('/api/profiles');
        if (res.ok) {
          const data = await res.json();
          setProfiles(data);
        } else {
          setProfiles(DEFAULT_PROFILES);
        }
      } catch (e) {
        console.error('Failed to load profiles from server', e);
        setProfiles(DEFAULT_PROFILES);
      }
    };
    fetchProfiles();

    const storedCompareDb = localStorage.getItem('querypulse_schema_compare_db');
    if (storedCompareDb) {
      try {
        const parsed = JSON.parse(storedCompareDb);
        if (parsed.source) {
          setSrcHost(parsed.source.host || '');
          setSrcPort(parsed.source.port?.toString() || '5432');
          setSrcDatabase(parsed.source.database || '');
          setSrcUsername(parsed.source.username || '');
          setSrcPassword(parsed.source.password || '');
        }
        if (parsed.destination) {
          setDestHost(parsed.destination.host || '');
          setDestPort(parsed.destination.port?.toString() || '5432');
          setDestDatabase(parsed.destination.database || '');
          setDestUsername(parsed.destination.username || '');
          setDestPassword(parsed.destination.password || '');
        }
      } catch (e) {
        console.error('Failed to parse comparison cache', e);
      }
    }
  }, []);

  // Auto scroll terminal log window to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  // Terminal logging helper
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTerminalLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  // Profile selection fill callbacks
  const handleSelectProfile = (id: string, target: 'source' | 'destination') => {
    const isSrc = target === 'source';
    if (isSrc) {
      setSelectedSrcProfileId(id);
      if (id === 'manual') return;
      const profile = profiles.find(p => p.id === id);
      if (profile) {
        setSrcHost(profile.host);
        setSrcPort(profile.port);
        setSrcDatabase(profile.database);
        setSrcUsername(profile.username);
        setSrcPassword(profile.password || '');
        setSourceStatus('idle');
      }
    } else {
      setSelectedDestProfileId(id);
      if (id === 'manual') return;
      const profile = profiles.find(p => p.id === id);
      if (profile) {
        setDestHost(profile.host);
        setDestPort(profile.port);
        setDestDatabase(profile.database);
        setDestUsername(profile.username);
        setDestPassword(profile.password || '');
        setDestStatus('idle');
      }
    }
  };

  // Connections Tester
  const handleTestConnection = async (target: 'source' | 'destination') => {
    const isSrc = target === 'source';
    const host = isSrc ? srcHost : destHost;
    const database = isSrc ? srcDatabase : destDatabase;
    const username = isSrc ? srcUsername : destUsername;
    const port = isSrc ? srcPort : destPort;
    const password = isSrc ? srcPassword : destPassword;

    if (!host || !database || !username) {
      addToast(`${isSrc ? 'Source' : 'Destination'} database configuration is incomplete`, 'warning');
      return;
    }

    if (isSrc) {
      setTestingSource(true);
      setSourceStatus('idle');
      setSourceError('');
    } else {
      setTestingDest(true);
      setDestStatus('idle');
      setDestError('');
    }

    try {
      const dbConfig = { host, port: parseInt(port, 10), database, username, password };
      const reqBody = isSrc ? { sourceDb: dbConfig } : { destinationDb: dbConfig };

      const res = await fetch('/api/compare-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });

      const data = await res.json();
      const statusData = isSrc ? data.source : data.destination;

      if (statusData.success) {
        if (isSrc) setSourceStatus('connected');
        else setDestStatus('connected');
        addToast(`${isSrc ? 'Source' : 'Destination'} connection verified successfully!`, 'success');
      } else {
        if (isSrc) {
          setSourceStatus('failed');
          setSourceError(statusData.error || 'Connection failed');
        } else {
          setDestStatus('failed');
          setDestError(statusData.error || 'Connection failed');
        }
        addToast(`${isSrc ? 'Source' : 'Destination'} connection failed`, 'error');
      }
    } catch (err: any) {
      if (isSrc) {
        setSourceStatus('failed');
        setSourceError(err.message || 'Connection failed');
      } else {
        setDestStatus('failed');
        setDestError(err.message || 'Connection failed');
      }
      addToast(`${isSrc ? 'Source' : 'Destination'} connection failed`, 'error');
    } finally {
      if (isSrc) setTestingSource(false);
      else setTestingDest(false);
    }
  };

  const fillDemoMode = () => {
    setSrcHost('demo-source');
    setSrcPort('5432');
    setSrcDatabase('staging_ecommerce');
    setSrcUsername('admin');
    setSrcPassword('••••••••');
    setSourceStatus('connected');

    setDestHost('demo-destination');
    setDestPort('5432');
    setDestDatabase('production_ecommerce');
    setDestUsername('root');
    setDestPassword('••••••••');
    setDestStatus('connected');

    addToast('Demo configurations filled successfully! Proceed to component selection.', 'success');
  };

  const saveProfiles = async (updated: DBProfile[]) => {
    setProfiles(updated);
    try {
      await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error('Failed to sync profiles to server', e);
    }
  };

  // Create Connection Profile
  const handleCreateProfile = () => {
    if (!newProfileName || !newProfileHost || !newProfileDatabase || !newProfileUsername) {
      addToast('Profile name, host, database, and username are required', 'warning');
      return;
    }

    let updated: DBProfile[];

    if (editingProfileId) {
      updated = profiles.map(p => {
        if (p.id === editingProfileId) {
          return {
            ...p,
            name: newProfileName,
            host: newProfileHost,
            port: newProfilePort,
            database: newProfileDatabase,
            username: newProfileUsername,
            password: newProfilePassword
          };
        }
        return p;
      });
      addToast(`Profile "${newProfileName}" updated successfully!`, 'success');
      setEditingProfileId(null);
    } else {
      const newProfile: DBProfile = {
        id: `prof-${Date.now()}`,
        name: newProfileName,
        host: newProfileHost,
        port: newProfilePort,
        database: newProfileDatabase,
        username: newProfileUsername,
        password: newProfilePassword
      };
      updated = [...profiles, newProfile];
      addToast(`Profile "${newProfile.name}" saved successfully!`, 'success');
    }

    saveProfiles(updated);

    setNewProfileName('');
    setNewProfileHost('');
    setNewProfilePort('5432');
    setNewProfileDatabase('');
    setNewProfileUsername('');
    setNewProfilePassword('');
  };

  const handleStartEditProfile = (prof: DBProfile) => {
    setEditingProfileId(prof.id);
    setNewProfileName(prof.name);
    setNewProfileHost(prof.host);
    setNewProfilePort(prof.port);
    setNewProfileDatabase(prof.database);
    setNewProfileUsername(prof.username);
    setNewProfilePassword(prof.password || '');
    addToast(`Loaded "${prof.name}" for editing.`, 'info');
  };

  const handleCancelEditProfile = () => {
    setEditingProfileId(null);
    setNewProfileName('');
    setNewProfileHost('');
    setNewProfilePort('5432');
    setNewProfileDatabase('');
    setNewProfileUsername('');
    setNewProfilePassword('');
  };

  const handleDuplicateProfile = (prof: DBProfile) => {
    const duplicated: DBProfile = {
      ...prof,
      id: `prof-${Date.now()}`,
      name: `${prof.name} (Copy)`
    };

    const updated = [...profiles, duplicated];
    saveProfiles(updated);
    addToast(`Duplicated profile to "${duplicated.name}"`, 'success');
  };

  const handleQuickSaveProfile = (target: 'source' | 'destination') => {
    const isSrc = target === 'source';
    const host = isSrc ? srcHost : destHost;
    const database = isSrc ? srcDatabase : destDatabase;
    const username = isSrc ? srcUsername : destUsername;
    const port = isSrc ? srcPort : destPort;
    const password = isSrc ? srcPassword : destPassword;

    if (!host || !database || !username) {
      addToast(`Please configure ${isSrc ? 'Source' : 'Destination'} database details first.`, 'warning');
      return;
    }

    const namePrompt = window.prompt('Enter Connection Profile Name:', `${database} (${host})`);
    if (namePrompt === null) return;

    const name = namePrompt.trim() || `${database} preset`;

    const newProfile: DBProfile = {
      id: `prof-${Date.now()}`,
      name,
      host,
      port,
      database,
      username,
      password
    };

    const updated = [...profiles, newProfile];
    saveProfiles(updated);

    if (isSrc) {
      setSelectedSrcProfileId(newProfile.id);
    } else {
      setSelectedDestProfileId(newProfile.id);
    }

    addToast(`Saved connection as profile "${name}" successfully!`, 'success');
  };

  const handleUpdateProfileDirect = (target: 'source' | 'destination') => {
    const isSrc = target === 'source';
    const profileId = isSrc ? selectedSrcProfileId : selectedDestProfileId;

    if (!profileId || profileId === 'manual') return;

    const host = isSrc ? srcHost : destHost;
    const database = isSrc ? srcDatabase : destDatabase;
    const username = isSrc ? srcUsername : destUsername;
    const port = isSrc ? srcPort : destPort;
    const password = isSrc ? srcPassword : destPassword;

    const profileToUpdate = profiles.find(p => p.id === profileId);
    if (!profileToUpdate) return;

    const updated = profiles.map(p => {
      if (p.id === profileId) {
        return { ...p, host, port, database, username, password };
      }
      return p;
    });

    saveProfiles(updated);
    addToast(`Preset "${profileToUpdate.name}" updated successfully!`, 'success');
  };

  const handleDeleteProfile = (id: string, name: string) => {
    const updated = profiles.filter(p => p.id !== id);
    saveProfiles(updated);

    if (selectedSrcProfileId === id) setSelectedSrcProfileId('manual');
    if (selectedDestProfileId === id) setSelectedDestProfileId('manual');

    addToast(`Profile "${name}" deleted.`, 'info');
  };

  const handleToggleComponent = (comp: string) => {
    if (selectedComponents.includes(comp)) {
      if (selectedComponents.length === 1) {
        addToast('At least one schema component must be selected', 'warning');
        return;
      }
      setSelectedComponents(selectedComponents.filter(c => c !== comp));
    } else {
      setSelectedComponents([...selectedComponents, comp]);
    }
  };

  // Chunked component extraction and diff workflow
  const runComparisonWorkflow = async () => {
    setLoadingCompare(true);
    setCompareProgress(0);
    setCompareError('');
    setTerminalLogs([]);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const sourceDb = {
      host: srcHost,
      port: parseInt(srcPort, 10) || 5432,
      database: srcDatabase,
      username: srcUsername,
      password: srcPassword
    };

    const destinationDb = {
      host: destHost,
      port: parseInt(destPort, 10) || 5432,
      database: destDatabase,
      username: destUsername,
      password: destPassword
    };

    const isDemo = srcHost === 'demo-source' || destHost === 'demo-destination';

    localStorage.setItem('querypulse_schema_compare_db', JSON.stringify({
      source: { host: srcHost, port: srcPort, database: srcDatabase, username: srcUsername },
      destination: { host: destHost, port: destPort, database: destDatabase, username: destUsername }
    }));

    try {
      addLog('🚀 Starting schema comparison workflow.');
      addLog(`Selected components to analyze: [ ${selectedComponents.join(', ')} ]`);

      addLog(`[1/3] Testing connection to Source database (${srcDatabase} on ${srcHost})...`);
      setCompareProgress(5);
      await sleep(400);

      const testRes = await fetch('/api/compare-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDb, destinationDb })
      });
      const testData = await testRes.json();

      if (!testData.source.success) {
        throw new Error(`Source DB Connection failed: ${testData.source.error}`);
      }
      addLog('Source database connection verified.');
      setCompareProgress(10);

      addLog(`Testing connection to Destination database (${destDatabase} on ${destHost})...`);
      await sleep(300);
      if (!testData.destination.success) {
        throw new Error(`Destination DB Connection failed: ${testData.destination.error}`);
      }
      addLog('Destination database connection verified.');
      setCompareProgress(15);
      addLog('Database handshakes complete. Initializing catalog extractions.');
      const extractComponent = async (
        config: typeof sourceDb,
        comp: string,
        target: 'source' | 'destination'
      ) => {
        const res = await fetch('/api/compare-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dbConfig: config,
            component: comp,
            useDemo: isDemo,
            demoTarget: target
          })
        });

        if (!res.ok) {
          try {
            const errData = await res.json();
            throw new Error(errData.error || `HTTP error! status: ${res.status}`);
          } catch (e: any) {
            throw new Error(e.message || `Extraction request failed with status: ${res.status}`);
          }
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let payload: any = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            let msg;
            try {
              msg = JSON.parse(line);
            } catch (e) {
              continue;
            }

            if (msg.type === 'log') {
              addLog(msg.message);
            } else if (msg.type === 'data') {
              payload = msg.payload;
            } else if (msg.type === 'error') {
              throw new Error(msg.error);
            }
          }
        }

        if (buffer.trim()) {
          let msg;
          try {
            msg = JSON.parse(buffer);
          } catch (e) {
            // ignore syntax errors of incomplete buffer
          }
          if (msg) {
            if (msg.type === 'log') {
              addLog(msg.message);
            } else if (msg.type === 'data') {
              payload = msg.payload;
            } else if (msg.type === 'error') {
              throw new Error(msg.error);
            }
          }
        }

        return payload;
      };

      const sourceSnapshot: Partial<DatabaseSchemaSnapshot> = {};
      const destSnapshot: Partial<DatabaseSchemaSnapshot> = {};

      const totalSteps = selectedComponents.length;

      for (let i = 0; i < totalSteps; i++) {
        const comp = selectedComponents[i];

        addLog(`[2/3] [${comp}] Initiating metadata extraction from Source DB...`);
        const srcData = await extractComponent(sourceDb, comp, 'source');
        if (!srcData) {
          throw new Error(`Source [${comp}] extraction returned empty data.`);
        }
        sourceSnapshot[comp as keyof DatabaseSchemaSnapshot] = srcData;
        const srcCount = Object.keys(srcData || {}).length;
        addLog(`[${comp}] Source DB metadata extracted: ${srcCount} structures.`);

        let prog = 15 + Math.round(((i * 2 + 1) / (totalSteps * 2)) * 75);
        setCompareProgress(prog);
        await sleep(50);

        addLog(`[2/3] [${comp}] Initiating metadata extraction from Destination DB...`);
        const destData = await extractComponent(destinationDb, comp, 'destination');
        if (!destData) {
          throw new Error(`Destination [${comp}] extraction returned empty data.`);
        }
        destSnapshot[comp as keyof DatabaseSchemaSnapshot] = destData;
        const destCount = Object.keys(destData || {}).length;
        addLog(`[${comp}] Destination DB metadata extracted: ${destCount} structures.`);

        prog = 15 + Math.round(((i * 2 + 2) / (totalSteps * 2)) * 75);
        setCompareProgress(prog);
        await sleep(50);
      }

      addLog('[3/3] Compiling snapshot schemas... Launching DDL drift analyzer.');
      setCompareProgress(95);
      await sleep(500);

      const diffRes = await fetch('/api/compare-diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceSnapshot,
          destinationSnapshot: destSnapshot,
          components: selectedComponents
        })
      });

      if (!diffRes.ok) {
        const errData = await diffRes.json();
        throw new Error(`Diff engine failed: ${errData.error}`);
      }

      const diffData: CompareResult = await diffRes.json();

      addLog(`Comparison complete! Found ${diffData.summary.totalDrifts} drifts total.`);
      addLog('Transactional SQL deployment migration script generated.');
      setCompareProgress(100);
      await sleep(750);

      setCompareResult(diffData);

      const compTypes = ['tables', 'views', 'functions', 'triggers', 'types', 'sequences'];
      const firstActive = compTypes.find(t => selectedComponents.includes(t));
      if (firstActive) {
        setActiveCompType(firstActive);

        const compList = (diffData as any)[firstActive] as CompareResultItem[];
        const hasMissing = compList.some(i => i.status === 'missing');
        const hasDifferent = compList.some(i => i.status === 'different');
        const hasExtra = compList.some(i => i.status === 'extra');

        if (hasMissing) setActiveDriftTab('missing');
        else if (hasDifferent) setActiveDriftTab('different');
        else if (hasExtra) setActiveDriftTab('extra');
        else setActiveDriftTab('missing');
      }

      setStep(3);
      addToast('Database schema comparison completed successfully!', 'success');
    } catch (err: any) {
      addLog(`❌ ERROR: ${err.message}`);
      setCompareError(err.message || 'Comparison failed');
      addToast('Failed to compare database schemas', 'error');
    } finally {
      setLoadingCompare(false);
    }
  };

  // Derived filter items
  const activeDriftItems = useMemo(() => {
    if (!compareResult || !activeCompType) return [];
    const items = (compareResult as any)[activeCompType] as CompareResultItem[];
    return items.filter(item => item.status === activeDriftTab);
  }, [compareResult, activeCompType, activeDriftTab]);

  const selectedDriftItem = useMemo(() => {
    if (activeDriftItems.length === 0) return null;
    if (selectedItemName) {
      const match = activeDriftItems.find(i => i.name === selectedItemName);
      if (match) return match;
    }
    return activeDriftItems[0];
  }, [activeDriftItems, selectedItemName]);

  useEffect(() => {
    setSelectedItemName(null);
  }, [activeCompType, activeDriftTab]);

  const handleSendEmail = async () => {
    if (!emailTo || !emailTo.includes('@')) {
      addToast('Please enter a valid recipient email address.', 'warning');
      return;
    }

    if (emailSendType === 'components' && selectedEmailComponents.length === 0) {
      addToast('Please select at least one component to send.', 'warning');
      return;
    }

    setSendingEmail(true);

    try {
      const attachments: { filename: string; content: string }[] = [];

      if (emailSendType === 'entire') {
        const order = ['types', 'sequences', 'tables', 'views', 'functions', 'triggers'];
        const sqlStatements: string[] = [];
        order.forEach((compKey) => {
          const items = (compareResult as any)[compKey] as CompareResultItem[] || [];
          items.forEach((item) => {
            if (item.status !== 'identical' && item.ddl) {
              sqlStatements.push(item.ddl);
            }
          });
        });
        const joined = sqlStatements.map(s => s.trim()).join(sqlSeparator === 'go' ? '\nGO\n\n' : '\n\n');
        let script = '';
        if (sqlSeparator === 'go') {
          script = `-- ===========================================================================\n-- QueryPulse Schema Migration Script (GO Separated)\n-- Generated: ${new Date().toISOString()}\n-- ===========================================================================\n\n${joined}\nGO`;
        } else {
          script = `-- ===========================================================================\n-- QueryPulse Schema Migration Script\n-- Generated: ${new Date().toISOString()}\n-- ===========================================================================\n\nBEGIN;\n\n${joined}\n\nCOMMIT;`;
        }
        attachments.push({
          filename: 'deploy_schema.sql',
          content: script
        });
      } else {
        selectedEmailComponents.forEach((compKey) => {
          const items = (compareResult as any)[compKey] as CompareResultItem[] || [];
          const filtered = items.filter(item => item.status !== 'identical' && item.ddl);
          if (filtered.length === 0) return;

          const joined = filtered.map(i => {
            const header = `-- Object: ${i.name} (${i.status})`;
            return `${header}\n${i.ddl.trim()}`;
          }).join(sqlSeparator === 'go' ? '\nGO\n\n' : '\n\n');

          const suffix = sqlSeparator === 'go' ? '\nGO' : '';

          const script = `
-- ===========================================================================
-- QueryPulse Database Migration File: ${compKey.toUpperCase()}
-- Generated: ${new Date().toISOString()}
-- ===========================================================================

${joined}${suffix}
`.trim();

          attachments.push({
            filename: `${compKey}_drifts.sql`,
            content: script
          });
        });
      }

      if (attachments.length === 0) {
        addToast('No drift scripts were generated. Email was not sent.', 'warning');
        setSendingEmail(false);
        return;
      }

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          bodyText: emailBody,
          attachments,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast('Email sent successfully!', 'success');
        setShowEmailModal(false);
      } else {
        throw new Error(result.error || 'Failed to send email');
      }
    } catch (error: any) {
      console.error('Email send error:', error);
      addToast(error.message || 'Error occurred while sending email.', 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleOpenEmailModal = () => {
    const defaultBody = `Please find the attached database schema migration script(s) generated by QueryPulse.

Source Database:
- Host: ${srcHost}
- Port: ${srcPort || '5432'}
- Database: ${srcDatabase}
- User: ${srcUsername}

Destination Database:
- Host: ${destHost}
- Port: ${destPort || '5432'}
- Database: ${destDatabase}
- User: ${destUsername}`;
    setEmailBody(defaultBody);
    setShowEmailModal(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    addToast('SQL code copied to clipboard!', 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`Downloaded ${filename} successfully!`, 'success');
  };

  const handleDownloadComponentFiles = (type: string, status: 'missing' | 'extra' | 'different') => {
    if (!compareResult) return;
    const items = (compareResult as any)[type] as CompareResultItem[];
    const filtered = items.filter(i => i.status === status);

    if (filtered.length === 0) {
      addToast(`No ${status} ${type} to generate script.`, 'info');
      return;
    }

    const joined = filtered.map(i => {
      const header = `-- Object: ${i.name}`;
      return `${header}\n${i.ddl.trim()}`;
    }).join(sqlSeparator === 'go' ? '\nGO\n\n' : '\n\n');

    const suffix = sqlSeparator === 'go' ? '\nGO' : '';

    const script = `
-- ===========================================================================
-- QueryPulse Database Migration File: ${type.toUpperCase()} - ${status.toUpperCase()}
-- Generated: ${new Date().toISOString()}
-- ===========================================================================

${joined}${suffix}
`.trim();

    downloadFile(script, `${type}_${status}.sql`);
  };

  if (!mounted) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: CB.canvas,
      }}>
        <Loader2 style={{ width: 24, height: 24, color: CB.primary }} className="animate-spin" />
      </div>
    );
  }

  /* ─── Step Indicator ─────────────────────────────────────────────── */
  const StepIndicator = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 48 }}>
      {[
        { num: 1, label: 'Configure' },
        { num: 2, label: 'Select' },
        { num: 3, label: 'Results' },
      ].map((s, idx) => (
        <React.Fragment key={s.num}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: s.num < step ? 'pointer' : 'default' }}
            onClick={() => { if (s.num < step && s.num !== 3) setStep(s.num as 1 | 2); }}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              background: s.num <= step ? CB.primary : CB.surfaceStrong,
              color: s.num <= step ? CB.onPrimary : CB.muted,
              transition: 'all 0.2s ease',
            }}>
              {s.num < step ? <Check style={{ width: 16, height: 16 }} /> : s.num}
            </div>
            <span style={{
              fontSize: 14,
              fontWeight: s.num === step ? 600 : 400,
              color: s.num <= step ? CB.ink : CB.muted,
              fontFamily: "'Inter', sans-serif",
            }}>
              {s.label}
            </span>
          </div>
          {idx < 2 && (
            <div style={{
              width: 48,
              height: 1,
              background: s.num < step ? CB.primary : CB.hairline,
              margin: '0 12px',
              transition: 'background 0.2s ease',
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  /* ─── Connection Panel (for src/dest) ──────────────────────────── */
  const ConnectionPanel = ({ target }: { target: 'source' | 'destination' }) => {
    const isSrc = target === 'source';
    const host = isSrc ? srcHost : destHost;
    const port = isSrc ? srcPort : destPort;
    const database = isSrc ? srcDatabase : destDatabase;
    const username = isSrc ? srcUsername : destUsername;
    const password = isSrc ? srcPassword : destPassword;
    const status = isSrc ? sourceStatus : destStatus;
    const error = isSrc ? sourceError : destError;
    const testing = isSrc ? testingSource : testingDest;
    const selectedProfileId = isSrc ? selectedSrcProfileId : selectedDestProfileId;

    const setHost = isSrc ? setSrcHost : setDestHost;
    const setPort = isSrc ? setSrcPort : setDestPort;
    const setDatabase = isSrc ? setSrcDatabase : setDestDatabase;
    const setUsername = isSrc ? setSrcUsername : setDestUsername;
    const setPassword = isSrc ? setSrcPassword : setDestPassword;
    const setStatus = isSrc ? setSourceStatus : setDestStatus;
    const setProfileId = isSrc ? setSelectedSrcProfileId : setSelectedDestProfileId;

    return (
      <div style={{ ...cardStyle, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header band */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${CB.hairline}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 9999,
              background: isSrc ? `${CB.primary}10` : `${CB.up}10`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {isSrc
                ? <Server style={{ width: 18, height: 18, color: CB.primary }} />
                : <Database style={{ width: 18, height: 18, color: CB.up }} />
              }
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: CB.ink, fontFamily: "'Inter', sans-serif" }}>
                {isSrc ? 'Source' : 'Destination'}
              </div>
              <div style={{ fontSize: 13, color: CB.muted, fontFamily: "'Inter', sans-serif" }}>
                {isSrc ? 'Reference schema' : 'Target to align'}
              </div>
            </div>
          </div>

          {/* Profile selector */}
          <div style={{ position: 'relative' }}>
            <select
              value={selectedProfileId}
              onChange={(e) => handleSelectProfile(e.target.value, target)}
              style={{
                ...inputStyle,
                height: 36,
                padding: '6px 32px 6px 12px',
                fontSize: 13,
                fontWeight: 500,
                width: 180,
                background: CB.surfaceSoft,
                borderColor: CB.hairlineSoft,
                appearance: 'none' as const,
                cursor: 'pointer',
              }}
            >
              <option value="manual">Manual Config</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 14,
              height: 14,
              color: CB.muted,
              pointerEvents: 'none' as const,
            }} />
          </div>
        </div>

        {/* Form fields */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Host</label>
              <input
                placeholder="e.g. localhost"
                value={host}
                onChange={(e) => { setHost(e.target.value); setStatus('idle'); setProfileId('manual'); }}
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = CB.primary}
                onBlur={(e) => e.target.style.borderColor = CB.hairline}
              />
            </div>
            <div>
              <label style={labelStyle}>Port</label>
              <input
                placeholder="5432"
                value={port}
                onChange={(e) => { setPort(e.target.value); setStatus('idle'); setProfileId('manual'); }}
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = CB.primary}
                onBlur={(e) => e.target.style.borderColor = CB.hairline}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Database</label>
            <input
              placeholder="e.g. staging_db"
              value={database}
              onChange={(e) => { setDatabase(e.target.value); setStatus('idle'); setProfileId('manual'); }}
              style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = CB.primary}
              onBlur={(e) => e.target.style.borderColor = CB.hairline}
            />
          </div>

          <div>
            <label style={labelStyle}>Username</label>
            <input
              placeholder="postgres"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setStatus('idle'); setProfileId('manual'); }}
              style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = CB.primary}
              onBlur={(e) => e.target.style.borderColor = CB.hairline}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setStatus('idle'); setProfileId('manual'); }}
              style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = CB.primary}
              onBlur={(e) => e.target.style.borderColor = CB.hairline}
            />
          </div>

          {/* Status messages */}
          {status === 'connected' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 12,
              background: `${CB.up}08`,
              border: `1px solid ${CB.up}20`,
              fontSize: 14,
              color: CB.up,
              fontFamily: "'Inter', sans-serif",
            }}>
              <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0 }} />
              Connection verified successfully
            </div>
          )}
          {status === 'failed' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '10px 14px',
              borderRadius: 12,
              background: `${CB.down}08`,
              border: `1px solid ${CB.down}20`,
              fontSize: 13,
              color: CB.down,
              fontFamily: "'Inter', sans-serif",
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <XCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                Connection test failed
              </div>
              <p style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", opacity: 0.85, wordBreak: 'break-all', margin: 0 }}>
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${CB.hairline}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleTestConnection(target)}
              disabled={testing}
              style={{
                ...pillBtnSecondary,
                flex: 1,
                height: 40,
                fontSize: 14,
                opacity: testing ? 0.6 : 1,
                cursor: testing ? 'wait' : 'pointer',
              }}
            >
              {testing ? (
                <>
                  <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                  Verifying…
                </>
              ) : 'Test Connection'}
            </button>
            <button
              onClick={() => handleQuickSaveProfile(target)}
              style={{ ...pillBtnSecondary, flex: 1, height: 40, fontSize: 14 }}
            >
              <Save style={{ width: 14, height: 14 }} />
              Save Profile
            </button>
          </div>
          {selectedProfileId !== 'manual' && (
            <button
              onClick={() => handleUpdateProfileDirect(target)}
              style={{
                ...pillBtnSecondary,
                width: '100%',
                height: 40,
                fontSize: 14,
                color: CB.primary,
                background: `${CB.primary}08`,
                fontWeight: 600,
              }}
            >
              <Save style={{ width: 14, height: 14 }} />
              Update Selected Preset
            </button>
          )}
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  R E N D E R                                                      */
  /* ═══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{
      minHeight: '100vh',
      background: CB.canvas,
      color: CB.ink,
      fontFamily: "'Inter', -apple-system, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* ─── Top Navigation ────────────────────────────────────────── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        background: CB.canvas,
        borderBottom: `1px solid ${CB.hairline}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => router.push('/dashboard')}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: CB.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <GitCompareArrows style={{ width: 18, height: 18, color: CB.onPrimary }} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 600, color: CB.ink, letterSpacing: -0.3 }}>
              Schema Compare
            </span>
          </div>

          {/* Nav pills */}
          {step < 3 && !loadingCompare && (
            <div style={{ display: 'flex', gap: 4, background: CB.surfaceStrong, padding: 4, borderRadius: 100 }}>
              {[
                { key: 'compare' as const, label: 'Compare Wizard', icon: Sliders },
                { key: 'profiles' as const, label: 'Connection Profiles', icon: Database },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveParentTab(tab.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 16px',
                    borderRadius: 100,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: activeParentTab === tab.key ? 600 : 400,
                    fontFamily: "'Inter', sans-serif",
                    background: activeParentTab === tab.key ? CB.canvas : 'transparent',
                    color: activeParentTab === tab.key ? CB.ink : CB.muted,
                    boxShadow: activeParentTab === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <tab.icon style={{ width: 14, height: 14 }} />
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={toggleTheme}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 36,
              height: 36,
              borderRadius: 9999,
              border: `1px solid ${CB.hairline}`,
              background: CB.surfaceStrong,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: CB.ink,
              transition: 'all 0.15s ease',
            }}
          >
            {dark ? <Sun style={{ width: 16, height: 16, color: CB.yellow }} /> : <Moon style={{ width: 16, height: 16, color: CB.primary }} />}
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              ...pillBtnSecondary,
              height: 36,
              fontSize: 14,
              padding: '6px 16px',
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Dashboard
          </button>
        </div>
      </header>

      {/* ─── Main Content ──────────────────────────────────────────── */}
      <main style={{ flex: 1, width: '100%', padding: '24px 32px 48px' }}>

        {/* ═══ LOADING STATE ═══ */}
        {loadingCompare && (
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{
                fontSize: 36,
                fontWeight: 400,
                color: CB.ink,
                letterSpacing: -0.5,
                margin: 0,
                fontFamily: "'Inter', sans-serif",
              }}>
                Analyzing schemas
              </h2>
              <p style={{ fontSize: 16, color: CB.body, marginTop: 8 }}>
                Querying metadata chunks to prevent statement timeouts
              </p>
            </div>

            {/* Progress ring */}
            <div style={{
              ...cardStyle,
              padding: 40,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 32,
            }}>
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes shimmerEffect {
                  0% { background-position: -200% 0; }
                  100% { background-position: 200% 0; }
                }
              `}} />
              <div style={{ width: '100%', maxWidth: 500 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: CB.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Comparison Progress
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: CB.ink, fontFamily: "'JetBrains Mono', monospace" }}>
                    {compareProgress}%
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: 10,
                  background: CB.surfaceSoft,
                  borderRadius: 9999,
                  overflow: 'hidden',
                  border: `1px solid ${CB.hairline}`,
                  position: 'relative',
                }}>
                  <div style={{
                    width: `${compareProgress}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${CB.primary}, #818cf8, ${CB.primary})`,
                    backgroundSize: '200% 100%',
                    borderRadius: 9999,
                    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    animation: 'shimmerEffect 2s infinite linear',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: CB.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Elapsed Time
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: CB.ink, fontFamily: "'JetBrains Mono', monospace" }}>
                      {formatTime(elapsedTime)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: CB.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Est. Remaining
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: CB.ink, fontFamily: "'JetBrains Mono', monospace" }}>
                      {estimatedTimeRemaining !== null ? formatTime(estimatedTimeRemaining) : 'Estimating...'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Terminal logs */}
              <div style={{ width: '100%' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 8,
                }}>
                  <TerminalIcon style={{ width: 14, height: 14, color: CB.muted }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: CB.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Process Output
                  </span>
                </div>
                <div style={{
                  height: 480,
                  background: CB.surfaceDark,
                  borderRadius: 16,
                  padding: 16,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  color: CB.onDarkSoft,
                  overflowY: 'auto',
                  lineHeight: 1.8,
                }}>
                  {terminalLogs.map((log, idx) => (
                    <div
                      key={idx}
                      style={{
                        color: log.includes('❌')
                          ? CB.down
                          : log.includes('verified') || log.includes('complete')
                            ? CB.up
                            : CB.onDarkSoft,
                        fontWeight: log.includes('❌') || log.includes('verified') || log.includes('complete') ? 600 : 400,
                        wordBreak: 'break-all',
                      }}
                    >
                      {log}
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ CONNECTION PROFILES TAB ═══ */}
        {activeParentTab === 'profiles' && !loadingCompare && step < 3 && (
          <div style={{ width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{
                fontSize: 36,
                fontWeight: 400,
                color: CB.ink,
                letterSpacing: -0.5,
                margin: 0,
              }}>
                Connection Profiles
              </h2>
              <p style={{ fontSize: 16, color: CB.body, marginTop: 8 }}>
                Manage saved database credentials for quick access
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
              {/* Saved profiles list */}
              <div style={{ ...cardStyle, padding: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: CB.ink, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Database style={{ width: 18, height: 18, color: CB.primary }} />
                  Saved Profiles
                </h3>

                <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {profiles.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: 48,
                      border: `1px dashed ${CB.hairline}`,
                      borderRadius: 16,
                      color: CB.muted,
                      fontSize: 14,
                    }}>
                      No saved profiles yet
                    </div>
                  ) : profiles.map((prof) => (
                    <div
                      key={prof.id}
                      style={{
                        padding: '14px 16px',
                        background: CB.surfaceSoft,
                        borderRadius: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = CB.surfaceStrong}
                      onMouseLeave={(e) => e.currentTarget.style.background = CB.surfaceSoft}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: CB.ink }}>{prof.name}</span>
                          {prof.host.startsWith('demo-') && (
                            <span style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: CB.primary,
                              background: `${CB.primary}10`,
                              padding: '2px 8px',
                              borderRadius: 100,
                            }}>Demo</span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 12,
                          color: CB.muted,
                          fontFamily: "'JetBrains Mono', monospace",
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          postgresql://{prof.username}@{prof.host}:{prof.port}/{prof.database}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {[
                          { icon: Copy, onClick: () => handleDuplicateProfile(prof), title: 'Duplicate' },
                          { icon: Edit2, onClick: () => handleStartEditProfile(prof), title: 'Edit' },
                          { icon: Trash2, onClick: () => handleDeleteProfile(prof.id, prof.name), title: 'Delete', danger: true },
                        ].map((act, i) => (
                          <button
                            key={i}
                            onClick={act.onClick}
                            title={act.title}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: CB.muted,
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = act.danger ? `${CB.down}10` : `${CB.primary}10`;
                              e.currentTarget.style.color = act.danger ? CB.down : CB.primary;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = CB.muted;
                            }}
                          >
                            <act.icon style={{ width: 14, height: 14 }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add / Edit profile form */}
              <div style={{ ...cardStyle, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: CB.ink, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {editingProfileId
                      ? <><Edit2 style={{ width: 18, height: 18, color: CB.primary }} /> Edit Profile</>
                      : <><Plus style={{ width: 18, height: 18, color: CB.up }} /> New Profile</>
                    }
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Profile Name</label>
                      <input placeholder="e.g. Production DB" value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)} style={inputStyle}
                        onFocus={(e) => e.target.style.borderColor = CB.primary}
                        onBlur={(e) => e.target.style.borderColor = CB.hairline} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                      <div>
                        <label style={labelStyle}>Host</label>
                        <input placeholder="localhost" value={newProfileHost}
                          onChange={(e) => setNewProfileHost(e.target.value)} style={inputStyle}
                          onFocus={(e) => e.target.style.borderColor = CB.primary}
                          onBlur={(e) => e.target.style.borderColor = CB.hairline} />
                      </div>
                      <div>
                        <label style={labelStyle}>Port</label>
                        <input placeholder="5432" value={newProfilePort}
                          onChange={(e) => setNewProfilePort(e.target.value)} style={inputStyle}
                          onFocus={(e) => e.target.style.borderColor = CB.primary}
                          onBlur={(e) => e.target.style.borderColor = CB.hairline} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Database</label>
                      <input placeholder="postgres" value={newProfileDatabase}
                        onChange={(e) => setNewProfileDatabase(e.target.value)} style={inputStyle}
                        onFocus={(e) => e.target.style.borderColor = CB.primary}
                        onBlur={(e) => e.target.style.borderColor = CB.hairline} />
                    </div>
                    <div>
                      <label style={labelStyle}>Username</label>
                      <input placeholder="postgres" value={newProfileUsername}
                        onChange={(e) => setNewProfileUsername(e.target.value)} style={inputStyle}
                        onFocus={(e) => e.target.style.borderColor = CB.primary}
                        onBlur={(e) => e.target.style.borderColor = CB.hairline} />
                    </div>
                    <div>
                      <label style={labelStyle}>Password</label>
                      <input type="password" placeholder="••••••••" value={newProfilePassword}
                        onChange={(e) => setNewProfilePassword(e.target.value)} style={inputStyle}
                        onFocus={(e) => e.target.style.borderColor = CB.primary}
                        onBlur={(e) => e.target.style.borderColor = CB.hairline} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                  <button
                    onClick={handleCreateProfile}
                    style={{
                      ...pillBtnPrimary,
                      width: '100%',
                      height: 44,
                      background: editingProfileId ? CB.primary : CB.up,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = editingProfileId ? CB.primaryActive : '#049e5c'}
                    onMouseLeave={(e) => e.currentTarget.style.background = editingProfileId ? CB.primary : CB.up}
                  >
                    {editingProfileId ? 'Update Profile' : 'Save Profile'}
                  </button>
                  {editingProfileId && (
                    <button onClick={handleCancelEditProfile} style={{ ...pillBtnSecondary, width: '100%', height: 40, fontSize: 14 }}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ COMPARE WIZARD ═══ */}
        {activeParentTab === 'compare' && !loadingCompare && (
          <>
            {/* STEP 1: CONFIGURE CONNECTIONS */}
            {step === 1 && (
              <div style={{ width: '100%' }}>
                <StepIndicator />

                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                  <h2 style={{
                    fontSize: 44,
                    fontWeight: 400,
                    color: CB.ink,
                    letterSpacing: -1,
                    margin: 0,
                    lineHeight: 1.09,
                    fontFamily: "'Inter', sans-serif",
                  }}>
                    Configure connections
                  </h2>
                  <p style={{
                    fontSize: 16,
                    color: CB.body,
                    marginTop: 12,
                    maxWidth: 480,
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    lineHeight: 1.5,
                  }}>
                    Select a saved profile or enter database configurations manually.
                    Schema components are extracted individually to avoid statement timeouts.
                  </p>
                  <div style={{ marginTop: 16 }}>
                    <button
                      onClick={fillDemoMode}
                      style={{
                        ...pillBtnSecondary,
                        height: 40,
                        fontSize: 14,
                        gap: 6,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = CB.hairlineSoft}
                      onMouseLeave={(e) => e.currentTarget.style.background = CB.surfaceStrong}
                    >
                      <Play style={{ width: 14, height: 14, fill: CB.primary, color: CB.primary }} />
                      Quick Demo: Fill Mock Databases
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <ConnectionPanel target="source" />
                  <ConnectionPanel target="destination" />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 32 }}>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!srcHost || !srcDatabase || !srcUsername || !destHost || !destDatabase || !destUsername}
                    style={{
                      ...pillBtnPrimary,
                      height: 48,
                      padding: '14px 32px',
                      fontSize: 16,
                      opacity: (!srcHost || !srcDatabase || !srcUsername || !destHost || !destDatabase || !destUsername) ? 0.4 : 1,
                      cursor: (!srcHost || !srcDatabase || !srcUsername || !destHost || !destDatabase || !destUsername) ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) e.currentTarget.style.background = CB.primaryActive;
                    }}
                    onMouseLeave={(e) => e.currentTarget.style.background = CB.primary}
                  >
                    Continue
                    <ArrowRight style={{ width: 18, height: 18 }} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: SELECT COMPONENTS */}
            {step === 2 && (
              <div style={{ width: '100%' }}>
                <StepIndicator />

                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                  <h2 style={{
                    fontSize: 44,
                    fontWeight: 400,
                    color: CB.ink,
                    letterSpacing: -1,
                    margin: 0,
                    lineHeight: 1.09,
                  }}>
                    Select components
                  </h2>
                  <p style={{ fontSize: 16, color: CB.body, marginTop: 12, lineHeight: 1.5 }}>
                    Choose which catalog components to check for schema drifts.
                  </p>
                </div>

                <div style={{ ...cardStyle, padding: 0 }}>
                  <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                    {Object.entries(COMP_META).map(([key, meta]) => {
                      const isSelected = selectedComponents.includes(key);
                      const Icon = meta.icon;
                      return (
                        <div
                          key={key}
                          onClick={() => handleToggleComponent(key)}
                          style={{
                            padding: '16px 18px',
                            borderRadius: 16,
                            border: `1.5px solid ${isSelected ? CB.primary : CB.hairline}`,
                            background: isSelected ? `${CB.primary}06` : CB.canvas,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 14,
                            transition: 'all 0.15s ease',
                            userSelect: 'none' as const,
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.borderColor = CB.mutedSoft;
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.borderColor = CB.hairline;
                          }}
                        >
                          <div style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            border: `2px solid ${isSelected ? CB.primary : CB.hairline}`,
                            background: isSelected ? CB.primary : CB.canvas,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: 1,
                            transition: 'all 0.15s ease',
                          }}>
                            {isSelected && <Check style={{ width: 14, height: 14, color: CB.onPrimary, strokeWidth: 3 }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: 16,
                              fontWeight: 600,
                              color: CB.ink,
                            }}>
                              <Icon style={{ width: 16, height: 16, color: isSelected ? CB.primary : CB.muted }} />
                              {meta.label}
                            </div>
                            <p style={{ fontSize: 13, color: CB.body, margin: '4px 0 0', lineHeight: 1.4 }}>
                              {meta.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {compareError && (
                    <div style={{
                      margin: '0 24px 16px',
                      padding: '12px 16px',
                      borderRadius: 12,
                      background: `${CB.down}08`,
                      border: `1px solid ${CB.down}20`,
                      fontSize: 13,
                      color: CB.down,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}>
                      <XCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <span style={{ fontWeight: 600 }}>Error:</span> {compareError}
                      </div>
                    </div>
                  )}

                  <div style={{
                    padding: '16px 24px',
                    borderTop: `1px solid ${CB.hairline}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <button
                      onClick={() => setStep(1)}
                      style={{ ...pillBtnSecondary, height: 44, fontSize: 16 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = CB.hairlineSoft}
                      onMouseLeave={(e) => e.currentTarget.style.background = CB.surfaceStrong}
                    >
                      Back
                    </button>
                    <button
                      onClick={runComparisonWorkflow}
                      style={{ ...pillBtnPrimary, height: 48, padding: '14px 32px' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = CB.primaryActive}
                      onMouseLeave={(e) => e.currentTarget.style.background = CB.primary}
                    >
                      Start Comparison
                      <Play style={{ width: 16, height: 16, fill: CB.onPrimary, color: CB.onPrimary }} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: RESULTS */}
            {step === 3 && compareResult && (
              <div>
                {/* Summary hero band (dark) */}
                <div style={{
                  background: CB.surfaceDark,
                  borderRadius: 24,
                  padding: '40px 48px',
                  marginBottom: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 32,
                }}>
                  <div>
                    <h2 style={{
                      fontSize: 36,
                      fontWeight: 400,
                      color: CB.onDark,
                      letterSpacing: -0.5,
                      margin: 0,
                      lineHeight: 1.11,
                    }}>
                      Comparison complete
                    </h2>
                    <p style={{ fontSize: 16, color: CB.onDarkSoft, marginTop: 8, lineHeight: 1.5 }}>
                      Found <span style={{ color: CB.onDark, fontWeight: 600 }}>{compareResult.summary.totalDrifts}</span> schema drifts across selected components
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[
                      { label: 'Missing', count: compareResult.summary.missingCount, color: CB.up },
                      { label: 'Different', count: compareResult.summary.differentCount, color: CB.yellow },
                      { label: 'Extra', count: compareResult.summary.extraCount, color: CB.down },
                    ].map(stat => (
                      <div key={stat.label} style={{
                        ...cardDarkStyle,
                        padding: '16px 24px',
                        textAlign: 'center',
                        minWidth: 100,
                      }}>
                        <div style={{
                          fontSize: 28,
                          fontWeight: 500,
                          color: stat.color,
                          fontFamily: "'JetBrains Mono', monospace",
                          lineHeight: 1.2,
                        }}>
                          {stat.count}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: CB.onDarkSoft, marginTop: 4 }}>
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Results grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
                  {/* Left sidebar */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ ...cardStyle, padding: 16 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: CB.muted,
                        textTransform: 'uppercase' as const,
                        letterSpacing: 0.5,
                        padding: '0 8px',
                        marginBottom: 8,
                      }}>
                        Components
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {Object.entries(COMP_META).map(([key, meta]) => {
                          if (!selectedComponents.includes(key)) return null;
                          const isActive = activeCompType === key;
                          const items = (compareResult as any)[key] as CompareResultItem[] || [];
                          const driftCount = items.filter(i => i.status !== 'identical').length;
                          const Icon = meta.icon;

                          return (
                            <button
                              key={key}
                              onClick={() => {
                                setActiveCompType(key);
                                const hasMissing = items.some(i => i.status === 'missing');
                                const hasDifferent = items.some(i => i.status === 'different');
                                const hasExtra = items.some(i => i.status === 'extra');
                                if (hasMissing) setActiveDriftTab('missing');
                                else if (hasDifferent) setActiveDriftTab('different');
                                else if (hasExtra) setActiveDriftTab('extra');
                                else setActiveDriftTab('missing');
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 12px',
                                borderRadius: 12,
                                border: 'none',
                                cursor: 'pointer',
                                background: isActive ? CB.primary : 'transparent',
                                color: isActive ? CB.onPrimary : CB.body,
                                fontSize: 14,
                                fontWeight: isActive ? 600 : 400,
                                fontFamily: "'Inter', sans-serif",
                                transition: 'all 0.15s ease',
                                width: '100%',
                                textAlign: 'left',
                              }}
                              onMouseEnter={(e) => {
                                if (!isActive) e.currentTarget.style.background = CB.surfaceSoft;
                              }}
                              onMouseLeave={(e) => {
                                if (!isActive) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Icon style={{ width: 16, height: 16 }} />
                                <span>{meta.label}</span>
                              </div>
                              {driftCount > 0 && (
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 100,
                                  background: isActive ? 'rgba(255,255,255,0.2)' : `${CB.down}10`,
                                  color: isActive ? CB.onPrimary : CB.down,
                                }}>
                                  {driftCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ borderTop: `1px solid ${CB.hairline}`, marginTop: 12, paddingTop: 12 }}>
                        <button
                          onClick={() => { setStep(2); setCompareResult(null); }}
                          style={{ ...pillBtnSecondary, width: '100%', height: 40, fontSize: 14 }}
                          onMouseEnter={(e) => e.currentTarget.style.background = CB.hairlineSoft}
                          onMouseLeave={(e) => e.currentTarget.style.background = CB.surfaceStrong}
                        >
                          Adjust Selection
                        </button>
                      </div>
                    </div>

                    {/* Deployment script card */}
                    <div style={{ ...cardStyle, padding: 20 }}>
                      <h4 style={{ fontSize: 16, fontWeight: 600, color: CB.ink, margin: '0 0 8px' }}>
                        Deployment Script
                      </h4>
                      <p style={{ fontSize: 13, color: CB.body, lineHeight: 1.5, margin: '0 0 16px' }}>
                        Download the consolidated SQL migration script.
                      </p>

                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>SQL Separator</label>
                        <div style={{ position: 'relative' }}>
                          <select
                            value={sqlSeparator}
                            onChange={(e) => setSqlSeparator(e.target.value as 'semicolon' | 'go')}
                            style={{
                              ...inputStyle,
                              height: 40,
                              padding: '8px 32px 8px 12px',
                              fontSize: 13,
                              fontWeight: 500,
                              appearance: 'none' as const,
                              cursor: 'pointer',
                              background: CB.surfaceSoft,
                              borderColor: CB.hairlineSoft,
                            }}
                          >
                            <option value="semicolon">Standard Semicolon (;)</option>
                            <option value="go">GO Separated</option>
                          </select>
                          <ChevronDown style={{
                            position: 'absolute',
                            right: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 14,
                            height: 14,
                            color: CB.muted,
                            pointerEvents: 'none' as const,
                          }} />
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const order = ['types', 'sequences', 'tables', 'views', 'functions', 'triggers'];
                          const sqlStatements: string[] = [];
                          order.forEach((compKey) => {
                            const items = (compareResult as any)[compKey] as CompareResultItem[] || [];
                            items.forEach((item) => {
                              if (item.status !== 'identical' && item.ddl) {
                                sqlStatements.push(item.ddl);
                              }
                            });
                          });
                          const joined = sqlStatements.map(s => s.trim()).join(sqlSeparator === 'go' ? '\nGO\n\n' : '\n\n');
                          let script = '';
                          if (sqlSeparator === 'go') {
                            script = `-- ===========================================================================\n-- QueryPulse Schema Migration Script (GO Separated)\n-- Generated: ${new Date().toISOString()}\n-- ===========================================================================\n\n${joined}\nGO`;
                          } else {
                            script = `-- ===========================================================================\n-- QueryPulse Schema Migration Script\n-- Generated: ${new Date().toISOString()}\n-- ===========================================================================\n\nBEGIN;\n\n${joined}\n\nCOMMIT;`;
                          }
                          downloadFile(script, 'deploy_schema.sql');
                        }}
                        style={{ ...pillBtnPrimary, width: '100%', height: 44 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = CB.primaryActive}
                        onMouseLeave={(e) => e.currentTarget.style.background = CB.primary}
                      >
                        <Download style={{ width: 16, height: 16 }} />
                        deploy_schema.sql
                      </button>

                      <button
                        onClick={handleOpenEmailModal}
                        style={{ ...pillBtnSecondary, width: '100%', height: 44, marginTop: 8 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = CB.hairlineSoft}
                        onMouseLeave={(e) => e.currentTarget.style.background = CB.surfaceStrong}
                      >
                        <Mail style={{ width: 16, height: 16 }} />
                        Send via Email
                      </button>
                    </div>
                  </div>

                  {/* Right detail panel */}
                  <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minHeight: 500 }}>
                    {/* Drift tab header */}
                    <div style={{
                      padding: '12px 20px',
                      borderBottom: `1px solid ${CB.hairline}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}>
                      <div style={{ display: 'flex', gap: 4, background: CB.surfaceSoft, padding: 3, borderRadius: 100 }}>
                        {[
                          { key: 'missing' as const, label: 'Missing in Target', color: CB.up },
                          { key: 'different' as const, label: 'Different (Drifts)', color: CB.yellow },
                          { key: 'extra' as const, label: 'Extra in Target', color: CB.down },
                        ].map((tab) => {
                          const count = compareResult ? ((compareResult as any)[activeCompType] as CompareResultItem[]).filter(i => i.status === tab.key).length : 0;
                          const active = activeDriftTab === tab.key;

                          return (
                            <button
                              key={tab.key}
                              onClick={() => setActiveDriftTab(tab.key)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 14px',
                                borderRadius: 100,
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: active ? 600 : 400,
                                fontFamily: "'Inter', sans-serif",
                                background: active ? CB.canvas : 'transparent',
                                color: active ? CB.ink : CB.muted,
                                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span style={{ width: 8, height: 8, borderRadius: 9999, background: tab.color, display: 'inline-block' }} />
                              {tab.label}
                              <span style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: 100,
                                background: CB.surfaceStrong,
                                color: CB.muted,
                              }}>{count}</span>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => handleDownloadComponentFiles(activeCompType, activeDriftTab)}
                        disabled={activeDriftItems.length === 0}
                        style={{
                          ...pillBtnSecondary,
                          height: 32,
                          fontSize: 12,
                          padding: '4px 14px',
                          opacity: activeDriftItems.length === 0 ? 0.4 : 1,
                          cursor: activeDriftItems.length === 0 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Download style={{ width: 12, height: 12 }} />
                        {activeCompType}_{activeDriftTab}.sql
                      </button>
                    </div>

                    {/* Content area */}
                    {activeDriftItems.length === 0 ? (
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 48,
                        textAlign: 'center',
                      }}>
                        <CheckCircle2 style={{ width: 48, height: 48, color: CB.up, marginBottom: 16 }} />
                        <h4 style={{ fontSize: 18, fontWeight: 600, color: CB.ink, margin: '0 0 8px' }}>All aligned</h4>
                        <p style={{ fontSize: 14, color: CB.body, maxWidth: 360, lineHeight: 1.5, margin: 0 }}>
                          No {activeDriftTab} {activeCompType} detected between Source and Destination schemas.
                        </p>
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr' }}>
                        {/* Item list */}
                        <div style={{
                          borderRight: `1px solid ${CB.hairline}`,
                          maxHeight: 500,
                          overflowY: 'auto',
                          padding: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}>
                          {activeDriftItems.map((item) => {
                            const isSelected = selectedDriftItem?.name === item.name;
                            return (
                              <button
                                key={item.name}
                                onClick={() => setSelectedItemName(item.name)}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '10px 12px',
                                  borderRadius: 12,
                                  border: 'none',
                                  cursor: 'pointer',
                                  background: isSelected ? `${CB.primary}08` : 'transparent',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 2,
                                  transition: 'background 0.1s ease',
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}
                                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = CB.surfaceSoft; }}
                                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? `${CB.primary}08` : 'transparent'; }}
                              >
                                <span style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: isSelected ? CB.primary : CB.ink,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {item.name}
                                </span>
                                {item.details && (
                                  <span style={{
                                    fontSize: 11,
                                    color: CB.muted,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {item.details}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Code viewer */}
                        {selectedDriftItem && (
                          <div style={{ padding: 24, maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <h4 style={{
                                fontSize: 16,
                                fontWeight: 600,
                                color: CB.ink,
                                margin: 0,
                                fontFamily: "'JetBrains Mono', monospace",
                                wordBreak: 'break-all',
                              }}>
                                {selectedDriftItem.name}
                              </h4>
                              <button
                                onClick={() => copyToClipboard(selectedDriftItem.ddl.trim() + (sqlSeparator === 'go' ? '\nGO' : ''))}
                                style={{
                                  ...pillBtnSecondary,
                                  height: 32,
                                  fontSize: 12,
                                  padding: '4px 14px',
                                }}
                              >
                                {copiedCode ? <Check style={{ width: 14, height: 14, color: CB.up }} /> : <Copy style={{ width: 14, height: 14 }} />}
                                {copiedCode ? 'Copied' : 'Copy'}
                              </button>
                            </div>

                            {selectedDriftItem.details && (
                              <div style={{
                                padding: '10px 14px',
                                borderRadius: 12,
                                background: `${CB.yellow}08`,
                                border: `1px solid ${CB.yellow}20`,
                                fontSize: 13,
                                color: '#8a6d00',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                lineHeight: 1.5,
                              }}>
                                <AlertTriangle style={{ width: 16, height: 16, color: CB.yellow, flexShrink: 0, marginTop: 1 }} />
                                {selectedDriftItem.details}
                              </div>
                            )}

                            <div>
                              <div style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: CB.muted,
                                textTransform: 'uppercase' as const,
                                letterSpacing: 0.5,
                                marginBottom: 8,
                              }}>
                                Generated DDL
                              </div>
                              <pre style={{
                                padding: 20,
                                background: CB.surfaceDark,
                                borderRadius: 16,
                                color: CB.up,
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', monospace",
                                lineHeight: 1.7,
                                overflow: 'auto',
                                whiteSpace: 'pre',
                                margin: 0,
                                userSelect: 'all' as const,
                              }}>
                                {selectedDriftItem.ddl.trim() + (sqlSeparator === 'go' ? '\nGO' : '')}
                              </pre>
                            </div>

                            {selectedDriftItem.status === 'different' && (
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: 16,
                                paddingTop: 16,
                                borderTop: `1px solid ${CB.hairline}`,
                              }}>
                                <div>
                                  <div style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: CB.muted,
                                    textTransform: 'uppercase' as const,
                                    letterSpacing: 0.5,
                                    marginBottom: 6,
                                  }}>Source</div>
                                  <pre style={{
                                    padding: 12,
                                    background: CB.surfaceSoft,
                                    borderRadius: 12,
                                    color: CB.body,
                                    fontSize: 11,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    maxHeight: 120,
                                    overflow: 'auto',
                                    whiteSpace: 'pre',
                                    margin: 0,
                                  }}>
                                    {selectedDriftItem.sourceDef}
                                  </pre>
                                </div>
                                <div>
                                  <div style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: CB.muted,
                                    textTransform: 'uppercase' as const,
                                    letterSpacing: 0.5,
                                    marginBottom: 6,
                                  }}>Destination</div>
                                  <pre style={{
                                    padding: 12,
                                    background: CB.surfaceSoft,
                                    borderRadius: 12,
                                    color: CB.body,
                                    fontSize: 11,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    maxHeight: 120,
                                    overflow: 'auto',
                                    whiteSpace: 'pre',
                                    margin: 0,
                                  }}>
                                    {selectedDriftItem.destDef}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ═══ EMAIL DELIVERY MODAL ═══ */}
      {showEmailModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 11, 13, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
        }}>
          <div style={{
            background: CB.canvas,
            borderRadius: 24,
            border: `1px solid ${CB.hairline}`,
            width: '100%',
            maxWidth: 560,
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '24px 28px',
              borderBottom: `1px solid ${CB.hairline}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: CB.ink, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mail style={{ width: 18, height: 18, color: CB.primary }} />
                  Send Migration SQL
                </h3>
                <p style={{ fontSize: 12, color: CB.muted, margin: '4px 0 0' }}>
                  Deliver SQL scripts via Google OAuth secure mail
                </p>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: CB.muted,
                  padding: 4,
                  borderRadius: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = CB.ink}
                onMouseLeave={(e) => e.currentTarget.style.color = CB.muted}
              >
                <XCircle style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Recipient */}
              <div>
                <label style={labelStyle}>To Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. administrator@company.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Subject */}
              <div>
                <label style={labelStyle}>Subject</label>
                <input
                  type="text"
                  placeholder="Email subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Message */}
              <div>
                <label style={labelStyle}>Message</label>
                <textarea
                  placeholder="Write a message to include in the email body..."
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  style={{
                    ...inputStyle,
                    height: 80,
                    resize: 'vertical',
                    padding: '12px 16px',
                  }}
                />
              </div>

              {/* Mode Selection */}
              <div>
                <label style={labelStyle}>Scope & Attachments</label>
                <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: CB.ink, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="emailSendType"
                      checked={emailSendType === 'entire'}
                      onChange={() => setEmailSendType('entire')}
                      style={{ accentColor: CB.primary }}
                    />
                    Consolidated Script
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: CB.ink, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="emailSendType"
                      checked={emailSendType === 'components'}
                      onChange={() => setEmailSendType('components')}
                      style={{ accentColor: CB.primary }}
                    />
                    Component-wise Scripts
                  </label>
                </div>

                {/* Component Selectors */}
                {emailSendType === 'components' && (
                  <div style={{
                    background: CB.surfaceSoft,
                    border: `1px solid ${CB.hairline}`,
                    borderRadius: 16,
                    padding: 16,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}>
                    {selectedComponents.map((compKey) => {
                      const items = (compareResult as any)[compKey] as CompareResultItem[] || [];
                      const driftCount = items.filter(i => i.status !== 'identical').length;
                      const isChecked = selectedEmailComponents.includes(compKey);
                      const hasDrifts = driftCount > 0;

                      return (
                        <label
                          key={compKey}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 13,
                            color: hasDrifts ? CB.ink : CB.muted,
                            cursor: hasDrifts ? 'pointer' : 'not-allowed',
                            opacity: hasDrifts ? 1 : 0.6,
                          }}
                        >
                          <input
                            type="checkbox"
                            disabled={!hasDrifts}
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEmailComponents([...selectedEmailComponents, compKey]);
                              } else {
                                setSelectedEmailComponents(selectedEmailComponents.filter(c => c !== compKey));
                              }
                            }}
                            style={{ accentColor: CB.primary }}
                          />
                          <span style={{ textTransform: 'capitalize' }}>
                            {compKey} ({driftCount} drifts)
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '20px 28px',
              borderTop: `1px solid ${CB.hairline}`,
              background: CB.surfaceSoft,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
            }}>
              <button
                onClick={() => setShowEmailModal(false)}
                disabled={sendingEmail}
                style={{ ...pillBtnSecondary, height: 40, padding: '0 20px', fontSize: 14 }}
                onMouseEnter={(e) => !sendingEmail && (e.currentTarget.style.background = CB.hairlineSoft)}
                onMouseLeave={(e) => !sendingEmail && (e.currentTarget.style.background = CB.surfaceStrong)}
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={sendingEmail}
                style={{
                  ...pillBtnPrimary,
                  height: 40,
                  padding: '0 20px',
                  fontSize: 14,
                  opacity: sendingEmail ? 0.7 : 1,
                  cursor: sendingEmail ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => !sendingEmail && (e.currentTarget.style.background = CB.primaryActive)}
                onMouseLeave={(e) => !sendingEmail && (e.currentTarget.style.background = CB.primary)}
              >
                {sendingEmail ? (
                  <>
                    <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send style={{ width: 14, height: 14 }} />
                    Send SQL
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
