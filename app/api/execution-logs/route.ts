// app/api/execution-logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { executionLogService } from '@/lib/services/executionLogService';

export async function GET() {
  try {
    const logs = executionLogService.getExecutions();
    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch logs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id, sourceDb, destDb, components, status, error, stepName, level, message, details, result } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action parameter is required' }, { status: 400 });
    }

    if (!id) {
      return NextResponse.json({ error: 'Execution ID (id) is required' }, { status: 400 });
    }

    switch (action) {
      case 'start':
        executionLogService.startExecution(
          id,
          sourceDb || 'Unknown Source',
          destDb || 'Unknown Destination',
          components || []
        );
        break;

      case 'update':
        if (status !== 'success' && status !== 'failed') {
          return NextResponse.json({ error: 'Invalid execution status' }, { status: 400 });
        }
        executionLogService.updateExecutionStatus(id, status, error, result);
        break;

      case 'step_start':
        if (!stepName) {
          return NextResponse.json({ error: 'stepName parameter is required' }, { status: 400 });
        }
        executionLogService.addStep(id, stepName);
        break;

      case 'step_update':
        if (!stepName || (status !== 'success' && status !== 'failed')) {
          return NextResponse.json({ error: 'stepName and valid status are required' }, { status: 400 });
        }
        executionLogService.updateStepStatus(id, stepName, status, error);
        break;

      case 'log':
        if (!stepName || !message) {
          return NextResponse.json({ error: 'stepName and message are required' }, { status: 400 });
        }
        executionLogService.addLog(id, stepName, level || 'info', message, details);
        break;

      default:
        return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update logs' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    executionLogService.clear();
    return NextResponse.json({ success: true, message: 'Execution logs cleared' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to clear logs' }, { status: 500 });
  }
}
