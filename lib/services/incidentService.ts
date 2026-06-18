// lib/services/incidentService.ts
import { Incident } from './spikeDetectionService';

export class IncidentService {
  private static STORAGE_KEY = 'querypulse_incidents';

  static getIncidents(): Incident[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to parse querypulse incidents from storage', error);
      return [];
    }
  }

  static saveIncidents(incidents: Incident[]): void {
    if (typeof window === 'undefined') return;
    try {
      // Limit to storing the most recent 30 incidents to prevent localStorage bloating
      const pruned = incidents.slice(0, 30);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(pruned));
    } catch (error) {
      console.error('Failed to write querypulse incidents to storage', error);
    }
  }

  static clearIncidents(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear querypulse incidents', error);
    }
  }
}
