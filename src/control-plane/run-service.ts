import { RunRecord, RunStatus, nowIso, uid } from '../types';
import { FsStore } from '../storage/fs-store';

export class RunService {
  constructor(private readonly store: FsStore) {}

  async create(sessionId: string, trigger: string, note = '') {
    const run: RunRecord = {
      run_id: uid('run'),
      session_id: sessionId,
      status: 'running',
      trigger,
      note,
      started_at: nowIso(),
      updated_at: nowIso(),
      ended_at: null,
    };
    await this.store.ensureSessionLayout(sessionId, run.run_id);
    await this.store.writeJson(this.store.runFile(sessionId, run.run_id), run);
    await this.store.writeTextIfMissing(this.store.eventsFile(sessionId, run.run_id), '');
    await this.store.writeTextIfMissing(this.store.spoolFile(sessionId, run.run_id), '');
    await this.store.writeTextIfMissing(this.store.skillTracesFile(sessionId, run.run_id), '');
    return run;
  }

  async get(sessionId: string, runId: string) {
    return this.store.readJson<RunRecord | null>(this.store.runFile(sessionId, runId), null);
  }

  async updateStatus(sessionId: string, runId: string, status: RunStatus, note?: string) {
    const run = await this.get(sessionId, runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const ended = ['completed', 'failed', 'cancelled', 'superseded'].includes(status) ? nowIso() : run.ended_at;
    const next: RunRecord = {
      ...run,
      status,
      note: note ?? run.note,
      updated_at: nowIso(),
      ended_at: ended,
    };
    await this.store.writeJson(this.store.runFile(sessionId, runId), next);
    return next;
  }
}

