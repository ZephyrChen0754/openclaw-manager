import { Request, Response } from 'express';
import { SessionService } from '../control-plane/session-service';
import { EventService } from '../control-plane/event-service';
import { AttentionService } from '../control-plane/attention-service';
import { BindingService } from '../control-plane/binding-service';
import { NormalizedInboundMessage } from '../types';
import { SpoolService } from '../control-plane/spool-service';
import { ConnectorAdapter } from '../connectors/base';

const isValidInbound = (body: Partial<NormalizedInboundMessage>) =>
  Boolean(body.source_type && body.source_thread_key && body.content);

export const processInboundMessage = async (
  message: NormalizedInboundMessage,
  deps: {
    sessionService: SessionService;
    eventService: EventService;
    attentionService: AttentionService;
    bindingService: BindingService;
    spoolService: SpoolService;
  }
) => {
  const binding = await deps.bindingService.resolve(message.source_type, message.source_thread_key);
  let session = message.target_session_id
    ? await deps.sessionService.getSession(message.target_session_id)
    : binding
      ? await deps.sessionService.getSession(binding.session_id)
      : null;

  if (!session) {
    session = await deps.sessionService.adopt({
      title: `Inbound ${message.source_type} thread`,
      objective: 'Handle inbound work from an external source.',
      source_channels: [message.source_type],
      initial_message: message.content,
      metadata: {
        source_thread_key: message.source_thread_key,
        source_message_id: message.source_message_id,
        source_author_id: message.source_author_id,
        source_author_name: message.source_author_name,
      },
    });
    await deps.bindingService.add({
      channel: message.source_type,
      external_thread_key: message.source_thread_key,
      session_id: session.session_id,
    });
  } else if (!session.active_run_id || session.current_state === 'archived') {
    session = await deps.sessionService.resume(
      session.session_id,
      `External ${message.source_type} update resumed the session.`
    );
  }

  if (!session.active_run_id) {
    throw new Error(`Session ${session.session_id} has no active run after inbound processing.`);
  }

  await deps.eventService.append(session.session_id, session.active_run_id, 'message_received', {
    source_type: message.source_type,
    source_thread_key: message.source_thread_key,
    source_message_id: message.source_message_id,
    source_author_id: message.source_author_id,
    source_author_name: message.source_author_name,
    content: message.content,
  });
  await deps.spoolService.appendInbound(session.session_id, session.active_run_id, message);

  const sessions = await deps.sessionService.refreshIndexes();
  await deps.attentionService.refresh(sessions);

  return {
    accepted: true,
    session_id: session.session_id,
    active_run_id: session.active_run_id,
  };
};

export const inboundHandler =
  (
    sessionService: SessionService,
    eventService: EventService,
    attentionService: AttentionService,
    bindingService: BindingService,
    spoolService: SpoolService
  ) =>
  async (req: Request, res: Response) => {
    const body = req.body as Partial<NormalizedInboundMessage>;
    if (!isValidInbound(body)) {
      res.status(400).json({ error: 'source_type, source_thread_key, and content are required.' });
      return;
    }

    const result = await processInboundMessage(body as NormalizedInboundMessage, {
      sessionService,
      eventService,
      attentionService,
      bindingService,
      spoolService,
    });
    res.status(202).json(result);
  };

export const connectorInboundHandler =
  (
    connector: ConnectorAdapter,
    sessionService: SessionService,
    eventService: EventService,
    attentionService: AttentionService,
    bindingService: BindingService,
    spoolService: SpoolService
  ) =>
  async (req: Request, res: Response) => {
    const normalized = connector.normalize((req.body || {}) as Record<string, unknown>);
    const result = await processInboundMessage(normalized, {
      sessionService,
      eventService,
      attentionService,
      bindingService,
      spoolService,
    });
    res.status(202).json({
      connector: connector.source_type,
      normalized,
      ...result,
    });
  };
