export type BuildingType = "commercial" | "institutional" | "residential" | "unclassified";

export type Geometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface Rooftop {
  id: string;
  rank: number;
  geometry: Geometry;
  centroid_lat: number;
  centroid_lng: number;
  footprint_area_m2: number;
  roof_area_m2: number;
  usable_area_m2: number;
  estimated: boolean;
  imagery_quality: string | null;
  sunshine_hours: number | null;
  address: string | null;
  state: string | null;
  building_type: BuildingType;
  place_id: string | null;
  place_distance_m: number | null;
  kw: number;
  units_per_year: number;
  saving_per_year: number;
  saving_low: number;
  saving_high: number;
  system_cost: number;
  subsidy: number;
  net_cost: number;
  payback_years: number | null;
  /** Panel positions from Solar API: [lng, lat, azimuth degrees, portrait 0/1]. */
  panels?: { width_m: number | null; height_m: number | null; capacity_w: number | null; items: number[][] } | null;
}

export type EventType =
  | "scanned"
  | "solar_ready"
  | "visual_drawn"
  | "economics_calculated"
  | "postcard_generated"
  | "mailed"
  | "microsite_live"
  | "qr_opened"
  | "booked";

export interface CampaignEvent {
  pincode: string;
  roof_id: string;
  type: EventType;
  source: "worker" | "web";
  created_at: string;
  meta?: Record<string, unknown> | null;
}

export interface Booking {
  pincode: string;
  roof_id: string;
  name: string;
  phone: string;
  consent_text: string;
  consent_at: string;
}

export type ScanStatus = "queued" | "running" | "completed" | "failed";

export interface Scan {
  pincode: string;
  status: ScanStatus;
  progress?: string | null;
  error?: string | null;
  boundary_source?: string | null;
  approximate?: boolean;
  buildings_in_boundary?: number | null;
  rooftop_count?: number | null;
  completed_at?: string | null;
  rooftops: Rooftop[];
}
