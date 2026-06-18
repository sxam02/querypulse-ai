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
    if (isDemo) {
      const target = demoTarget || (dbConfig?.host === 'demo-source' ? 'source' : 'destination');
      const fullSnapshot = PostgresCompareService.getDemoSnapshot(target as 'source' | 'destination');
      
      // Return only the requested component
      const componentData = fullSnapshot[component as keyof typeof fullSnapshot] || {};
      return NextResponse.json({ [component]: componentData });
    }

    // 2. Live DB extraction
    if (!dbConfig || !dbConfig.host || !dbConfig.database || !dbConfig.username) {
      return NextResponse.json({ error: 'Database connection configuration is incomplete' }, { status: 400 });
    }

    const snapshot = await PostgresCompareService.extractSchema(dbConfig, [component]);
    return NextResponse.json({ [component]: snapshot[component as keyof typeof snapshot] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'An error occurred during component extraction' },
      { status: 500 }
    );
  }
}
