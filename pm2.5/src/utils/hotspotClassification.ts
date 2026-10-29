import type { VehicleCounts } from '../data/dummyData';

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface TimestampedPmReading {
  timestamp: Date;
  pm25: number;
}

export interface TimestampedVehicleReading {
  timestamp: Date;
  vehicles: VehicleCounts;
}

export type CorrelationStrength =
  | 'insufficient-data'
  | 'weak'
  | 'moderate'
  | 'strong';

export type VehicleDataQuality = 'good' | 'partial' | 'unavailable';

export interface MinuteWindow {
  minuteStart: Date;
  minuteEnd: Date;
  pm25Average: number;
  /**
   * Vehicles counted this minute. `null` means no reliable reading was
   * available (no vehicle data near this minute, or the cumulative counter
   * reset partway through it) — never fabricated or interpolated.
   */
  vehicleRatePerMinute: number | null;
  /**
   * True if the vehicle count did not change at all across this minute.
   * Could mean genuinely zero traffic, OR the vehicle-detection side went
   * silent while the PM2.5 sensor kept reporting (e.g. Pi offline, or a
   * bench/home test with the PM sensor running but no camera pointed at
   * traffic). Flagged for visibility, not auto-excluded, since after
   * manual session cleaning a real zero-traffic minute is possible.
   */
  vehicleDataSuspect: boolean;
}

export interface PmEvent {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  peakPm25: number;
  averagePm25: number;
  windows: MinuteWindow[];
  /** Minutes with BOTH a valid PM2.5 average and a valid (non-null) vehicle rate. */
  sampleSize: number;
  averageVehicleRatePerMinute: number | null;
  pearsonR: number | null;
  spearmanR: number | null;
  pearsonStrength: CorrelationStrength;
  spearmanStrength: CorrelationStrength;
  vehicleDataQuality: VehicleDataQuality;
  /**
   * True when this PM2.5 event qualifies as a traffic-related hotspot per
   * the thesis definition: sustained elevated PM2.5 (already required to
   * log an event at all) WITH at least a moderate correlation (|r| >= 0.3
   * on Pearson or Spearman) to vehicle activity. Events that don't clear
   * this bar are still logged — e.g. a rain-suppressed session, or a
   * pollution event from a non-traffic source — but are reported as plain
   * pollution events, not hotspots.
   */
  isHotspot: boolean;
  /** Human-readable classification for display: "Traffic-Related Hotspot",
   *  "Pollution Event (weak/no traffic correlation)", or
   *  "Pollution Event (insufficient data)". */
  hotspotLabel: string;
}

export interface HotspotAnalysisResult {
  events: PmEvent[];
  totalEvents: number;
  eventsWithReliableCorrelation: number;
  /** Subset of totalEvents that qualify as traffic-related hotspots (isHotspot === true). */
  hotspotsDetected: number;
}

// ─────────────────────────────────────────────────────────────
//  Tunables
// ─────────────────────────────────────────────────────────────

/** US EPA "Moderate" upper bound — same threshold the rest of the app already uses. */
export const PM25_ELEVATED_THRESHOLD = 35.5;
/** US EPA "Unhealthy for Sensitive Groups" upper bound — used for severity labeling only. */
export const PM25_CRITICAL_THRESHOLD = 55.5;

export const EVENT_WINDOW_MINUTES = 1;
/** Consecutive below-threshold minutes tolerated before an event is closed. */
export const EVENT_CLOSE_GAP_MINUTES = 2;
/** Minimum duration (minutes) to log a stretch as an "event" at all. */
export const EVENT_MIN_DURATION_MINUTES = 3;
/** Minimum minutes with valid PM2.5 + vehicle data before a correlation is trusted. */
export const CORRELATION_MIN_SAMPLE_SIZE = 10;
/**
 * Gap (minutes) between readings, or between a lookup time and the nearest
 * vehicle reading, beyond which we treat the device as having been offline
 * rather than stitching unrelated data together.
 */
export const SESSION_GAP_MINUTES = 3;

// Cohen's conventions — conventionally defined for Pearson's r. Applying the
// same bands to Spearman's rho is common practice for a side-by-side
// comparison like this, but worth flagging explicitly in your methodology
// write-up if you settle on Spearman as your primary coefficient.
function strengthFromR(r: number | null): CorrelationStrength {
  if (r === null) return 'insufficient-data';
  const abs = Math.abs(r);
  if (abs < 0.3) return 'weak';
  if (abs < 0.5) return 'moderate';
  return 'strong';
}

// ─────────────────────────────────────────────────────────────
//  Small stats helpers
// ─────────────────────────────────────────────────────────────

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  if (denomX === 0 || denomY === 0) return null; // no variance — correlation undefined
  return num / Math.sqrt(denomX * denomY);
}

/** Ranks values 1..n, averaging ranks across ties (standard Spearman tie handling). */
function rankArray(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1; // 1-indexed
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

export function spearmanCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || ys.length !== xs.length) return null;
  return pearsonCorrelation(rankArray(xs), rankArray(ys));
}

// ─────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────

const minuteKey = (date: Date): number =>
  Math.floor(date.getTime() / (EVENT_WINDOW_MINUTES * 60 * 1000)) *
  EVENT_WINDOW_MINUTES *
  60 *
  1000;

const totalVehicles = (vehicles: VehicleCounts): number =>
  Object.values(vehicles).reduce((sum, value) => sum + value, 0);

interface VehiclePoint {
  t: number;
  total: number;
}

/**
 * Sums vehicle increments across a chronological series, treating any
 * decrease in the cumulative counter as a restart (the Pi's counter
 * resetting to 0 between sessions is expected behavior) rather than losing
 * the vehicles counted after the reset. Used for range-level totals, not
 * per-minute correlation — see minuteVehicleRate() for that.
 */
export function sumVehiclesResetAware(points: VehiclePoint[]): number {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.t - b.t);
  let total = 0;
  let prev = sorted[0].total;
  total += prev; // count whatever the first reading already had accumulated
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i].total;
    if (cur >= prev) {
      total += cur - prev;
    } else {
      // reset detected — the counter restarted; the new value itself
      // represents vehicles counted since the restart
      total += cur;
    }
    prev = cur;
  }
  return total;
}

// ─────────────────────────────────────────────────────────────
//  Core: detect PM2.5 events and correlate each against vehicle rate
// ─────────────────────────────────────────────────────────────

export function detectPmEvents(
  pmReadings: TimestampedPmReading[],
  vehicleReadings: TimestampedVehicleReading[],
): HotspotAnalysisResult {
  // ── 1. Aggregate PM2.5 into 1-minute averages ──
  const pmByMinute = new Map<number, number[]>();
  pmReadings.forEach((r) => {
    if (!r || !(r.timestamp instanceof Date) || isNaN(r.timestamp.getTime()))
      return;
    const key = minuteKey(r.timestamp);
    const arr = pmByMinute.get(key);
    if (arr) arr.push(r.pm25);
    else pmByMinute.set(key, [r.pm25]);
  });
  const minuteKeys = [...pmByMinute.keys()].sort((a, b) => a - b);

  // ── 2. Build a sorted vehicle series + detect reset boundaries ──
  const vehicleSeries: VehiclePoint[] = vehicleReadings
    .filter(
      (r) => r && r.timestamp instanceof Date && !isNaN(r.timestamp.getTime()),
    )
    .map((r) => ({
      t: r.timestamp.getTime(),
      total: totalVehicles(r.vehicles),
    }))
    .sort((a, b) => a.t - b.t);

  const resetIndices = new Set<number>();
  for (let i = 1; i < vehicleSeries.length; i++) {
    if (vehicleSeries[i].total < vehicleSeries[i - 1].total)
      resetIndices.add(i);
  }

  const MAX_LOOKUP_GAP_MS = SESSION_GAP_MINUTES * 60 * 1000;

  function valueAtOrBefore(t: number): { value: number; index: number } | null {
    let lo = 0;
    let hi = vehicleSeries.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (vehicleSeries[mid].t <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (ans === -1) return null;
    if (t - vehicleSeries[ans].t > MAX_LOOKUP_GAP_MS) return null;
    return { value: vehicleSeries[ans].total, index: ans };
  }

  function minuteVehicleRate(minuteStartMs: number): {
    rate: number | null;
    suspectFlat: boolean;
  } {
    const startVal = valueAtOrBefore(minuteStartMs);
    const endVal = valueAtOrBefore(minuteStartMs + 60_000);
    if (!startVal || !endVal) return { rate: null, suspectFlat: false };

    // If a reset boundary falls between these two lookups, the delta is
    // meaningless — don't fabricate a rate for this minute.
    for (let i = startVal.index + 1; i <= endVal.index; i++) {
      if (resetIndices.has(i)) return { rate: null, suspectFlat: false };
    }

    const rate = Math.max(endVal.value - startVal.value, 0);
    return { rate, suspectFlat: rate === 0 };
  }

  // ── 3. Build ordered minute windows for every minute with PM2.5 data ──
  const windows: MinuteWindow[] = minuteKeys.map((key) => {
    const pmVals = pmByMinute.get(key)!;
    const pm25Average = pmVals.reduce((a, b) => a + b, 0) / pmVals.length;
    const { rate, suspectFlat } = minuteVehicleRate(key);
    return {
      minuteStart: new Date(key),
      minuteEnd: new Date(key + 60_000),
      pm25Average,
      vehicleRatePerMinute: rate,
      vehicleDataSuspect: suspectFlat,
    };
  });

  // ── 4. Walk the windows chronologically, grouping elevated stretches into events ──
  const events: PmEvent[] = [];
  let current: MinuteWindow[] = [];
  let belowStreak = 0;
  let prevMinuteEnd: number | null = null;

  const closeEvent = () => {
    if (current.length === 0) return;

    const durationMinutes = current.length;
    if (durationMinutes < EVENT_MIN_DURATION_MINUTES) {
      current = [];
      belowStreak = 0;
      return;
    }

    const pmVals = current.map((w) => w.pm25Average);
    const peakPm25 = Math.max(...pmVals);
    const averagePm25 = pmVals.reduce((a, b) => a + b, 0) / pmVals.length;

    const validPairs = current
      .filter((w) => w.vehicleRatePerMinute !== null)
      .map((w) => ({
        pm: w.pm25Average,
        veh: w.vehicleRatePerMinute as number,
      }));

    const sampleSize = validPairs.length;
    const xsPm = validPairs.map((p) => p.pm);
    const ysVeh = validPairs.map((p) => p.veh);

    let pearsonR: number | null = null;
    let spearmanR: number | null = null;
    if (sampleSize >= CORRELATION_MIN_SAMPLE_SIZE) {
      pearsonR = pearsonCorrelation(xsPm, ysVeh);
      spearmanR = spearmanCorrelation(xsPm, ysVeh);
    }

    const averageVehicleRatePerMinute =
      sampleSize > 0 ? ysVeh.reduce((a, b) => a + b, 0) / sampleSize : null;

    const suspectCount = current.filter((w) => w.vehicleDataSuspect).length;
    const missingCount = current.filter(
      (w) => w.vehicleRatePerMinute === null,
    ).length;
    const unreliableFraction = (suspectCount + missingCount) / current.length;

    let vehicleDataQuality: VehicleDataQuality = 'good';
    if (unreliableFraction >= 0.5) vehicleDataQuality = 'unavailable';
    else if (unreliableFraction > 0) vehicleDataQuality = 'partial';

    // Hotspot classification: sustained elevated PM2.5 (already required to
    // reach this point) PLUS at least moderate correlation with vehicle
    // activity on either coefficient. This is the thesis's core
    // "traffic-related hotspot" definition — sustained pollution alone
    // (e.g. a non-traffic source, or insufficient vehicle data) does not
    // qualify on its own.
    const hasModerateOrStrongCorrelation =
      (pearsonR !== null && Math.abs(pearsonR) >= 0.3) ||
      (spearmanR !== null && Math.abs(spearmanR) >= 0.3);

    const isHotspot =
      sampleSize >= CORRELATION_MIN_SAMPLE_SIZE &&
      hasModerateOrStrongCorrelation;

    let hotspotLabel: string;
    if (isHotspot) {
      hotspotLabel = 'Traffic-Related Hotspot';
    } else if (sampleSize < CORRELATION_MIN_SAMPLE_SIZE) {
      hotspotLabel =
        'Pollution Event (insufficient data to confirm traffic link)';
    } else {
      hotspotLabel = 'Pollution Event (weak/no traffic correlation)';
    }

    events.push({
      startTime: current[0].minuteStart,
      endTime: current[current.length - 1].minuteEnd,
      durationMinutes,
      peakPm25,
      averagePm25,
      windows: current,
      sampleSize,
      averageVehicleRatePerMinute,
      pearsonR,
      spearmanR,
      pearsonStrength: strengthFromR(pearsonR),
      spearmanStrength: strengthFromR(spearmanR),
      vehicleDataQuality,
      isHotspot,
      hotspotLabel,
    });

    current = [];
    belowStreak = 0;
  };

  windows.forEach((w) => {
    const gapMinutes =
      prevMinuteEnd === null
        ? 0
        : (w.minuteStart.getTime() - prevMinuteEnd) / 60_000;

    if (gapMinutes > SESSION_GAP_MINUTES) {
      // Device was offline for a real stretch — always close whatever was
      // in progress rather than bridging an event across a dead period.
      closeEvent();
    }

    const elevated = w.pm25Average >= PM25_ELEVATED_THRESHOLD;

    if (elevated) {
      current.push(w);
      belowStreak = 0;
    } else if (current.length > 0) {
      current.push(w);
      belowStreak += 1;
      if (belowStreak > EVENT_CLOSE_GAP_MINUTES) {
        // Trim the trailing below-threshold minutes that exceeded
        // tolerance, then close the event at its real elevated boundary.
        current = current.slice(0, current.length - belowStreak);
        closeEvent();
      }
    }

    prevMinuteEnd = w.minuteEnd.getTime();
  });
  closeEvent();

  return {
    events,
    totalEvents: events.length,
    eventsWithReliableCorrelation: events.filter(
      (e) => e.sampleSize >= CORRELATION_MIN_SAMPLE_SIZE,
    ).length,
    hotspotsDetected: events.filter((e) => e.isHotspot).length,
  };
}

// ─────────────────────────────────────────────────────────────
//  Display helpers
// ─────────────────────────────────────────────────────────────

export function getCorrelationColor(strength: CorrelationStrength): string {
  switch (strength) {
    case 'strong':
      return '#ff3333';
    case 'moderate':
      return '#ffa500';
    case 'weak':
      return '#f5d90a';
    case 'insufficient-data':
    default:
      return '#5a6978';
  }
}

export function getCorrelationLabel(strength: CorrelationStrength): string {
  switch (strength) {
    case 'strong':
      return 'Strong';
    case 'moderate':
      return 'Moderate';
    case 'weak':
      return 'Weak';
    case 'insufficient-data':
    default:
      return 'Insufficient data';
  }
}

export function getVehicleDataQualityLabel(
  quality: VehicleDataQuality,
): string {
  switch (quality) {
    case 'good':
      return 'Good';
    case 'partial':
      return 'Partial';
    case 'unavailable':
    default:
      return 'Unavailable';
  }
}

// ─────────────────────────────────────────────────────────────
//  Single-value tier for consumers that need one summary state per
//  sensor (map pins, live dashboard cards) rather than the full event
//  list — e.g. realtimeDatabaseHelpers.ts / SensorReading.hotspotTier.
//
//  IMPORTANT: this return type ('none' | 'elevated' | 'critical') must
//  match whatever `HotspotTier` is defined as in ../data/dummyData. If
//  that type has different members, either update this type or update
//  dummyData's HotspotTier to match.
// ─────────────────────────────────────────────────────────────

export type HotspotTierSummary = 'none' | 'elevated' | 'critical';

/**
 * Collapses the most recent PM2.5 event down to a single tier, for
 * display contexts (map pins, dashboard cards) that need one value per
 * sensor rather than the full event list. Only reports 'elevated' /
 * 'critical' if that event is still current (its end time is within
 * SESSION_GAP_MINUTES of the latest known reading) AND it qualifies as
 * a traffic-related hotspot (isHotspot === true, per the shared
 * definition above) — a sustained pollution event with no meaningful
 * traffic correlation reports 'none' here, even though it's still
 * visible as a plain pollution event in the full event list.
 */
export function getCurrentHotspotTier(
  events: PmEvent[],
  latestReadingTime: Date | null,
): HotspotTierSummary {
  if (events.length === 0 || !latestReadingTime) return 'none';

  const latestEvent = events[events.length - 1];
  const gapMinutes =
    (latestReadingTime.getTime() - latestEvent.endTime.getTime()) / 60_000;
  const isCurrent = gapMinutes <= SESSION_GAP_MINUTES;
  if (!isCurrent || !latestEvent.isHotspot) return 'none';

  return latestEvent.peakPm25 >= PM25_CRITICAL_THRESHOLD
    ? 'critical'
    : 'elevated';
}
