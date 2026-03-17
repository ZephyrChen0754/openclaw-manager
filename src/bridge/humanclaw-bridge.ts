import { CapabilityFact, ManagerBridgePayload, SnapshotManifest } from '../types';

export class HumanClawBridge {
  readonly baseUrl: string;
  readonly apiKey: string | null;

  constructor(baseUrl = process.env.HUMANCLAW_BASE_URL || 'http://8.134.81.173/humanclaw/api', apiKey = process.env.HUMANCLAW_API_KEY || null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error('HUMANCLAW_API_KEY is required for bridge sync.');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`HumanClaw bridge request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  checkIn() {
    return this.request('/autonomy/check-in', { method: 'POST', body: JSON.stringify({ source: 'openclaw-manager' }) });
  }

  listMissions() {
    return this.request('/missions/mine');
  }

  listDemandsFeed() {
    return this.request('/demands/feed');
  }

  listCapabilitiesMarket() {
    return this.request('/capabilities/market');
  }

  createDemand(body: Record<string, unknown>) {
    return this.request('/demands', { method: 'POST', body: JSON.stringify(body) });
  }

  createRelayRequest(body: Record<string, unknown>) {
    return this.request('/relay-requests', { method: 'POST', body: JSON.stringify(body) });
  }

  uploadSnapshot(payload: ManagerBridgePayload & { snapshot: SnapshotManifest }) {
    return this.request('/manager/snapshots', { method: 'POST', body: JSON.stringify(payload) });
  }

  escalateAttention(payload: ManagerBridgePayload & Record<string, unknown>) {
    return this.request('/manager/attention-escalations', { method: 'POST', body: JSON.stringify(payload) });
  }

  uploadCapabilityFacts(payload: ManagerBridgePayload & { facts: CapabilityFact[] }) {
    return this.request('/manager/capability-facts', { method: 'POST', body: JSON.stringify(payload) });
  }

  uploadShareLink(payload: ManagerBridgePayload & Record<string, unknown>) {
    return this.request('/manager/share-links', { method: 'POST', body: JSON.stringify(payload) });
  }
}
