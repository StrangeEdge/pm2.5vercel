import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import './HistoryPage.css';
import { getAuthToken } from '../config/firebaseConfig';
import {
  detectPmEvents,
  sumVehiclesResetAware,
  getCorrelationColor,
  getCorrelationLabel,
  getVehicleDataQualityLabel,
  PM25_ELEVATED_THRESHOLD,
  EVENT_CLOSE_GAP_MINUTES,
  EVENT_MIN_DURATION_MINUTES,
  CORRELATION_MIN_SAMPLE_SIZE,
  SESSION_GAP_MINUTES,
  type TimestampedPmReading,
  type TimestampedVehicleReading,
  type PmEvent,
} from '../utils/hotspotClassification';
import {
  buildXlsxBlob,
  type XlsxSheet,
  type XlsxCell,
} from '../utils/xlsxExport';
const RTDB_URL = import.meta.env.VITE_RTDB_URL;

type HistoryPoint = { timestamp: Date; pm25: number };

type VehicleHistoryPoint = {
  timestamp: Date;
  Car: number;
  Jeep: number;
  Truck: number;
  Tricycle: number;
  Motorcycle: number;
  Bus: number;
};

const TIME_WINDOWS = [
  { label: '5m', ms: 5 * 60 * 1000 },
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '1w', ms: 7 * 24 * 60 * 60 * 1000 },
];

const VEHICLE_COLORS: Record<string, string> = {
  Car: '#3b82f6',
  Jeep: '#06b6d4',
  Truck: '#ef4444',
  Tricycle: '#ffa500',
  Motorcycle: '#f59e0b',
  Bus: '#8b5cf6',
};

function todayISODate(): string {
  return localDateKey(new Date());
}

function totalVehiclesAtPoint(p: VehicleHistoryPoint): number {
  return p.Car + p.Jeep + p.Truck + p.Tricycle + p.Motorcycle + p.Bus;
}

const SESSION_GAP_MS = SESSION_GAP_MINUTES * 60 * 1000;

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${localDateKey(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatTimeOfDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Continuous runs of readings; a gap longer than SESSION_GAP_MS starts a new
// session so interrupted recordings aren't stitched together.
function splitIntoSessions<T extends { timestamp: Date }>(
  points: T[],
  gapMs: number,
): T[][] {
  const sessions: T[][] = [];
  let current: T[] = [];
  for (let i = 0; i < points.length; i++) {
    if (
      current.length > 0 &&
      points[i].timestamp.getTime() - points[i - 1].timestamp.getTime() > gapMs
    ) {
      sessions.push(current);
      current = [];
    }
    current.push(points[i]);
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

// Session header label for an XLSX export block.
function sessionHeader(
  label: string,
  session: { timestamp: Date }[],
): string {
  const start = session[0].timestamp;
  const end = session[session.length - 1].timestamp;
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  return `${label} — ${formatTimeOfDay(start)} to ${formatTimeOfDay(end)} (${mins} min, ${session.length} readings)`;
}

export default function HistoryPage() {
  const [windowIdx, setWindowIdx] = useState(1); // default 30m
  const [customMode, setCustomMode] = useState(false);
  const [customDate, setCustomDate] = useState<string>(todayISODate());
  const [customStart, setCustomStart] = useState<string>('08:00');
  const [customEnd, setCustomEnd] = useState<string>('09:00');

  // Full, unfiltered datasets pulled from Firebase.
  const [allPoints, setAllPoints] = useState<HistoryPoint[]>([]);
  const [allVehicleHistory, setAllVehicleHistory] = useState<
    VehicleHistoryPoint[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [vLoading, setVLoading] = useState(true);

  const window = TIME_WINDOWS[windowIdx];

  // fetch full raw history — filtering to a window happens client-side
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const url = `${RTDB_URL}/pm25_history/esp32-sensor-01.json?auth=${token}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
      const raw = await resp.json();

      if (!raw) {
        setAllPoints([]);
        return;
      }

      const parsedAll: HistoryPoint[] = [];
      for (const key of Object.keys(raw)) {
        const d = raw[key];
        if (!d || typeof d !== 'object') continue;
        // Accept numeric strings (e.g. "76") and epoch-millis timestamps as
        // well as plain numbers / ISO strings — strict typing here silently
        // dropped readings that had been serialized differently, leaving holes
        // in the PM2.5 history (e.g. the tail of a session).
        const pm = Number(d.pm25 ?? d.pm2_5 ?? d.value);
        const ts = d.timestamp;
        const t =
          typeof ts === 'number'
            ? new Date(ts)
            : typeof ts === 'string' && ts.trim() !== ''
              ? new Date(ts)
              : null;
        if (!Number.isFinite(pm) || !t || isNaN(t.getTime())) continue;
        parsedAll.push({ pm25: pm, timestamp: t });
      }
      parsedAll.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      setAllPoints(parsedAll);
    } catch (err) {
      console.error('[fetchHistory] failed:', err);
      setAllPoints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVehicleHistory = useCallback(async () => {
    setVLoading(true);
    try {
      const token = await getAuthToken();
      const parsedAll: VehicleHistoryPoint[] = [];

      // 1. Fetch time series from /vehicle_history
      const vHistUrl = `${RTDB_URL}/vehicle_history/esp32-sensor-01.json?auth=${token}`;
      const vHistResp = await fetch(vHistUrl);
      if (vHistResp.ok) {
        const raw = await vHistResp.json();
        if (raw && typeof raw === 'object') {
          for (const key of Object.keys(raw)) {
            const d = raw[key];
            if (!d || typeof d !== 'object') continue;
            const ts = d.timestamp ?? d.vehicles_timestamp;
            const v = d.vehicles;
            if (typeof ts !== 'string' || !v || typeof v !== 'object') continue;
            parsedAll.push({
              timestamp: new Date(ts),
              Car: Number(v.Car) || 0,
              Jeep: Number(v.Jeep) || 0,
              Truck: Number(v.Truck) || 0,
              Tricycle: Number(v.Tricycle) || 0,
              Motorcycle: Number(v.Motorcycle) || 0,
              Bus: Number(v.Bus) || 0,
            });
          }
        }
      }

      // 2. Also include the current snapshot from /pm25_data
      const snapUrl = `${RTDB_URL}/pm25_data/esp32-sensor-01.json?auth=${token}`;
      const snapResp = await fetch(snapUrl);
      if (snapResp.ok) {
        const snap = await snapResp.json();
        if (snap && typeof snap === 'object') {
          const ts = snap.vehicles_timestamp;
          const v = snap.vehicles;
          if (typeof ts === 'string' && v && typeof v === 'object') {
            parsedAll.push({
              timestamp: new Date(ts),
              Car: Number(v.Car) || 0,
              Jeep: Number(v.Jeep) || 0,
              Truck: Number(v.Truck) || 0,
              Tricycle: Number(v.Tricycle) || 0,
              Motorcycle: Number(v.Motorcycle) || 0,
              Bus: Number(v.Bus) || 0,
            });
          }
        }
      }

      parsedAll.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      setAllVehicleHistory(parsedAll);
    } catch (err) {
      console.error('[fetchVehicleHistory] failed:', err);
      setAllVehicleHistory([]);
    } finally {
      setVLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      await fetchHistory();
      await fetchVehicleHistory();
    } catch (e) {
      console.error('[HistoryPage] fetch error', e);
    }
  }, [fetchHistory, fetchVehicleHistory]);

  // Fetch once on mount. Data doesn't need re-fetching when the selected
  // window/day changes — everything is already pulled in full and just
  // gets re-filtered below. Use the Refresh button to pull newer data.
  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active [start, end] range driving every chart, table, and the CSV export.
  const activeRange = useMemo(() => {
    if (customMode) {
      const start = new Date(`${customDate}T${customStart}:00`);
      const end = new Date(`${customDate}T${customEnd}:00`);
      return { start, end };
    }
    const end = new Date();
    const start = new Date(end.getTime() - window.ms);
    return { start, end };
  }, [customMode, customDate, customStart, customEnd, window.ms]);

  const rangeValid =
    !customMode || activeRange.start.getTime() < activeRange.end.getTime();

  const points = useMemo(() => {
    if (!rangeValid) return [];
    return allPoints.filter(
      (p) =>
        p.timestamp.getTime() >= activeRange.start.getTime() &&
        p.timestamp.getTime() <= activeRange.end.getTime(),
    );
  }, [allPoints, activeRange, rangeValid]);

  const vehicleHistory = useMemo(() => {
    if (!rangeValid) return [];
    return allVehicleHistory.filter(
      (p) =>
        p.timestamp.getTime() >= activeRange.start.getTime() &&
        p.timestamp.getTime() <= activeRange.end.getTime(),
    );
  }, [allVehicleHistory, activeRange, rangeValid]);

  // ── PM2.5 event detection + Pearson/Spearman correlation, computed over
  //    the FULL dataset (not just the selected view window) so an event
  //    that straddles the edge of the currently-selected range still gets
  //    evaluated with its complete data. ──
  const eventAnalysis = useMemo(() => {
    const pmReadings: TimestampedPmReading[] = allPoints.map((point) => ({
      timestamp: point.timestamp,
      pm25: point.pm25,
    }));
    const vehicleReadings: TimestampedVehicleReading[] = allVehicleHistory.map(
      (point) => ({
        timestamp: point.timestamp,
        vehicles: {
          Car: point.Car,
          Jeep: point.Jeep,
          Truck: point.Truck,
          Tricycle: point.Tricycle,
          Motorcycle: point.Motorcycle,
          Bus: point.Bus,
        },
      }),
    );
    return detectPmEvents(pmReadings, vehicleReadings);
  }, [allPoints, allVehicleHistory]);

  // Only events that overlap the currently-selected view range are shown
  // in the table below, even though they were computed against full data.
  const visibleEvents = useMemo(() => {
    if (!rangeValid) return [];
    return eventAnalysis.events.filter(
      (e) =>
        e.endTime.getTime() >= activeRange.start.getTime() &&
        e.startTime.getTime() <= activeRange.end.getTime(),
    );
  }, [eventAnalysis, activeRange, rangeValid]);

  // Metrics
  const metrics = useMemo(() => {
    if (points.length === 0)
      return {
        avg: 0,
        max: 0,
        min: 0,
        spikes: 0,
        spikePoints: new Set<number>(),
        threshold: 0,
      };
    const vals = points.map((p) => p.pm25);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const threshold = Math.max(avg * 2, 75);
    const spikePoints = new Set<number>();
    let spikes = 0;
    vals.forEach((v, i) => {
      if (v >= threshold) {
        spikes++;
        spikePoints.add(i);
      }
    });
    return { avg, max, min, spikes, spikePoints, threshold };
  }, [points]);

  const chartData = useMemo(
    () =>
      points.map((p, i) => ({
        time: p.timestamp.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        pm25: p.pm25,
        isSpike: metrics.spikePoints.has(i),
        raw: p,
      })),
    [points, metrics.spikePoints],
  );

  const vehicleChartData = useMemo(
    () =>
      vehicleHistory.map((p) => ({
        time: p.timestamp.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        Car: p.Car,
        Jeep: p.Jeep,
        Truck: p.Truck,
        Tricycle: p.Tricycle,
        Motorcycle: p.Motorcycle,
        Bus: p.Bus,
      })),
    [vehicleHistory],
  );

  // Reset-aware total vehicles counted within the SELECTED range — replaces
  // the old approach of reading a single live snapshot node, which ignored
  // the selected date range entirely and silently undercounted across any
  // Pi restart within the window.
  const totalVehicles = useMemo(
    () =>
      sumVehiclesResetAware(
        vehicleHistory.map((p) => ({
          t: p.timestamp.getTime(),
          total: totalVehiclesAtPoint(p),
        })),
      ),
    [vehicleHistory],
  );

  const formatR = (r: number | null) => (r === null ? '—' : r.toFixed(2));

  // ── Shared CSV builder. Takes explicit datasets so it can be used both
  //    for the range-filtered export and the full-history export without
  //    duplicating the row/summary-building logic. ──
  const buildCsv = useCallback(
    (
      rangeLabel: string,
      pmPoints: HistoryPoint[],
      vHistory: VehicleHistoryPoint[],
      events: PmEvent[],
    ): string => {
      const hasVehicles = vHistory.length > 0;

      // For each PM2.5 reading, find the closest vehicle-history reading
      // at or before that timestamp (vHistory is sorted ascending). Only
      // pairs when the reading is recent — attaching counters from hours
      // earlier (or from the future via a fallback) over-reports traffic.
      const findVehiclesAt = (t: number): VehicleHistoryPoint | null => {
        let match: VehicleHistoryPoint | null = null;
        for (const vh of vHistory) {
          if (vh.timestamp.getTime() <= t) {
            match = vh;
          } else {
            break;
          }
        }
        return match && t - match.timestamp.getTime() <= SESSION_GAP_MS
          ? match
          : null;
      };

      const header = hasVehicles
        ? 'Timestamp,PM2.5,Car,Jeep,Truck,Tricycle,Motorcycle,Bus\n'
        : 'Timestamp,PM2.5\n';

      const rows = pmPoints
        .map((p) => {
          if (!hasVehicles) return `${p.timestamp.toISOString()},${p.pm25}`;
          const v = findVehiclesAt(p.timestamp.getTime());
          if (!v) return `${p.timestamp.toISOString()},${p.pm25},0,0,0,0,0,0`;
          return `${p.timestamp.toISOString()},${p.pm25},${v.Car},${v.Jeep},${v.Truck},${v.Tricycle},${v.Motorcycle},${v.Bus}`;
        })
        .join('\n');

      const totalV = sumVehiclesResetAware(
        vHistory.map((p) => ({
          t: p.timestamp.getTime(),
          total: totalVehiclesAtPoint(p),
        })),
      );

      const vals = pmPoints.map((p) => p.pm25);
      const avg = vals.length
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : 0;
      const max = vals.length ? Math.max(...vals) : 0;
      const min = vals.length ? Math.min(...vals) : 0;
      const threshold = Math.max(avg * 2, 75);
      const spikes = vals.filter((v) => v >= threshold).length;

      const eventLines = events.map(
        (e, i) =>
          `${e.isHotspot ? 'Hotspot' : 'Event'} ${i + 1},${e.startTime.toISOString()},${e.endTime.toISOString()},` +
          `${e.durationMinutes},${e.peakPm25.toFixed(1)},${e.averagePm25.toFixed(1)},` +
          `${e.averageVehicleRatePerMinute?.toFixed(1) ?? 'n/a'},${e.sampleSize},` +
          `${formatR(e.pearsonR)},${formatR(e.spearmanR)},` +
          `${getCorrelationLabel(e.pearsonStrength)},${getCorrelationLabel(e.spearmanStrength)},` +
          `${getVehicleDataQualityLabel(e.vehicleDataQuality)},${e.hotspotLabel}`,
      );

      const summary = [
        '',
        '',
        'Summary',
        `Range,${rangeLabel}`,
        `Avg PM2.5,${avg.toFixed(1)}`,
        `Max PM2.5,${max}`,
        `Min PM2.5,${min}`,
        `Spikes,${spikes}`,
        `Vehicles (reset-aware total for this range),${totalV}`,
        `Readings,${pmPoints.length}`,
        `Traffic-Related Hotspots Detected,${events.filter((e) => e.isHotspot).length}`,
        `Total PM2.5 Events Detected (hotspots + non-hotspot pollution events),${events.length}`,
        `Events With Reliable Correlation (n>=${CORRELATION_MIN_SAMPLE_SIZE}),${
          events.filter((e) => e.sampleSize >= CORRELATION_MIN_SAMPLE_SIZE)
            .length
        }`,
        '',
        'Detected Hotspots & PM2.5 Events',
        'ID,Start,End,Duration(min),Peak PM2.5,Avg PM2.5,Avg Vehicles/min,Sample Size(min),Pearson r,Spearman r,Pearson Strength,Spearman Strength,Vehicle Data Quality,Classification',
        ...eventLines,
      ].join('\n');

      return header + rows + '\n' + summary;
    },
    [formatR],
  );

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = (csv: string, filename: string) => {
    downloadBlob(new Blob([csv], { type: 'text/csv' }), filename);
  };

  const exportCSV = () => {
    const rangeLabel = customMode
      ? `${customDate} ${customStart}-${customEnd}`
      : window.label;
    const csv = buildCsv(rangeLabel, points, vehicleHistory, visibleEvents);
    const label = customMode
      ? `${customDate}_${customStart}-${customEnd}`.replace(/:/g, '')
      : window.label;
    downloadCsv(csv, `pm25-history-${label}.csv`);
  };

  // Exports the complete Firebase history as an Excel workbook with one tab
  // per day. PM2.5 and vehicle history are recorded by separate processes, so
  // each tab contains two independent session-grouped sections: the PM2.5
  // readings (with vehicle counters attached at each reading) and the full
  // vehicle history. A gap longer than SESSION_GAP_MINUTES starts a new
  // session in either series, so interrupted recordings are never stitched
  // together.
  const exportAllXlsx = (includeVehicles = true) => {
    if (allPoints.length === 0 && allVehicleHistory.length === 0) return;

    // Group both datasets by local day (PM and vehicle timestamps represent
    // the same instants, so a day in one is the same day in the other).
    const pmByDay = new Map<string, HistoryPoint[]>();
    for (const p of allPoints) {
      const key = localDateKey(p.timestamp);
      const arr = pmByDay.get(key);
      if (arr) arr.push(p);
      else pmByDay.set(key, [p]);
    }
    const vByDay = new Map<string, VehicleHistoryPoint[]>();
    for (const v of allVehicleHistory) {
      const key = localDateKey(v.timestamp);
      const arr = vByDay.get(key);
      if (arr) arr.push(v);
      else vByDay.set(key, [v]);
    }
    const dayKeys = [...new Set([...pmByDay.keys(), ...vByDay.keys()])].sort();

    const allPmVals = allPoints.map((p) => p.pm25);
    const allAvg = allPmVals.reduce((a, b) => a + b, 0) / allPmVals.length;
    const allMax = allPmVals.reduce((a, b) => (b > a ? b : a), -Infinity);
    const allMin = allPmVals.reduce((a, b) => (b < a ? b : a), Infinity);
    const allVehicles = includeVehicles
      ? sumVehiclesResetAware(
          allVehicleHistory.map((p) => ({
            t: p.timestamp.getTime(),
            total: totalVehiclesAtPoint(p),
          })),
        )
      : 0;

    const sessionCounts = dayKeys.reduce(
      (acc, key) => {
        acc.pm += splitIntoSessions(pmByDay.get(key) ?? [], SESSION_GAP_MS)
          .length;
        acc.vehicles += includeVehicles
          ? splitIntoSessions(vByDay.get(key) ?? [], SESSION_GAP_MS).length
          : 0;
        return acc;
      },
      { pm: 0, vehicles: 0 },
    );

    // ── Overview tab ──
    const overviewRows: XlsxCell[][] = [
      [{ v: 'PM2.5 History — Complete Export', s: 1 }],
      ['Device', 'esp32-sensor-01'],
      ['Generated', formatLocal(new Date())],
      ['Days with data (PM2.5 or vehicles)', dayKeys.length],
      ['PM2.5 readings', allPoints.length],
      ['Sessions (PM2.5)', sessionCounts.pm],
      ['Avg PM2.5', allAvg.toFixed(1)],
      ['Max PM2.5', allMax],
      ['Min PM2.5', allMin],
      ...(includeVehicles
        ? [
            ['Vehicle readings', allVehicleHistory.length],
            ['Sessions (vehicles)', sessionCounts.vehicles],
            ['Vehicles (reset-aware, all time)', allVehicles],
          ]
        : []),
      [
        'Traffic-related hotspots detected',
        eventAnalysis.events.filter((e) => e.isHotspot).length,
      ],
      ['PM2.5 events detected', eventAnalysis.events.length],
      [],
      [
        includeVehicles
          ? 'Each tab below is one day, split into PM2.5 and vehicle sections.'
          : 'Each tab below is one day with PM2.5 readings only (no vehicle data).',
      ],
      [
        `Within each section, a gap longer than ${SESSION_GAP_MINUTES} minutes`,
      ],
      ['between readings starts a new session, so interrupted recordings'],
      ['are not stitched together.'],
    ];

    const sheets: XlsxSheet[] = [
      { name: 'Overview', rows: overviewRows },
      ...dayKeys.map((key) => {
        const dayPm = pmByDay.get(key) ?? [];
        const dayV = vByDay.get(key) ?? [];
        const hasPm = dayPm.length > 0;
        const hasVehicles = dayV.length > 0;
        const pmSessions = splitIntoSessions(dayPm, SESSION_GAP_MS);
        const vSessions = splitIntoSessions(dayV, SESSION_GAP_MS);

        // Nearest vehicle reading at or before t within this day (for pairing
        // counters onto PM2.5 rows). Only pairs when the reading is recent —
        // attaching counters from hours earlier over-reports traffic.
        const vehiclesAt = (t: number): VehicleHistoryPoint | null => {
          let match: VehicleHistoryPoint | null = null;
          for (const vh of dayV) {
            if (vh.timestamp.getTime() <= t) match = vh;
            else break;
          }
          return match && t - match.timestamp.getTime() <= SESSION_GAP_MS
            ? match
            : null;
        };

        const pmVals = dayPm.map((p) => p.pm25);
        const avg = hasPm
          ? pmVals.reduce((a, b) => a + b, 0) / pmVals.length
          : 0;
        const max = hasPm
          ? pmVals.reduce((a, b) => (b > a ? b : a), -Infinity)
          : 0;
        const min = hasPm
          ? pmVals.reduce((a, b) => (b < a ? b : a), Infinity)
          : 0;
        const vehTotal = hasVehicles
          ? sumVehiclesResetAware(
              dayV.map((p) => ({
                t: p.timestamp.getTime(),
                total: totalVehiclesAtPoint(p),
              })),
            )
          : 0;

        const rows: XlsxCell[][] = [
          [{ v: `Sensor History — ${key}`, s: 1 }],
          [
            `Sessions: ${pmSessions.length} PM + ${includeVehicles ? vSessions.length : 0} vehicle` +
              (hasPm
                ? `  |  PM2.5 readings: ${dayPm.length}  |  Avg PM2.5: ${avg.toFixed(1)}  |  Max: ${max}  |  Min: ${min}`
                : '') +
              (includeVehicles && hasVehicles
                ? `  |  Vehicle readings: ${dayV.length}  |  Vehicles (reset-aware): ${vehTotal}`
                : ''),
          ],
        ];

        // ── PM2.5 section ──
        if (hasPm) {
          rows.push([{ v: 'PM2.5 Readings', s: 2 }]);
          rows.push(
            includeVehicles && hasVehicles
              ? [
                  { v: 'Timestamp', s: 1 },
                  { v: 'PM2.5', s: 1 },
                  { v: 'Car', s: 1 },
                  { v: 'Jeep', s: 1 },
                  { v: 'Truck', s: 1 },
                  { v: 'Tricycle', s: 1 },
                  { v: 'Motorcycle', s: 1 },
                  { v: 'Bus', s: 1 },
                ]
              : [
                  { v: 'Timestamp', s: 1 },
                  { v: 'PM2.5', s: 1 },
                ],
          );
          pmSessions.forEach((session, si) => {
            rows.push([
              { v: sessionHeader(`Session ${si + 1}`, session), s: 2 },
            ]);
            for (const p of session) {
              if (!includeVehicles || !hasVehicles) {
                rows.push([formatLocal(p.timestamp), p.pm25]);
              } else {
                const v = vehiclesAt(p.timestamp.getTime());
                rows.push([
                  formatLocal(p.timestamp),
                  p.pm25,
                  v ? v.Car : 0,
                  v ? v.Jeep : 0,
                  v ? v.Truck : 0,
                  v ? v.Tricycle : 0,
                  v ? v.Motorcycle : 0,
                  v ? v.Bus : 0,
                ]);
              }
            }
            rows.push([]); // blank separator between sessions
          });
        } else {
          rows.push(['No PM2.5 readings on this day.']);
        }

        // ── Vehicle section ──
        if (includeVehicles && hasVehicles) {
          rows.push([{ v: 'Vehicle Readings', s: 2 }]);
          rows.push([
            { v: 'Timestamp', s: 1 },
            { v: 'Car', s: 1 },
            { v: 'Jeep', s: 1 },
            { v: 'Truck', s: 1 },
            { v: 'Tricycle', s: 1 },
            { v: 'Motorcycle', s: 1 },
            { v: 'Bus', s: 1 },
          ]);
          vSessions.forEach((session, si) => {
            rows.push([
              {
                v: sessionHeader(`Vehicle session ${si + 1}`, session),
                s: 2,
              },
            ]);
            for (const v of session) {
              rows.push([
                formatLocal(v.timestamp),
                v.Car,
                v.Jeep,
                v.Truck,
                v.Tricycle,
                v.Motorcycle,
                v.Bus,
              ]);
            }
            rows.push([]); // blank separator between sessions
          });
        }

        return { name: key, rows };
      }),
    ];

    downloadBlob(
      buildXlsxBlob(sheets),
      includeVehicles
        ? 'pm25-history-all-time.xlsx'
        : 'pm25-history-all-time-pm-only.xlsx',
    );
  };

  return (
    <div className='history-page'>
      <div className='history-header'>
        <h2>Sensor History — esp32-sensor-01</h2>
        <div className='time-filters'>
          {TIME_WINDOWS.map((tw, i) => (
            <button
              key={tw.label}
              className={!customMode && i === windowIdx ? 'active' : ''}
              onClick={() => {
                setCustomMode(false);
                setWindowIdx(i);
              }}
            >
              {tw.label}
            </button>
          ))}
          <button
            className={customMode ? 'active' : ''}
            onClick={() => setCustomMode(true)}
          >
            Custom
          </button>
          <button onClick={refreshAll}>Refresh</button>
          <button
            className='export-btn'
            onClick={exportCSV}
            disabled={points.length === 0}
            title='Export the currently selected time window'
          >
            CSV
          </button>
          <button
            className='export-btn'
            onClick={() => exportAllXlsx()}
            disabled={allPoints.length === 0 && allVehicleHistory.length === 0}
            title='Export the entire history as an Excel workbook — one tab per day, sessions separated'
          >
            Export All (.xlsx)
          </button>
          <button
            className='export-btn'
            onClick={() => exportAllXlsx(false)}
            disabled={allPoints.length === 0}
            title='Export only the PM2.5 readings — no vehicle data'
          >
            PM2.5 Only
          </button>
        </div>
      </div>

      {customMode && (
        <div className='custom-range-bar'>
          <label>
            Date
            <input
              type='date'
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          </label>
          <label>
            Start
            <input
              type='time'
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </label>
          <label>
            End
            <input
              type='time'
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </label>
          {!rangeValid && (
            <span className='range-error'>
              End time must be after start time
            </span>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className='metrics-bar'>
        <div className='metric'>
          <span className='metric-label'>Avg PM2.5</span>
          <span className='metric-value'>{metrics.avg.toFixed(1)} µg/m³</span>
        </div>
        <div className='metric'>
          <span className='metric-label'>Max</span>
          <span className='metric-value highlight'>{metrics.max} µg/m³</span>
        </div>
        <div className='metric'>
          <span className='metric-label'>Min</span>
          <span className='metric-value'>{metrics.min} µg/m³</span>
        </div>
        <div className='metric'>
          <span className='metric-label'>Spikes</span>
          <span className='metric-value spike-count'>{metrics.spikes}</span>
        </div>
        <div className='metric'>
          <span className='metric-label'>Vehicles</span>
          <span className='metric-value'>{totalVehicles}</span>
        </div>
        <div className='metric'>
          <span className='metric-label'>Hotspots</span>
          <span className='metric-value highlight'>
            {visibleEvents.filter((e) => e.isHotspot).length}
          </span>
        </div>
        <div className='metric'>
          <span className='metric-label'>PM2.5 Events</span>
          <span className='metric-value'>{visibleEvents.length}</span>
        </div>
        <div className='metric'>
          <span className='metric-label'>Readings</span>
          <span className='metric-value'>{points.length}</span>
        </div>
      </div>

      <p className='hotspot-note'>
        A <strong>traffic-related hotspot</strong> is a sustained PM2.5 event
        (1-minute average at or above {PM25_ELEVATED_THRESHOLD} µg/m³,
        tolerating up to {EVENT_CLOSE_GAP_MINUTES} consecutive below-threshold
        minutes, minimum {EVENT_MIN_DURATION_MINUTES} minutes to be logged) that
        also shows at least a moderate correlation (|r| ≥ 0.3, Pearson or
        Spearman) with vehicle activity, computed over at least{' '}
        {CORRELATION_MIN_SAMPLE_SIZE} minutes of reliable data. Sustained PM2.5
        events that don't clear the correlation bar — e.g. weather-suppressed
        sessions, or pollution from a non-traffic source — are still logged
        below as plain pollution events, just not counted as hotspots. A gap of
        more than {SESSION_GAP_MINUTES} minutes between readings is treated as
        the device going offline and always closes any event in progress.
        Vehicle-count decreases (counter restarts) are detected and excluded
        from the affected minute's rate rather than producing a false negative
        delta.
      </p>

      {loading ? (
        <div className='history-loading'>Loading history...</div>
      ) : !rangeValid ? (
        <div className='history-empty'>Fix the date range above.</div>
      ) : points.length === 0 ? (
        <div className='history-empty'>
          No history data for this time window.
        </div>
      ) : (
        <>
          {/* PM2.5 Chart */}
          <div className='chart-section'>
            <h3>PM2.5 Over Time</h3>
            <ResponsiveContainer width='100%' height={280}>
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray='3 3'
                  stroke='rgba(255,255,255,0.06)'
                />
                <XAxis
                  dataKey='time'
                  tick={{ fontSize: 10, fill: '#5a6978' }}
                />
                <YAxis tick={{ fontSize: 10, fill: '#5a6978' }} />
                <Tooltip
                  contentStyle={{
                    background: '#161b22',
                    border: '1px solid rgba(0,217,255,0.2)',
                    borderRadius: 6,
                  }}
                  formatter={(val: unknown) => {
                    const num =
                      typeof val === 'number'
                        ? val
                        : typeof val === 'string' && val.trim() !== ''
                          ? Number(val)
                          : NaN;
                    return [isNaN(num) ? 'N/A µg/m³' : `${num} µg/m³`, 'PM2.5'];
                  }}
                />
                <ReferenceLine
                  y={metrics.threshold}
                  stroke='#ff3333'
                  strokeDasharray='4 4'
                  label={{
                    value: 'Spike threshold',
                    fill: '#ff3333',
                    fontSize: 10,
                  }}
                />
                <ReferenceLine
                  y={PM25_ELEVATED_THRESHOLD}
                  stroke='#ffa500'
                  strokeDasharray='2 4'
                  label={{
                    value: 'Event threshold',
                    fill: '#ffa500',
                    fontSize: 10,
                  }}
                />
                <Line
                  type='monotone'
                  dataKey='pm25'
                  stroke='#00d9ff'
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type='monotone'
                  dataKey='isSpike'
                  stroke='none'
                  dot={(props: {
                    cx?: number;
                    cy?: number;
                    payload?: { isSpike: boolean };
                  }) => {
                    if (
                      !props.payload?.isSpike ||
                      props.cx == null ||
                      props.cy == null
                    )
                      return null;
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={5}
                        fill='#ff3333'
                        stroke='#fff'
                        strokeWidth={1}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Vehicle Counts Over Time */}
          <div className='chart-section'>
            <h3>Vehicle Counts Over Time</h3>
            <div className='chart-frame'>
              {vLoading ? (
                <div className='history-loading'>
                  Loading vehicle history...
                </div>
              ) : vehicleHistory.length === 0 ? (
                <div className='history-empty'>
                  No vehicle history data for this time window.
                </div>
              ) : (
                <ResponsiveContainer width='100%' height={280}>
                  <LineChart data={vehicleChartData}>
                    <CartesianGrid
                      strokeDasharray='3 3'
                      stroke='rgba(255,255,255,0.06)'
                    />
                    <XAxis
                      dataKey='time'
                      tick={{ fontSize: 10, fill: '#5a6978' }}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#5a6978' }} />
                    <Tooltip
                      contentStyle={{
                        background: '#161b22',
                        border: '1px solid rgba(0,217,255,0.2)',
                        borderRadius: 6,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {Object.keys(VEHICLE_COLORS).map((type) => (
                      <Line
                        key={type}
                        type='monotone'
                        dataKey={type}
                        stroke={VEHICLE_COLORS[type]}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Detected PM2.5 Events + Hotspot classification */}
          <div className='chart-section'>
            <h3>Detected Hotspots &amp; PM2.5 Events</h3>
            {visibleEvents.length === 0 ? (
              <div className='history-empty'>
                No PM2.5 events (≥{PM25_ELEVATED_THRESHOLD} µg/m³ sustained ≥
                {EVENT_MIN_DURATION_MINUTES} min) in this time window.
              </div>
            ) : (
              <div className='reading-table-scroll'>
                <table className='reading-table'>
                  <thead>
                    <tr>
                      <th>Start</th>
                      <th>Duration</th>
                      <th>Peak PM2.5</th>
                      <th>Avg PM2.5</th>
                      <th>Avg Vehicles/min</th>
                      <th>n (min)</th>
                      <th>Pearson r</th>
                      <th>Spearman r</th>
                      <th>Vehicle Data</th>
                      <th>Classification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEvents.map((e: PmEvent, i: number) => (
                      <tr key={i} className={e.isHotspot ? 'spike-row' : ''}>
                        <td>
                          {e.startTime.toLocaleString([], {
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </td>
                        <td>{e.durationMinutes} min</td>
                        <td>{e.peakPm25.toFixed(1)} µg/m³</td>
                        <td>{e.averagePm25.toFixed(1)} µg/m³</td>
                        <td>
                          {e.averageVehicleRatePerMinute !== null
                            ? e.averageVehicleRatePerMinute.toFixed(1)
                            : '—'}
                        </td>
                        <td>{e.sampleSize}</td>
                        <td
                          style={{
                            color: getCorrelationColor(e.pearsonStrength),
                          }}
                        >
                          {formatR(e.pearsonR)} (
                          {getCorrelationLabel(e.pearsonStrength)})
                        </td>
                        <td
                          style={{
                            color: getCorrelationColor(e.spearmanStrength),
                          }}
                        >
                          {formatR(e.spearmanR)} (
                          {getCorrelationLabel(e.spearmanStrength)})
                        </td>
                        <td>
                          {getVehicleDataQualityLabel(e.vehicleDataQuality)}
                        </td>
                        <td
                          style={{ color: e.isHotspot ? '#ff3333' : '#5a6978' }}
                        >
                          {e.hotspotLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Reading Table */}
          <div className='reading-table-container'>
            <h3>Readings</h3>
            <div className='reading-table-scroll'>
              <table className='reading-table'>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>PM2.5</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points]
                    .reverse()
                    .slice(0, 200)
                    .map((p, i) => (
                      <tr
                        key={i}
                        className={
                          metrics.spikePoints.has(points.indexOf(p))
                            ? 'spike-row'
                            : ''
                        }
                      >
                        <td>
                          {p.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false,
                          })}
                        </td>
                        <td>{p.pm25} µg/m³</td>
                        <td className={getStatusClass(p.pm25)}>
                          {getStatusLabel(p.pm25)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {points.length > 200 && (
                <p className='table-note'>
                  Showing latest 200 of {points.length} readings
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getStatusLabel(pm25: number): string {
  if (pm25 <= 9) return 'Good';
  if (pm25 <= 35.4) return 'Moderate';
  if (pm25 <= 55.4) return 'Unhealthy for Sensitive Groups';
  if (pm25 <= 125.4) return 'Unhealthy';
  if (pm25 <= 225.4) return 'Very Unhealthy';
  return 'Hazardous';
}

function getStatusClass(pm25: number): string {
  if (pm25 <= 9) return 'status-good';
  if (pm25 <= 35.4) return 'status-moderate';
  if (pm25 <= 55.4) return 'status-sensitive';
  if (pm25 <= 125.4) return 'status-unhealthy';
  if (pm25 <= 225.4) return 'status-very-unhealthy';
  return 'status-hazardous';
}
