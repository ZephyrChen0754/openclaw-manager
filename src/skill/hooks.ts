import { SkillTraceService } from '../telemetry/skill-trace';

export const recordSkillInvocation = async (
  traces: SkillTraceService,
  params: {
    session_id: string;
    run_id: string;
    skill_name: string;
    skill_version?: string | null;
    role?: 'primary' | 'supporting' | 'observer';
    input_summary?: string;
    output_summary?: string;
    outcome?: 'advanced' | 'neutral' | 'regressed';
    latency_ms?: number | null;
  }
) =>
  traces.record({
    session_id: params.session_id,
    run_id: params.run_id,
    skill_name: params.skill_name,
    skill_version: params.skill_version ?? null,
    role: params.role ?? 'supporting',
    input_summary: params.input_summary ?? '',
    output_summary: params.output_summary ?? '',
    outcome: params.outcome ?? 'neutral',
    latency_ms: params.latency_ms ?? null,
  });

export const heartbeatMaintenance = async (callback: () => Promise<void>) => callback();

