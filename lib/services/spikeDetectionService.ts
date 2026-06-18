// lib/services/spikeDetectionService.ts
import { SqlQuerySnapshot } from './postgresMonitoringService';

export interface IncidentTimelineEvent {
  time: string;
  description: string;
  type: 'info' | 'warning' | 'error' | 'critical';
}

export interface QueryContributor {
  rank: number;
  impactScore: number;
  query: string;
  duration: number;
  executionCount: number;
  state: string;
}

export interface Incident {
  id: string;
  startTime: string;
  cpu: number;
  durationSeconds: number;
  affectedApp: string;
  activeQueriesCount: number;
  status: 'ACTIVE' | 'RESOLVED';
  timeline: IncidentTimelineEvent[];
  topContributors: QueryContributor[];
  rootCause: {
    potentialCause: string;
    topSuspectedQuery: string;
    longestRunningQuery: string;
    connectionPoolStatus: string;
    threadCountTrend: string;
    databaseActivityTrend: string;
  };
}

export class SpikeDetectionService {
  static evaluate(
    currentCpu: number,
    cpuThreshold: number,
    activeQueries: SqlQuerySnapshot[],
    postgresMetrics: {
      activeConnections: number;
      activeQueriesCount: number;
      longRunningQueries: number;
      avgQueryDuration: number;
      dbLoad: number;
    },
    jvmMetrics: {
      cpu: number;
      memory: number;
      jvmHeap: number;
      threadCount: number;
      activeSessions: number;
      gcPauseTime: number;
      responseTime: number;
      dbConnections: number;
    },
    existingIncidents: Incident[],
    appName: string
  ): { newIncident: Incident | null; updatedIncidents: Incident[]; eventsToAdd: string[] } {
    const updatedIncidents = [...existingIncidents];
    const activeIncidentIndex = updatedIncidents.findIndex(i => i.status === 'ACTIVE');
    const activeIncident = activeIncidentIndex > -1 ? updatedIncidents[activeIncidentIndex] : null;
    const eventsToAdd: string[] = [];

    const nowStr = new Date().toISOString();

    // Case 1: CPU exceeds configured threshold
    if (currentCpu > cpuThreshold) {
      if (!activeIncident) {
        // CPU crossed threshold, no active incident -> CREATE NEW INCIDENT
        const topContributors = this.correlateQueries(activeQueries);
        const longestQuery = activeQueries.reduce((prev, current) => (prev.duration > current.duration) ? prev : current, { queryText: 'None', duration: 0 });
        const topSuspected = topContributors[0]?.query || 'None';

        const rootCause = {
          potentialCause: topContributors.length > 0 
            ? `PostgreSQL CPU overload correlation. High query duration detected. Top suspected query matches CPU spike start.`
            : 'JVM CPU spike without matching slow database queries. Investigate application thread allocation.',
          topSuspectedQuery: topSuspected,
          longestRunningQuery: longestQuery.queryText,
          connectionPoolStatus: `DB Connections: ${postgresMetrics.activeConnections} active, Tomcat threads: ${jvmMetrics.threadCount}`,
          threadCountTrend: `JVM thread count: ${jvmMetrics.threadCount}. Session load: ${jvmMetrics.activeSessions} active sessions.`,
          databaseActivityTrend: `PostgreSQL active queries: ${postgresMetrics.activeQueriesCount}, Avg duration: ${postgresMetrics.avgQueryDuration}ms, load: ${postgresMetrics.dbLoad}%`,
        };

        const timeline: IncidentTimelineEvent[] = [
          {
            time: nowStr,
            description: 'Incident Created: System Performance Incident triggered',
            type: 'critical',
          },
          {
            time: nowStr,
            description: `CPU Threshold Crossed (Current CPU: ${currentCpu}%, Threshold: ${cpuThreshold}%)`,
            type: 'error',
          },
        ];

        if (postgresMetrics.longRunningQueries > 0) {
          timeline.push({
            time: nowStr,
            description: `${postgresMetrics.longRunningQueries} long running SQL query/queries detected (> threshold)`,
            type: 'warning',
          });
        }

        if (postgresMetrics.activeConnections > 15) {
          timeline.push({
            time: nowStr,
            description: `Connection Count Increased to ${postgresMetrics.activeConnections} active DB channels`,
            type: 'info',
          });
        }

        if (jvmMetrics.threadCount > 40) {
          timeline.push({
            time: nowStr,
            description: `Thread Count Increased: Tomcat active threads at ${jvmMetrics.threadCount}`,
            type: 'info',
          });
        }

        const newInc: Incident = {
          id: `inc-${Date.now()}`,
          startTime: nowStr,
          cpu: currentCpu,
          durationSeconds: 0,
          affectedApp: appName || 'Java Application',
          activeQueriesCount: postgresMetrics.activeQueriesCount,
          status: 'ACTIVE',
          timeline,
          topContributors,
          rootCause,
        };

        updatedIncidents.unshift(newInc);
        eventsToAdd.push(`CPU spike detected (${currentCpu}%). Live Incident created.`);
        return { newIncident: newInc, updatedIncidents, eventsToAdd };
      } else {
        // Active incident exists and CPU is still high -> UPDATE DURATION & CPU
        const durationSec = Math.round((Date.now() - new Date(activeIncident.startTime).getTime()) / 1000);
        
        const currentTimeline = [...activeIncident.timeline];
        
        // Add periodic timeline reports or if new symptoms occur
        if (postgresMetrics.longRunningQueries > 0 && !currentTimeline.some(e => e.description.includes('Long Running Query Detected') && (Date.now() - new Date(e.time).getTime() < 30000))) {
          currentTimeline.unshift({
            time: nowStr,
            description: `Long Running Query Detected: ${postgresMetrics.longRunningQueries} active database queries running slow`,
            type: 'warning',
          });
        }

        updatedIncidents[activeIncidentIndex] = {
          ...activeIncident,
          cpu: Math.max(activeIncident.cpu, currentCpu),
          durationSeconds: durationSec,
          timeline: currentTimeline,
        };
      }
    } else {
      // Case 2: CPU returned below threshold
      if (activeIncident) {
        // CPU is normal, active incident exists -> RESOLVE INCIDENT
        const durationSec = Math.round((Date.now() - new Date(activeIncident.startTime).getTime()) / 1000);
        const timeline: IncidentTimelineEvent[] = [
          {
            time: nowStr,
            description: `CPU returned below threshold (${currentCpu}%). Performance nominal.`,
            type: 'info',
          },
          ...activeIncident.timeline,
        ];

        updatedIncidents[activeIncidentIndex] = {
          ...activeIncident,
          status: 'RESOLVED',
          durationSeconds: durationSec,
          timeline,
        };
        eventsToAdd.push('CPU returned to normal. Active incident resolved.');
      }
    }

    return { newIncident: null, updatedIncidents, eventsToAdd };
  }

  // Rank active PostgreSQL queries to identify top contributors
  static correlateQueries(activeQueries: SqlQuerySnapshot[]): QueryContributor[] {
    if (!activeQueries || activeQueries.length === 0) return [];

    const queryMap = new Map<string, { queryText: string; totalDuration: number; count: number; state: string }>();

    activeQueries.forEach(q => {
      // Group similar queries by replacing multiple spaces
      const normalized = q.queryText.trim().replace(/\s+/g, ' ');
      const existing = queryMap.get(normalized);
      if (existing) {
        existing.count += 1;
        existing.totalDuration += q.duration;
      } else {
        queryMap.set(normalized, {
          queryText: q.queryText,
          totalDuration: q.duration,
          count: 1,
          state: q.state,
        });
      }
    });

    const correlated: QueryContributor[] = Array.from(queryMap.values()).map(q => {
      // Impact Score Calculation: combination of execution count (frequency), average duration, and type
      // Impact is a relative score between 0 and 100
      const avgDuration = q.totalDuration / q.count;
      const durationScore = Math.min(65, (avgDuration / 1000) * 45); // up to 65 pts for duration
      const countScore = Math.min(35, q.count * 10); // up to 35 pts for frequency
      const impactScore = Math.round(durationScore + countScore);

      return {
        rank: 0, // set later
        impactScore,
        query: q.queryText,
        duration: parseFloat(avgDuration.toFixed(1)),
        executionCount: q.count,
        state: q.state,
      };
    });

    // Sort by impact score descending
    correlated.sort((a, b) => b.impactScore - a.impactScore);

    // Apply Rank index
    return correlated.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }
}
