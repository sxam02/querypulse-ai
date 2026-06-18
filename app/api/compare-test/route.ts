// app/api/compare-test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PostgresCompareService } from '@/lib/services/postgresCompareService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceDb, destinationDb } = body;

    const results = {
      source: { success: false, error: null as string | null },
      destination: { success: false, error: null as string | null },
    };

    const promises: Promise<any>[] = [];

    // Test Source
    if (sourceDb) {
      if (sourceDb.host === 'demo-source') {
        results.source = { success: true, error: null };
      } else {
        promises.push(
          PostgresCompareService.testConnection(sourceDb)
            .then(() => {
              results.source = { success: true, error: null };
            })
            .catch((err) => {
              results.source = { success: false, error: err.message };
            })
        );
      }
    }

    // Test Destination
    if (destinationDb) {
      if (destinationDb.host === 'demo-destination') {
        results.destination = { success: true, error: null };
      } else {
        promises.push(
          PostgresCompareService.testConnection(destinationDb)
            .then(() => {
              results.destination = { success: true, error: null };
            })
            .catch((err) => {
              results.destination = { success: false, error: err.message };
            })
        );
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Internal connection test failure' },
      { status: 500 }
    );
  }
}
