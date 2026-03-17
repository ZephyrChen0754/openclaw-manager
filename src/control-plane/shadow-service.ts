import {
  AdoptSessionInput,
  NormalizedInboundMessage,
  PromotionQueueEntry,
  PromotionReason,
  SessionRecord,
  ThreadShadow,
  nowIso,
  uid,
} from '../types';
import { FsStore } from '../storage/fs-store';
import { writePromotionQueue, writeThreadShadows } from '../storage/indexes';
import { withNamedLock } from '../storage/locks';
import { AttentionService } from './attention-service';
import { BindingService } from './binding-service';
import { EventService } from './event-service';
import { SessionService } from './session-service';
import { SpoolService } from './spool-service';

const summarize = (text: string, max = 160) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
};

const uniqueReasons = (reasons: PromotionReason[]) => Array.from(new Set(reasons));

const uniqueStrings = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const asRecord = (value: unknown) =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const inferHighPriority = (message: NormalizedInboundMessage) => {
  const metadata = asRecord(message.metadata);
  return metadata.high_priority === true || metadata.priority === 'high';
};

const needsConnectorFollowup = (message: NormalizedInboundMessage) => {
  const metadata = asRecord(message.metadata);
  return metadata.requires_followup === true || message.message_type === 'followup_required';
};

const threadTitle = (message: NormalizedInboundMessage) => {
  const metadata = asRecord(message.metadata);
  const explicit =
    (typeof metadata.thread_title === 'string' && metadata.thread_title) ||
    (typeof metadata.chat_title === 'string' && metadata.chat_title) ||
    (typeof metadata.repo === 'string' && metadata.repo) ||
    '';
  return explicit || `Observed ${message.source_type} thread`;
};

const promotionScore = (shadow: ThreadShadow) => {
  const recencyHours = Math.max(0, (Date.now() - new Date(shadow.last_message_at).getTime()) / 36e5);
  const recencyBonus = Math.max(0, 20 - recencyHours * 2);
  return Math.round(
    shadow.turn_count * 12 +
      shadow.promotion_reasons.length * 15 +
      (shadow.high_priority ? 30 : 0) +
      (shadow.source_type !== 'chat' ? 6 : 0) +
      recencyBonus
  );
};

const toQueueEntry = (shadow: ThreadShadow): PromotionQueueEntry => ({
  shadow_id: shadow.shadow_id,
  title: shadow.title,
  source_type: shadow.source_type,
  source_thread_key: shadow.source_thread_key,
  state: shadow.state,
  turn_count: shadow.turn_count,
  promotion_reasons: shadow.promotion_reasons,
  promotion_score: promotionScore(shadow),
  latest_summary: shadow.latest_summary,
  last_message_at: shadow.last_message_at,
  linked_session_id: shadow.linked_session_id,
});

const detectPromotionReasons = (
  shadow: ThreadShadow,
  message: NormalizedInboundMessage,
  options: {
    manual_adopt?: boolean;
    high_priority?: boolean;
  } = {}
): PromotionReason[] => {
  const metadata = asRecord(message.metadata);
  const next = [...shadow.promotion_reasons];

  if (shadow.turn_count >= 3) {
    next.push('turn_threshold');
  }
  if (message.message_type === 'tool_called' || metadata.tool_called === true) {
    next.push('tool_called');
  }
  if (message.message_type === 'artifact_created' || metadata.artifact_created === true) {
    next.push('artifact_created');
  }
  if (message.message_type === 'skill_invoked' || metadata.skill_invoked === true) {
    next.push('skill_invoked');
  }
  if (message.message_type === 'blocked' || metadata.current_state === 'blocked') {
    next.push('blocked');
  }
  if (message.message_type === 'waiting_human' || metadata.current_state === 'waiting_human') {
    next.push('waiting_human');
  }
  if (needsConnectorFollowup(message)) {
    next.push('connector_followup');
  }
  if (options.manual_adopt) {
    next.push('manual_adopt');
  }
  if (options.high_priority || inferHighPriority(message)) {
    next.push('high_priority');
  }

  return uniqueReasons(next);
};

const defaultObjective = (shadow: ThreadShadow) => {
  if (shadow.source_type === 'chat') {
    return 'Continue the observed local thread as a managed session.';
  }
  return `Follow up on the observed ${shadow.source_type} thread.`;
};

export class ShadowService {
  constructor(
    private readonly store: FsStore,
    private readonly sessionService: SessionService,
    private readonly eventService: EventService,
    private readonly attentionService: AttentionService,
    private readonly bindingService: BindingService,
    private readonly spoolService: SpoolService
  ) {}

  private async readShadows() {
    return this.store.readJson<ThreadShadow[]>(this.store.threadShadowsFile, []);
  }

  private async writeShadows(shadows: ThreadShadow[]) {
    const normalized = shadows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const queue = normalized
      .filter((shadow) => !shadow.linked_session_id && shadow.state !== 'archived')
      .filter((shadow) => shadow.state === 'candidate' || shadow.turn_count >= 2 || shadow.high_priority)
      .map(toQueueEntry)
      .sort((a, b) => b.promotion_score - a.promotion_score || b.last_message_at.localeCompare(a.last_message_at));

    await writeThreadShadows(this.store, normalized);
    await writePromotionQueue(this.store, queue);
  }

  private shadowState(shadow: ThreadShadow, shouldPromote: boolean) {
    if (shadow.archived_at) {
      return 'archived' as const;
    }
    if (shadow.linked_session_id || shouldPromote) {
      return 'promoted' as const;
    }
    if (shadow.turn_count >= 2 || shadow.high_priority) {
      return 'candidate' as const;
    }
    return 'observed' as const;
  }

  private upsertObservedShadow(
    shadows: ThreadShadow[],
    message: NormalizedInboundMessage,
    options: {
      linked_session_id?: string | null;
      manual_adopt?: boolean;
      high_priority?: boolean;
    } = {}
  ) {
    const index = shadows.findIndex(
      (item) =>
        item.source_type === message.source_type && item.source_thread_key === message.source_thread_key
    );
    const existing = index >= 0 ? shadows[index] : null;
    const now = nowIso();
    const highPriority =
      (options.high_priority ?? inferHighPriority(message)) || existing?.high_priority || false;
    const base: ThreadShadow =
      existing || {
        shadow_id: uid('shadow'),
        source_type: message.source_type,
        source_thread_key: message.source_thread_key,
        title: threadTitle(message),
        latest_summary: summarize(message.content),
        turn_count: 0,
        last_message_at: message.timestamp || now,
        state: 'observed',
        promotion_reasons: [],
        linked_session_id: null,
        high_priority: false,
        metadata: {},
        created_at: now,
        updated_at: now,
        archived_at: null,
      };

    const next: ThreadShadow = {
      ...base,
      title: base.title || threadTitle(message),
      latest_summary: summarize(message.content) || base.latest_summary,
      turn_count: base.turn_count + 1,
      last_message_at: message.timestamp || now,
      high_priority: highPriority,
      linked_session_id: options.linked_session_id ?? base.linked_session_id,
      metadata: {
        ...base.metadata,
        ...asRecord(message.metadata),
        last_message_type: message.message_type,
        last_message_id: message.source_message_id || null,
        last_author_id: message.source_author_id || null,
        last_author_name: message.source_author_name || null,
      },
      updated_at: now,
      archived_at: options.linked_session_id ? null : base.archived_at,
    };
    const reasons = detectPromotionReasons(next, message, options);
    const shouldPromote = !next.linked_session_id && reasons.length > 0;
    next.promotion_reasons = reasons;
    next.state = this.shadowState(next, shouldPromote);

    if (index >= 0) {
      shadows[index] = next;
    } else {
      shadows.push(next);
    }

    return { shadow: next, shouldPromote, reasons };
  }

  private async appendInboundToSession(session: SessionRecord, message: NormalizedInboundMessage) {
    let target = session;
    if (!target.active_run_id || target.current_state === 'archived') {
      target = await this.sessionService.resume(
        target.session_id,
        `Resume from ${message.source_type} thread update.`
      );
    }

    if (!target.active_run_id) {
      throw new Error(`Session ${target.session_id} has no active run after inbound processing.`);
    }

    await this.eventService.append(target.session_id, target.active_run_id, 'message_received', {
      source_type: message.source_type,
      source_thread_key: message.source_thread_key,
      source_message_id: message.source_message_id,
      source_author_id: message.source_author_id,
      source_author_name: message.source_author_name,
      content: message.content,
    });
    await this.spoolService.appendInbound(target.session_id, target.active_run_id, message);

    const sessions = await this.sessionService.refreshIndexes();
    await this.attentionService.refresh(sessions);
    return target;
  }

  async listShadows() {
    const shadows = await this.readShadows();
    return shadows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async listPromotionQueue() {
    return this.store.readJson<PromotionQueueEntry[]>(this.store.promotionQueueFile, []);
  }

  async getShadow(shadowId: string) {
    const shadows = await this.readShadows();
    return shadows.find((shadow) => shadow.shadow_id === shadowId) || null;
  }

  async findByThread(sourceType: string, sourceThreadKey: string) {
    const shadows = await this.readShadows();
    return (
      shadows.find(
        (shadow) =>
          shadow.source_type === sourceType && shadow.source_thread_key === sourceThreadKey
      ) || null
    );
  }

  async focusCandidates(limit = 5) {
    const queue = await this.listPromotionQueue();
    return queue.slice(0, limit);
  }

  async archiveShadow(shadowId: string) {
    return withNamedLock('manager:thread-shadows', async () => {
      const shadows = await this.readShadows();
      const index = shadows.findIndex((shadow) => shadow.shadow_id === shadowId);
      if (index < 0) {
        throw new Error(`Thread shadow not found: ${shadowId}`);
      }
      const next: ThreadShadow = {
        ...shadows[index],
        state: 'archived',
        archived_at: nowIso(),
        updated_at: nowIso(),
      };
      shadows[index] = next;
      await this.writeShadows(shadows);
      return next;
    });
  }

  private async promoteFromShadows(
    shadows: ThreadShadow[],
    index: number,
    input: Partial<AdoptSessionInput> = {},
    extraReasons: PromotionReason[] = []
  ) {
    const shadow = shadows[index];
    let session =
      shadow.linked_session_id ? await this.sessionService.getSession(shadow.linked_session_id) : null;

    if (!session) {
      session = await this.sessionService.adopt({
        title: input.title?.trim() || shadow.title,
        objective: input.objective?.trim() || defaultObjective(shadow),
        owner: input.owner ?? null,
        source_channels: uniqueStrings([shadow.source_type, ...(input.source_channels || [])]),
        priority: input.priority || (shadow.high_priority ? 'high' : 'normal'),
        tags: uniqueStrings(['shadow-promoted', ...(input.tags || [])]),
        initial_message: input.initial_message?.trim() || shadow.latest_summary,
        metadata: {
          ...shadow.metadata,
          ...(input.metadata || {}),
          shadow_id: shadow.shadow_id,
          source_thread_key: shadow.source_thread_key,
          promotion_reasons: uniqueReasons([...shadow.promotion_reasons, ...extraReasons]),
        },
      });
    } else if (!session.active_run_id || session.current_state === 'archived') {
      session = await this.sessionService.resume(session.session_id, 'Resume promoted thread shadow.');
    }

    if (shadow.source_thread_key) {
      await this.bindingService.add({
        channel: shadow.source_type,
        external_thread_key: shadow.source_thread_key,
        session_id: session.session_id,
      });
    }

    const nextShadow: ThreadShadow = {
      ...shadow,
      state: 'promoted',
      linked_session_id: session.session_id,
      promotion_reasons: uniqueReasons([...shadow.promotion_reasons, ...extraReasons]),
      updated_at: nowIso(),
      archived_at: null,
    };
    shadows[index] = nextShadow;
    await this.writeShadows(shadows);

    const sessions = await this.sessionService.refreshIndexes();
    await this.attentionService.refresh(sessions);

    return {
      shadow: nextShadow,
      session,
    };
  }

  async promoteShadow(
    shadowId: string,
    input: Partial<AdoptSessionInput> = {},
    extraReasons: PromotionReason[] = []
  ) {
    return withNamedLock('manager:thread-shadows', async () => {
      const shadows = await this.readShadows();
      const index = shadows.findIndex((shadow) => shadow.shadow_id === shadowId);
      if (index < 0) {
        throw new Error(`Thread shadow not found: ${shadowId}`);
      }
      return this.promoteFromShadows(shadows, index, input, extraReasons);
    });
  }

  async manualAdopt(input: Record<string, unknown>) {
    return withNamedLock('manager:thread-shadows', async () => {
      const shadowId = typeof input.shadow_id === 'string' ? input.shadow_id : null;
      if (shadowId) {
        const shadows = await this.readShadows();
        const index = shadows.findIndex((shadow) => shadow.shadow_id === shadowId);
        if (index < 0) {
          throw new Error(`Thread shadow not found: ${shadowId}`);
        }
        return this.promoteFromShadows(shadows, index, {
          title: typeof input.title === 'string' ? input.title : undefined,
          objective: typeof input.objective === 'string' ? input.objective : undefined,
          owner: typeof input.owner === 'string' ? input.owner : undefined,
          source_channels: Array.isArray(input.source_channels) ? (input.source_channels as string[]) : undefined,
          priority:
            input.priority === 'low' || input.priority === 'normal' || input.priority === 'high'
              ? input.priority
              : undefined,
          tags: Array.isArray(input.tags) ? (input.tags as string[]) : undefined,
          initial_message: typeof input.initial_message === 'string' ? input.initial_message : undefined,
          metadata: asRecord(input.metadata),
        }, ['manual_adopt']);
      }

      const sourceType = typeof input.source_type === 'string' ? input.source_type : 'chat';
      const sourceThreadKey =
        typeof input.source_thread_key === 'string' && input.source_thread_key.trim()
          ? input.source_thread_key.trim()
          : `manual:${uid('thread')}`;
      const message: NormalizedInboundMessage = {
        request_id: uid('req'),
        external_trigger_id: uid('evt'),
        source_type: sourceType,
        source_thread_key: sourceThreadKey,
        source_message_id: null,
        source_author_id: null,
        source_author_name: null,
        target_session_id: null,
        message_type: 'user_message',
        content:
          (typeof input.initial_message === 'string' && input.initial_message.trim()) ||
          (typeof input.objective === 'string' && input.objective.trim()) ||
          'Manual adoption requested.',
        attachments: [],
        timestamp: nowIso(),
        metadata: {
          ...asRecord(input.metadata),
          high_priority: input.priority === 'high',
          thread_title: typeof input.title === 'string' ? input.title : undefined,
        },
      };

      const shadows = await this.readShadows();
      const { shadow } = this.upsertObservedShadow(shadows, message, {
        manual_adopt: true,
        high_priority: input.priority === 'high',
      });
      const index = shadows.findIndex((item) => item.shadow_id === shadow.shadow_id);
      return this.promoteFromShadows(
        shadows,
        index,
        {
          title: typeof input.title === 'string' ? input.title : shadow.title,
          objective: typeof input.objective === 'string' ? input.objective : defaultObjective(shadow),
          owner: typeof input.owner === 'string' ? input.owner : undefined,
          source_channels: Array.isArray(input.source_channels) ? (input.source_channels as string[]) : undefined,
          priority:
            input.priority === 'low' || input.priority === 'normal' || input.priority === 'high'
              ? input.priority
              : undefined,
          tags: Array.isArray(input.tags) ? (input.tags as string[]) : undefined,
          initial_message:
            (typeof input.initial_message === 'string' && input.initial_message.trim()) || shadow.latest_summary,
          metadata: asRecord(input.metadata),
        },
        ['manual_adopt']
      );
    });
  }

  async handleInbound(message: NormalizedInboundMessage) {
    return withNamedLock('manager:thread-shadows', async () => {
      const binding = await this.bindingService.resolve(message.source_type, message.source_thread_key);
      const shadows = await this.readShadows();
      const linkedShadow =
        shadows.find(
          (shadow) =>
            shadow.source_type === message.source_type &&
            shadow.source_thread_key === message.source_thread_key
        ) || null;
      const targetSessionId =
        message.target_session_id || binding?.session_id || linkedShadow?.linked_session_id || null;
      const { shadow, shouldPromote } = this.upsertObservedShadow(shadows, message, {
        linked_session_id: targetSessionId,
      });

      if (targetSessionId) {
        const session = await this.sessionService.getSession(targetSessionId);
        if (!session) {
          shadow.linked_session_id = null;
          shadow.state = this.shadowState(shadow, shouldPromote);
        } else {
          const updatedSession = await this.appendInboundToSession(session, message);
          shadow.state = 'promoted';
          shadow.linked_session_id = updatedSession.session_id;
          await this.writeShadows(shadows);
          return {
            accepted: true,
            mode: 'promoted' as const,
            shadow_id: shadow.shadow_id,
            session_id: updatedSession.session_id,
            active_run_id: updatedSession.active_run_id,
          };
        }
      }

      if (shouldPromote) {
        const index = shadows.findIndex((item) => item.shadow_id === shadow.shadow_id);
        const promoted = await this.promoteFromShadows(shadows, index, {
          title: shadow.title,
          objective: defaultObjective(shadow),
          initial_message: message.content,
          metadata: {
            ...shadow.metadata,
            source_message_id: message.source_message_id,
            source_author_id: message.source_author_id,
            source_author_name: message.source_author_name,
          },
        });
        return {
          accepted: true,
          mode: 'promoted' as const,
          shadow_id: promoted.shadow.shadow_id,
          session_id: promoted.session.session_id,
          active_run_id: promoted.session.active_run_id,
        };
      }

      await this.writeShadows(shadows);
      return {
        accepted: true,
        mode: 'shadowed' as const,
        shadow_id: shadow.shadow_id,
      };
    });
  }
}
