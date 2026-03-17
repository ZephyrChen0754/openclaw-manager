import path from 'node:path';
import { AdoptSessionInput, CheckpointInput, CloseSessionInput, SessionRecord, nowIso, uid } from '../types';
import { FsStore } from '../storage/fs-store';
import { writeSessionIndexes } from '../storage/indexes';
import { EventService } from './event-service';
import { RunService } from './run-service';
import { CheckpointService } from './checkpoint-service';
import { withNamedLock } from '../storage/locks';

export class SessionService {
  constructor(
    private readonly store: FsStore,
    private readonly runService: RunService,
    private readonly eventService: EventService,
    private readonly checkpointService: CheckpointService
  ) {}

  async listSessions(): Promise<SessionRecord[]> {
    const indexed = await this.store.readJson<SessionRecord[]>(path.join(this.store.indexesDir, 'sessions.json'), []);
    return indexed.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async getSession(sessionId: string) {
    return this.store.readJson<SessionRecord | null>(this.store.sessionFile(sessionId), null);
  }

  async adopt(input: AdoptSessionInput) {
    return withNamedLock('manager:sessions', async () => {
      const sessionId = uid('sess');
      const initialRun = await this.runService.create(sessionId, 'adopt', 'Initial adoption run');
      const session: SessionRecord = {
        session_id: sessionId,
        title: input.title.trim(),
        objective: input.objective.trim(),
        owner: input.owner ?? null,
        source_channels: input.source_channels ?? ['chat'],
        current_state: 'running',
        active_run_id: initialRun.run_id,
        priority: input.priority ?? 'normal',
        blockers: [],
        pending_human_decisions: [],
        derived_summary: input.initial_message?.trim() || 'Session adopted from an existing OpenClaw thread.',
        tags: input.tags ?? [],
        metadata: input.metadata ?? {},
        created_at: nowIso(),
        updated_at: nowIso(),
        archived_at: null,
      };

      await this.store.ensureSessionLayout(sessionId, initialRun.run_id);
      await this.store.writeJson(this.store.sessionFile(sessionId), session);
      await this.eventService.append(sessionId, initialRun.run_id, 'run_started', {
        trigger: 'adopt',
      });
      if (input.initial_message?.trim()) {
        await this.eventService.append(sessionId, initialRun.run_id, 'message_received', {
          content: input.initial_message.trim(),
        });
      }
      await this.checkpointService.upsert(session, {
        next_machine_actions: ['Continue the adopted work.'],
      });

      const sessions = await this.listSessions();
      await writeSessionIndexes(this.store, [session, ...sessions.filter((item) => item.session_id !== session.session_id)]);
      return session;
    });
  }

  async resume(sessionId: string, note = 'Resume existing session') {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const run = await this.runService.create(sessionId, 'resume', note);
    const next: SessionRecord = {
      ...session,
      current_state: 'running',
      active_run_id: run.run_id,
      updated_at: nowIso(),
      archived_at: null,
    };
    await this.store.writeJson(this.store.sessionFile(sessionId), next);
    await this.eventService.append(sessionId, run.run_id, 'run_started', {
      trigger: 'resume',
      note,
    });
    await this.checkpointService.upsert(next, {
      next_machine_actions: ['Resume from latest checkpoint.'],
    });
    await this.refreshIndexes();
    return next;
  }

  async checkpoint(sessionId: string, input: CheckpointInput = {}) {
    const session = await this.getSession(sessionId);
    if (!session || !session.active_run_id) {
      throw new Error(`Session not found or inactive: ${sessionId}`);
    }

    const next: SessionRecord = {
      ...session,
      blockers: input.blockers ?? session.blockers,
      pending_human_decisions: input.pending_human_decisions ?? session.pending_human_decisions,
      derived_summary: input.summary ?? session.derived_summary,
      updated_at: nowIso(),
    };
    await this.store.writeJson(this.store.sessionFile(sessionId), next);
    await this.eventService.append(sessionId, session.active_run_id, 'summary_refreshed', {
      summary: next.derived_summary,
    });
    const checkpoint = await this.checkpointService.upsert(next, input);
    await this.refreshIndexes();
    return { session: next, checkpoint };
  }

  async close(sessionId: string, input: CloseSessionInput = {}) {
    const session = await this.getSession(sessionId);
    if (!session || !session.active_run_id) {
      throw new Error(`Session not found or inactive: ${sessionId}`);
    }

    const next: SessionRecord = {
      ...session,
      current_state: input.outcome || 'completed',
      derived_summary: input.notes?.trim() || session.derived_summary,
      updated_at: nowIso(),
      archived_at: nowIso(),
    };

    await this.store.writeJson(this.store.sessionFile(sessionId), next);
    await this.runService.updateStatus(sessionId, session.active_run_id, 'completed', input.notes || 'Session closed');
    await this.eventService.append(sessionId, session.active_run_id, 'session_archived', {
      closure_type: input.closure_type || 'completed',
      notes: input.notes || '',
    });
    await this.checkpointService.upsert(next, {
      next_machine_actions: [],
      next_human_actions: [],
    });
    await this.refreshIndexes();
    return next;
  }

  async refreshIndexes() {
    const sessions = await this.listSessions();
    await writeSessionIndexes(this.store, sessions);
    return sessions;
  }
}

