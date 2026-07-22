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
  { label: '5m', ms: 5 * 60 * 1000, limit: 60 },
  { label: '30m', ms: 30 * 60 * 1000, limit: 360 },
  { label: '1h', ms: 60 * 60 * 1000, limit: 720 },
  { label: '6h', ms: 6 * 60 * 60 * 1000, limit: 720 },
  { label: '12h', ms: 12 * 60 * 60 * 1000, limit: 2000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000, limit: 2000 },
  { label: '1w', ms: 7 * 24 * 60 * 60 * 1000, limit: 2000 },
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

export default function HistoryPage() {
  const [windowIdx, setWindowIdx] = useState(1); // default 30m
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [allPoints, setAllPoints] = useState<HistoryPoint[]>([]);
  const [vehicles, setVehicles] = useState<VehicleCounts>(EMPTY_VEHICLES);
  const [vehicleHistory, setVehicleHistory] = useState<VehicleHistoryPoint[]>(
    [],
  );
  const [allVehicleHistory, setAllVehicleHistory] = useState<
    VehicleHistoryPoint[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [vLoading, setVLoading] = useState(true);

  const window = TIME_WINDOWS[windowIdx];

  // fetch raw history, filter client-side by time window
  const fetchHistory = useCallback(async (_limit: number, ms: number) => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const url = `${RTDB_URL}/pm25_history/esp32-sensor-01.json?auth=${token}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
      const raw = await resp.json();

      if (!raw) {
        setPoints([]);
        setLoading(false);
        return;
      }

      const now = Date.now();
      const cutoff = now - ms;
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
      const parsedWindow = parsedAll.filter(
        (point) => point.timestamp.getTime() >= cutoff,
      );
      setAllPoints(parsedAll);
      setPoints(parsedWindow);
    } catch (err) {
      console.error('[fetchHistory] failed:', err);
      setPoints([]);
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

  const fetchVehicleHistory = useCallback(async (ms: number) => {
    setVLoading(true);
    try {
      const token = await getAuthToken();
      const parsedAll: VehicleHistoryPoint[] = [];
      const now = Date.now();
      const cutoff = now - ms;

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
            const t = new Date(ts).getTime();
            if (!isNaN(t) && t >= cutoff) {
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
      }

      parsedAll.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const parsedWindow = parsedAll.filter(
        (point) => point.timestamp.getTime() >= cutoff,
      );
      setAllVehicleHistory(parsedAll);
      setVehicleHistory(parsedWindow);
    } catch (err) {
      console.error('[fetchVehicleHistory] failed:', err);
      setAllVehicleHistory([]);
      setVehicleHistory([]);
    } finally {
      setVLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await fetchHistory(window.limit, window.ms);
        await fetchVehicles();
        await fetchVehicleHistory(window.ms);
      } catch (e) {
        console.error('[HistoryPage] fetch error', e);
      }
    })();
  }, [
    windowIdx,
    window.limit,
    window.ms,
    fetchHistory,
    fetchVehicles,
    fetchVehicleHistory,
  ]);

  const hotspotSession = useMemo(() => {
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

    return classifyHotspotSession(pmReadings, vehicleReadings);
  }, [allPoints, allVehicleHistory]);

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
    const v = vehicles;
    const hasVehicles = totalVehicles > 0;
    const header = hasVehicles
      ? 'Timestamp,PM2.5,Car,Jeep,Truck,Tricycle,Motorcycle,Bus\n'
      : 'Timestamp,PM2.5\n';
    const rows = points
      .map((p) =>
        hasVehicles
          ? `${p.timestamp.toISOString()},${p.pm25},${v.Car},${v.Jeep},${v.Truck},${v.Tricycle},${v.Motorcycle},${v.Bus}`
          : `${p.timestamp.toISOString()},${p.pm25}`,
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pm25-history-${window.label}.csv`;
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
              className={i === windowIdx ? 'active' : ''}
              onClick={() => setWindowIdx(i)}
            >
              {tw.label}
            </button>
          ))}
          <button
            className='export-btn'
            onClick={exportCSV}
            disabled={points.length === 0}
          >
            CSV
          </button>
        </div>
      </div>

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
        warm-up, and a 10-minute sustained run requirement.
      </p>

      {loading ? (
        <div className='history-loading'>Loading history...</div>
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
            {vLoading ? (
              <div className='history-loading'>Loading vehicle history...</div>
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
