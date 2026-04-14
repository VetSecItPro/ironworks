export interface ChartDataPoint {
  label: string;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface ChartAnnotation {
  label: string;
  index: number;
  color?: string;
  dashed?: boolean;
}

export type ChartType = "bar" | "line" | "area";

export interface ChartProps {
  data: ChartDataPoint[];
  annotations?: ChartAnnotation[];
  formatValue?: (v: number) => string;
  height?: number;
  onPointClick?: (point: ChartDataPoint, index: number) => void;
  showSwitcher?: boolean;
  defaultType?: ChartType;
  comparisonData?: ChartDataPoint[];
  comparisonLabel?: string;
  className?: string;
}
