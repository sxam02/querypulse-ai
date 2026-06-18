// lib/services/javaMelodyService.ts

export interface JavaMelodyMetrics {
  cpu: number;
  memory: number;
  jvmHeap: number;
  threadCount: number;
  activeSessions: number;
  gcPauseTime: number;
  responseTime: number;
  dbConnections: number;
}

export class JavaMelodyService {
  static async testConnection(url: string, username?: string, password?: string): Promise<boolean> {
    // Attempt lightweight validation check first
    try {
      const testUrl = new URL(url);
      testUrl.searchParams.set('format', 'json');
      testUrl.searchParams.set('part', 'lastValue');

      const headers: HeadersInit = {
        'Accept': 'application/json',
        'User-Agent': 'QueryPulse-Telemetry-Agent/1.0',
      };

      if (username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const res = await fetch(testUrl.toString(), {
        headers,
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(5000), // 5 seconds is plenty for lastValue
      });

      if (res.ok) {
        const data = await res.json();
        if (data && (data.list || data['linked-hash-map'])) {
          return true;
        }
      }
    } catch (e) {
      // Ignore and fall back to full report check
    }

    try {
      const targetUrl = new URL(url);
      if (!targetUrl.searchParams.has('format')) {
        targetUrl.searchParams.set('format', 'json');
      }

      const headers: HeadersInit = {
        'Accept': 'application/json',
        'User-Agent': 'QueryPulse-Telemetry-Agent/1.0',
      };

      if (username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const res = await fetch(targetUrl.toString(), {
        headers,
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(20000), // 20 seconds fallback timeout
      });

      if (!res.ok) {
        throw new Error(`JavaMelody connection returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data || !data.list) {
        throw new Error('Invalid JavaMelody JSON response structure (missing list field)');
      }
      return true;
    } catch (error: any) {
      throw new Error(`JavaMelody connection failed: ${error.message}`);
    }
  }

  static async getMetrics(url: string, username?: string, password?: string): Promise<JavaMelodyMetrics> {
    // 1. Try lightweight endpoint to avoid overloading remote server
    try {
      const lastValueUrl = new URL(url);
      lastValueUrl.searchParams.set('format', 'json');
      lastValueUrl.searchParams.set('part', 'lastValue');

      const headers: HeadersInit = {
        'Accept': 'application/json',
        'User-Agent': 'QueryPulse-Telemetry-Agent/1.0',
      };

      if (username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const res = await fetch(lastValueUrl.toString(), {
        headers,
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(6000), // 6 seconds timeout for lastValue
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data['linked-hash-map']) {
          const map = new Map<string, any>(data['linked-hash-map']);
          
          let cpu = map.get('cpu') || 0;
          // Normalize system CPU load to percentage 0-100
          if (cpu > 0 && cpu <= 1.0) {
            cpu = parseFloat((cpu * 100).toFixed(1));
          } else {
            cpu = parseFloat(cpu.toFixed(1));
          }

          const usedMemory = map.get('usedMemory') || 0;
          // Heap estimate: assume standard 2GB if max is unknown
          const jvmHeap = parseFloat(Math.min(100, (usedMemory / (2 * 1024 * 1024 * 1024)) * 100).toFixed(1));
          
          const activeSessions = map.get('httpSessions') || 0;
          const threadCount = map.get('activeThreads') || 0;
          const dbConnections = map.get('usedConnections') || map.get('activeConnections') || 0;
          const responseTime = map.get('sqlMeanTimes') || map.get('httpMeanTimes') || 0;

          return {
            cpu,
            memory: jvmHeap, // fallback OS memory matching JVM activity
            jvmHeap,
            threadCount,
            activeSessions,
            gcPauseTime: 0,
            responseTime,
            dbConnections,
          };
        }
      }
    } catch (e) {
      console.warn('Lightweight lastValue fetch failed, falling back to full JSON report', e);
    }

    // 2. Fallback: Query full JavaMelody telemetry report (slow but comprehensive)
    try {
      const targetUrl = new URL(url);
      if (!targetUrl.searchParams.has('format')) {
        targetUrl.searchParams.set('format', 'json');
      }

      const headers: HeadersInit = {
        'Accept': 'application/json',
        'User-Agent': 'QueryPulse-Telemetry-Agent/1.0',
      };

      if (username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const res = await fetch(targetUrl.toString(), {
        headers,
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(20000), // 20 seconds timeout for full load
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const list = data.list || [];
      const systemInfo = list.find((item: any) => item.name === null || item.name === undefined || item.memoryInformations);

      if (!systemInfo) {
        throw new Error('System information segment not found in telemetry payload');
      }

      const cpu = systemInfo.systemCpuLoad !== undefined 
        ? parseFloat((systemInfo.systemCpuLoad * 100).toFixed(1)) 
        : 0;

      const memoryInformations = systemInfo.memoryInformations || {};
      let memory = 50;
      if (memoryInformations.usedPhysicalMemorySize) {
        const details = memoryInformations.memoryDetails || '';
        const totalMemMatch = details.match(/Total physical memory\s*=\s*([\d,]+)\s*Mo/);
        if (totalMemMatch) {
          const totalMb = parseFloat(totalMemMatch[1].replace(/,/g, ''));
          const totalBytes = totalMb * 1024 * 1024;
          memory = parseFloat(((memoryInformations.usedPhysicalMemorySize / totalBytes) * 100).toFixed(1));
        } else {
          memory = parseFloat(((memoryInformations.usedPhysicalMemorySize / (16 * 1024 * 1024 * 1024)) * 100).toFixed(1));
        }
      }

      const usedHeap = memoryInformations.usedMemory || 0;
      const maxHeap = memoryInformations.maxMemory || 1;
      const jvmHeap = parseFloat(((usedHeap / maxHeap) * 100).toFixed(1));

      const activeSessions = systemInfo.sessionCount || 0;
      const tomcatList = systemInfo.tomcatInformationsList || [];
      const mainConnector = tomcatList[0] || {};
      const threadCount = systemInfo.threadCount || mainConnector.currentThreadCount || 0;

      const dbConnections = systemInfo.usedConnectionCount !== undefined 
        ? systemInfo.usedConnectionCount 
        : (systemInfo.activeConnectionCount || 0);

      const gcPauseTime = memoryInformations.garbageCollectionTimeMillis || 0;

      const sqlInfo = list.find((item: any) => item.name === 'sql');
      const rawSqlRequests = sqlInfo?.requests || [];
      let responseTime = 0;
      if (rawSqlRequests.length > 0) {
        const totalDurations = rawSqlRequests.reduce((acc: number, [, details]: [string, any]) => acc + (details.durationsSum || 0), 0);
        const totalHits = rawSqlRequests.reduce((acc: number, [, details]: [string, any]) => acc + (details.hits || 1), 0);
        responseTime = totalHits > 0 ? parseFloat((totalDurations / totalHits).toFixed(1)) : 0;
      }

      return {
        cpu,
        memory,
        jvmHeap,
        threadCount,
        activeSessions,
        gcPauseTime,
        responseTime,
        dbConnections,
      };
    } catch (error: any) {
      throw new Error(`JavaMelody fetch failed: ${error.message}`);
    }
  }
}
