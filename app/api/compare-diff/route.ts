// app/api/compare-diff/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PostgresCompareService, DatabaseSchemaSnapshot } from '@/lib/services/postgresCompareService';
import { executionLogService } from '@/lib/services/executionLogService';

export async function POST(request: NextRequest) {
  const executionId = request.headers.get('x-execution-id');
  const stepName = 'DDL Drift Analysis';

  try {
    const body = await request.json();
    const { sourceSnapshot, destinationSnapshot, components } = body;

    if (executionId) {
      executionLogService.addStep(executionId, stepName);
      executionLogService.addLog(executionId, stepName, 'info', `Compiling snapshots and starting drift analysis for: [${components?.join(', ')}]...`);
    }

    if (!sourceSnapshot || !destinationSnapshot) {
      throw new Error('Both source and destination snapshots are required for comparison');
    }

    if (!components || !Array.isArray(components) || components.length === 0) {
      throw new Error('At least one component must be selected');
    }

    // Run diff analysis
    const result = PostgresCompareService.compareSchemas(
      sourceSnapshot as DatabaseSchemaSnapshot,
      destinationSnapshot as DatabaseSchemaSnapshot,
      components
    );

    if (executionId) {
      executionLogService.addLog(executionId, stepName, 'info', `Drift analysis completed successfully. Found ${result.summary.totalDrifts} drifts: ${result.summary.missingCount} missing, ${result.summary.extraCount} extra, ${result.summary.differentCount} drifted.`);
      executionLogService.updateStepStatus(executionId, stepName, 'success');
    }

    return NextResponse.json(result);
  } catch (error: any) {
    if (executionId) {
      executionLogService.addLog(executionId, stepName, 'error', error.message || 'Drift generation failed');
      executionLogService.updateStepStatus(executionId, stepName, 'failed', error.message || 'Drift generation failed');
    }
    return NextResponse.json(
      { error: error.message || 'An error occurred during schema diff generation' },
      { status: 500 }
    );
  }
}
