import { AttentionService } from '../control-plane/attention-service';
import { BindingService } from '../control-plane/binding-service';
import { SessionService } from '../control-plane/session-service';
import { ShareService } from '../control-plane/share-service';
import { CapabilityFactService } from '../telemetry/capability-facts';
import { renderDigestMarkdown } from '../exporters/markdown-report';
import { listConnectorAdapters } from '../connectors/registry';

export const buildCommandRegistry = (
  sessions: SessionService,
  attention: AttentionService,
  bindings: BindingService,
  share: ShareService,
  capabilityFacts: CapabilityFactService
) => ({
  '/tasks': async () => ({
    session_map: await attention.sessionMap(),
    connectors: listConnectorAdapters().map((adapter) => adapter.source_type),
  }),
  '/resume': (sessionId: string) => sessions.resume(sessionId),
  '/share': async (sessionId: string, input?: { snapshot_kind?: 'task_snapshot' | 'run_evidence' | 'capability_snapshot'; related_run_id?: string }) => {
    const session = await sessions.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found.');
    }
    return share.createSnapshot(session, input?.snapshot_kind || 'task_snapshot', {
      related_run_id: input?.related_run_id || session.active_run_id,
    });
  },
  '/bind': async (input: { channel: string; external_thread_key: string; session_id: string; identity_key?: string }) => {
    const binding = await bindings.add(input);
    const adapter = listConnectorAdapters().find((item) => item.source_type === input.channel);
    if (adapter) {
      await bindings.upsertConnectorConfig(adapter.defaultConfig(input.identity_key || `${input.channel}-default`));
    }
    return binding;
  },
  '/focus': () => attention.focus(),
  '/graph': () => capabilityFacts.graphSummary(),
  '/digest': async () => {
    const sessionMap = await attention.sessionMap();
    const focus = await attention.focus();
    const riskView = await attention.riskView();
    const driftView = await attention.driftView();
    return {
      session_map: sessionMap,
      focus,
      risk_view: riskView,
      drift_view: driftView,
      markdown: renderDigestMarkdown({ sessionMap, focus, riskView, driftView }),
    };
  },
  '/checkpoint': (sessionId: string, input?: Record<string, unknown>) => sessions.checkpoint(sessionId, input || {}),
  '/close': (sessionId: string, input?: Record<string, unknown>) => sessions.close(sessionId, input || {}),
  '/adopt': (input: Record<string, unknown>) =>
    sessions.adopt({
      title: String(input.title || 'Untitled session'),
      objective: String(input.objective || 'Resume work from current chat'),
      owner: (input.owner as string) || null,
      source_channels: Array.isArray(input.source_channels) ? (input.source_channels as string[]) : ['chat'],
      tags: Array.isArray(input.tags) ? (input.tags as string[]) : [],
      initial_message: (input.initial_message as string) || '',
      metadata: typeof input.metadata === 'object' && input.metadata ? (input.metadata as Record<string, unknown>) : {},
    }),
});

export type CommandRegistry = ReturnType<typeof buildCommandRegistry>;
