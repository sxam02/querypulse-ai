// app/api/metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { JavaMelodyService } from '@/lib/services/javaMelodyService';
import { PostgresMonitoringService } from '@/lib/services/postgresMonitoringService';

export async function POST(request: NextRequest) {
  try {
    const config = await request.json();
    const {
      javaMelodyUrl,
      javaMelodyUsername,
      javaMelodyPassword,
      pgHost,
      pgPort,
      pgDatabase,
      pgUsername,
      pgPassword,
      queryDurationThreshold = 500,
    } = config;

    const results: any = {
      javamelody: {
        status: 'Not Configured',
        error: null,
        metrics: null,
      },
      postgres: {
        status: 'Not Configured',
        error: null,
        metrics: null,
      },
    };

    const promises: Promise<any>[] = [];

    // JavaMelody Query Promise
    let jmPromiseIdx = -1;
    if (javaMelodyUrl) {
      jmPromiseIdx = promises.length;
      promises.push(
        JavaMelodyService.getMetrics(javaMelodyUrl, javaMelodyUsername, javaMelodyPassword)
          .then((metrics) => ({ type: 'javamelody', success: true, metrics }))
          .catch((error) => ({ type: 'javamelody', success: false, error: error.message }))
      );
    }

    // PostgreSQL Query Promise
    let pgPromiseIdx = -1;
    if (pgHost && pgDatabase && pgUsername) {
      pgPromiseIdx = promises.length;
      promises.push(
        PostgresMonitoringService.getMetrics(
          {
            host: pgHost,
            port: pgPort,
            database: pgDatabase,
            username: pgUsername,
            password: pgPassword,
          },
          queryDurationThreshold
        )
          .then((metrics) => ({ type: 'postgres', success: true, metrics }))
          .catch((error) => ({ type: 'postgres', success: false, error: error.message }))
      );
    }

    // Wait for both to complete
    const settled = await Promise.all(promises);

    if (jmPromiseIdx !== -1) {
      const res = settled[jmPromiseIdx];
      if (res.success) {
        results.javamelody = {
          status: 'Connected',
          error: null,
          metrics: res.metrics,
        };
      } else {
        results.javamelody = {
          status: 'Disconnected',
          error: res.error,
          metrics: null,
        };
      }
    }

    if (pgPromiseIdx !== -1) {
      const res = settled[pgPromiseIdx];
      if (res.success) {
        results.postgres = {
          status: 'Connected',
          error: null,
          metrics: res.metrics,
        };
      } else {
        results.postgres = {
          status: 'Disconnected',
          error: res.error,
          metrics: null,
        };
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: `Internal API error: ${error.message}` }, { status: 500 });
  }
}
