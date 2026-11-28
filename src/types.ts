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
  autoFixErrors: boolean;
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

export type ValidationIssueType =
  | 'formula_mismatch'
  | 'excel_error'
  | 'math_expression'
  | 'format_error'
  | 'summary_mismatch'
  | 'outlier_warning';

export type ValidationSeverity = 'error' | 'warning' | 'fixed';

export interface ValidationIssue {
  id: string;
  cellRef: string;
  rowIndex: number;
  column: string;
  type: ValidationIssueType;
  severity: ValidationSeverity;
  formula?: string;
  originalValue: string;
  correctedValue: string;
  message: string;
  autoFixed: boolean;
}

export interface ValidationReport {
  totalFormulas: number;
  validFormulas: number;
  fixedFormulaMismatches: number;
  fixedExcelErrors: number;
  fixedMathExpressions: number;
  fixedFormatErrors: number;
  summaryRowDiscrepancies: number;
  outlierWarnings: number;
  totalErrorsFound: number;
  totalAutoFixed: number;
  healthScore: number;
  issues: ValidationIssue[];
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

// Auth, Billing & Admin types
export type UserRole = 'user' | 'admin';
export type PlanId = 'free' | 'starter' | 'pro_pack' | 'ultimate' | 'pro_monthly';
export type SubscriptionStatus = 'inactive' | 'active' | 'pending' | 'cancelled';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: PlanId;
  credits: number; // -1 means unlimited
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PlanInfo {
  id: PlanId;
  name: string;
  priceEur: number;
  billingType: 'free' | 'one_time' | 'monthly';
  credits: number; // -1 for unlimited
  badge?: string;
  description: string;
  features: string[];
}

export type PaymentProvider = 'viva' | 'stripe' | 'iris' | 'web_banking' | 'manual' | 'demo';

export interface PaymentSettings {
  bankName: string;
  iban: string;
  beneficiaryName: string;
  bicSwift: string;
  irisEnabled: boolean;
  irisIdentifier: string;
  irisRecipientName: string;
  webBankingEnabled: boolean;
  vivaEnabled: boolean;
  stripeEnabled: boolean;
  paymentInstructions: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  planId: PlanId;
  planName: string;
  amountEur: number;
  currency: string;
  billingType: 'one_time' | 'monthly';
  provider: PaymentProvider;
  providerRef: string;
  status: 'pending' | 'paid' | 'rejected' | 'refunded';
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  userId: string | null;
  userEmail: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  paidUsers: number;
  totalRevenueEur: number;
  pendingPayments: number;
  totalAnalyses: number;
  dbEngine: 'postgresql' | 'local-json';
  vivaConfigured: boolean;
  stripeConfigured: boolean;
  geminiConfigured: boolean;
  geminiModel: string;
}
