// app/api/compare-extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PostgresCompareService } from '@/lib/services/postgresCompareService';
import { executionLogService } from '@/lib/services/executionLogService';

export async function POST(request: NextRequest) {
  const executionId = request.headers.get('x-execution-id');

  try {
    const body = await request.json();
    const { dbConfig, component, useDemo, demoTarget } = body;

    if (!component) {
      return NextResponse.json({ error: 'Component parameter is required' }, { status: 400 });
    }

    const validComponents = ['tables', 'views', 'functions', 'triggers', 'types', 'sequences'];
    if (!validComponents.includes(component)) {
      return NextResponse.json({ error: `Invalid component: ${component}` }, { status: 400 });
    }

    // 1. Check if demo mode
    const isDemo = useDemo || (dbConfig && (dbConfig.host === 'demo-source' || dbConfig.host === 'demo-destination'));
    const targetName = demoTarget || (dbConfig?.host === 'demo-source' ? 'source' : dbConfig?.host === 'demo-destination' ? 'destination' : 'live');
    const displayTarget = targetName.charAt(0).toUpperCase() + targetName.slice(1);
    const stepName = `Extracting ${component} (${displayTarget})`;

    if (executionId) {
      executionLogService.addStep(executionId, stepName);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendLog = (message: string) => {
          if (executionId) {
            executionLogService.addLog(executionId, stepName, 'info', message);
          }
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'log', message }) + '\n'));
        };

        try {
          if (isDemo) {
            const target = demoTarget || (dbConfig?.host === 'demo-source' ? 'source' : 'destination');
            sendLog(`Emulating ${component} extraction for Demo ${target}...`);
            await new Promise(resolve => setTimeout(resolve, 80));
            sendLog(`Loading ${component} snapshots from demo database...`);
            await new Promise(resolve => setTimeout(resolve, 100));
            sendLog(`Completed demo data mapping for [${component}].`);

            const fullSnapshot = PostgresCompareService.getDemoSnapshot(target as 'source' | 'destination');
            const componentData = fullSnapshot[component as keyof typeof fullSnapshot] || {};
            if (executionId) {
              executionLogService.addLog(executionId, stepName, 'info', `Successfully loaded ${Object.keys(componentData).length} ${component} from demo snapshot.`);
              executionLogService.updateStepStatus(executionId, stepName, 'success');
            }
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'data', payload: componentData }) + '\n'));
          } else {
            // 2. Live DB extraction
            if (!dbConfig || !dbConfig.host || !dbConfig.database || !dbConfig.username) {
              throw new Error('Database connection configuration is incomplete');
            }

            console.log(`[compare-extract] Initiating extraction for component: ${component}...`);
            sendLog(`Establishing secure database connection (${dbConfig.database} at ${dbConfig.host})...`);
            const snapshot = await PostgresCompareService.extractSchema(dbConfig, [component], (msg) => {
              sendLog(msg);
            });
            const componentData = snapshot[component as keyof typeof snapshot] || {};
            console.log(`[compare-extract] Component ${component} extracted:`, Object.keys(componentData).length, "items.");
            if (executionId) {
              executionLogService.addLog(executionId, stepName, 'info', `Successfully extracted ${Object.keys(componentData).length} ${component} from live database.`);
              executionLogService.updateStepStatus(executionId, stepName, 'success');
            }
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'data', payload: componentData }) + '\n'));
          }
        } catch (err: any) {
          console.error(`[compare-extract] Error during component ${component} extraction:`, err);
          if (executionId) {
            executionLogService.addLog(executionId, stepName, 'error', err.message || 'Extraction failed');
            executionLogService.updateStepStatus(executionId, stepName, 'failed', err.message || 'Extraction failed');
          }
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: err.message || 'Extraction failed' }) + '\n'));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  } catch (error: any) {
    const errorMsg = error.message || 'An error occurred during component extraction';
    if (executionId) {
      const fallbackStep = `Extracting Component (Pre-flight)`;
      executionLogService.addStep(executionId, fallbackStep);
      executionLogService.addLog(executionId, fallbackStep, 'error', errorMsg);
      executionLogService.updateStepStatus(executionId, fallbackStep, 'failed', errorMsg);
    }
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
