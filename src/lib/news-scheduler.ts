import { prisma } from "@/lib/prisma";
import { syncBatchCountriesToDb } from "@/lib/ai-agenda-curator";
import { ensureCountryIntelligence } from "@/lib/country-intel";

export const SCHEDULER_TICK_MINUTES = 10;
const BATCH_SIZE = 10;

interface SchedulerState {
  started: boolean;
  running: boolean;
  tickIntervalMinutes: number;
  lastTickAt: string | null;
  nextTickAt: string | null;
  lastUpdatedCount: number;
  totalCycles: number;
  timer?: ReturnType<typeof setInterval>;
}

const globalForScheduler = globalThis as unknown as {
  __agoraSchedulerState?: SchedulerState;
};

function getState(): SchedulerState {
  if (!globalForScheduler.__agoraSchedulerState) {
    globalForScheduler.__agoraSchedulerState = {
      started: false,
      running: false,
      tickIntervalMinutes: SCHEDULER_TICK_MINUTES,
      lastTickAt: null,
      nextTickAt: null,
      lastUpdatedCount: 0,
      totalCycles: 0,
    };
  }
  return globalForScheduler.__agoraSchedulerState;
}

function tempoPriority(tempo: string): number {
  if (tempo === "HOT") return 0;
  if (tempo === "MODERATE") return 1;
  return 2;
}

/**
 * Tek bir arka plan tarama döngüsü:
 * Süresi dolmuş veya henüz senkronize edilmemiş ülkelerin haberlerini çeker,
 * Gemini 3.5 Flash-Lite ile formatlayıp doğrudan veritabanına yazar.
 */
export async function runSchedulerCycle(maxCountries = 24): Promise<number> {
  const state = getState();
  if (state.running) return 0;

  state.running = true;
  let updatedTotal = 0;

  try {
    const allCountries = await prisma.country.findMany({
      select: {
        code: true,
        tempo: true,
        updateIntervalHours: true,
        lastSyncedAt: true,
        infoSyncedAt: true,
        _count: {
          select: {
            agendas: { where: { isActive: true } },
          },
        },
      },
    });

    const nowMs = Date.now();

    // 1. Find countries due for fresh news + Gemini curation
    const dueForAgendas = allCountries
      .filter((c) => {
        if (!c.lastSyncedAt || c._count.agendas < 3) return true;
        const ageHours = (nowMs - c.lastSyncedAt.getTime()) / (1000 * 60 * 60);
        return ageHours >= c.updateIntervalHours;
      })
      .sort((a, b) => {
        const aEmpty = !a.lastSyncedAt || a._count.agendas < 3 ? 0 : 1;
        const bEmpty = !b.lastSyncedAt || b._count.agendas < 3 ? 0 : 1;
        if (aEmpty !== bEmpty) return aEmpty - bEmpty;

        const pDiff = tempoPriority(a.tempo) - tempoPriority(b.tempo);
        if (pDiff !== 0) return pDiff;

        const aTs = a.lastSyncedAt ? a.lastSyncedAt.getTime() : 0;
        const bTs = b.lastSyncedAt ? b.lastSyncedAt.getTime() : 0;
        return aTs - bTs;
      })
      .slice(0, maxCountries);

    for (let i = 0; i < dueForAgendas.length; i += BATCH_SIZE) {
      const batchCodes = dueForAgendas
        .slice(i, i + BATCH_SIZE)
        .map((c) => c.code);
      const count = await syncBatchCountriesToDb(batchCodes, false);
      updatedTotal += count;
    }

    // 2. Refresh stale country macro profiles / exchange rates in background
    const dueForInfo = allCountries
      .filter((c) => {
        if (!c.infoSyncedAt) return true;
        const ageHours = (nowMs - c.infoSyncedAt.getTime()) / (1000 * 60 * 60);
        return ageHours >= 24;
      })
      .slice(0, 18);

    for (let i = 0; i < dueForInfo.length; i += BATCH_SIZE) {
      const slice = dueForInfo.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        slice.map((c) => ensureCountryIntelligence(c.code))
      );
    }

    state.lastTickAt = new Date().toISOString();
    state.nextTickAt = new Date(
      Date.now() + SCHEDULER_TICK_MINUTES * 60 * 1000
    ).toISOString();
    state.lastUpdatedCount = updatedTotal;
    state.totalCycles += 1;

    return updatedTotal;
  } catch (err) {
    console.error("[news-scheduler] Cycle error:", err);
    return updatedTotal;
  } finally {
    state.running = false;
  }
}

export function enqueueBackgroundCountrySync(code: string): void {
  void syncBatchCountriesToDb([code], false);
  void ensureCountryIntelligence(code);
}

export function startBackgroundNewsScheduler(): void {
  const state = getState();
  if (state.started) return;

  state.started = true;
  const intervalMs = SCHEDULER_TICK_MINUTES * 60 * 1000;
  state.nextTickAt = new Date(Date.now() + 8_000).toISOString();

  // Initial check 8s after server boot (non-blocking)
  const bootTimer = setTimeout(() => {
    void runSchedulerCycle(24);
  }, 8_000);
  bootTimer.unref?.();

  // Periodic background ingestion every 10 minutes
  const timer = setInterval(() => {
    void runSchedulerCycle(24);
  }, intervalMs);
  timer.unref?.();
  state.timer = timer;

  console.log(
    `[agora-mundi] Otonom Haber & Gemini 3.5 zamanlayıcısı aktif (kontrol döngüsü: ${SCHEDULER_TICK_MINUTES} dk | HOT: 1s, MODERATE: 3s, STABLE: 6s)`
  );
}

export function getSchedulerStatusSnapshot() {
  const state = getState();
  return {
    started: state.started,
    running: state.running,
    tickIntervalMinutes: state.tickIntervalMinutes,
    lastTickAt: state.lastTickAt,
    nextTickAt: state.nextTickAt,
    lastUpdatedCount: state.lastUpdatedCount,
    totalCycles: state.totalCycles,
    tiersHours: {
      HOT: 1,
      MODERATE: 3,
      STABLE: 6,
    },
  };
}
