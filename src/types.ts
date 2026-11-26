export interface DataRow {
  [key: string]: string | number | boolean | null | undefined;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter';
export type AggregationMode = 'none' | 'sum' | 'avg' | 'count';
export type MissingValueStrategy = 'omit' | 'mean' | 'median' | 'zero';
export type WorkspaceTab = 'data' | 'stats' | 'charts' | 'ai' | 'presentation';

export interface CleaningOptions {
  removeSummaryRows: boolean;
  removeDuplicates: boolean;
  missingValueStrategy: MissingValueStrategy;
  trimWhitespace: boolean;
}

export interface CleaningStats {
  totalCells: number;
  parsedNumbers: number;
  emptyCells: number;
  imputedCells: number;
  categoricalCells: number;
  removedSummaryRows: number;
  removedDuplicateRows: number;
  numericColumns: string[];
  categoricalColumns: string[];
}

export interface FullStats {
  mean: number;
  median: number;
  sum: number;
  stdDev: number;
  stdError: number;
  cv: number;
  q1: number;
  q3: number;
  iqr: number;
  kurtosis: number;
  skewness: number;
  max: number;
  min: number;
  range: number;
  ciLower: number;
  ciUpper: number;
  count: number;
  correlation: number | null;
  dependency: number | null;
  tTest: number;
}

export type ChartOrientation = 'rows' | 'columns';
export type ColumnSeriesMode = 'avg' | 'sum' | 'row' | 'multi';

export interface ChartSuggestion {
  id: string;
  type: ChartType;
  title: string;
  orientation?: ChartOrientation;
  xAxis: string;
  yAxis: string;
  xColumns?: string[];
  seriesMode?: ColumnSeriesMode;
  selectedRows?: string[];
  description: string;
  aggregation?: AggregationMode;
  excludedXValues?: string[];
  excludedYValues?: string[];
}

export interface ColumnInsightStat {
  column: string;
  type: 'numeric' | 'categorical';
  count: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  min?: number;
  max?: number;
  topValues?: { value: string; count: number }[];
  description?: string;
}

export interface SlideOutline {
  id: string;
  title: string;
  content: string[];
  chartIndex?: number;
}

export interface DataInsight {
  summary: string;
  keyFindings?: string[];
  statistics?: ColumnInsightStat[];
  suggestedCharts: ChartSuggestion[];
  presentationOutline: {
    title: string;
    slides: SlideOutline[];
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}
