// lib/services/postgresMonitoringService.ts
import { Client } from 'pg';

export interface SqlQuerySnapshot {
  pid: number;
  user: string;
  state: string;
  duration: number; // in milliseconds
  queryStartTime: string | null;
  queryText: string;
}

export interface PostgresMetrics {
  activeConnections: number;
  activeQueriesCount: number;
  longRunningQueries: number;
  avgQueryDuration: number;
  dbLoad: number;
  queries: SqlQuerySnapshot[];
}

export class PostgresMonitoringService {
  private static getClient(config: any) {
    return new Client({
      host: config.host,
      port: parseInt(config.port, 10) || 5432,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
  }

  static async testConnection(config: any): Promise<boolean> {
    const client = this.getClient(config);
    try {
      await client.connect();
      // Execute a quick simple validation query
      await client.query('SELECT 1');
      await client.end();
      return true;
    } catch (error: any) {
      try {
        await client.end();
      } catch (e) {}
      throw new Error(`PostgreSQL connection failed: ${error.message}`);
    }
  }

  static async getMetrics(config: any, queryTimeThresholdMs: number): Promise<PostgresMetrics> {
    const client = this.getClient(config);
    try {
      await client.connect();

      // Retrieve total connection count
      const connRes = await client.query('SELECT count(*) as count FROM pg_stat_activity');
      const activeConnections = parseInt(connRes.rows[0].count, 10);

      // Retrieve active running queries (excluding our own telemetry query and idle states)
      const queryFilter = "state = 'active' AND query IS NOT NULL AND query != '' AND query NOT LIKE '%pg_stat_activity%'";
      
      const activeCountRes = await client.query(`SELECT count(*) as count FROM pg_stat_activity WHERE ${queryFilter}`);
      const activeQueriesCount = parseInt(activeCountRes.rows[0].count, 10);

      // Retrieve active queries that exceed the duration threshold (converted from interval)
      const longCountRes = await client.query(
        `SELECT count(*) as count FROM pg_stat_activity 
         WHERE ${queryFilter} 
         AND extract(epoch from (now() - query_start)) * 1000 > $1`,
        [queryTimeThresholdMs]
      );
      const longRunningQueries = parseInt(longCountRes.rows[0].count, 10);

      // Average duration of currently active queries
      const avgDurationRes = await client.query(
        `SELECT COALESCE(avg(extract(epoch from (now() - query_start)) * 1000), 0) as avg_duration 
         FROM pg_stat_activity 
         WHERE ${queryFilter}`
      );
      const avgQueryDuration = parseFloat(parseFloat(avgDurationRes.rows[0].avg_duration).toFixed(1));

      // Retrieve all active and recently completed running queries
      const queriesListRes = await client.query(
        `SELECT 
          pid, 
          usename as "user", 
          state, 
          COALESCE(extract(epoch from (now() - query_start)) * 1000, 0) as duration, 
          query_start as query_start_time, 
          query as query_text 
         FROM pg_stat_activity 
         WHERE query IS NOT NULL AND query != '' AND query NOT LIKE '%pg_stat_activity%'
         ORDER BY duration DESC 
         LIMIT 50`
      );

      await client.end();

      // Database Load estimate (ratio of active queries to active connections, scaled to percentage)
      const dbLoad = activeConnections > 0 ? Math.min(100, Math.round((activeQueriesCount / activeConnections) * 100)) : 0;

      const queries: SqlQuerySnapshot[] = queriesListRes.rows.map((r: any) => ({
        pid: r.pid,
        user: r.user || 'system',
        state: r.state || 'unknown',
        duration: r.duration ? parseFloat(r.duration.toFixed(1)) : 0,
        queryStartTime: r.query_start_time ? new Date(r.query_start_time).toISOString() : null,
        queryText: r.query_text,
      }));

      return {
        activeConnections,
        activeQueriesCount,
        longRunningQueries,
        avgQueryDuration,
        dbLoad,
        queries,
      };
    } catch (error: any) {
      try {
        await client.end();
      } catch (e) {}
      throw new Error(`PostgreSQL monitoring query failed: ${error.message}`);
    }
  }
}
