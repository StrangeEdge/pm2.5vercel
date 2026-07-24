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
  classifyHotspotSession,
  HOTSPOT_SESSION_GAP_MINUTES,
  type TimestampedPmReading,
  type TimestampedVehicleReading,
} from '../utils/hotspotClassification';
import { getHotspotTierColor, getHotspotTierLabel } from '../data/dummyData';

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

interface VehicleCounts {
  Car: number;
  Jeep: number;
  Truck: number;
  Tricycle: number;
  Motorcycle: number;
  Bus: number;
}

const TIME_WINDOWS = [
  { label: '5m', ms: 5 * 60 * 1000 },
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '1w', ms: 7 * 24 * 60 * 60 * 1000 },
];

const EMPTY_VEHICLES: VehicleCounts = {
  Car: 0,
  Jeep: 0,
  Truck: 0,
  Tricycle: 0,
  Motorcycle: 0,
  Bus: 0,
};

const VEHICLE_COLORS: Record<string, string> = {
  Car: '#3b82f6',
  Jeep: '#06b6d4',
  Truck: '#ef4444',
  Tricycle: '#ffa500',
  Motorcycle: '#f59e0b',
  Bus: '#8b5cf6',
};

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const [vehicles, setVehicles] = useState<VehicleCounts>(EMPTY_VEHICLES);

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
        const pm = d.pm25 ?? d.pm2_5 ?? d.value;
        const ts = d.timestamp;
        if (typeof pm !== 'number' || typeof ts !== 'string') continue;
        parsedAll.push({ pm25: pm, timestamp: new Date(ts) });
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

  const fetchVehicles = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const resp = await fetch(
        `${RTDB_URL}/pm25_data/esp32-sensor-01/vehicles.json?auth=${token}`,
      );
      if (!resp.ok) return;
      const raw = await resp.json();
      if (raw && typeof raw === 'object') {
        setVehicles({
          Car: Number(raw.Car) || 0,
          Jeep: Number(raw.Jeep) || 0,
          Truck: Number(raw.Truck) || 0,
          Tricycle: Number(raw.Tricycle) || 0,
          Motorcycle: Number(raw.Motorcycle) || 0,
          Bus: Number(raw.Bus) || 0,
        });
      }
    } catch (err) {
      console.error('[fetchVehicles] failed:', err);
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
      await fetchVehicles();
      await fetchVehicleHistory();
    } catch (e) {
      console.error('[HistoryPage] fetch error', e);
    }
  }, [fetchHistory, fetchVehicles, fetchVehicleHistory]);

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

  const hotspotReadings = useMemo(() => {
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
    return { pmReadings, vehicleReadings };
  }, [allPoints, allVehicleHistory]);

  // Two sensitivity checks against the same underlying data. Near-miss
  // stats (maxElevatedRunLength / maxCriticalRunLength) are identical
  // between them since they don't depend on the threshold — only the
  // resulting tier does.
  const hotspotSession10 = useMemo(
    () =>
      classifyHotspotSession(
        hotspotReadings.pmReadings,
        hotspotReadings.vehicleReadings,
        10,
      ),
    [hotspotReadings],
  );
  const hotspotSession5 = useMemo(
    () =>
      classifyHotspotSession(
        hotspotReadings.pmReadings,
        hotspotReadings.vehicleReadings,
        5,
      ),
    [hotspotReadings],
  );
  const hotspotSession = hotspotSession10;

  // Metrics
  const metrics = useMemo(() => {
    if (points.length === 0)
      return {
        avg: 0,
        max: 0,
        min: 0,
        spikes: 0,
        spikePoints: new Set<number>(),
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

  const totalVehicles = Object.values(vehicles).reduce((a, b) => a + b, 0);

  const exportCSV = () => {
    const hasVehicles = vehicleHistory.length > 0;

    // For each PM2.5 reading, find the closest vehicle-history reading
    // at or before that timestamp (vehicleHistory is sorted ascending).
    const findVehiclesAt = (t: number): VehicleHistoryPoint | null => {
      let match: VehicleHistoryPoint | null = null;
      for (const vh of vehicleHistory) {
        if (vh.timestamp.getTime() <= t) {
          match = vh;
        } else {
          break;
        }
      }
      return match ?? vehicleHistory[0] ?? null;
    };

    const header = hasVehicles
      ? 'Timestamp,PM2.5,Hotspot Tier,Car,Jeep,Truck,Tricycle,Motorcycle,Bus\n'
      : 'Timestamp,PM2.5,Hotspot Tier\n';

    // Time-align vehicle counts to each PM2.5 reading instead of reusing one
    // fixed snapshot for every row. `points` and `vehicleHistory` are both
    // sorted ascending by timestamp, so a single forward-advancing pointer
    // finds, for each PM reading, the most recent vehicle-history entry at
    // or before that reading's timestamp (an "as-of" match) — matching how
    // the Pi actually reports vehicle state: valid until its next push.
    let vIdx = 0;
    const rows = points
      .map((p) => {
        if (!hasVehicles) return `${p.timestamp.toISOString()},${p.pm25}`;
        const v = findVehiclesAt(p.timestamp.getTime());
        if (!v) return `${p.timestamp.toISOString()},${p.pm25},0,0,0,0,0,0`;
        return `${p.timestamp.toISOString()},${p.pm25},${v.Car},${v.Jeep},${v.Truck},${v.Tricycle},${v.Motorcycle},${v.Bus}`;
      })
      .join('\n');

    const rangeLabel = customMode
      ? `${customDate} ${customStart}-${customEnd}`
      : window.label;

    const summary = [
      '',
      '',
      'Summary',
      `Range,${rangeLabel}`,
      `Avg PM2.5,${metrics.avg.toFixed(1)}`,
      `Max PM2.5,${metrics.max}`,
      `Min PM2.5,${metrics.min}`,
      `Spikes,${metrics.spikes}`,
      `Vehicles,${totalVehicles}`,
      `Hotspot Tier (10-min),${getHotspotTierLabel(hotspotSession10.hotspotTier)}`,
      `Hotspot Peak Tier (10-min),${getHotspotTierLabel(hotspotSession10.peakHotspotTier)}`,
      `Hotspot Tier (5-min),${getHotspotTierLabel(hotspotSession5.hotspotTier)}`,
      `Hotspot Peak Tier (5-min),${getHotspotTierLabel(hotspotSession5.peakHotspotTier)}`,
      `Longest Elevated Streak (min),${hotspotSession10.maxElevatedRunLength}`,
      `Longest Critical Streak (min),${hotspotSession10.maxCriticalRunLength}`,
      `Traffic Baseline (vehicles/min),${hotspotSession10.sessionMeanVehicleRatePerMinute.toFixed(1)}`,
      `Readings,${points.length}`,
    ].join('\n');

    const blob = new Blob([header + rows + '\n' + summary], {
      type: 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const label = customMode
      ? `${customDate}_${customStart}-${customEnd}`.replace(/:/g, '')
      : window.label;
    a.download = `pm25-history-${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          >
            CSV
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
            <span className='range-error'>End time must be after start time</span>
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
          <span className='metric-label'>Hotspot</span>
          <span
            className='metric-value'
            style={{ color: getHotspotTierColor(hotspotSession.hotspotTier) }}
          >
            {getHotspotTierLabel(hotspotSession.hotspotTier)}
          </span>
        </div>
        <div className='metric'>
          <span className='metric-label'>Traffic Baseline</span>
          <span className='metric-value'>
            {hotspotSession.sessionMeanVehicleRatePerMinute.toFixed(1)}
          </span>
        </div>
        <div className='metric'>
          <span className='metric-label'>Readings</span>
          <span className='metric-value'>{points.length}</span>
        </div>
      </div>

      <p className='hotspot-note'>
        Hotspot tier uses 1-minute vehicle-rate windows, a 5-minute baseline
        warm-up, and a 10-minute sustained run requirement, computed over the
        full dataset regardless of the selected view range. A gap of more
        than {HOTSPOT_SESSION_GAP_MINUTES} minutes between readings starts a
        new session, resetting the baseline and any in-progress streak.
      </p>

      <div className='hotspot-sensitivity'>
        <h3>Hotspot Sensitivity Check</h3>
        <div className='hotspot-sensitivity-grid'>
          <div className='hotspot-sensitivity-col'>
            <span className='hotspot-sensitivity-label'>10-min sustained</span>
            <span
              className='metric-value'
              style={{
                color: getHotspotTierColor(hotspotSession10.hotspotTier),
              }}
            >
              {getHotspotTierLabel(hotspotSession10.hotspotTier)}
            </span>
            <span className='hotspot-sensitivity-sub'>
              Peak reached: {getHotspotTierLabel(hotspotSession10.peakHotspotTier)}
            </span>
          </div>
          <div className='hotspot-sensitivity-col'>
            <span className='hotspot-sensitivity-label'>5-min sustained</span>
            <span
              className='metric-value'
              style={{
                color: getHotspotTierColor(hotspotSession5.hotspotTier),
              }}
            >
              {getHotspotTierLabel(hotspotSession5.hotspotTier)}
            </span>
            <span className='hotspot-sensitivity-sub'>
              Peak reached: {getHotspotTierLabel(hotspotSession5.peakHotspotTier)}
            </span>
          </div>
          <div className='hotspot-sensitivity-col'>
            <span className='hotspot-sensitivity-label'>Near misses</span>
            <span className='metric-value'>
              {hotspotSession10.maxElevatedRunLength}m elevated
            </span>
            <span className='hotspot-sensitivity-sub'>
              {hotspotSession10.maxCriticalRunLength}m critical (longest
              qualifying streak observed, threshold met or not)
            </span>
          </div>
        </div>
      </div>

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