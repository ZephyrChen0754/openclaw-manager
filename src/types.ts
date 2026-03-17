import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export type RunStatus =
  | 'accepted'
  | 'queued'
  | 'running'
  | 'waiting_human'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'superseded';

export type EventType =
  | 'message_received'
  | 'run_started'
  | 'skill_invoked'
  | 'skill_completed'
  | 'tool_called'
  | 'artifact_created'
  | 'state_changed'
  | 'summary_refreshed'
  | 'blocker_detected'
  | 'human_decision_requested'
  | 'human_decision_resolved'
  | 'external_trigger_bound'
  | 'session_shared'
  | 'session_archived';

export interface SessionRecord {
  session_id: string;
  title: string;
  objective: string;
  owner: string | null;
  source_channels: string[];
  current_state: string;
  active_run_id: string | null;
  priority: 'low' | 'normal' | 'high';
  blockers: string[];
  pending_human_decisions: string[];
  derived_summary: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface RunRecord {
  run_id: string;
  session_id: string;
  status: RunStatus;
  trigger: string;
  note: string;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface EventRecord {
  event_id: string;
  session_id: string;
  run_id: string;
  event_type: EventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SkillTraceRecord {
  trace_id: string;
  session_id: string;
  run_id: string;
  skill_name: string;
  skill_version: string | null;
  role: 'primary' | 'supporting' | 'observer';
  input_summary: string;
  output_summary: string;
  outcome: 'advanced' | 'neutral' | 'regressed';
  latency_ms: number | null;
  timestamp: string;
}

export interface AttentionUnit {
  attention_id: string;
  session_id: string;
  kind: 'blocked' | 'waiting_human' | 'stale' | 'desynced' | 'high_value';
  priority: 'high' | 'normal' | 'low';
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface CapabilityFact {
  fact_id: string;
  session_id: string;
  scenario_signature: string;
  skill_name: string | null;
  workflow_name: string | null;
  style_family: string | null;
  variant_label: string | null;
  closure_type: string;
  metrics: Record<string, unknown>;
  confidence: number;
  sample_size: number;
  timestamp: string;
}

export interface CheckpointRecord {
  session_id: string;
  active_run_id: string | null;
  current_state: string;
  blockers: string[];
  pending_human_decisions: string[];
  artifact_refs: string[];
  next_machine_actions: string[];
  next_human_actions: string[];
  updated_at: string;
}

export interface SnapshotManifest {
  snapshot_id: string;
  session_id: string;
  snapshot_kind: 'task_snapshot' | 'run_evidence' | 'capability_snapshot';
  title: string;
  created_at: string;
  summary_path: string;
  html_path: string;
  metadata: Record<string, unknown>;
}

export interface NormalizedInboundMessage {
  request_id: string;
  external_trigger_id: string;
  source_type: string;
  source_thread_key: string;
  target_session_id?: string | null;
  message_type: string;
  content: string;
  attachments: Array<Record<string, unknown>>;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface AdoptSessionInput {
  title: string;
  objective: string;
  owner?: string | null;
  source_channels?: string[];
  priority?: 'low' | 'normal' | 'high';
  tags?: string[];
  initial_message?: string;
  metadata?: Record<string, unknown>;
}

export interface CheckpointInput {
  blockers?: string[];
  pending_human_decisions?: string[];
  next_machine_actions?: string[];
  next_human_actions?: string[];
  artifact_refs?: string[];
  summary?: string;
}

export interface CloseSessionInput {
  closure_type?: string;
  outcome?: string;
  notes?: string;
  style_family?: string | null;
  variant_label?: string | null;
  reusable_skill_name?: string | null;
}

export interface BindingRecord {
  binding_id: string;
  channel: string;
  external_thread_key: string;
  session_id: string;
  created_at: string;
}

export interface ManagerBridgePayload {
  manager_node_id: string;
  manager_session_id: string;
}

export const defaultStateRoot = () =>
  process.env.OPENCLAW_MANAGER_STATE_ROOT ||
  path.join(os.homedir(), '.openclaw', 'skills', 'manager');

export const nowIso = () => new Date().toISOString();

export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
