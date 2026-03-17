import { CapabilityFact, CloseSessionInput, SessionRecord, nowIso, uid } from '../types';
import { buildClosureMetrics } from './closure-metrics';
import { deriveScenarioSignature } from './scenario-tagging';
import { EventService } from '../control-plane/event-service';
import { SkillTraceService } from './skill-trace';
import { FsStore } from '../storage/fs-store';

export class CapabilityFactService {
  constructor(
    private readonly store: FsStore,
    private readonly eventService: EventService,
    private readonly skillTraceService: SkillTraceService
  ) {}

  async createFromClosure(session: SessionRecord, closeInput: CloseSessionInput = {}) {
    if (!session.active_run_id) {
      throw new Error('Cannot create capability facts without an active run.');
    }

    const events = await this.eventService.list(session.session_id, session.active_run_id);
    const traces = await this.skillTraceService.list(session.session_id, session.active_run_id);
    const dominantTrace = traces.find((trace) => trace.outcome === 'advanced') || traces[0] || null;

    const fact: CapabilityFact = {
      fact_id: uid('fact'),
      session_id: session.session_id,
      scenario_signature: deriveScenarioSignature(session, closeInput.closure_type || 'completed'),
      skill_name: dominantTrace?.skill_name || closeInput.reusable_skill_name || null,
      workflow_name: 'openclaw-manager-control-plane',
      style_family: closeInput.style_family || null,
      variant_label: closeInput.variant_label || null,
      closure_type: closeInput.closure_type || 'completed',
      metrics: buildClosureMetrics(events, traces),
      confidence: traces.length ? 0.72 : 0.55,
      sample_size: Math.max(1, traces.length || events.length || 1),
      timestamp: nowIso(),
    };

    await this.store.appendJsonl(this.store.capabilityFactsFile, fact);
    return fact;
  }

  async listAll() {
    return this.store.readJsonl<CapabilityFact>(this.store.capabilityFactsFile);
  }
}

