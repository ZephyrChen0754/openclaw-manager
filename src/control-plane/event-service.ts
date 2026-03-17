import { EventRecord, EventType, nowIso, uid } from '../types';
import { FsStore } from '../storage/fs-store';

export class EventService {
  constructor(private readonly store: FsStore) {}

  async append(sessionId: string, runId: string, eventType: EventType, payload: Record<string, unknown>) {
    const event: EventRecord = {
      event_id: uid('evt'),
      session_id: sessionId,
      run_id: runId,
      event_type: eventType,
      timestamp: nowIso(),
      payload,
    };
    await this.store.appendJsonl(this.store.eventsFile(sessionId, runId), event);
    return event;
  }

  async list(sessionId: string, runId: string) {
    return this.store.readJsonl<EventRecord>(this.store.eventsFile(sessionId, runId));
  }
}

