# Connector Protocol

External sources are normalized into a single inbound message shape before they touch the control plane.

```json
{
  "request_id": "req_...",
  "external_trigger_id": "ext_...",
  "source_type": "telegram",
  "source_thread_key": "thread_123",
  "target_session_id": "sess_...",
  "message_type": "user_message",
  "content": "New inbound content",
  "attachments": [],
  "timestamp": "2026-03-17T10:00:00.000Z",
  "metadata": {}
}
```

