import path from 'node:path';
import { AttentionUnit, SessionRecord } from '../types';
import { FsStore } from './fs-store';

export const writeSessionIndexes = async (store: FsStore, sessions: SessionRecord[]) => {
  await store.writeJson(path.join(store.indexesDir, 'sessions.json'), sessions);
  await store.writeJson(
    path.join(store.indexesDir, 'active_sessions.json'),
    sessions.filter((session) => !session.archived_at).map((session) => session.session_id)
  );
};

export const writeAttentionQueue = async (store: FsStore, items: AttentionUnit[]) => {
  await store.writeJson(path.join(store.indexesDir, 'attention_queue.json'), items);
};
