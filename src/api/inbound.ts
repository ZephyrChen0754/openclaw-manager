import { Request, Response } from 'express';
import { SessionService } from '../control-plane/session-service';
import { EventService } from '../control-plane/event-service';
import { AttentionService } from '../control-plane/attention-service';
import { BindingService } from '../control-plane/binding-service';
import { NormalizedInboundMessage } from '../types';

export const inboundHandler =
  (sessionService: SessionService, eventService: EventService, attentionService: AttentionService, bindingService: BindingService) =>
  async (req: Request, res: Response) => {
    const body = req.body as Partial<NormalizedInboundMessage>;
    if (!body.source_type || !body.source_thread_key || !body.content) {
      res.status(400).json({ error: 'source_type, source_thread_key, and content are required.' });
      return;
    }

    const binding = await bindingService.resolve(String(body.source_type), String(body.source_thread_key));
    let session = body.target_session_id
      ? await sessionService.getSession(body.target_session_id)
      : binding
        ? await sessionService.getSession(binding.session_id)
        : null;
    if (!session) {
      session = await sessionService.adopt({
        title: `Inbound ${body.source_type} thread`,
        objective: 'Handle new inbound message from external source.',
        source_channels: [String(body.source_type)],
        initial_message: String(body.content),
        metadata: { source_thread_key: body.source_thread_key },
      });
      await bindingService.add({
        channel: String(body.source_type),
        external_thread_key: String(body.source_thread_key),
        session_id: session.session_id,
      });
    } else if (session.active_run_id) {
      await eventService.append(session.session_id, session.active_run_id, 'message_received', {
        source_type: body.source_type,
        source_thread_key: body.source_thread_key,
        content: body.content,
      });
    }

    const sessions = await sessionService.refreshIndexes();
    await attentionService.refresh(sessions);

    res.status(202).json({
      accepted: true,
      session_id: session.session_id,
      active_run_id: session.active_run_id,
    });
  };
