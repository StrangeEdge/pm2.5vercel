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
  hotspotTier: HotspotTier;
}

export interface HotspotSessionSummary {
  hotspotTier: HotspotTier;
  windows: HotspotWindow[];
  sustainedWindowCount: number;
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

export const classifyHotspotSession = (
  pmReadings: TimestampedPmReading[],
  vehicleReadings: TimestampedVehicleReading[],
): HotspotSessionSummary => {
  const pmWindows = buildPmWindows(pmReadings);
  const vehicleWindows = buildVehicleWindows(vehicleReadings);

  const vehicleByMinute = new Map<number, AggregatedVehicleWindow>();
  vehicleWindows.forEach((window) => {
    vehicleByMinute.set(window.minuteStart, window);
  });

  const alignedWindows: HotspotWindow[] = [];

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
      minuteStart: new Date(pmWindow.minuteStart),
      minuteEnd: new Date(
        pmWindow.minuteStart + HOTSPOT_WINDOW_MINUTES * 60 * 1000,
      ),
      pm25Average,
      vehicleRatePerMinute,
      baselineVehicleRatePerMinute: 0,
      trafficElevated: false,
      hotspotTier: 'none',
    });
  });

  let runningMeanSum = 0;
  let runningMeanCount = 0;
  let elevatedTrafficWindowCount = 0;
  let criticalTrafficWindowCount = 0;
  let elevatedRun = 0;
  let criticalRun = 0;
  let latestHotspotTier: HotspotTier = 'none';
  let sustainedWindowCount = 0;

  const windows = alignedWindows.map((window) => {
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

    if (criticalRun >= HOTSPOT_SUSTAINED_WINDOWS) {
      latestHotspotTier = 'critical';
      sustainedWindowCount = criticalRun;
    } else if (elevatedRun >= HOTSPOT_SUSTAINED_WINDOWS) {
      latestHotspotTier = 'elevated';
      sustainedWindowCount = elevatedRun;
    } else {
      latestHotspotTier = 'none';
      sustainedWindowCount = 0;
    }

    const evaluatedWindow: HotspotWindow = {
      ...window,
      baselineVehicleRatePerMinute: sessionMeanVehicleRatePerMinute,
      trafficElevated,
      hotspotTier: latestHotspotTier,
    };

    runningMeanSum += window.vehicleRatePerMinute;
    runningMeanCount += 1;

    return evaluatedWindow;
  });

  return {
    hotspotTier: latestHotspotTier,
    windows,
    sustainedWindowCount,
    elevatedTrafficWindowCount,
    criticalTrafficWindowCount,
    sessionMeanVehicleRatePerMinute:
      runningMeanCount > 0 ? runningMeanSum / runningMeanCount : 0,
  };
};
