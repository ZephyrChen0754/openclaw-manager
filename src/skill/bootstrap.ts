import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { FsStore } from '../storage/fs-store';
import { EventService } from '../control-plane/event-service';
import { RunService } from '../control-plane/run-service';
import { CheckpointService } from '../control-plane/checkpoint-service';
import { SessionService } from '../control-plane/session-service';
import { AttentionService } from '../control-plane/attention-service';
import { BindingService } from '../control-plane/binding-service';
import { ShareService } from '../control-plane/share-service';
import { SpoolService } from '../control-plane/spool-service';
import { ShadowService } from '../control-plane/shadow-service';
import { SkillTraceService } from '../telemetry/skill-trace';
import { CapabilityFactService } from '../telemetry/capability-facts';
import { buildCommandRegistry } from './commands';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sidecarBaseUrl = () => {
  const port = Number(process.env.PORT || 4318);
  return process.env.OPENCLAW_MANAGER_SIDECAR_URL || `http://127.0.0.1:${port}`;
};

const checkSidecarHealth = async () => {
  try {
    const response = await fetch(`${sidecarBaseUrl()}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

const resolveServerCommand = async () => {
  const distServer = path.resolve(process.cwd(), 'dist', 'api', 'server.js');
  try {
    await fs.access(distServer);
    return [process.execPath, [distServer]] as const;
  } catch {
    const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    return [process.execPath, [tsxCli, path.resolve(process.cwd(), 'src', 'api', 'server.ts')]] as const;
  }
};

export const ensureSidecarRunning = async () => {
  if (process.env.OPENCLAW_MANAGER_SERVER_PROCESS === '1' || process.env.OPENCLAW_MANAGER_NO_AUTOSTART === '1') {
    return {
      already_running: await checkSidecarHealth(),
      launched: false,
      base_url: sidecarBaseUrl(),
    };
  }

  if (await checkSidecarHealth()) {
    return {
      already_running: true,
      launched: false,
      base_url: sidecarBaseUrl(),
    };
  }

  const [command, args] = await resolveServerCommand();
  const child = spawn(command, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      OPENCLAW_MANAGER_SERVER_PROCESS: '1',
    },
  });
  child.unref();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await checkSidecarHealth()) {
      return {
        already_running: false,
        launched: true,
        base_url: sidecarBaseUrl(),
      };
    }
    await wait(300);
  }

  return {
    already_running: false,
    launched: true,
    base_url: sidecarBaseUrl(),
  };
};

export const bootstrapManagerRuntime = async () => {
  const store = new FsStore();
  await store.ensureLayout();

  const eventService = new EventService(store);
  const runService = new RunService(store);
  const checkpointService = new CheckpointService(store);
  const spoolService = new SpoolService(store);
  const sessionService = new SessionService(store, runService, eventService, checkpointService, spoolService);
  const attentionService = new AttentionService(store);
  const bindingService = new BindingService(store);
  const shareService = new ShareService(store, eventService, runService, checkpointService, spoolService);
  const skillTraceService = new SkillTraceService(store, eventService);
  const capabilityFactService = new CapabilityFactService(store, eventService, skillTraceService);
  const shadowService = new ShadowService(
    store,
    sessionService,
    eventService,
    attentionService,
    bindingService,
    spoolService
  );

  return {
    store,
    eventService,
    runService,
    checkpointService,
    spoolService,
    sessionService,
    attentionService,
    bindingService,
    shareService,
    shadowService,
    skillTraceService,
    capabilityFactService,
    commands: buildCommandRegistry(
      sessionService,
      attentionService,
      bindingService,
      shareService,
      capabilityFactService,
      shadowService
    ),
  };
};

if (require.main === module) {
  (async () => {
    const sidecar = await ensureSidecarRunning();
    const runtime = await bootstrapManagerRuntime();
    process.stdout.write(
      `${JSON.stringify(
        {
          product: 'openclaw-manager',
          state_root: runtime.store.rootDir,
          sidecar,
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
