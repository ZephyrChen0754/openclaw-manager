import { SkillTraceRecord, nowIso, uid } from '../types';
import { FsStore } from '../storage/fs-store';

export class SkillTraceService {
  constructor(private readonly store: FsStore) {}

  async record(trace: Omit<SkillTraceRecord, 'trace_id' | 'timestamp'>) {
    const payload: SkillTraceRecord = {
      ...trace,
      trace_id: uid('trace'),
      timestamp: nowIso(),
    };
    await this.store.appendJsonl(this.store.skillTracesFile(trace.session_id, trace.run_id), payload);
    return payload;
  }

  async list(sessionId: string, runId: string) {
    return this.store.readJsonl<SkillTraceRecord>(this.store.skillTracesFile(sessionId, runId));
  }
}

