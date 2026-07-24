import type { HotspotTier, VehicleCounts } from '../data/dummyData';

export interface TimestampedPmReading {
  timestamp: Date;
  pm25: number;
}

export interface TimestampedVehicleReading {
  timestamp: Date;
  vehicles: VehicleCounts;
}

export interface HotspotWindow {
  minuteStart: Date;
  minuteEnd: Date;
  pm25Average: number;
  vehicleRatePerMinute: number;
  baselineVehicleRatePerMinute: number;
  trafficElevated: boolean;
  pmElevated: boolean;
  pmCritical: boolean;
  // Consecutive qualifying-minute streak ENDING at this window, regardless
  // of whether it has crossed the sustained-window threshold yet. This is
  // what "near miss" reporting is built from.
  elevatedRunLength: number;
  criticalRunLength: number;
  // True if this window follows a gap large enough to be treated as the
  // start of a new recording session (baseline/streaks were reset here).
  isSessionStart: boolean;
}

export interface HotspotSessionSummary {
  /** Tier as of the very last evaluated minute — "is a hotspot active right now." */
  hotspotTier: HotspotTier;
  /** Best tier reached at any point in the dataset — "did a hotspot ever occur." */
  peakHotspotTier: HotspotTier;
  windows: HotspotWindow[];
  /** Length of the qualifying streak underlying the CURRENT hotspotTier (0 if 'none'). */
  sustainedWindowCount: number;
  /** The sustainedWindows threshold this result was computed with. */
  sustainedWindowsRequired: number;
  /** Longest elevated-qualifying streak observed anywhere in the dataset, met or not. */
  maxElevatedRunLength: number;
  /** Longest critical-qualifying streak observed anywhere in the dataset, met or not. */
  maxCriticalRunLength: number;
  elevatedTrafficWindowCount: number;
  criticalTrafficWindowCount: number;
  sessionMeanVehicleRatePerMinute: number;
}

export const HOTSPOT_PM25_ELEVATED_THRESHOLD = 35.5;
export const HOTSPOT_PM25_CRITICAL_THRESHOLD = 55.5;
export const HOTSPOT_WINDOW_MINUTES = 1;
export const HOTSPOT_WARMUP_WINDOWS = 5;
export const HOTSPOT_SUSTAINED_WINDOWS = 10;
export const HOTSPOT_TRAFFIC_MULTIPLIER = 1.5;
// If the gap between one evaluated minute and the next exceeds this many
// minutes, treat it as the start of a new recording session: reset the
// running traffic baseline and any in-progress streak. Without this,
// analyzing multiple days/sessions together would let a streak "jump"
// across an overnight (or multi-hour) gap as if it were consecutive, and
// the baseline would blend unrelated sessions and times of day together.
export const HOTSPOT_SESSION_GAP_MINUTES = 3;

const minuteKey = (date: Date): number =>
  Math.floor(date.getTime() / (HOTSPOT_WINDOW_MINUTES * 60 * 1000)) *
  HOTSPOT_WINDOW_MINUTES *
  60 *
  1000;

const totalVehicles = (vehicles: VehicleCounts): number =>
  Object.values(vehicles).reduce((sum, value) => sum + value, 0);

interface AggregatedPmWindow {
  minuteStart: number;
  values: number[];
}

interface AggregatedVehicleWindow {
  minuteStart: number;
  points: TimestampedVehicleReading[];
}

const buildPmWindows = (
  readings: TimestampedPmReading[],
): AggregatedPmWindow[] => {
  const windows = new Map<number, AggregatedPmWindow>();

  readings.forEach((reading) => {
    if (
      !reading ||
      !(reading.timestamp instanceof Date) ||
      isNaN(reading.timestamp.getTime())
    ) {
      return;
    }

    const key = minuteKey(reading.timestamp);
    const existing = windows.get(key);
    if (existing) {
      existing.values.push(reading.pm25);
      return;
    }

    windows.set(key, {
      minuteStart: key,
      values: [reading.pm25],
    });
  });

  return [...windows.values()].sort((a, b) => a.minuteStart - b.minuteStart);
};

const buildVehicleWindows = (
  readings: TimestampedVehicleReading[],
): AggregatedVehicleWindow[] => {
  const windows = new Map<number, AggregatedVehicleWindow>();

  readings.forEach((reading) => {
    if (
      !reading ||
      !(reading.timestamp instanceof Date) ||
      isNaN(reading.timestamp.getTime())
    ) {
      return;
    }

    const key = minuteKey(reading.timestamp);
    const existing = windows.get(key);
    if (existing) {
      existing.points.push(reading);
      return;
    }

    windows.set(key, {
      minuteStart: key,
      points: [reading],
    });
  });

  return [...windows.values()].sort((a, b) => a.minuteStart - b.minuteStart);
};

export const isElevatedTraffic = (
  currentVehicleRatePerMinute: number,
  sessionMeanVehicleRatePerMinute: number,
): boolean => {
  if (sessionMeanVehicleRatePerMinute <= 0) {
    return currentVehicleRatePerMinute > 0;
  }

  return (
    currentVehicleRatePerMinute >=
    HOTSPOT_TRAFFIC_MULTIPLIER * sessionMeanVehicleRatePerMinute
  );
};

/**
 * Classify a dataset of PM2.5 + vehicle readings into hotspot windows.
 *
 * @param sustainedWindows how many consecutive qualifying minutes are
 *   required before a streak counts as a hotspot. Defaults to
 *   HOTSPOT_SUSTAINED_WINDOWS (10). Pass a different value (e.g. 5) to run
 *   a sensitivity check against the same underlying data — near-miss stats
 *   (maxElevatedRunLength / maxCriticalRunLength) are threshold-independent
 *   and will be identical across calls; only hotspotTier/peakHotspotTier/
 *   sustainedWindowCount change with the threshold.
 */
export const classifyHotspotSession = (
  pmReadings: TimestampedPmReading[],
  vehicleReadings: TimestampedVehicleReading[],
  sustainedWindows: number = HOTSPOT_SUSTAINED_WINDOWS,
): HotspotSessionSummary => {
  const pmWindows = buildPmWindows(pmReadings);
  const vehicleWindows = buildVehicleWindows(vehicleReadings);

  const vehicleByMinute = new Map<number, AggregatedVehicleWindow>();
  vehicleWindows.forEach((window) => {
    vehicleByMinute.set(window.minuteStart, window);
  });

  const alignedWindows: Array<{
    minuteStart: number;
    minuteEnd: number;
    pm25Average: number;
    vehicleRatePerMinute: number;
  }> = [];

  pmWindows.forEach((pmWindow) => {
    const vehicleWindow = vehicleByMinute.get(pmWindow.minuteStart);
    if (!vehicleWindow) {
      return;
    }

    const pm25Average =
      pmWindow.values.reduce((sum, value) => sum + value, 0) /
      pmWindow.values.length;

    const sortedVehiclePoints = [...vehicleWindow.points].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    const first = sortedVehiclePoints[0];
    const last = sortedVehiclePoints[sortedVehiclePoints.length - 1];
    const vehicleRatePerMinute = Math.max(
      totalVehicles(last.vehicles) - totalVehicles(first.vehicles),
      0,
    );

    alignedWindows.push({
      minuteStart: pmWindow.minuteStart,
      minuteEnd: pmWindow.minuteStart + HOTSPOT_WINDOW_MINUTES * 60 * 1000,
      pm25Average,
      vehicleRatePerMinute,
    });
  });

  let runningMeanSum = 0;
  let runningMeanCount = 0;
  let elevatedTrafficWindowCount = 0;
  let criticalTrafficWindowCount = 0;
  let elevatedRun = 0;
  let criticalRun = 0;
  let maxElevatedRunLength = 0;
  let maxCriticalRunLength = 0;
  let latestHotspotTier: HotspotTier = 'none';
  let peakHotspotTier: HotspotTier = 'none';
  let sustainedWindowCount = 0;
  let previousMinuteEnd: number | null = null;

  const windows: HotspotWindow[] = alignedWindows.map((window) => {
    const gapMinutes =
      previousMinuteEnd === null
        ? 0
        : (window.minuteStart - previousMinuteEnd) / (60 * 1000);
    const isSessionStart =
      previousMinuteEnd === null || gapMinutes > HOTSPOT_SESSION_GAP_MINUTES;

    if (isSessionStart && previousMinuteEnd !== null) {
      // New recording session detected (e.g. a different day). Don't let
      // the traffic baseline or an in-progress streak bleed across the gap.
      runningMeanSum = 0;
      runningMeanCount = 0;
      elevatedRun = 0;
      criticalRun = 0;
    }

    const sessionMeanVehicleRatePerMinute =
      runningMeanCount > 0 ? runningMeanSum / runningMeanCount : 0;
    const trafficElevated =
      runningMeanCount >= HOTSPOT_WARMUP_WINDOWS
        ? isElevatedTraffic(
            window.vehicleRatePerMinute,
            sessionMeanVehicleRatePerMinute,
          )
        : false;

    const pmElevated = window.pm25Average >= HOTSPOT_PM25_ELEVATED_THRESHOLD;
    const pmCritical = window.pm25Average >= HOTSPOT_PM25_CRITICAL_THRESHOLD;

    if (pmElevated && trafficElevated) {
      elevatedRun += 1;
      elevatedTrafficWindowCount += 1;
    } else {
      elevatedRun = 0;
    }

    if (pmCritical && trafficElevated) {
      criticalRun += 1;
      criticalTrafficWindowCount += 1;
    } else {
      criticalRun = 0;
    }

    maxElevatedRunLength = Math.max(maxElevatedRunLength, elevatedRun);
    maxCriticalRunLength = Math.max(maxCriticalRunLength, criticalRun);

    if (criticalRun >= sustainedWindows) {
      latestHotspotTier = 'critical';
      sustainedWindowCount = criticalRun;
      peakHotspotTier = 'critical';
    } else if (elevatedRun >= sustainedWindows) {
      latestHotspotTier = 'elevated';
      sustainedWindowCount = elevatedRun;
      if (peakHotspotTier !== 'critical') {
        peakHotspotTier = 'elevated';
      }
    } else {
      latestHotspotTier = 'none';
      sustainedWindowCount = 0;
    }

    const evaluatedWindow: HotspotWindow = {
      minuteStart: new Date(window.minuteStart),
      minuteEnd: new Date(window.minuteEnd),
      pm25Average: window.pm25Average,
      vehicleRatePerMinute: window.vehicleRatePerMinute,
      baselineVehicleRatePerMinute: sessionMeanVehicleRatePerMinute,
      trafficElevated,
      pmElevated,
      pmCritical,
      elevatedRunLength: elevatedRun,
      criticalRunLength: criticalRun,
      isSessionStart,
    };

    runningMeanSum += window.vehicleRatePerMinute;
    runningMeanCount += 1;
    previousMinuteEnd = window.minuteEnd;

    return evaluatedWindow;
  });

  return {
    hotspotTier: latestHotspotTier,
    peakHotspotTier,
    windows,
    sustainedWindowCount,
    sustainedWindowsRequired: sustainedWindows,
    maxElevatedRunLength,
    maxCriticalRunLength,
    elevatedTrafficWindowCount,
    criticalTrafficWindowCount,
    sessionMeanVehicleRatePerMinute:
      runningMeanCount > 0 ? runningMeanSum / runningMeanCount : 0,
  };
};