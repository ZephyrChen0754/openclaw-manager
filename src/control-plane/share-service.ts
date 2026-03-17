import fs from 'node:fs/promises';
import path from 'node:path';
import { SessionRecord, SnapshotManifest, nowIso, uid } from '../types';
import { FsStore } from '../storage/fs-store';

export class ShareService {
  constructor(private readonly store: FsStore) {}

  async createSnapshot(session: SessionRecord, kind: SnapshotManifest['snapshot_kind'], metadata: Record<string, unknown> = {}) {
    const snapshotId = uid('snap');
    const snapshotDir = path.join(this.store.snapshotsDir, snapshotId);
    await fs.mkdir(snapshotDir, { recursive: true });

    const summaryPath = path.join(snapshotDir, 'summary.md');
    const htmlPath = path.join(snapshotDir, 'index.html');
    const managerSummary = await fs.readFile(this.store.summaryFile(session.session_id), 'utf8').catch(() => `# ${session.title}\n`);

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${session.title}</title>
  </head>
  <body>
    <h1>${session.title}</h1>
    <p><strong>Objective:</strong> ${session.objective}</p>
    <p><strong>Current state:</strong> ${session.current_state}</p>
    <pre>${managerSummary.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] || ch))}</pre>
  </body>
</html>
`;

    await fs.writeFile(summaryPath, managerSummary, 'utf8');
    await fs.writeFile(htmlPath, html, 'utf8');

    const manifest: SnapshotManifest = {
      snapshot_id: snapshotId,
      session_id: session.session_id,
      snapshot_kind: kind,
      title: session.title,
      created_at: nowIso(),
      summary_path: summaryPath,
      html_path: htmlPath,
      metadata,
    };

    await fs.writeFile(path.join(snapshotDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  }
}

