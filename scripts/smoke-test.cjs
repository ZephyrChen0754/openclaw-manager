const { bootstrapManagerRuntime } = require('../dist/skill/bootstrap.js');
const { telegramConnector } = require('../dist/connectors/telegram.js');

(async () => {
  const runtime = await bootstrapManagerRuntime();
  const session = await runtime.sessionService.adopt({
    title: 'Smoke Test Session',
    objective: 'Verify overview parity flow.',
    source_channels: ['chat'],
    initial_message: 'Start the smoke test flow.',
    tags: ['smoke', 'overview'],
  });
  await runtime.attentionService.refresh(await runtime.sessionService.listSessions());
  await runtime.sessionService.checkpoint(session.session_id, {
    blockers: ['Need external confirmation'],
    summary: 'Waiting on an external update to continue.',
    next_machine_actions: ['Watch for inbound update.'],
  });
  const resumed = await runtime.sessionService.resume(session.session_id, 'Resume from latest checkpoint');
  await runtime.skillTraceService.wrap(
    {
      session_id: resumed.session_id,
      run_id: resumed.active_run_id,
      skill_name: 'smoke-skill',
      role: 'primary',
      input_summary: 'Resume and complete the test task.',
    },
    async () => ({
      output_summary: 'Completed the simulated smoke task.',
      outcome: 'advanced',
      value: { ok: true },
    })
  );
  await runtime.bindingService.upsertConnectorConfig(telegramConnector.defaultConfig('telegram-smoke'));
  const normalized = telegramConnector.normalize({
    message: {
      chat: { id: 12345, title: 'Smoke Chat' },
      from: { id: 'agent-smoke', username: 'agent_smoke' },
      text: 'Inbound follow-up',
      message_id: 'msg-1',
      date: Math.floor(Date.now() / 1000),
    },
  });
  const snapshot = await runtime.shareService.createSnapshot(resumed, 'run_evidence', {
    related_run_id: resumed.active_run_id,
  });
  const closed = await runtime.sessionService.close(resumed.session_id, {
    closure_type: 'completed',
    notes: 'Smoke test completed.',
    outcome: 'completed',
    reusable_skill_name: 'smoke-skill',
  });
  const fact = await runtime.capabilityFactService.createFromClosure(closed, {
    closure_type: 'completed',
    reusable_skill_name: 'smoke-skill',
  });
  const graph = await runtime.capabilityFactService.graphSummary();
  const digest = await runtime.commands['/digest']();
  const focus = await runtime.attentionService.focus();

  process.stdout.write(
    `${JSON.stringify(
      {
        session_id: closed.session_id,
        normalized_source: normalized.source_type,
        snapshot_kind: snapshot.snapshot_kind,
        graph_nodes: graph.nodes.length,
        digest_sessions: digest.session_map.length,
        focus_items: focus.top_items.length,
        fact_id: fact.fact_id,
      },
      null,
      2
    )}\n`
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
