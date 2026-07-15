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
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import './HistoryPage.css';
import { getAuthToken } from '../config/firebaseConfig';

const RTDB_URL = import.meta.env.VITE_RTDB_URL;

type HistoryPoint = { timestamp: Date; pm25: number };

interface VehicleCounts {
  Car: number;
  Van: number;
  Jeepney: number;
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
  Van: 0,
  Jeepney: 0,
  Truck: 0,
  Tricycle: 0,
  Motorcycle: 0,
  Bus: 0,
};

export default function HistoryPage() {
  const [windowIdx, setWindowIdx] = useState(1); // default 30m
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [vehicles, setVehicles] = useState<VehicleCounts>(EMPTY_VEHICLES);
  const [loading, setLoading] = useState(true);

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
      const parsed: HistoryPoint[] = [];

      for (const key of Object.keys(raw)) {
        const d = raw[key];
        if (!d || typeof d !== 'object') continue;
        const pm = d.pm25 ?? d.pm2_5 ?? d.value;
        const ts = d.timestamp;
        if (typeof pm !== 'number' || typeof ts !== 'string') continue;
        const t = new Date(ts).getTime();
        if (isNaN(t) || t < cutoff) continue;
        parsed.push({ pm25: pm, timestamp: new Date(ts) });
      }
      parsed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      setPoints(parsed);
    } catch (err) {
      console.error('[fetchHistory] failed:', err);
      setPoints([]);
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
          Van: Number(raw.Van) || 0,
          Jeepney: Number(raw.Jeepney) || 0,
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

  useEffect(() => {
    fetchHistory(window.limit, window.ms);
    fetchVehicles();
  }, [windowIdx, fetchHistory, fetchVehicles]);

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

  const totalVehicles = Object.values(vehicles).reduce((a, b) => a + b, 0);

  const exportCSV = () => {
    const v = vehicles;
    const hasVehicles = totalVehicles > 0;
    const header = hasVehicles
      ? 'Timestamp,PM2.5,Car,Van,Jeepney,Truck,Tricycle,Motorcycle,Bus\n'
      : 'Timestamp,PM2.5\n';
    const rows = points
      .map((p) =>
        hasVehicles
          ? `${p.timestamp.toISOString()},${p.pm25},${v.Car},${v.Van},${v.Jeepney},${v.Truck},${v.Tricycle},${v.Motorcycle},${v.Bus}`
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
          <span className='metric-label'>Readings</span>
          <span className='metric-value'>{points.length}</span>
        </div>
      </div>

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
                  formatter={(val: number) => [`${val} µg/m³`, 'PM2.5']}
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

          {/* Vehicle Counts */}
          <div className='chart-section'>
            <h3>Vehicle Counts (latest snapshot)</h3>
            <ResponsiveContainer width='100%' height={200}>
              <BarChart
                data={[
                  {
                    Car: vehicles.Car,
                    Van: vehicles.Van,
                    Jeepney: vehicles.Jeepney,
                    Truck: vehicles.Truck,
                    Tricycle: vehicles.Tricycle,
                    Motorcycle: vehicles.Motorcycle,
                    Bus: vehicles.Bus,
                  },
                ]}
              >
                <CartesianGrid
                  strokeDasharray='3 3'
                  stroke='rgba(255,255,255,0.06)'
                />
                <XAxis dataKey='name' tick={false} />
                <YAxis tick={{ fontSize: 10, fill: '#5a6978' }} />
                <Tooltip
                  contentStyle={{
                    background: '#161b22',
                    border: '1px solid rgba(0,217,255,0.2)',
                    borderRadius: 6,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey='Car' fill='#3b82f6' />
                <Bar dataKey='Van' fill='#8b5cf6' />
                <Bar dataKey='Jeepney' fill='#06b6d4' />
                <Bar dataKey='Truck' fill='#ef4444' />
                <Bar dataKey='Tricycle' fill='#ffa500' />
                <Bar dataKey='Motorcycle' fill='#f59e0b' />
                <Bar dataKey='Bus' fill='#8b5cf6' />
              </BarChart>
            </ResponsiveContainer>
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
  if (pm25 <= 35) return 'Good';
  if (pm25 <= 75) return 'Moderate';
  if (pm25 <= 115) return 'Unhealthy*';
  return 'Unhealthy';
}

function getStatusClass(pm25: number): string {
  if (pm25 <= 35) return 'status-good';
  if (pm25 <= 75) return 'status-moderate';
  if (pm25 <= 115) return 'status-sensitive';
  return 'status-unhealthy';
}
