// app/api/compare-extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PostgresCompareService } from '@/lib/services/postgresCompareService';

export async function POST(request: NextRequest) {
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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendLog = (message: string) => {
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
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'data', payload: componentData }) + '\n'));
          }
        } catch (err: any) {
          console.error(`[compare-extract] Error during component ${component} extraction:`, err);
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
    return NextResponse.json(
      { error: error.message || 'An error occurred during component extraction' },
      { status: 500 }
    );
  }
}
