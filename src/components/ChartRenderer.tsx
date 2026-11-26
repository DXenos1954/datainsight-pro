import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartSuggestion, DataRow } from '../types';
import { parseNumberSafely, prepareChartData } from '../lib/statistics';

export const CHART_COLORS = [
  '#2563eb',
  '#0d9488',
  '#d97706',
  '#dc2626',
  '#6366f1',
  '#0284c7',
  '#059669',
  '#e11d48',
];

interface ChartRendererProps {
  chart: ChartSuggestion;
  data: DataRow[];
  headers?: string[];
  numericColumns: string[];
  height?: number | '100%';
  large?: boolean;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  chart,
  data,
  headers = [],
  numericColumns,
  height = 300,
  large = false,
}) => {
  const { rows, xKey, yKey, seriesKeys, isColumnOrientation } = useMemo(
    () => prepareChartData(data, chart, large ? 100 : 40, headers, numericColumns),
    [data, chart, large, headers, numericColumns]
  );

  const isYNumeric =
    isColumnOrientation ||
    chart.aggregation === 'count' ||
    numericColumns.includes(yKey) ||
    rows.some((r) => Number.isFinite(parseNumberSafely(r[yKey])));

  const isXNumeric =
    numericColumns.includes(xKey) ||
    rows.some((r) => Number.isFinite(parseNumberSafely(r[xKey])));

  if (!xKey || seriesKeys.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[240px] bg-slate-50 rounded-lg border border-slate-200 text-slate-500 text-xs px-4 text-center">
        Επιλέξτε έγκυρες στήλες για τους άξονες X και Y.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[240px] bg-slate-50 rounded-lg border border-slate-200 text-slate-500 text-xs px-4 text-center">
        Δεν υπάρχουν δεδομένα για εμφάνιση με τα τρέχοντα φίλτρα ή τους επιλεγμένους άξονες.
      </div>
    );
  }

  if (chart.type !== 'scatter' && !isYNumeric) {
    return (
      <div className="flex items-center justify-center h-full min-h-[240px] bg-amber-50/60 rounded-lg border border-amber-200 text-amber-800 text-xs px-4 text-center">
        Η στήλη «{yKey}» δεν είναι αριθμητική. Επιλέξτε αριθμητική στήλη για τον άξονα Y ή ομαδοποίηση «Πλήθος».
      </div>
    );
  }

  if (chart.type === 'scatter' && (!isXNumeric || !isYNumeric)) {
    return (
      <div className="flex items-center justify-center h-full min-h-[240px] bg-amber-50/60 rounded-lg border border-amber-200 text-amber-800 text-xs px-4 text-center">
        Για γράφημα διασποράς (Scatter), και οι δύο άξονες (X και Y) πρέπει να περιέχουν αριθμητικές τιμές (π.χ. αριθμητικά έτη στον άξονα X).
      </div>
    );
  }

  const formatAxisNumber = (val: unknown) =>
    typeof val === 'number' ? val.toLocaleString('el-GR', { maximumFractionDigits: 1 }) : String(val ?? '');

  const formatTooltipValue = (val: unknown) =>
    typeof val === 'number' ? val.toLocaleString('el-GR', { maximumFractionDigits: 2 }) : String(val ?? '');

  const tickStyle = { fontSize: large ? 11 : 10, fill: '#64748b' };
  const margin = large
    ? { top: 20, right: 28, left: 16, bottom: 56 }
    : { top: 12, right: 16, left: 8, bottom: 24 };

  const containerHeight: number | `${number}%` = height;

  switch (chart.type) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={containerHeight}>
          <BarChart data={rows} margin={margin}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey={xKey}
              tick={tickStyle}
              angle={large ? -35 : 0}
              textAnchor={large ? 'end' : 'middle'}
              height={large ? 72 : 30}
              interval="preserveStartEnd"
            />
            <YAxis tick={tickStyle} tickFormatter={formatAxisNumber} width={62} />
            <Tooltip
              formatter={formatTooltipValue}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {seriesKeys.map((sKey, idx) => (
              <Bar
                key={sKey}
                dataKey={sKey}
                fill={CHART_COLORS[idx % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={seriesKeys.length > 2 ? 28 : 48}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case 'line':
      return (
        <ResponsiveContainer width="100%" height={containerHeight}>
          <LineChart data={rows} margin={margin}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey={xKey}
              tick={tickStyle}
              angle={large ? -35 : 0}
              textAnchor={large ? 'end' : 'middle'}
              height={large ? 72 : 30}
              interval="preserveStartEnd"
            />
            <YAxis tick={tickStyle} tickFormatter={formatAxisNumber} width={62} />
            <Tooltip
              formatter={formatTooltipValue}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {seriesKeys.map((sKey, idx) => (
              <Line
                key={sKey}
                type="monotone"
                dataKey={sKey}
                stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                strokeWidth={large ? 2.5 : 2}
                dot={{ r: large ? 4 : 3, fill: CHART_COLORS[idx % CHART_COLORS.length] }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );

    case 'pie': {
      const primaryKey = seriesKeys[0];
      const pieRows = rows
        .map((r) => ({ ...r, [primaryKey]: Math.max(0, parseNumberSafely(r[primaryKey]) || 0) }))
        .filter((r) => Number(r[primaryKey]) > 0)
        .slice(0, large ? 14 : 10);

      if (pieRows.length === 0) {
        return (
          <div className="flex items-center justify-center h-full min-h-[240px] bg-slate-50 rounded-lg border border-slate-200 text-slate-500 text-xs">
            Το κυκλικό διάγραμμα απαιτεί θετικές αριθμητικές τιμές.
          </div>
        );
      }

      return (
        <ResponsiveContainer width="100%" height={containerHeight}>
          <PieChart>
            <Pie
              data={pieRows}
              dataKey={primaryKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={large ? 135 : 88}
              innerRadius={large ? 48 : 0}
              paddingAngle={1.5}
              label={({ name, percent }) =>
                `${String(name).slice(0, 14)} (${((percent ?? 0) * 100).toFixed(0)}%)`
              }
              labelLine={{ stroke: '#cbd5e1' }}
            >
              {pieRows.map((_, idx) => (
                <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={formatTooltipValue}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    case 'scatter':
      return (
        <ResponsiveContainer width="100%" height={containerHeight}>
          <ScatterChart margin={margin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey={xKey}
              name={isColumnOrientation ? 'Στήλες / Έτη' : xKey}
              domain={['auto', 'auto']}
              tick={tickStyle}
              tickFormatter={formatAxisNumber}
            />
            <YAxis
              type="number"
              dataKey={seriesKeys[0]}
              name={seriesKeys[0]}
              tick={tickStyle}
              tickFormatter={formatAxisNumber}
              width={62}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              formatter={formatTooltipValue}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Scatter
              name={isColumnOrientation ? seriesKeys[0] : `${xKey} vs ${seriesKeys[0]}`}
              data={rows}
              fill="#2563eb"
            />
          </ScatterChart>
        </ResponsiveContainer>
      );

    default:
      return null;
  }
};
