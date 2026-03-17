import express, { Request, Response } from 'express';
import { bootstrapManagerRuntime } from '../skill/bootstrap';
import { healthHandler } from './health';
import { inboundHandler } from './inbound';
import { CloseSessionInput, ManagerBridgePayload } from '../types';
import { HumanClawBridge } from '../bridge/humanclaw-bridge';

const startServer = async () => {
  const runtime = await bootstrapManagerRuntime();
  const bridge = new HumanClawBridge();
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', healthHandler(runtime.store));

  app.get('/sessions', async (_req: Request, res: Response) => {
    res.json(await runtime.sessionService.listSessions());
  });

  app.post('/sessions/adopt', async (req: Request, res: Response) => {
    const session = await runtime.sessionService.adopt(req.body || {});
    await runtime.attentionService.refresh(await runtime.sessionService.listSessions());
    res.status(201).json(session);
  });

  app.post('/sessions/:id/resume', async (req: Request, res: Response) => {
    const session = await runtime.sessionService.resume(String(req.params.id), String(req.body?.note || 'Resume requested'));
    await runtime.attentionService.refresh(await runtime.sessionService.listSessions());
    res.json(session);
  });

  app.post('/sessions/:id/checkpoint', async (req: Request, res: Response) => {
    const result = await runtime.sessionService.checkpoint(String(req.params.id), req.body || {});
    await runtime.attentionService.refresh(await runtime.sessionService.listSessions());
    res.json(result);
  });

  app.post('/sessions/:id/close', async (req: Request, res: Response) => {
    const session = await runtime.sessionService.close(String(req.params.id), (req.body || {}) as CloseSessionInput);
    const fact = await runtime.capabilityFactService.createFromClosure(session, req.body || {});
    const snapshot = await runtime.shareService.createSnapshot(session, 'capability_snapshot', { fact_id: fact.fact_id });
    await runtime.attentionService.refresh(await runtime.sessionService.listSessions());

    if (bridge.isConfigured()) {
      const payload: ManagerBridgePayload = {
        manager_node_id: process.env.OPENCLAW_MANAGER_NODE_ID || 'local-node',
        manager_session_id: session.session_id,
      };
      await bridge.uploadSnapshot({ ...payload, snapshot }).catch(() => undefined);
      await bridge.uploadCapabilityFacts({ ...payload, facts: [fact] }).catch(() => undefined);
    }

    res.json({
      session,
      capability_fact: fact,
      snapshot,
    });
  });

  app.get('/attention', async (_req: Request, res: Response) => {
    res.json(await runtime.attentionService.list());
  });

  app.post(
    '/inbound-message',
    inboundHandler(runtime.sessionService, runtime.eventService, runtime.attentionService, runtime.bindingService)
  );

  app.post('/share/:sessionId', async (req: Request, res: Response) => {
    const session = await runtime.sessionService.getSession(String(req.params.sessionId));
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const snapshot = await runtime.shareService.createSnapshot(
      session,
      (req.body?.snapshot_kind as 'task_snapshot' | 'run_evidence' | 'capability_snapshot') || 'task_snapshot',
      req.body?.metadata || {}
    );

    if (bridge.isConfigured()) {
      const payload: ManagerBridgePayload = {
        manager_node_id: process.env.OPENCLAW_MANAGER_NODE_ID || 'local-node',
        manager_session_id: session.session_id,
      };
      await bridge.uploadSnapshot({ ...payload, snapshot }).catch(() => undefined);
      await bridge.uploadShareLink({
        ...payload,
        snapshot_id: snapshot.snapshot_id,
        share_kind: snapshot.snapshot_kind,
        share_url: snapshot.html_path,
        manifest: snapshot,
      }).catch(() => undefined);
    }

    res.status(201).json(snapshot);
  });

  app.get('/exports/capability-facts', async (_req: Request, res: Response) => {
    res.json(await runtime.capabilityFactService.listAll());
  });

  app.post('/bridge/check-in', async (_req: Request, res: Response) => {
    if (!bridge.isConfigured()) {
      res.status(409).json({ error: 'HumanClaw bridge is not configured.' });
      return;
    }
    res.json(await bridge.checkIn());
  });

  app.use((error: Error, _req: Request, res: Response, _next: unknown) => {
    res.status(500).json({ error: error.message || 'Unexpected manager error.' });
  });

  const port = Number(process.env.PORT || 4318);
  return new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`OpenClaw Manager sidecar listening on ${port}`);
      resolve();
    });
  });
};

if (require.main === module) {
  void startServer();
}

export { startServer };
