import { AttentionUnit, SessionRecord, nowIso, uid } from '../types';
import { FsStore } from '../storage/fs-store';
import { writeAttentionQueue } from '../storage/indexes';

const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 36e5;

export class AttentionService {
  constructor(private readonly store: FsStore) {}

  deriveForSession(session: SessionRecord): AttentionUnit[] {
    const base = {
      session_id: session.session_id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    const items: AttentionUnit[] = [];

    if (session.current_state === 'blocked' || session.blockers.length) {
      items.push({
        attention_id: uid('attn'),
        kind: 'blocked',
        priority: 'high',
        summary: session.blockers[0] || 'Session is blocked.',
        ...base,
      });
    }

    if (session.current_state === 'waiting_human' || session.pending_human_decisions.length) {
      items.push({
        attention_id: uid('attn'),
        kind: 'waiting_human',
        priority: 'high',
        summary: session.pending_human_decisions[0] || 'Human decision is required.',
        ...base,
      });
    }

    if (!session.archived_at && hoursSince(session.updated_at) >= 24) {
      items.push({
        attention_id: uid('attn'),
        kind: 'stale',
        priority: 'normal',
        summary: 'Session is stale and needs review.',
        ...base,
      });
    }

    if (session.priority === 'high' && !session.archived_at) {
      items.push({
        attention_id: uid('attn'),
        kind: 'high_value',
        priority: 'normal',
        summary: 'High-priority session should stay in focus.',
        ...base,
      });
    }

    return items;
  }

  async refresh(allSessions: SessionRecord[]) {
    const items = allSessions.flatMap((session) => this.deriveForSession(session));
    await writeAttentionQueue(this.store, items);

    for (const session of allSessions) {
      await this.store.writeJson(this.store.attentionFile(session.session_id), items.filter((item) => item.session_id === session.session_id));
    }

    return items;
  }

  async list() {
    return this.store.readJson<AttentionUnit[]>(`${this.store.indexesDir}/attention_queue.json`, []);
  }
}

