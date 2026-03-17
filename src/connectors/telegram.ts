import { ConnectorAdapter } from './base';

export const telegramConnector: ConnectorAdapter = {
  source_type: 'telegram',
  normalize(payload) {
    return {
      request_id: String(payload.request_id || ''),
      external_trigger_id: String(payload.external_trigger_id || ''),
      source_type: 'telegram',
      source_thread_key: String(payload.source_thread_key || ''),
      target_session_id: (payload.target_session_id as string) || null,
      message_type: String(payload.message_type || 'user_message'),
      content: String(payload.content || ''),
      attachments: Array.isArray(payload.attachments) ? (payload.attachments as Array<Record<string, unknown>>) : [],
      timestamp: String(payload.timestamp || new Date().toISOString()),
      metadata: typeof payload.metadata === 'object' && payload.metadata ? (payload.metadata as Record<string, unknown>) : {},
    };
  },
};

