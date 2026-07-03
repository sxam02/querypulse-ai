export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
}

export interface ExecutionStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  logs: LogEntry[];
}

export interface Execution {
  id: string;
  timestamp: string;
  sourceDb: string;
  destDb: string;
  components: string[];
  status: 'running' | 'success' | 'failed';
  steps: ExecutionStep[];
  error?: string;
}

class ExecutionLogService {
  private executions: Execution[] = [];

  getExecutions() {
    return this.executions;
  }

  getExecution(id: string) {
    return this.executions.find(e => e.id === id);
  }

  startExecution(id: string, sourceDb: string, destDb: string, components: string[]) {
    const newExec: Execution = {
      id,
      timestamp: new Date().toISOString(),
      sourceDb,
      destDb,
      components,
      status: 'running',
      steps: []
    };
    this.executions.unshift(newExec);
    // Prevent memory leaks by keeping the last 50 execution runs
    if (this.executions.length > 50) {
      this.executions.pop();
    }
    return newExec;
  }

  updateExecutionStatus(id: string, status: 'success' | 'failed', error?: string) {
    const exec = this.getExecution(id);
    if (exec) {
      exec.status = status;
      if (error) exec.error = error;
    }
  }

  addStep(id: string, stepName: string) {
    const exec = this.getExecution(id);
    if (exec) {
      // Mark any other currently 'running' steps as success
      exec.steps.forEach(s => {
        if (s.status === 'running') {
          s.status = 'success';
          s.completedAt = new Date().toISOString();
          s.durationMs = new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
        }
      });

      const newStep: ExecutionStep = {
        name: stepName,
        status: 'running',
        startedAt: new Date().toISOString(),
        logs: []
      };
      exec.steps.push(newStep);
      return newStep;
    }
  }

  updateStepStatus(id: string, stepName: string, status: 'success' | 'failed', error?: string) {
    const exec = this.getExecution(id);
    if (exec) {
      const step = exec.steps.find(s => s.name === stepName);
      if (step) {
        step.status = status;
        step.completedAt = new Date().toISOString();
        step.durationMs = new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
        if (error) step.error = error;
      }
    }
  }

  addLog(id: string, stepName: string, level: 'info' | 'warn' | 'error', message: string, details?: any) {
    const exec = this.getExecution(id);
    if (exec) {
      let step = exec.steps.find(s => s.name === stepName);
      if (!step) {
        step = this.addStep(id, stepName);
      }
      if (step) {
        step.logs.push({
          timestamp: new Date().toISOString(),
          level,
          message,
          details
        });
      }
    }
  }

  clear() {
    this.executions = [];
  }
}

// Persist the singleton instance across hot reloads in development
const globalForExecutionLog = global as unknown as {
  executionLogServiceInstance: ExecutionLogService;
};

export const executionLogService =
  globalForExecutionLog.executionLogServiceInstance || new ExecutionLogService();

if (process.env.NODE_ENV !== 'production') {
  globalForExecutionLog.executionLogServiceInstance = executionLogService;
}
