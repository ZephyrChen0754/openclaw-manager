import express, { Request, Response } from 'express';
import { bootstrapManagerRuntime } from '../skill/bootstrap';
import { healthHandler } from './health';
import { connectorInboundHandler, inboundHandler } from './inbound';
import { CloseSessionInput, ManagerBridgePayload } from '../types';
import { HumanClawBridge } from '../bridge/humanclaw-bridge';
import { getConnectorAdapter, listConnectorAdapters } from '../connectors/registry';

const materializeBridgeAction = async (
  runtime: Awaited<ReturnType<typeof bootstrapManagerRuntime>>,
  action: Record<string, unknown>
) => {
  const mode = typeof action.mode === 'string' ? action.mode : 'standby';
  if (mode === 'standby') {
    return null;
  }

  const suggestedId = typeof action.suggested_id === 'string' ? action.suggested_id : null;
  const bridgeKey = `${mode}:${typeof action.suggested_resource === 'string' ? action.suggested_resource : 'resource'}:${suggestedId || 'none'}`;
  const sessions = await runtime.sessionService.listSessions();
  const existing = sessions.find((session) => session.metadata.bridge_key === bridgeKey) || null;

  let session = existing;
  if (!session) {
    session = await runtime.sessionService.adopt({
      title: typeof action.mode === 'string' ? `HumanClaw ${action.mode}` : 'HumanClaw bridge action',
      objective:
        (typeof action.next_action === 'string' && action.next_action) ||
        (typeof action.why_now === 'string' && action.why_now) ||
        'Work on the next best action returned by HumanClaw.',
      source_channels: ['humanclaw'],
      tags: ['humanclaw', mode],
      initial_message: typeof action.principal_script === 'string' ? action.principal_script : '',
      metadata: {
        bridge_key: bridgeKey,
        bridge_action: action,
      },
    });
  } else if (!session.active_run_id || session.current_state === 'archived') {
    session = await runtime.sessionService.resume(session.session_id, 'Resume HumanClaw bridge action.');
  }

  if (session.active_run_id) {
    await runtime.spoolService.append(session.session_id, session.active_run_id, 'bridge_action', action);
    await runtime.eventService.append(session.session_id, session.active_run_id, 'external_trigger_bound', {
      source_type: 'humanclaw',
      bridge_key: bridgeKey,
      mode,
      suggested_resource: action.suggested_resource,
      suggested_id: action.suggested_id,
    });
  }

  const refreshed = await runtime.sessionService.refreshIndexes();
  await runtime.attentionService.refresh(refreshed);
  return session;
};

const startServer = async () => {
  const runtime = await bootstrapManagerRuntime();
  const bridge = new HumanClawBridge();
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', healthHandler(runtime.store));

  app.get('/sessions', async (_req: Request, res: Response) => {
    res.json(await runtime.sessionService.listSessions());
  });

  app.get('/sessions/map', async (_req: Request, res: Response) => {
    res.json(await runtime.attentionService.sessionMap());
  });

  app.get('/sessions/digest', async (_req: Request, res: Response) => {
    const sessionMap = await runtime.attentionService.sessionMap();
    const focus = await runtime.attentionService.focus();
    const riskView = await runtime.attentionService.riskView();
    const driftView = await runtime.attentionService.driftView();
    res.json({
      session_map: sessionMap,
      focus,
      risk_view: riskView,
      drift_view: driftView,
    });
  });

  app.get('/sessions/:id', async (req: Request, res: Response) => {
    const session = await runtime.sessionService.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.json({
      session,
      runs: await runtime.sessionService.listRuns(session.session_id),
      attention: await runtime.attentionService.listForSession(session.session_id),
      shared_snapshots: await runtime.shareService.listSharedSnapshots(session.session_id),
    });
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

  app.get('/attention/focus', async (_req: Request, res: Response) => {
    res.json(await runtime.attentionService.focus());
  });

  app.get('/attention/risk', async (_req: Request, res: Response) => {
    res.json(await runtime.attentionService.riskView());
  });

  app.get('/attention/drift', async (_req: Request, res: Response) => {
    res.json(await runtime.attentionService.driftView());
  });

  app.post(
    '/inbound-message',
    inboundHandler(
      runtime.sessionService,
      runtime.eventService,
      runtime.attentionService,
      runtime.bindingService,
      runtime.spoolService
    )
  );

  app.get('/connectors', async (_req: Request, res: Response) => {
    const configs = await runtime.bindingService.listConnectorConfigs();
    res.json({
      adapters: listConnectorAdapters().map((adapter) => adapter.source_type),
      configs,
    });
  });

  app.post('/connectors/:name/config', async (req: Request, res: Response) => {
    const adapter = getConnectorAdapter(String(req.params.name));
    if (!adapter) {
      res.status(404).json({ error: 'Unknown connector.' });
      return;
    }
    const config = await runtime.bindingService.upsertConnectorConfig(
      adapter.defaultConfig(String(req.body?.identity_key || `${adapter.source_type}-default`))
    );
    res.status(201).json(config);
  });

  app.post('/connectors/:name/ingest', async (req: Request, res: Response, next: express.NextFunction) => {
    const adapter = getConnectorAdapter(String(req.params.name));
    if (!adapter) {
      res.status(404).json({ error: 'Unknown connector.' });
      return;
    }
    try {
      await connectorInboundHandler(
        adapter,
        runtime.sessionService,
        runtime.eventService,
        runtime.attentionService,
        runtime.bindingService,
        runtime.spoolService
      )(req, res);
    } catch (error) {
      next(error);
    }
  });

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

  app.get('/graph', async (_req: Request, res: Response) => {
    res.json(await runtime.capabilityFactService.graphSummary());
  });

  app.get('/exports/capability-facts', async (_req: Request, res: Response) => {
    res.json(await runtime.capabilityFactService.listAll());
  });

  app.get('/exports/capability-facts/anonymized', async (_req: Request, res: Response) => {
    res.json(await runtime.capabilityFactService.anonymizedExport());
  });

  app.post('/bridge/check-in', async (_req: Request, res: Response) => {
    if (!bridge.isConfigured()) {
      res.status(409).json({ error: 'HumanClaw bridge is not configured.' });
      return;
    }
    const bridgeResult = (await bridge.checkIn()) as Record<string, unknown>;
    const materialized = await materializeBridgeAction(runtime, bridgeResult);
    res.json({
      bridge_result: bridgeResult,
      materialized_session: materialized,
    });
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
