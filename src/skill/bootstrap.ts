import { FsStore } from '../storage/fs-store';
import { EventService } from '../control-plane/event-service';
import { RunService } from '../control-plane/run-service';
import { CheckpointService } from '../control-plane/checkpoint-service';
import { SessionService } from '../control-plane/session-service';
import { AttentionService } from '../control-plane/attention-service';
import { BindingService } from '../control-plane/binding-service';
import { ShareService } from '../control-plane/share-service';
import { SkillTraceService } from '../telemetry/skill-trace';
import { CapabilityFactService } from '../telemetry/capability-facts';
import { buildCommandRegistry } from './commands';

export const bootstrapManagerRuntime = async () => {
  const store = new FsStore();
  await store.ensureLayout();

  const eventService = new EventService(store);
  const runService = new RunService(store);
  const checkpointService = new CheckpointService(store);
  const sessionService = new SessionService(store, runService, eventService, checkpointService);
  const attentionService = new AttentionService(store);
  const bindingService = new BindingService(store);
  const shareService = new ShareService(store);
  const skillTraceService = new SkillTraceService(store);
  const capabilityFactService = new CapabilityFactService(store, eventService, skillTraceService);

  return {
    store,
    eventService,
    runService,
    checkpointService,
    sessionService,
    attentionService,
    bindingService,
    shareService,
    skillTraceService,
    capabilityFactService,
    commands: buildCommandRegistry(sessionService, attentionService, bindingService, shareService, capabilityFactService),
  };
};

if (require.main === module) {
  (async () => {
    const runtime = await bootstrapManagerRuntime();
    process.stdout.write(
      `${JSON.stringify(
        {
          product: 'openclaw-manager',
          state_root: runtime.store.rootDir,
          commands: Object.keys(runtime.commands),
        },
        null,
        2
      )}\n`
    );
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
