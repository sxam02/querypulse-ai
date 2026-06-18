// app/config/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '@/lib/stateContext';
import { 
  Server, 
  Database, 
  Sliders, 
  ArrowLeft, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Save,
  Activity
} from 'lucide-react';

export default function ConfigPage() {
  const router = useRouter();
  const { addToast } = useAppContext();
  const [mounted, setMounted] = useState(false);

  // Form State
  const [javaMelodyUrl, setJavaMelodyUrl] = useState('');
  const [javaMelodyUser, setJavaMelodyUser] = useState('');
  const [javaMelodyPass, setJavaMelodyPass] = useState('');

  const [pgHost, setPgHost] = useState('');
  const [pgPort, setPgPort] = useState('5432');
  const [pgDatabase, setPgDatabase] = useState('');
  const [pgUsername, setPgUsername] = useState('');
  const [pgPassword, setPgPassword] = useState('');

  const [cpuThreshold, setCpuThreshold] = useState('80');
  const [queryDurationThreshold, setQueryDurationThreshold] = useState('500');
  const [refreshInterval, setRefreshInterval] = useState('5');

  // Test states
  const [testingJm, setTestingJm] = useState(false);
  const [jmStatus, setJmStatus] = useState<'idle' | 'connected' | 'failed'>('idle');
  const [jmError, setJmError] = useState('');

  const [testingPg, setTestingPg] = useState(false);
  const [pgStatus, setPgStatus] = useState<'idle' | 'connected' | 'failed'>('idle');
  const [pgError, setPgError] = useState('');

  // Check if configuration already exists in localStorage
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('querypulse_config');
    if (stored) {
      try {
        const config = JSON.parse(stored);
        setJavaMelodyUrl(config.javaMelodyUrl || '');
        setJavaMelodyUser(config.javaMelodyUsername || '');
        setJavaMelodyPass(config.javaMelodyPassword || '');

        setPgHost(config.pgHost || '');
        setPgPort(config.pgPort?.toString() || '5432');
        setPgDatabase(config.pgDatabase || '');
        setPgUsername(config.pgUsername || '');
        setPgPassword(config.pgPassword || '');

        setCpuThreshold(config.cpuThreshold?.toString() || '80');
        setQueryDurationThreshold(config.queryDurationThreshold?.toString() || '500');
        setRefreshInterval(config.refreshInterval?.toString() || '5');

        setHasConfig(true);
      } catch (e) {
        console.error('Failed to parse config', e);
      }
    }
  }, []);

  const handleTestJavaMelody = async () => {
    if (!javaMelodyUrl) {
      addToast('JavaMelody URL is required to test connection', 'warning');
      return;
    }
    setTestingJm(true);
    setJmStatus('idle');
    setJmError('');

    try {
      const res = await fetch('/api/test-javamelody', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: javaMelodyUrl,
          username: javaMelodyUser,
          password: javaMelodyPass,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setJmStatus('connected');
        addToast('JavaMelody connection verified successfully!', 'success');
      } else {
        setJmStatus('failed');
        setJmError(data.error || 'Connection failed');
        addToast('JavaMelody connection failed', 'error');
      }
    } catch (err: any) {
      setJmStatus('failed');
      setJmError(err.message || 'Connection failed');
      addToast('JavaMelody connection failed', 'error');
    } finally {
      setTestingJm(false);
    }
  };

  const handleTestPostgres = async () => {
    if (!pgHost || !pgDatabase || !pgUsername) {
      addToast('Host, database name, and username are required to test connection', 'warning');
      return;
    }
    setTestingPg(true);
    setPgStatus('idle');
    setPgError('');

    try {
      const res = await fetch('/api/test-postgres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: pgHost,
          port: parseInt(pgPort, 10),
          database: pgDatabase,
          username: pgUsername,
          password: pgPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPgStatus('connected');
        addToast('PostgreSQL connection verified successfully!', 'success');
      } else {
        setPgStatus('failed');
        setPgError(data.error || 'Connection failed');
        addToast('PostgreSQL connection failed', 'error');
      }
    } catch (err: any) {
      setPgStatus('failed');
      setPgError(err.message || 'Connection failed');
      addToast('PostgreSQL connection failed', 'error');
    } finally {
      setTestingPg(false);
    }
  };

  const handleSave = () => {
    if (!javaMelodyUrl) {
      addToast('JavaMelody URL is required', 'warning');
      return;
    }
    if (!pgHost || !pgDatabase || !pgUsername) {
      addToast('PostgreSQL configuration is incomplete', 'warning');
      return;
    }

    const config = {
      javaMelodyUrl,
      javaMelodyUsername: javaMelodyUser,
      javaMelodyPassword: javaMelodyPass,
      pgHost,
      pgPort: parseInt(pgPort, 10) || 5432,
      pgDatabase,
      pgUsername,
      pgPassword,
      cpuThreshold: parseFloat(cpuThreshold) || 80,
      queryDurationThreshold: parseInt(queryDurationThreshold, 10) || 500,
      refreshInterval: parseInt(refreshInterval, 10) || 5,
    };

    localStorage.setItem('querypulse_config', JSON.stringify(config));
    addToast('Configuration saved successfully!', 'success');
    router.push('/');
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="size-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none">
      {/* Top Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-zinc-900/40 border-b border-zinc-800/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center size-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-md shadow-violet-500/20">
            <Cpu className="size-4 text-white animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 size-2 bg-emerald-500 border border-zinc-900 rounded-full" />
          </div>
          <span className="font-bold text-base bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
            QueryPulse Config
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push('/schema-compare')}
            className="text-zinc-400 hover:text-zinc-100 flex items-center gap-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 h-8"
          >
            <Sliders className="size-3.5" /> Schema Compare
          </Button>

          {hasConfig && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.push('/')}
              className="text-zinc-400 hover:text-zinc-100 flex items-center gap-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 h-8"
            >
              <ArrowLeft className="size-3.5" /> Back to Dashboard
            </Button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-full w-full p-8 space-y-6 flex flex-col justify-center">
        <div className="text-center max-w-lg mx-auto space-y-2 mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">Telemetry Settings</h1>
          <p className="text-xs text-zinc-400">
            Configure JVM telemetry via JavaMelody and PostgreSQL access parameters to track query latency and CPU spikes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* JavaMelody Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 shadow-lg backdrop-blur-md flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Server className="size-4 text-violet-400" />
                JavaMelody Configuration
              </CardTitle>
              <CardDescription className="text-[11px] text-zinc-500">
                Connection URL to query JavaMelody stats (ex: http://localhost:8080/monitoring)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">URL</label>
                <Input 
                  placeholder="https://app.internal/monitoring" 
                  value={javaMelodyUrl}
                  onChange={(e) => setJavaMelodyUrl(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 text-xs focus:ring-violet-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Username (optional)</label>
                <Input 
                  placeholder="admin" 
                  value={javaMelodyUser}
                  onChange={(e) => setJavaMelodyUser(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 text-xs focus:ring-violet-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Password (optional)</label>
                <Input 
                  type="password"
                  placeholder="••••••••" 
                  value={javaMelodyPass}
                  onChange={(e) => setJavaMelodyPass(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 text-xs focus:ring-violet-500"
                />
              </div>

              {jmStatus === 'connected' && (
                <div className="flex items-center gap-1.5 p-2 bg-emerald-950/20 border border-emerald-800/40 rounded-lg text-emerald-400 text-xs">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span>Connection successful</span>
                </div>
              )}
              {jmStatus === 'failed' && (
                <div className="flex flex-col gap-1 p-2 bg-rose-950/20 border border-rose-800/40 rounded-lg text-rose-400 text-[11px] max-w-full overflow-hidden">
                  <div className="flex items-center gap-1.5 font-bold">
                    <XCircle className="size-3.5 shrink-0" />
                    <span>Connection failed</span>
                  </div>
                  <p className="font-mono text-[10px] break-all opacity-80">{jmError}</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t border-zinc-800/50 pt-3">
              <Button 
                onClick={handleTestJavaMelody}
                disabled={testingJm}
                variant="outline"
                className="w-full text-zinc-300 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                {testingJm ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5 text-violet-400" />
                    Testing Connection...
                  </>
                ) : 'Test JavaMelody Connection'}
              </Button>
            </CardFooter>
          </Card>

          {/* PostgreSQL Card */}
          <Card className="bg-zinc-900/60 border border-zinc-800/80 shadow-lg backdrop-blur-md flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Database className="size-4 text-emerald-400" />
                PostgreSQL Configuration
              </CardTitle>
              <CardDescription className="text-[11px] text-zinc-500">
                Credentials to fetch query performance details from pg_stat_activity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Host</label>
                  <Input 
                    placeholder="localhost" 
                    value={pgHost}
                    onChange={(e) => setPgHost(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 text-xs focus:ring-violet-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Port</label>
                  <Input 
                    placeholder="5432" 
                    value={pgPort}
                    onChange={(e) => setPgPort(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 text-xs focus:ring-violet-500"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Database</label>
                <Input 
                  placeholder="postgres" 
                  value={pgDatabase}
                  onChange={(e) => setPgDatabase(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 text-xs focus:ring-violet-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Username</label>
                <Input 
                  placeholder="postgres" 
                  value={pgUsername}
                  onChange={(e) => setPgUsername(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 text-xs focus:ring-violet-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Password</label>
                <Input 
                  type="password"
                  placeholder="••••••••" 
                  value={pgPassword}
                  onChange={(e) => setPgPassword(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 text-xs focus:ring-violet-500"
                />
              </div>

              {pgStatus === 'connected' && (
                <div className="flex items-center gap-1.5 p-2 bg-emerald-950/20 border border-emerald-800/40 rounded-lg text-emerald-400 text-xs">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span>Connection successful</span>
                </div>
              )}
              {pgStatus === 'failed' && (
                <div className="flex flex-col gap-1 p-2 bg-rose-950/20 border border-rose-800/40 rounded-lg text-rose-400 text-[11px] max-w-full overflow-hidden">
                  <div className="flex items-center gap-1.5 font-bold">
                    <XCircle className="size-3.5 shrink-0" />
                    <span>Connection failed</span>
                  </div>
                  <p className="font-mono text-[10px] break-all opacity-80">{pgError}</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t border-zinc-800/50 pt-3">
              <Button 
                onClick={handleTestPostgres}
                disabled={testingPg}
                variant="outline"
                className="w-full text-zinc-300 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                {testingPg ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5 text-violet-400" />
                    Testing Connection...
                  </>
                ) : 'Test PostgreSQL Connection'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Monitoring Settings */}
        <Card className="bg-zinc-900/60 border border-zinc-800/80 shadow-lg backdrop-blur-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Sliders className="size-4 text-amber-400" />
              Monitoring Settings
            </CardTitle>
            <CardDescription className="text-[11px] text-zinc-500">
              Configure alert thresholds for incident detection and dashboard polling frequency
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">CPU Threshold %</label>
              <Input 
                type="number"
                min="1"
                max="100"
                placeholder="80" 
                value={cpuThreshold}
                onChange={(e) => setCpuThreshold(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs focus:ring-violet-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Query Duration Threshold (ms)</label>
              <Input 
                type="number"
                min="50"
                placeholder="500" 
                value={queryDurationThreshold}
                onChange={(e) => setQueryDurationThreshold(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs focus:ring-violet-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Refresh Interval (seconds)</label>
              <Input 
                type="number"
                min="2"
                max="60"
                placeholder="5" 
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs focus:ring-violet-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button 
            onClick={handleSave}
            className="px-6 py-2 bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 text-white font-bold rounded-lg shadow-md hover:shadow-violet-500/10 transition-all flex items-center gap-1.5 text-xs"
          >
            <Save className="size-4" /> Save Configuration
          </Button>
        </div>
      </main>
    </div>
  );
}
