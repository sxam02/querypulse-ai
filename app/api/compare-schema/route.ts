// app/api/compare-schema/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PostgresCompareService } from '@/lib/services/postgresCompareService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceDb, destinationDb, components, useDemo } = body;

    if (!components || !Array.isArray(components) || components.length === 0) {
      return NextResponse.json(
        { error: 'At least one schema component must be selected' },
        { status: 400 }
      );
    }

    // 1. Check if we should use demo mode
    const isDemo = useDemo || 
                   (sourceDb && sourceDb.host === 'demo-source') || 
                   (destinationDb && destinationDb.host === 'demo-destination');

    if (isDemo) {
      const result = PostgresCompareService.getDemoComparison(components);
      return NextResponse.json(result);
    }

    // 2. Perform live connection comparisons
    if (!sourceDb || !destinationDb) {
      return NextResponse.json(
        { error: 'Connection parameters are required for both source and destination databases' },
        { status: 400 }
      );
    }

    // Extract schemas concurrently
    const [sourceSnapshot, destSnapshot] = await Promise.all([
      PostgresCompareService.extractSchema(sourceDb, components),
      PostgresCompareService.extractSchema(destinationDb, components),
    ]);

    // Compare snapshots
    const result = PostgresCompareService.compareSchemas(sourceSnapshot, destSnapshot, components);
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'An error occurred during schema comparison' },
      { status: 500 }
    );
  }
}
