import { SessionRecord, SnapshotManifest } from '../types';
import { ShareService } from '../control-plane/share-service';

export class SnapshotExporter {
  constructor(private readonly shareService: ShareService) {}

  exportTaskSnapshot(session: SessionRecord, metadata: Record<string, unknown> = {}): Promise<SnapshotManifest> {
    return this.shareService.createSnapshot(session, 'task_snapshot', metadata);
  }

  exportRunEvidence(session: SessionRecord, metadata: Record<string, unknown> = {}): Promise<SnapshotManifest> {
    return this.shareService.createSnapshot(session, 'run_evidence', metadata);
  }

  exportCapabilitySnapshot(session: SessionRecord, metadata: Record<string, unknown> = {}): Promise<SnapshotManifest> {
    return this.shareService.createSnapshot(session, 'capability_snapshot', metadata);
  }
}
