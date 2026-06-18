// app/api/compare-diff/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PostgresCompareService, DatabaseSchemaSnapshot } from '@/lib/services/postgresCompareService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceSnapshot, destinationSnapshot, components } = body;

    if (!sourceSnapshot || !destinationSnapshot) {
      return NextResponse.json(
        { error: 'Both source and destination snapshots are required for comparison' },
        { status: 400 }
      );
    }

    if (!components || !Array.isArray(components) || components.length === 0) {
      return NextResponse.json(
        { error: 'At least one component must be selected' },
        { status: 400 }
      );
    }

    // Run diff analysis
    const result = PostgresCompareService.compareSchemas(
      sourceSnapshot as DatabaseSchemaSnapshot,
      destinationSnapshot as DatabaseSchemaSnapshot,
      components
    );

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'An error occurred during schema diff generation' },
      { status: 500 }
    );
  }
}
