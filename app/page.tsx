// app/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppContext } from '@/lib/stateContext';
import { SpikeDetectionService, Incident, IncidentTimelineEvent } from '@/lib/services/spikeDetectionService';
import { IncidentService } from '@/lib/services/incidentService';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Cpu,
  Database,
  Activity,
  RefreshCw,
  Play,
  Pause,
  AlertCircle,
  Clock,
  TrendingUp,
  Settings,
  Search,
  ArrowUpDown,
  Flame,
  Terminal,
  History,
  Layers,
  Thermometer,
  Zap,
  CheckCircle,
  XCircle,
  Loader2,
  Sliders,
} from 'lucide-react';

interface TrendPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  threadCount: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { addToast } = useAppContext();
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<any>(null);

  // Connection Data States
  const [loading, setLoading] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<string>('N/A');
  const [refreshCountdown, setRefreshCountdown] = useState<number>(5);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string>('');

  // Status Indicators
  const [jmStatus, setJmStatus] = useState<'Connected' | 'Disconnected' | 'Not Configured'>('Not Configured');
  const [pgStatus, setPgStatus] = useState<'Connected' | 'Disconnected' | 'Not Configured'>('Not Configured');

  // Metrics Data States
  const [jvmMetrics, setJvmMetrics] = useState<any>(null);
  const [postgresMetrics, setPostgresMetrics] = useState<any>(null);
  const [activeQueries, setActiveQueries] = useState<any[]>([]);

  // Incidents
  const [incidents, setIncidents] = useState<Incident[]>([]);

  // Chart trend history
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);

  // Table Search and Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'duration' | 'user' | 'pid' | 'state'>('duration');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // References for timers
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load config on mount
  useEffect(() => {
    setMounted(true);
    const storedConfig = localStorage.getItem('querypulse_config');
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig);
        setConfig(parsed);
        setRefreshCountdown(parsed.refreshInterval || 5);
        setJmStatus('Disconnected');
        setPgStatus('Disconnected');
      } catch (e) {
        console.error('Failed to parse stored config', e);
      }
    }
    setIncidents(IncidentService.getIncidents());
  }, []);

  // Fetch metrics API
  const fetchLiveMetrics = async (currentConfig = config) => {
    if (!currentConfig) return;
    setLoading(true);
    try {
      const res = await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentConfig),
      });

      if (!res.ok) {
        throw new Error(`Metrics API returned HTTP ${res.status}`);
      }

      const data = await res.json();

      // Update statuses
      setJmStatus(data.javamelody.status);
      setPgStatus(data.postgres.status);

      // Extract errors if any
      const errors = [];
      if (data.javamelody.error) {
        errors.push(`JavaMelody: ${data.javamelody.error}`);
      }
      if (data.postgres.error) {
        errors.push(`PostgreSQL: ${data.postgres.error}`);
      }
      setLastError(errors.join(' | '));

      // Set metrics
      const jmMetrics = data.javamelody.metrics;
      const pgMetrics = data.postgres.metrics;
      
      setJvmMetrics(jmMetrics);
      setPostgresMetrics(pgMetrics);
      setActiveQueries(pgMetrics?.queries || []);

      const now = new Date();
      setLastRefreshTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      // Update Trend Buffering (keep last 30 minutes in state)
      if (jmMetrics) {
        setTrendData((prev) => {
          const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const newPoint: TrendPoint = {
            timestamp,
            cpu: jmMetrics.cpu,
            memory: jmMetrics.memory,
            threadCount: jmMetrics.threadCount,
          };

          const maxPoints = Math.round((30 * 60) / (currentConfig.refreshInterval || 5));
          const updated = [...prev, newPoint];
          if (updated.length > maxPoints) {
            return updated.slice(updated.length - maxPoints);
          }
          return updated;
        });

        // Evaluate Spike Detection
        const existingInc = IncidentService.getIncidents();
        const appName = new URL(currentConfig.javaMelodyUrl).hostname;
        
        const evaluation = SpikeDetectionService.evaluate(
          jmMetrics.cpu,
          currentConfig.cpuThreshold || 80,
          pgMetrics?.queries || [],
          pgMetrics || { activeConnections: 0, activeQueriesCount: 0, longRunningQueries: 0, avgQueryDuration: 0, dbLoad: 0 },
          jmMetrics,
          existingInc,
          appName
        );

        if (evaluation.newIncident || evaluation.eventsToAdd.length > 0) {
          setIncidents(evaluation.updatedIncidents);
          IncidentService.saveIncidents(evaluation.updatedIncidents);
          
          // Toast any new alert notifications
          evaluation.eventsToAdd.forEach((msg) => {
            addToast(msg, jmMetrics.cpu > (currentConfig.cpuThreshold || 80) ? 'error' : 'info');
          });
        } else {
          // If active incident updated duration, sync UI state
          setIncidents(evaluation.updatedIncidents);
        }
      }
    } catch (err: any) {
      setLastError(err.message || 'Data retrieval failed');
      setJmStatus('Disconnected');
      setPgStatus('Disconnected');
    } finally {
      setLoading(false);
      setRefreshCountdown(currentConfig?.refreshInterval || 5);
    }
  };

  // Timers trigger
  useEffect(() => {
    if (!config) return;

    // First initial load
    fetchLiveMetrics(config);

    // Setup polling interval
    intervalRef.current = setInterval(() => {
      if (!isPaused) {
        fetchLiveMetrics(config);
      }
    }, (config.refreshInterval || 5) * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [config, isPaused]);

  // Separate Countdown Timer for UI fluidity
  useEffect(() => {
    if (!config || isPaused) return;

    countdownIntervalRef.current = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          return config.refreshInterval || 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [config, isPaused]);

  const togglePause = () => {
    setIsPaused(!isPaused);
    addToast(isPaused ? 'Auto refresh resumed' : 'Auto refresh paused', 'info');
  };

  // Current Active Incident derived values
  const activeIncident = useMemo(() => {
    return incidents.find((i) => i.status === 'ACTIVE') || null;
  }, [incidents]);

  // PostgreSQL active query table search and sorting logic
  const handleSort = (field: 'duration' | 'user' | 'pid' | 'state') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedAndFilteredQueries = useMemo(() => {
    let list = [...activeQueries];

    // Filter
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      list = list.filter(
        (q) =>
          q.queryText.toLowerCase().includes(queryLower) ||
          q.user.toLowerCase().includes(queryLower) ||
          q.pid.toString().includes(queryLower) ||
          q.state.toLowerCase().includes(queryLower)
      );
    }

    // Sort
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [activeQueries, searchQuery, sortField, sortDirection]);

  // Clean incidents history helper
  const handleClearHistory = () => {
    IncidentService.clearIncidents();
    setIncidents([]);
    addToast('Incident timeline logs cleared', 'info');
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="size-6 animate-spin text-violet-500" />
      </div>
    );
  }

  // Not Configured State Screen
  if (!config) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none">
        {/* Simple Header */}
        <header className="h-16 flex items-center justify-between px-6 bg-zinc-900/40 border-b border-zinc-800/60 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center size-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500">
              <Cpu className="size-4 text-white" />
            </div>
            <span className="font-bold text-base bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
              QueryPulse
            </span>
          </div>
        </header>

        {/* Dashboard Placeholder Card */}
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <Card className="max-w-md w-full bg-zinc-900/40 border-zinc-800/80 shadow-2xl backdrop-blur-md text-center p-6 space-y-6">
            <div className="flex justify-center">
              <div className="p-4 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded-full animate-pulse">
                <Settings className="size-10" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Configure Connection</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                QueryPulse is a real-time performance troubleshooter that connects directly to JavaMelody and PostgreSQL. Configure connection credentials to get started.
              </p>
            </div>
            <Button
              onClick={() => router.push('/config')}
              className="w-full py-2 bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 text-white font-bold rounded-lg shadow-md transition-all text-xs"
            >
              Configure Telemetry Settings
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none pb-8">
      {/* Premium Dashboard Header */}
      <header className="sticky top-0 h-16 flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50 z-30">
        {/* Left branding and connection statuses */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
            <div className="relative flex items-center justify-center size-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-md shadow-violet-500/20">
              <Activity className="size-4 text-white animate-pulse" />
              {activeIncident && (
                <span className="absolute -top-0.5 -right-0.5 size-2 bg-rose-500 border border-zinc-900 rounded-full animate-ping" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
                QueryPulse Live Monitoring
              </span>
              <span className="text-[9px] text-zinc-500 font-mono font-medium">JVM & Postgres Telemetry</span>
            </div>
          </div>

          {/* Connection Status Badges */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] bg-zinc-900 border border-zinc-800/60 rounded-md font-mono">
              <span className="text-zinc-500 font-semibold">JavaMelody:</span>
              <span className={`flex items-center gap-1 font-bold ${
                jmStatus === 'Connected' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {jmStatus === 'Connected' ? (
                  <>
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </>
                ) : (
                  <>
                    <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                    Offline
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] bg-zinc-900 border border-zinc-800/60 rounded-md font-mono">
              <span className="text-zinc-500 font-semibold">Postgres:</span>
              <span className={`flex items-center gap-1 font-bold ${
                pgStatus === 'Connected' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {pgStatus === 'Connected' ? (
                  <>
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </>
                ) : (
                  <>
                    <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                    Offline
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right refresh utilities and settings link */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono bg-zinc-900/60 border border-zinc-800/60 px-3 py-1 rounded-lg">
            <span>Ref: {lastRefreshTime}</span>
            <span className="text-zinc-600">|</span>
            <div className="flex items-center gap-1 w-20">
              {isPaused ? (
                <span className="text-amber-500 font-semibold uppercase text-[10px]">Paused</span>
              ) : (
                <>
                  <span className="text-zinc-500">Auto:</span>
                  <span className="text-violet-400 font-bold animate-pulse">{refreshCountdown}s</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={togglePause}
              className="size-8 p-0 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-white"
              title={isPaused ? 'Resume Auto Refresh' : 'Pause Auto Refresh'}
            >
              {isPaused ? <Play className="size-3.5 fill-amber-500 text-amber-500" /> : <Pause className="size-3.5 fill-violet-400 text-violet-400" />}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchLiveMetrics()}
              disabled={loading}
              className="size-8 p-0 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-white"
              title="Force Refresh Now"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin text-violet-500' : ''}`} />
            </Button>

            <Button
              size="sm"
              onClick={() => router.push('/schema-compare')}
              className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-medium text-xs flex items-center gap-1 h-8"
            >
              <Sliders className="size-3.5" />
              Schema Compare
            </Button>

            <Button
              size="sm"
              onClick={() => router.push('/config')}
              className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-medium text-xs flex items-center gap-1 h-8"
            >
              <Settings className="size-3.5" />
              Configure
            </Button>
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="flex-1 max-w-full w-full p-6 space-y-6">
        {/* Error Alert Display */}
        {lastError && (
          <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-xl text-rose-400 text-xs font-mono flex items-start gap-2 shadow-md">
            <AlertCircle className="size-4 shrink-0 mt-0.5 animate-bounce" />
            <div className="flex-1">
              <span className="font-bold">Active Connection Error:</span> {lastError}
            </div>
          </div>
        )}

        {/* ACTIVE SPIKE INCIDENT ALERT BANNER */}
        {activeIncident && (
          <div className="p-4 bg-rose-950/30 border border-rose-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse shadow-lg shadow-rose-950/10 relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Flame className="size-5 text-rose-500 fill-rose-500 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="bg-red-600 hover:bg-red-600 text-white font-extrabold text-[10px] tracking-wider uppercase">
                    Critical CPU Spike Active
                  </Badge>
                  <span className="text-[10px] text-zinc-400 font-mono">App: {activeIncident.affectedApp}</span>
                </div>
                <h4 className="text-sm font-bold text-white mt-1">
                  CPU usage at {activeIncident.cpu}% (Threshold: {config.cpuThreshold}%) • Running for {activeIncident.durationSeconds}s
                </h4>
              </div>
            </div>
            
            <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400 bg-zinc-950/40 border border-zinc-800/40 px-3 py-1.5 rounded-lg self-start md:self-auto shrink-0">
              <Clock className="size-3.5 text-rose-400" />
              <span>Start: {new Date(activeIncident.startTime).toLocaleTimeString()}</span>
            </div>
            <div className="absolute top-0 right-0 w-24 h-full bg-gradient-to-l from-rose-500/5 to-transparent pointer-events-none" />
          </div>
        )}

        {/* Real-time JVM Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-8 gap-3">
          {/* CPU Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-3 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-md">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <span>CPU Usage</span>
              <Cpu className="size-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`text-xl font-extrabold tracking-tight ${
                jvmMetrics?.cpu > (config.cpuThreshold || 80) ? 'text-red-400' : 'text-white'
              }`}>
                {jvmMetrics ? `${jvmMetrics.cpu}%` : 'N/A'}
              </span>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono mt-1">
              Threshold: {config.cpuThreshold}%
            </div>
          </Card>

          {/* Memory Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-3 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-md">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <span>Physical Mem</span>
              <Layers className="size-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-white">
                {jvmMetrics ? `${jvmMetrics.memory}%` : 'N/A'}
              </span>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono mt-1">
              OS allocated allocation
            </div>
          </Card>

          {/* JVM Heap Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-3 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-md">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <span>JVM Heap</span>
              <Layers className="size-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-white">
                {jvmMetrics ? `${jvmMetrics.jvmHeap}%` : 'N/A'}
              </span>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono mt-1">
              Heap allocation pool
            </div>
          </Card>

          {/* Threads Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-3 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-md">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <span>Threads</span>
              <Activity className="size-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-white">
                {jvmMetrics ? jvmMetrics.threadCount : 'N/A'}
              </span>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono mt-1">
              Active system threads
            </div>
          </Card>

          {/* Active Sessions Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-3 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-md">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <span>Sessions</span>
              <Activity className="size-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-white">
                {jvmMetrics ? jvmMetrics.activeSessions : 'N/A'}
              </span>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono mt-1">
              Web user session count
            </div>
          </Card>

          {/* GC Activity Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-3 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-md">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <span>GC Activity</span>
              <Clock className="size-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-white">
                {jvmMetrics ? `${jvmMetrics.gcPauseTime}ms` : 'N/A'}
              </span>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono mt-1">
              Cumulative garbage collection
            </div>
          </Card>

          {/* Response Time Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-3 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-md">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <span>Resp Time</span>
              <Clock className="size-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-white">
                {jvmMetrics ? `${jvmMetrics.responseTime}ms` : 'N/A'}
              </span>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono mt-1">
              Avg telemetry latency
            </div>
          </Card>

          {/* Connection Pool Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-3 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-md">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <span>DB Pool</span>
              <Database className="size-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-white">
                {jvmMetrics ? jvmMetrics.dbConnections : 'N/A'}
              </span>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono mt-1">
              Active connections used
            </div>
          </Card>
        </div>

        {/* Charts and Root Cause Console */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trend Chart (2/3 width) */}
          <Card className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/80 p-5 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="size-4 text-violet-400" />
                  JVM CPU & Memory Trend (Last 30m)
                </h3>
                <p className="text-[10px] text-zinc-500">In-memory rolling buffer chart</p>
              </div>
              <div className="flex gap-3 text-[10px] font-mono">
                <span className="flex items-center gap-1 text-zinc-300">
                  <span className="size-2 rounded-full bg-violet-500" /> CPU %
                </span>
                <span className="flex items-center gap-1 text-zinc-300">
                  <span className="size-2 rounded-full bg-indigo-400" /> Mem %
                </span>
                <span className="flex items-center gap-1 text-zinc-300">
                  <span className="size-2 rounded-full bg-emerald-500" /> Threads
                </span>
              </div>
            </div>
            <div className="h-64">
              {trendData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-600 font-mono">
                  Buffering real-time history...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorCpuTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorMemTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="timestamp" stroke="#52525b" fontSize={8} tickLine={false} />
                    <YAxis stroke="#52525b" fontSize={8} tickLine={false} domain={[0, 100]} />
                    <ChartTooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                      labelStyle={{ color: '#a1a1aa', fontSize: 9, fontFamily: 'monospace' }}
                      itemStyle={{ fontSize: 11 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorCpuTrend)"
                      name="CPU %"
                    />
                    <Area
                      type="monotone"
                      dataKey="memory"
                      stroke="#6366f1"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorMemTrend)"
                      name="Memory %"
                      strokeDasharray="3 3"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Root Cause Analysis & Query Correlation (1/3 width) */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-5 shadow-xl flex flex-col space-y-4">
            <div>
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="size-4 text-rose-400" />
                Root Cause Analysis Console
              </h3>
              <p className="text-[10px] text-zinc-500">Live query correlation diagnostics</p>
            </div>

            <div className="flex-1 flex flex-col justify-between space-y-4">
              {activeIncident ? (
                <div className="space-y-3">
                  <div className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase block tracking-wider">Potential Root Cause</span>
                    <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                      {activeIncident.rootCause.potentialCause}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase block tracking-wider">Top Suspected SQL Query</span>
                    <div className="font-mono text-[9px] text-rose-300 bg-zinc-950 p-2.5 rounded-lg border border-red-950/50 break-all line-clamp-3 select-all">
                      {activeIncident.rootCause.topSuspectedQuery}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase block tracking-wider">Longest Running Query</span>
                    <div className="font-mono text-[9px] text-zinc-300 bg-zinc-950 p-2 rounded-lg border border-zinc-850 break-all line-clamp-2">
                      {activeIncident.rootCause.longestRunningQuery}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800">
                    <div>
                      <span className="text-[9px] font-bold text-zinc-500 uppercase block">Conn Pool Status</span>
                      <span className="text-[10px] text-zinc-300 font-semibold">{postgresMetrics?.activeConnections} Connections</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-zinc-500 uppercase block">DB Active Queries</span>
                      <span className="text-[10px] text-zinc-300 font-semibold">{postgresMetrics?.activeQueriesCount} running</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2 border border-dashed border-zinc-800 rounded-xl">
                  <CheckCircle className="size-8 text-emerald-500" />
                  <h4 className="text-xs font-bold text-zinc-300">System Healthy</h4>
                  <p className="text-[10px] text-zinc-500 max-w-xs">
                    CPU is below the threshold. Root Cause Analysis triggers automatically during a performance spike incident.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* PostgreSQL Metrics & Query Correlation Engine */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Query Correlation Engine contributors list (1/3) */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-5 shadow-xl space-y-4">
            <div>
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="size-4 text-violet-400" />
                Query Correlation Engine
              </h3>
              <p className="text-[10px] text-zinc-500">Top Query Contributors during active spikes</p>
            </div>

            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {activeIncident && activeIncident.topContributors.length > 0 ? (
                activeIncident.topContributors.map((item) => (
                  <div key={item.rank} className="p-3 border border-zinc-850 bg-zinc-950/40 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <div className="flex items-center gap-1 font-bold">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-zinc-800">Rank #{item.rank}</Badge>
                        <span className="text-zinc-500 font-mono">Impact Score:</span>
                        <span className={`font-mono font-bold ${
                          item.impactScore > 60 ? 'text-red-400' : 'text-amber-400'
                        }`}>{item.impactScore}</span>
                      </div>
                      <span className="text-zinc-500 font-mono">State: {item.state}</span>
                    </div>
                    <div className="font-mono text-[9px] text-zinc-300 truncate bg-zinc-900 p-2 rounded border border-zinc-800 select-all">
                      {item.query}
                    </div>
                    <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                      <span>Execs: {item.executionCount}</span>
                      <span>Avg Duration: {item.duration}ms</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-48 flex items-center justify-center text-xs text-zinc-600 font-mono border border-dashed border-zinc-800 rounded-xl">
                  {activeIncident ? 'No active query metrics captured.' : 'Waiting for CPU spike incidents...'}
                </div>
              )}
            </div>
          </Card>

          {/* Database Metrics Stats Card (1/3) */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-5 shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="size-4 text-emerald-400" />
                PostgreSQL Load Metrics
              </h3>
              <p className="text-[10px] text-zinc-500">Direct active PostgreSQL statistics</p>
            </div>

            <div className="flex-1 space-y-3.5 pt-2">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-xs text-zinc-400">Active Connections</span>
                <span className="text-sm font-bold font-mono text-white">
                  {postgresMetrics ? postgresMetrics.activeConnections : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-xs text-zinc-400">Active Running Queries</span>
                <span className="text-sm font-bold font-mono text-white">
                  {postgresMetrics ? postgresMetrics.activeQueriesCount : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-xs text-zinc-400 font-semibold text-rose-400">Long Running Queries</span>
                <Badge variant={postgresMetrics?.longRunningQueries > 0 ? 'destructive' : 'outline'} className="font-mono text-xs font-bold">
                  {postgresMetrics ? postgresMetrics.longRunningQueries : 0}
                </Badge>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-xs text-zinc-400">Average SQL Duration</span>
                <span className="text-sm font-bold font-mono text-white">
                  {postgresMetrics ? `${postgresMetrics.avgQueryDuration}ms` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-xs text-zinc-400">Database Load</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold font-mono text-white">
                    {postgresMetrics ? `${postgresMetrics.dbLoad}%` : 'N/A'}
                  </span>
                  <div className="w-16 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                      style={{ width: `${postgresMetrics ? postgresMetrics.dbLoad : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* System Status (1/3) */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 p-5 shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="size-4 text-violet-400" />
                Telemetry Pipeline Status
              </h3>
              <p className="text-[10px] text-zinc-500">Pipeline verification details</p>
            </div>

            <div className="flex-1 space-y-3.5 pt-2">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2 text-xs">
                <span className="text-zinc-400">JavaMelody Status</span>
                <span className={`font-mono font-bold ${jmStatus === 'Connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {jmStatus}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2 text-xs">
                <span className="text-zinc-400">PostgreSQL Status</span>
                <span className={`font-mono font-bold ${pgStatus === 'Connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {pgStatus}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2 text-xs">
                <span className="text-zinc-400">Last Successful Refresh</span>
                <span className="font-mono text-zinc-300 font-semibold">{lastRefreshTime}</span>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2 text-xs">
                <span className="text-zinc-400">Telemetry Health</span>
                <span className={`font-mono font-bold ${
                  jmStatus === 'Connected' && pgStatus === 'Connected' ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {jmStatus === 'Connected' && pgStatus === 'Connected' ? 'Healthy' : 'Degraded'}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2 text-xs">
                <span className="text-zinc-400">Refresh Cadence</span>
                <span className="font-mono text-zinc-300 font-semibold">Every {config.refreshInterval}s</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ACTIVE QUERY TABLE */}
        <Card className="bg-zinc-900/60 border border-zinc-800/80 p-5 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="size-4 text-emerald-400" />
                Active SQL Queries (pg_stat_activity)
              </h3>
              <p className="text-[10px] text-zinc-500">Real-time database operations executing currently</p>
            </div>

            <div className="flex items-center gap-2 max-w-sm w-full">
              <Search className="size-4 text-zinc-500 shrink-0" />
              <Input
                placeholder="Filter queries by SQL text, user or state..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-zinc-950 border-zinc-850 text-xs text-zinc-200 placeholder-zinc-700 h-8"
              />
            </div>
          </div>

          <div className="border border-zinc-800/60 rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-950/60">
                <TableRow className="border-zinc-800 hover:bg-zinc-950/60">
                  <TableHead className="w-24 text-[10px] font-bold text-zinc-500 uppercase font-mono">
                    <button onClick={() => handleSort('pid')} className="flex items-center gap-1 hover:text-zinc-350 cursor-pointer">
                      PID <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-32 text-[10px] font-bold text-zinc-500 uppercase font-mono">
                    <button onClick={() => handleSort('user')} className="flex items-center gap-1 hover:text-zinc-350 cursor-pointer">
                      User <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-28 text-[10px] font-bold text-zinc-500 uppercase font-mono">
                    <button onClick={() => handleSort('state')} className="flex items-center gap-1 hover:text-zinc-350 cursor-pointer">
                      State <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-32 text-[10px] font-bold text-zinc-500 uppercase font-mono">
                    <button onClick={() => handleSort('duration')} className="flex items-center gap-1 hover:text-zinc-350 cursor-pointer">
                      Duration <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-48 text-[10px] font-bold text-zinc-500 uppercase font-mono">Start Time</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase font-mono">Query Text</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAndFilteredQueries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-zinc-650 text-xs font-mono">
                      {loading ? 'Fetching active database telemetry...' : 'No active queries matched filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedAndFilteredQueries.map((q) => {
                    const isLongRunning = q.duration > (config.queryDurationThreshold || 500);
                    return (
                      <TableRow 
                        key={q.pid} 
                        className={`border-zinc-800 hover:bg-zinc-900/40 transition-colors ${
                          isLongRunning ? 'bg-red-950/10 hover:bg-red-950/20' : ''
                        }`}
                      >
                        <TableCell className="font-mono text-xs text-zinc-400 py-2">{q.pid}</TableCell>
                        <TableCell className="font-mono text-xs text-zinc-300 py-2">{q.user}</TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className={`text-[9px] font-semibold tracking-wide capitalize px-1.5 py-0 border-zinc-800 ${
                            q.state === 'active' ? 'text-emerald-450 bg-emerald-950/10' : 'text-zinc-500'
                          }`}>
                            {q.state}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs py-2">
                          <span className={`font-bold ${isLongRunning ? 'text-red-400 font-extrabold' : 'text-zinc-200'}`}>
                            {q.duration}ms
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-zinc-500 py-2">
                          {q.queryStartTime ? new Date(q.queryStartTime).toLocaleTimeString() : 'N/A'}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-zinc-350 max-w-lg truncate select-all py-2" title={q.queryText}>
                          {q.queryText}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Incident History Timeline (Bottom Area) */}
        <Card className="bg-zinc-900/60 border border-zinc-800/80 p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                <History className="size-4 text-violet-400" />
                Live Incident Timeline & Historical logs
              </h3>
              <p className="text-[10px] text-zinc-500">Performance threshold crossing records</p>
            </div>
            {incidents.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearHistory}
                className="text-[10px] h-7 px-2 border-zinc-800 text-zinc-450 hover:text-zinc-250 cursor-pointer"
              >
                Clear History
              </Button>
            )}
          </div>

          <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
            {incidents.length === 0 ? (
              <div className="text-center py-6 text-zinc-650 text-xs font-mono">
                No incidents recorded. System functioning under normal thresholds.
              </div>
            ) : (
              <div className="relative border-l border-zinc-800 pl-4 ml-2 space-y-4">
                {incidents.map((inc) => (
                  <div key={inc.id} className="relative space-y-2">
                    {/* Pulsing state marker */}
                    <span className={`absolute -left-[21px] top-1 size-3 rounded-full border-2 border-zinc-950 ${
                      inc.status === 'ACTIVE' ? 'bg-red-500 animate-ping' : 'bg-emerald-500'
                    }`} />
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-250">
                          Incident {inc.status === 'ACTIVE' ? 'Active' : 'Resolved'} on {inc.affectedApp}
                        </span>
                        <Badge variant={inc.status === 'ACTIVE' ? 'destructive' : 'outline'} className="text-[9px] px-1.5 py-0 font-bold uppercase">
                          {inc.status}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Started: {new Date(inc.startTime).toLocaleString()} • Peak CPU: {inc.cpu}%
                      </span>
                    </div>

                    <div className="pl-3 py-2 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-1.5">
                      {inc.timeline.map((event, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-[11px]">
                          <span className="font-mono text-[9px] text-zinc-500 mt-0.5 shrink-0">
                            [{new Date(event.time).toLocaleTimeString()}]
                          </span>
                          <span className={`${
                            event.type === 'critical' ? 'text-red-400 font-bold' : 
                            event.type === 'error' ? 'text-rose-450' :
                            event.type === 'warning' ? 'text-amber-400' : 'text-zinc-400'
                          }`}>
                            {event.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
