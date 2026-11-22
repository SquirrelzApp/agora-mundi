import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const PUBLIC_DIR = path.join(ROOT, "public");
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const STAGING_DIR = path.join(ROOT, ".next-staging");
const LIVE_DIR = path.join(ROOT, ".next");
const PORT = 3000;

let serverProc = null;
let building = false;
let pendingRebuild = false;
let debounceTimer = null;

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(250);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

async function waitForPortFree(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inUse = await isPortInUse(port);
    if (!inUse) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

function startServer() {
  serverProc = spawn(
    process.execPath,
    [NEXT_BIN, "start", "-H", "0.0.0.0", "-p", String(PORT)],
    {
      cwd: ROOT,
      stdio: "inherit",
      detached: true,
      env: { ...process.env, NODE_ENV: "production" },
    }
  );
}

async function stopServer() {
  if (serverProc && serverProc.pid) {
    const pid = serverProc.pid;
    const p = serverProc;
    serverProc = null;

    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      p.once("exit", done);
      try {
        // Kill entire process group (next CLI + next-server child)
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          p.kill("SIGTERM");
        } catch {
          done();
        }
      }

      setTimeout(() => {
        if (!settled) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            try {
              p.kill("SIGKILL");
            } catch {
              // ignore
            }
          }
          done();
        }
      }, 1800);
    });
  }

  await waitForPortFree(PORT, 4000);
}

async function triggerAtomicRebuild() {
  if (building) {
    pendingRebuild = true;
    return;
  }
  building = true;
  console.log("[auto-prod] Source change detected, rebuilding in background...");

  try {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });

    const exitCode = await new Promise((resolve) => {
      const buildProc = spawn(process.execPath, [NEXT_BIN, "build"], {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, NEXT_DIST_DIR: ".next-staging" },
      });
      buildProc.on("exit", (code) => resolve(code ?? 1));
    });

    if (exitCode === 0 && fs.existsSync(STAGING_DIR)) {
      await stopServer();
      const backupDir = path.join(ROOT, ".next-old");
      fs.rmSync(backupDir, { recursive: true, force: true });
      if (fs.existsSync(LIVE_DIR)) {
        fs.renameSync(LIVE_DIR, backupDir);
      }
      fs.renameSync(STAGING_DIR, LIVE_DIR);
      fs.rmSync(backupDir, { recursive: true, force: true });
      startServer();
      console.log("[auto-prod] New build deployed seamlessly!");
    } else {
      console.warn("[auto-prod] Build failed; keeping the currently running release.");
      fs.rmSync(STAGING_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("[auto-prod] Rebuild error:", err);
  } finally {
    building = false;
    if (pendingRebuild) {
      pendingRebuild = false;
      void triggerAtomicRebuild();
    }
  }
}

function scheduleRebuild(_eventType, filename) {
  if (!filename) return;
  if (!/\.(tsx?|css|mjs|json|svg|png|ico|webp)$/.test(filename)) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void triggerAtomicRebuild();
  }, 1200);
}

// Initial boot
if (!fs.existsSync(LIVE_DIR)) {
  spawnSync(process.execPath, [NEXT_BIN, "build"], {
    cwd: ROOT,
    stdio: "inherit",
  });
}
startServer();

// Watch src/ and public/ recursively for future edits
fs.watch(SRC_DIR, { recursive: true }, scheduleRebuild);
if (fs.existsSync(PUBLIC_DIR)) {
  fs.watch(PUBLIC_DIR, { recursive: true }, scheduleRebuild);
}

process.on("SIGTERM", async () => {
  await stopServer();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await stopServer();
  process.exit(0);
});
