// lib/mockDb.ts

export interface Application {
  id: string;
  name: string;
  environment: string; // Production, UAT, QA, Development
  appType: string; // Spring Boot, Java EE, Micronaut, Quarkus
  javaMelodyUrl?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  site24x7ApiKey?: string;
  dbType: string; // PostgreSQL, MySQL, Oracle
  cpuThreshold: number;
  memoryThreshold: number;
  queryTimeThreshold: number; // ms
  notificationChannels: string[]; // EMAIL, SLACK, TEAMS
  status: 'Healthy' | 'Warning' | 'Degraded';
}

export interface SqlQuery {
  id: string;
  queryText: string;
  queryType: 'SELECT' | 'UPDATE' | 'INSERT' | 'DELETE';
  executionCount: number;
  avgDurationMs: number;
  maxDurationMs: number;
  cpuImpactPct: number;
  severityScore: number;
  rowsProcessed: number;
  affectedTables: string[];
}

export interface MetricPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  jvmHeap: number;
  activeSessions: number;
  activeQueries: number;
  dbConnections: number;
  queryDuration: number;
  gcPauseTime: number;
}

export interface IncidentTimelineEvent {
  time: string;
  description: string;
  icon: string; // code, database, cpu, alert, etc
  type: 'info' | 'warning' | 'error' | 'critical';
}

export interface AiRootCause {
  summary: string;
  primaryQueryResponsible: string;
  affectedComponents: string[];
  possibleMissingIndexes: string[];
  queryRewriteSuggestions: string;
  databaseOptimizationSuggestions: string;
  infrastructureRecommendations: string;
  estimatedImprovementPercentage: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  recommendedActions: string[];
}

export interface Incident {
  id: string;
  applicationId: string;
  applicationName: string;
  environment: string;
  timestamp: string;
  title: string;
  cpu: number;
  memory: number;
  threadCount: number;
  activeSessions: number;
  activeQueriesCount: number;
  slowQueriesCount: number;
  status: 'ACTIVE' | 'RESOLVED';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  impactScore: number;
  durationMinutes: number;
  triggerMetric: string;
  timeline: IncidentTimelineEvent[];
  slowQueries: SqlQuery[];
  rootCause: AiRootCause;
  isSimulatedTuned?: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  applicationId: string;
  applicationName: string;
  metric: 'CPU' | 'Memory' | 'Query Duration' | 'Connection Pool';
  condition: 'GREATER_THAN' | 'LESS_THAN';
  threshold: number;
  durationMinutes: number;
  channels: ('EMAIL' | 'SLACK' | 'TEAMS')[];
  isEnabled: boolean;
}

export interface AlertHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  applicationName: string;
  timestamp: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'TRIGGERED' | 'RESOLVED';
}

export interface Integration {
  id: string;
  name: string;
  type: 'JavaMelody' | 'AWS CloudWatch' | 'Site24x7';
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'TESTING';
  lastSyncTime: string;
  syncLogs: string[];
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  orgName: string;
  apiKeys: { id: string; key: string; name: string; createdAt: string }[];
}

const DEFAULT_APPLICATIONS: Application[] = [
  {
    id: 'app-spicemoney',
    name: 'SpiceMoney Travel',
    environment: 'Production',
    appType: 'Spring Boot',
    javaMelodyUrl: 'https://travel.spicemoney.com/system/monitoring',
    dbType: 'PostgreSQL',
    cpuThreshold: 80,
    memoryThreshold: 85,
    queryTimeThreshold: 500,
    notificationChannels: ['SLACK', 'EMAIL'],
    status: 'Healthy',
  },
  {
    id: 'app-1',
    name: 'billing-service',
    environment: 'Production',
    appType: 'Spring Boot',
    javaMelodyUrl: 'https://billing.internal.acme.org/monitoring',
    dbType: 'PostgreSQL',
    cpuThreshold: 80,
    memoryThreshold: 85,
    queryTimeThreshold: 500,
    notificationChannels: ['SLACK', 'EMAIL'],
    status: 'Degraded',
  },
  {
    id: 'app-2',
    name: 'auth-provider',
    environment: 'Production',
    appType: 'Spring Boot',
    awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
    dbType: 'PostgreSQL',
    cpuThreshold: 75,
    memoryThreshold: 80,
    queryTimeThreshold: 300,
    notificationChannels: ['SLACK'],
    status: 'Warning',
  },
  {
    id: 'app-3',
    name: 'inventory-manager',
    environment: 'Production',
    appType: 'Java EE',
    site24x7ApiKey: 's247_xyz_9876543210',
    dbType: 'MySQL',
    cpuThreshold: 80,
    memoryThreshold: 80,
    queryTimeThreshold: 600,
    notificationChannels: ['EMAIL'],
    status: 'Healthy',
  },
  {
    id: 'app-4',
    name: 'order-processor',
    environment: 'Production',
    appType: 'Spring Boot',
    javaMelodyUrl: 'https://orders.internal.acme.org/monitoring',
    dbType: 'PostgreSQL',
    cpuThreshold: 80,
    memoryThreshold: 85,
    queryTimeThreshold: 500,
    notificationChannels: ['SLACK', 'EMAIL', 'TEAMS'],
    status: 'Healthy',
  },
  {
    id: 'app-5',
    name: 'search-indexer',
    environment: 'UAT',
    appType: 'Spring Boot',
    awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
    dbType: 'PostgreSQL',
    cpuThreshold: 90,
    memoryThreshold: 90,
    queryTimeThreshold: 1000,
    notificationChannels: ['TEAMS'],
    status: 'Healthy',
  },
  {
    id: 'app-6',
    name: 'recommendation-engine',
    environment: 'UAT',
    appType: 'Micronaut',
    javaMelodyUrl: 'https://recommend.internal.acme.org/monitoring',
    dbType: 'PostgreSQL',
    cpuThreshold: 85,
    memoryThreshold: 85,
    queryTimeThreshold: 800,
    notificationChannels: ['EMAIL'],
    status: 'Healthy',
  },
  {
    id: 'app-7',
    name: 'notification-hub',
    environment: 'QA',
    appType: 'Spring Boot',
    javaMelodyUrl: 'https://notifs.internal.acme.org/monitoring',
    dbType: 'PostgreSQL',
    cpuThreshold: 80,
    memoryThreshold: 80,
    queryTimeThreshold: 400,
    notificationChannels: ['EMAIL'],
    status: 'Healthy',
  },
  {
    id: 'app-8',
    name: 'analytics-dashboard',
    environment: 'QA',
    appType: 'Quarkus',
    site24x7ApiKey: 's247_xyz_9876543210',
    dbType: 'MySQL',
    cpuThreshold: 85,
    memoryThreshold: 90,
    queryTimeThreshold: 1200,
    notificationChannels: ['SLACK'],
    status: 'Healthy',
  },
  {
    id: 'app-9',
    name: 'payment-gateway',
    environment: 'Development',
    appType: 'Spring Boot',
    javaMelodyUrl: 'https://payments.dev.acme.org/monitoring',
    dbType: 'PostgreSQL',
    cpuThreshold: 70,
    memoryThreshold: 75,
    queryTimeThreshold: 200,
    notificationChannels: ['EMAIL'],
    status: 'Healthy',
  },
  {
    id: 'app-10',
    name: 'cart-checkout',
    environment: 'Development',
    appType: 'Spring Boot',
    dbType: 'PostgreSQL',
    cpuThreshold: 75,
    memoryThreshold: 80,
    queryTimeThreshold: 400,
    notificationChannels: ['EMAIL'],
    status: 'Healthy',
  },
];

const MOCK_SQL_QUERIES: SqlQuery[] = [];

const MOCK_INCIDENTS: Incident[] = [];

const DEFAULT_ALERT_RULES: AlertRule[] = [];

const DEFAULT_ALERT_HISTORY: AlertHistory[] = [];

const DEFAULT_INTEGRATIONS: Integration[] = [];

const DEFAULT_USER_PROFILE: UserProfile = {
  name: 'Soham Developer',
  email: 'soham@querypulse.ai',
  role: 'Administrator',
  orgName: 'Acme Observability Corp',
  apiKeys: [
    { id: 'key-1', key: 'qp_live_ae8f6b2167d3e230495f2d6c1b3f68a2', name: 'Production Agent Key', createdAt: new Date(Date.now() - 3600000 * 240).toISOString().split('T')[0] },
    { id: 'key-2', key: 'qp_test_892ba9cf821b02ea9aef34f195d824d6', name: 'UAT/Staging Key', createdAt: new Date(Date.now() - 3600000 * 12).toISOString().split('T')[0] },
  ],
};

// Generates simulated historical metric graph data (disabled for pure real-time data)
export function generateMetricsHistory(appId: string, durationHours: number = 24, isTuned: boolean = false): MetricPoint[] {
  return [];
}

// Global In-Memory state that is loaded from localStorage in the browser
let isClient = typeof window !== 'undefined';

class MockDatabase {
  private state: {
    applications: Application[];
    queries: SqlQuery[];
    incidents: Incident[];
    alertRules: AlertRule[];
    alertHistory: AlertHistory[];
    integrations: Integration[];
    userProfile: UserProfile;
  };

  constructor() {
    this.state = {
      applications: DEFAULT_APPLICATIONS,
      queries: MOCK_SQL_QUERIES,
      incidents: MOCK_INCIDENTS,
      alertRules: DEFAULT_ALERT_RULES,
      alertHistory: DEFAULT_ALERT_HISTORY,
      integrations: DEFAULT_INTEGRATIONS,
      userProfile: DEFAULT_USER_PROFILE,
    };
    this.load();
  }

  private load() {
    if (isClient) {
      try {
        const stored = localStorage.getItem('querypulse_mock_db');
        if (stored) {
          this.state = JSON.parse(stored);
        } else {
          this.save();
        }
      } catch (e) {
        console.error('Error loading mock db', e);
      }
    }
  }

  public save() {
    if (isClient) {
      try {
        localStorage.setItem('querypulse_mock_db', JSON.stringify(this.state));
      } catch (e) {
        console.error('Error saving mock db', e);
      }
    }
  }

  // Applications CRUD
  getApplications() {
    this.load();
    return this.state.applications;
  }

  getApplication(id: string) {
    this.load();
    return this.state.applications.find(a => a.id === id);
  }

  saveApplication(app: Partial<Application> & { name: string; environment: string; dbType: string }) {
    this.load();
    const id = app.id || `app-${Date.now()}`;
    const newApp: Application = {
      id,
      name: app.name,
      environment: app.environment,
      appType: app.appType || 'Spring Boot',
      javaMelodyUrl: app.javaMelodyUrl || '',
      awsAccessKey: app.awsAccessKey || '',
      awsSecretKey: app.awsSecretKey || '',
      site24x7ApiKey: app.site24x7ApiKey || '',
      dbType: app.dbType,
      cpuThreshold: app.cpuThreshold || 80,
      memoryThreshold: app.memoryThreshold || 85,
      queryTimeThreshold: app.queryTimeThreshold || 500,
      notificationChannels: app.notificationChannels || ['EMAIL'],
      status: app.status || 'Healthy',
    };

    const index = this.state.applications.findIndex(a => a.id === id);
    if (index > -1) {
      this.state.applications[index] = newApp;
    } else {
      this.state.applications.push(newApp);
    }
    this.save();
    return newApp;
  }

  deleteApplication(id: string) {
    this.load();
    this.state.applications = this.state.applications.filter(a => a.id !== id);
    this.state.alertRules = this.state.alertRules.filter(r => r.applicationId !== id);
    this.state.incidents = this.state.incidents.filter(i => i.applicationId !== id);
    this.save();
  }

  // Incidents
  getIncidents() {
    this.load();
    return this.state.incidents;
  }

  getIncident(id: string) {
    this.load();
    return this.state.incidents.find(i => i.id === id);
  }

  resolveIncident(id: string) {
    this.load();
    const index = this.state.incidents.findIndex(i => i.id === id);
    if (index > -1) {
      this.state.incidents[index].status = 'RESOLVED';
      
      // Update application status to Healthy if no other active incidents
      const appId = this.state.incidents[index].applicationId;
      const otherActive = this.state.incidents.some(i => i.applicationId === appId && i.status === 'ACTIVE' && i.id !== id);
      if (!otherActive) {
        const appIndex = this.state.applications.findIndex(a => a.id === appId);
        if (appIndex > -1) {
          this.state.applications[appIndex].status = 'Healthy';
        }
      }
      this.save();
    }
  }

  tuneIncident(id: string, isTuned: boolean) {
    this.load();
    const index = this.state.incidents.findIndex(i => i.id === id);
    if (index > -1) {
      this.state.incidents[index].isSimulatedTuned = isTuned;
      if (isTuned) {
        this.state.incidents[index].status = 'RESOLVED';
        const appId = this.state.incidents[index].applicationId;
        const appIndex = this.state.applications.findIndex(a => a.id === appId);
        if (appIndex > -1) {
          this.state.applications[appIndex].status = 'Healthy';
        }
      } else {
        this.state.incidents[index].status = 'ACTIVE';
        const appId = this.state.incidents[index].applicationId;
        const appIndex = this.state.applications.findIndex(a => a.id === appId);
        if (appIndex > -1) {
          this.state.applications[appIndex].status = this.state.incidents[index].severity === 'CRITICAL' ? 'Degraded' : 'Warning';
        }
      }
      this.save();
    }
  }

  // Alert Rules CRUD
  getAlertRules() {
    this.load();
    return this.state.alertRules;
  }

  saveAlertRule(rule: Partial<AlertRule> & { name: string; applicationId: string; metric: any; threshold: number }) {
    this.load();
    const id = rule.id || `rule-${Date.now()}`;
    const app = this.state.applications.find(a => a.id === rule.applicationId);
    
    const newRule: AlertRule = {
      id,
      name: rule.name,
      applicationId: rule.applicationId,
      applicationName: app ? app.name : 'Unknown Application',
      metric: rule.metric,
      condition: rule.condition || 'GREATER_THAN',
      threshold: rule.threshold,
      durationMinutes: rule.durationMinutes || 5,
      channels: rule.channels || ['EMAIL'],
      isEnabled: rule.isEnabled !== undefined ? rule.isEnabled : true,
    };

    const index = this.state.alertRules.findIndex(r => r.id === id);
    if (index > -1) {
      this.state.alertRules[index] = newRule;
    } else {
      this.state.alertRules.push(newRule);
    }
    this.save();
    return newRule;
  }

  deleteAlertRule(id: string) {
    this.load();
    this.state.alertRules = this.state.alertRules.filter(r => r.id !== id);
    this.save();
  }

  getAlertHistory() {
    this.load();
    return this.state.alertHistory;
  }

  // Integrations
  getIntegrations() {
    this.load();
    return this.state.integrations;
  }

  syncIntegration(id: string) {
    this.load();
    const index = this.state.integrations.findIndex(i => i.id === id);
    if (index > -1) {
      this.state.integrations[index].connectionStatus = 'TESTING';
      this.save();

      // Simulate API sync delay in mock
      setTimeout(() => {
        this.load();
        const innerIdx = this.state.integrations.findIndex(i => i.id === id);
        if (innerIdx > -1) {
          const nowStr = new Date().toISOString();
          const timeStr = nowStr.split('T')[1].substring(0, 8);
          this.state.integrations[innerIdx].connectionStatus = 'CONNECTED';
          this.state.integrations[innerIdx].lastSyncTime = nowStr;
          this.state.integrations[innerIdx].syncLogs.unshift(
            `${timeStr} INFO - Periodic sync triggered successfully.`,
            `${timeStr} INFO - Active metrics successfully pull-replicated.`,
            `${timeStr} INFO - Connection verified.`
          );
          if (this.state.integrations[innerIdx].syncLogs.length > 20) {
            this.state.integrations[innerIdx].syncLogs = this.state.integrations[innerIdx].syncLogs.slice(0, 20);
          }
          this.save();
        }
      }, 1500);
    }
  }

  // SQL Queries
  getQueries() {
    this.load();
    return this.state.queries;
  }

  // Settings
  getUserProfile() {
    this.load();
    return this.state.userProfile;
  }

  saveUserProfile(profile: { name: string; email: string; orgName: string }) {
    this.load();
    this.state.userProfile.name = profile.name;
    this.state.userProfile.email = profile.email;
    this.state.userProfile.orgName = profile.orgName;
    this.save();
  }

  saveApiKey(name: string) {
    this.load();
    const id = `key-${Date.now()}`;
    const key = `qp_${id.substring(4)}_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    const newKey = {
      id,
      key,
      name,
      createdAt: new Date().toISOString().split('T')[0],
    };
    this.state.userProfile.apiKeys.push(newKey);
    this.save();
    return newKey;
  }

  deleteApiKey(id: string) {
    this.load();
    this.state.userProfile.apiKeys = this.state.userProfile.apiKeys.filter(k => k.id !== id);
    this.save();
  }
}

// Singleton instances for Server / Client imports
const globalDbKey = Symbol.for('querypulse.mockdb');
type GlobalWithMockDb = typeof globalThis & { [globalDbKey]?: MockDatabase };

let db: MockDatabase;
if (typeof window !== 'undefined') {
  db = new MockDatabase();
} else {
  // Prevent multiple instantiations in Hot Module Replacement in Node.js
  const globalWithDb = globalThis as GlobalWithMockDb;
  if (!globalWithDb[globalDbKey]) {
    globalWithDb[globalDbKey] = new MockDatabase();
  }
  db = globalWithDb[globalDbKey]!;
}

export { db };
