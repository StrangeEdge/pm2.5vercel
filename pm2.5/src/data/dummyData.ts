// Las Piñas, Philippines coordinates: ~14.3534° N, 120.9895° E
// Dummy data for PM2.5 sensor readings and vehicle detection

export interface VehicleCounts {
  Car: number;
  Jeep: number;
  Truck: number;
  Tricycle: number;
  Motorcycle: number;
  Bus: number;
}

export const VEHICLE_TYPES: (keyof VehicleCounts)[] = [
  'Car',
  'Jeep',
  'Truck',
  'Tricycle',
  'Motorcycle',
  'Bus',
];

export const emptyVehicleCounts = (): VehicleCounts => ({
  Car: 0,
  Jeep: 0,
  Truck: 0,
  Tricycle: 0,
  Motorcycle: 0,
  Bus: 0,
});

export const totalVehicleCount = (vehicles: VehicleCounts): number =>
  VEHICLE_TYPES.reduce((sum, type) => sum + (vehicles[type] || 0), 0);

export type PM25Status =
  | 'good'
  | 'moderate'
  | 'unhealthy_for_sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous';

export const PM25_STATUS_META: Record<
  PM25Status,
  { label: string; color: string; flagged: boolean }
> = {
  good: { label: 'Good', color: '#21db15', flagged: false },
  moderate: { label: 'Moderate', color: '#ffd700', flagged: false },
  unhealthy_for_sensitive: {
    label: 'Unhealthy for Sensitive Groups',
    color: '#ffa500',
    flagged: true,
  },
  unhealthy: { label: 'Unhealthy', color: '#ff3333', flagged: true },
  very_unhealthy: { label: 'Very Unhealthy', color: '#c026d3', flagged: true },
  hazardous: { label: 'Hazardous', color: '#7f1d1d', flagged: true },
};

export const isFlaggedPM25Status = (status: PM25Status): boolean =>
  PM25_STATUS_META[status].flagged;

export const getPM25StatusLabel = (status: PM25Status): string =>
  PM25_STATUS_META[status].label;

export const getPM25StatusColor = (status: PM25Status): string =>
  PM25_STATUS_META[status].color;

export type HotspotTier = 'none' | 'elevated' | 'critical';

export const HOTSPOT_TIER_META: Record<
  HotspotTier,
  { label: string; color: string; flagged: boolean }
> = {
  none: { label: 'None', color: '#8892a0', flagged: false },
  elevated: { label: 'Elevated', color: '#ffb000', flagged: true },
  critical: { label: 'Critical Hotspot', color: '#ff3333', flagged: true },
};

export const getHotspotTierLabel = (tier: HotspotTier): string =>
  HOTSPOT_TIER_META[tier].label;

export const getHotspotTierColor = (tier: HotspotTier): string =>
  HOTSPOT_TIER_META[tier].color;

export const isHotspotTierFlagged = (tier: HotspotTier): boolean =>
  HOTSPOT_TIER_META[tier].flagged;

export interface SensorReading {
  id: string;
  pm25: number; // μg/m³
  location: {
    lat: number;
    lng: number;
    name: string;
  };
  timestamp: Date;
  status: PM25Status;
  hotspotTier: HotspotTier;
  vehicles: VehicleCounts;
}

// NOTE: keep only the types/constants that the dashboard uses directly.
// The previous file included generated sample data and helper `Vehicle` /
// `DashboardData` shapes used for examples; those have been removed to
// avoid exporting unused scaffolding.
