import { AttentionService } from '../control-plane/attention-service';
import { BindingService } from '../control-plane/binding-service';
import { SessionService } from '../control-plane/session-service';
import { ShareService } from '../control-plane/share-service';
import { CapabilityFactService } from '../telemetry/capability-facts';

export const buildCommandRegistry = (
  sessions: SessionService,
  attention: AttentionService,
  bindings: BindingService,
  share: ShareService,
  capabilityFacts: CapabilityFactService
) => ({
  '/tasks': () => sessions.listSessions(),
  '/resume': (sessionId: string) => sessions.resume(sessionId),
  '/share': async (sessionId: string) => {
    const session = await sessions.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found.');
    }
    return share.createSnapshot(session, 'task_snapshot');
  },
  '/bind': (input: { channel: string; external_thread_key: string; session_id: string }) => bindings.add(input),
  '/focus': () => attention.list(),
  '/graph': () => capabilityFacts.listAll(),
  '/digest': async () => {
    const sessionList = await sessions.listSessions();
    return sessionList.map((session) => ({
      session_id: session.session_id,
      title: session.title,
      current_state: session.current_state,
      blockers: session.blockers,
      pending_human_decisions: session.pending_human_decisions,
    }));
  },
  '/checkpoint': (sessionId: string) => sessions.checkpoint(sessionId),
  '/close': (sessionId: string, input?: Record<string, unknown>) => sessions.close(sessionId, input || {}),
  '/adopt': (input: Record<string, unknown>) =>
    sessions.adopt({
      title: String(input.title || 'Untitled session'),
      objective: String(input.objective || 'Resume work from current chat'),
      owner: (input.owner as string) || null,
      source_channels: Array.isArray(input.source_channels) ? (input.source_channels as string[]) : ['chat'],
      tags: Array.isArray(input.tags) ? (input.tags as string[]) : [],
      initial_message: (input.initial_message as string) || '',
    }),
});

export type CommandRegistry = ReturnType<typeof buildCommandRegistry>;
