// app/api/compare-test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PostgresCompareService } from '@/lib/services/postgresCompareService';
import { executionLogService } from '@/lib/services/executionLogService';

export async function POST(request: NextRequest) {
  const executionId = request.headers.get('x-execution-id');
  const stepName = 'Database Handshake & Connection Test';

  try {
    const body = await request.json();
    const { sourceDb, destinationDb } = body;

    if (executionId) {
      executionLogService.addStep(executionId, stepName);
      executionLogService.addLog(executionId, stepName, 'info', 'Initiating connection test handshakes...');
    }

    const results = {
      source: { success: false, error: null as string | null },
      destination: { success: false, error: null as string | null },
    };

    const promises: Promise<any>[] = [];

    // Test Source
    if (sourceDb) {
      if (sourceDb.host === 'demo-source') {
        results.source = { success: true, error: null };
        if (executionId) {
          executionLogService.addLog(executionId, stepName, 'info', `Source DB (${sourceDb.database}): Connected to demo database.`);
        }
      } else {
        if (executionId) {
          executionLogService.addLog(executionId, stepName, 'info', `Source DB (${sourceDb.database}): Testing connection to host ${sourceDb.host}...`);
        }
        promises.push(
          PostgresCompareService.testConnection(sourceDb)
            .then(() => {
              results.source = { success: true, error: null };
              if (executionId) {
                executionLogService.addLog(executionId, stepName, 'info', `Source DB (${sourceDb.database}): Connection successful.`);
              }
            })
            .catch((err) => {
              results.source = { success: false, error: err.message };
              if (executionId) {
                executionLogService.addLog(executionId, stepName, 'error', `Source DB (${sourceDb.database}): Connection failed: ${err.message}`);
              }
            })
        );
      }
    }

    // Test Destination
    if (destinationDb) {
      if (destinationDb.host === 'demo-destination') {
        results.destination = { success: true, error: null };
        if (executionId) {
          executionLogService.addLog(executionId, stepName, 'info', `Destination DB (${destinationDb.database}): Connected to demo database.`);
        }
      } else {
        if (executionId) {
          executionLogService.addLog(executionId, stepName, 'info', `Destination DB (${destinationDb.database}): Testing connection to host ${destinationDb.host}...`);
        }
        promises.push(
          PostgresCompareService.testConnection(destinationDb)
            .then(() => {
              results.destination = { success: true, error: null };
              if (executionId) {
                executionLogService.addLog(executionId, stepName, 'info', `Destination DB (${destinationDb.database}): Connection successful.`);
              }
            })
            .catch((err) => {
              results.destination = { success: false, error: err.message };
              if (executionId) {
                executionLogService.addLog(executionId, stepName, 'error', `Destination DB (${destinationDb.database}): Connection failed: ${err.message}`);
              }
            })
        );
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    const overallSuccess = (!sourceDb || results.source.success) && (!destinationDb || results.destination.success);
    if (executionId) {
      if (overallSuccess) {
        executionLogService.updateStepStatus(executionId, stepName, 'success');
      } else {
        const errorMsg = [
          results.source.error ? `Source: ${results.source.error}` : null,
          results.destination.error ? `Destination: ${results.destination.error}` : null,
        ].filter(Boolean).join(' | ');
        executionLogService.updateStepStatus(executionId, stepName, 'failed', errorMsg);
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    if (executionId) {
      executionLogService.addLog(executionId, stepName, 'error', `Connection test error: ${error.message}`);
      executionLogService.updateStepStatus(executionId, stepName, 'failed', error.message);
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal connection test failure' },
      { status: 500 }
    );
  }
}
