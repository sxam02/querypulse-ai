// app/api/test-postgres/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PostgresMonitoringService } from '@/lib/services/postgresMonitoringService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { host, port, database, username, password } = body;

    if (!host || !database || !username) {
      return NextResponse.json({ success: false, error: 'Host, database, and username are required' }, { status: 400 });
    }

    const result = await PostgresMonitoringService.testConnection({
      host,
      port,
      database,
      username,
      password,
    });
    
    return NextResponse.json({ success: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
