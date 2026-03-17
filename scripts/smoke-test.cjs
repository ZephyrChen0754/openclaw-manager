const { bootstrapManagerRuntime } = require('../dist/skill/bootstrap.js');
const { buildNormalizedInbound } = require('../dist/connectors/base.js');
const { telegramConnector } = require('../dist/connectors/telegram.js');

(async () => {
  const runtime = await bootstrapManagerRuntime();

  const baseThread = {
    source_type: 'chat',
    source_thread_key: `smoke:${Date.now()}`,
    message_type: 'user_message',
    attachments: [],
  };

  const first = await runtime.shadowService.handleInbound(
    buildNormalizedInbound({
      ...baseThread,
      content: 'First turn in the observed local thread.',
    })
  );
  const second = await runtime.shadowService.handleInbound(
    buildNormalizedInbound({
      ...baseThread,
      content: 'Second turn keeps the thread under observation.',
    })
  );
  const third = await runtime.shadowService.handleInbound(
    buildNormalizedInbound({
      ...baseThread,
      content: 'Third turn should promote the shadow into a session.',
    })
  );

  if (first.mode !== 'shadowed' || second.mode !== 'shadowed' || third.mode !== 'promoted') {
    throw new Error('Shadow-first promotion flow did not behave as expected.');
  }

  const promotedSession = await runtime.sessionService.getSession(third.session_id);
  if (!promotedSession) {
    throw new Error('Promoted session was not created.');
  }

  await runtime.sessionService.checkpoint(promotedSession.session_id, {
    blockers: ['Need external confirmation'],
    summary: 'Waiting on an external update to continue.',
    next_machine_actions: ['Watch for inbound update.'],
  });
  const resumed = await runtime.sessionService.resume(
    promotedSession.session_id,
    'Resume from latest checkpoint'
  );

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

  const manual = await runtime.shadowService.manualAdopt({
    title: 'Manual Promotion Smoke',
    objective: 'Verify manual shadow promotion.',
    initial_message: 'Manual adoption should promote a synthetic shadow.',
    source_type: 'chat',
    source_thread_key: `manual:${Date.now()}`,
  });

  const connectorPayload = telegramConnector.normalize({
    message: {
      chat: { id: 12345, title: 'Smoke Chat' },
      from: { id: 'agent-smoke', username: 'agent_smoke' },
      text: 'Connector follow-up should promote immediately.',
      message_id: 'msg-1',
      date: Math.floor(Date.now() / 1000),
    },
  });
  connectorPayload.metadata.requires_followup = true;
  const connectorResult = await runtime.shadowService.handleInbound(connectorPayload);

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
  const focus = await runtime.commands['/focus']();
  const threads = await runtime.commands['/threads']();

  process.stdout.write(
    `${JSON.stringify(
      {
        shadow_modes: [first.mode, second.mode, third.mode],
        promoted_session_id: third.session_id,
        manual_session_id: manual.session.session_id,
        connector_mode: connectorResult.mode,
        snapshot_kind: snapshot.snapshot_kind,
        graph_nodes: graph.nodes.length,
        digest_sessions: digest.session_map.length,
        focus_candidates: focus.candidate_shadows.length,
        thread_count: threads.length,
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
