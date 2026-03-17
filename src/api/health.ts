import { Request, Response } from 'express';
import { FsStore } from '../storage/fs-store';

export const healthHandler =
  (store: FsStore) =>
  async (_req: Request, res: Response) => {
    await store.ensureLayout();
    res.json({
      status: 'ok',
      product: 'openclaw-manager',
      state_root: store.rootDir,
      mode: 'filesystem-first',
    });
  };

