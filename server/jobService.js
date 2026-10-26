import { readDevices } from "./storage.js";
import { readSchedules } from "./scheduleStorage.js";
import { applyDeviceList } from "./unifiService.js";
import { currentScheduleAction, scheduleRunKey } from "./scheduler.js";

export function createScheduleJobService({ getServerConfig, onApplied }) {
  const completedRuns = new Set();
  const intervalMs = 30_000;
  let timer = null;
  let running = false;
  let lastRun = null;

  async function run() {
    if (running) {
      return {
        ok: true,
        skipped: true,
        reason: "A schedule run is already in progress",
      };
    }

    running = true;
    const now = new Date();
    let actionCount = 0;
    try {
      const schedules = await readSchedules();
      const devices = await readDevices();
      const serverConfig = await getServerConfig();

      for (const schedule of schedules) {
        const action = currentScheduleAction(schedule, now);
        if (!action) continue;

        const runKey = scheduleRunKey(schedule, action, now);
        if (completedRuns.has(runKey)) continue;

        const selectedDevices = devices.filter(
          (device) =>
            String(device.groupName || "")
              .trim()
              .toLowerCase() ===
            String(schedule.groupName || "")
              .trim()
              .toLowerCase(),
        );
        if (selectedDevices.length === 0) continue;

        const result = await applyDeviceList(
          selectedDevices,
          serverConfig,
          action,
          { groupName: schedule.groupName },
        );
        await onApplied(action, result);
        completedRuns.add(runKey);
        actionCount += 1;
      }

      lastRun = {
        ok: true,
        completedAt: new Date().toISOString(),
        actionCount,
      };
      return lastRun;
    } catch (error) {
      lastRun = {
        ok: false,
        completedAt: new Date().toISOString(),
        error: error.message,
      };
      throw error;
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      run().catch((error) =>
        console.error(`Schedule job failed: ${error.message}`),
      );
    }, intervalMs);
    timer.unref?.();
    run().catch((error) =>
      console.error(`Schedule job failed: ${error.message}`),
    );
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function getStatus() {
    return { running, started: Boolean(timer), intervalMs, lastRun };
  }

  return { getStatus, run, start, stop };
}
