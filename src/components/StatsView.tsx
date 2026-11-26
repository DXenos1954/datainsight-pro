import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Grid3X3, Layout, ArrowRight } from 'lucide-react';
import { DataRow } from '../types';
import {
  calculateCorrelationMatrix,
  calculateFullStats,
  getColumnStatsForDataset,
  parseNumberSafely,
} from '../lib/statistics';
import { cn } from '../lib/utils';

interface StatsViewProps {
  data: DataRow[];
  headers: string[];
  numericHeaders: string[];
  currentSheet: string;
  onExportExcel: (referenceColumn: string) => void;
}

type StatsSubMode = 'vertical' | 'horizontal' | 'correlation';

const VERTICAL_PARAMS = [
  { label: 'Μέση Τιμή (Mean)', key: 'mean' },
  { label: 'Διάμεσος (Median)', key: 'median' },
  { label: 'Άθροισμα (Sum)', key: 'sum' },
  { label: 'Τυπική Απόκλιση (StdDev)', key: 'stdDev' },
  { label: 'Τυπικό Σφάλμα (StdError)', key: 'stdError' },
  { label: 'Συντ. Μεταβλητότητας (%)', key: 'cv', isPercent: true },
  { label: '1ο Τεταρτημόριο (Q1)', key: 'q1' },
  { label: '3ο Τεταρτημόριο (Q3)', key: 'q3' },
  { label: 'Ενδοτεταρτ. Εύρος (IQR)', key: 'iqr' },
  { label: 'Κύρτωση (Kurtosis)', key: 'kurtosis' },
  { label: 'Ασυμμετρία (Skewness)', key: 'skewness' },
  { label: 'Συσχέτιση Pearson (r)', key: 'correlation', usesRef: true },
  { label: 'Κλίση Παλινδρόμησης (Slope)', key: 'dependency', usesRef: true },
  { label: 't-statistic (vs 0)', key: 'tTest' },
  { label: 'Μέγιστη Τιμή (Max)', key: 'max' },
  { label: 'Ελάχιστη Τιμή (Min)', key: 'min' },
  { label: 'Εύρος (Range)', key: 'range' },
  { label: '95% CI Κάτω Όριο', key: 'ciLower' },
  { label: '95% CI Άνω Όριο', key: 'ciUpper' },
  { label: 'Πλήθος Έγκυρων (N)', key: 'count', isInt: true },
] as const;

export const StatsView: React.FC<StatsViewProps> = ({
  data,
  headers,
  numericHeaders,
  onExportExcel,
}) => {
  const [mode, setMode] = useState<StatsSubMode>('vertical');
  const [referenceColumn, setReferenceColumn] = useState<string>(numericHeaders[0] || '');

  useEffect(() => {
    if (numericHeaders.length > 0 && !numericHeaders.includes(referenceColumn)) {
      setReferenceColumn(numericHeaders[0]);
    }
  }, [numericHeaders, referenceColumn]);

  const verticalStatsMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof getColumnStatsForDataset>> = {};
    headers.forEach((h) => {
      map[h] = getColumnStatsForDataset(data, h, referenceColumn || undefined);
    });
    return map;
  }, [data, headers, referenceColumn]);

  const correlationMatrix = useMemo(
    () => calculateCorrelationMatrix(data, numericHeaders),
    [data, numericHeaders]
  );

  const getCorrCellClasses = (val: number | null) => {
    if (val === null) return 'bg-slate-50 text-slate-300';
    if (val >= 0.75) return 'bg-blue-600 text-white font-semibold';
    if (val >= 0.4) return 'bg-blue-100 text-blue-900 font-medium';
    if (val <= -0.75) return 'bg-red-600 text-white font-semibold';
    if (val <= -0.4) return 'bg-red-100 text-red-900 font-medium';
    return 'bg-slate-50 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Εκτενής Στατιστική Επεξεργασία
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Περιγραφική στατιστική, ζευγαρωτή συσχέτιση Pearson, γραμμική παλινδρόμηση και διαστήματα εμπιστοσύνης 95%.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setMode('vertical')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0',
                  mode === 'vertical'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <Layout className="w-3.5 h-3.5" />
                Κάθετη (Στήλες)
              </button>
              <button
                onClick={() => setMode('horizontal')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0',
                  mode === 'horizontal'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Οριζόντια (Γραμμές)
              </button>
              <button
                onClick={() => setMode('correlation')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0',
                  mode === 'correlation'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                Πίνακας Συσχετίσεων
              </button>
            </div>

            <button
              onClick={() => onExportExcel(referenceColumn)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Εξαγωγή Excel (3 Φύλλα)
            </button>
          </div>
        </div>

        {/* Contextual Controls */}
        {mode === 'vertical' && numericHeaders.length > 0 && (
          <div className="py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <p className="text-slate-600">
              Οι συντελεστές Pearson (r) και Slope υπολογίζονται σε ζευγαρωτές έγκυρες παρατηρήσεις ως προς τη στήλη αναφοράς.
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="ref-col-select" className="text-slate-500 font-medium whitespace-nowrap">
                Στήλη αναφοράς:
              </label>
              <select
                id="ref-col-select"
                value={referenceColumn}
                onChange={(e) => setReferenceColumn(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {numericHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {mode === 'horizontal' && (
          <div className="py-3.5 border-b border-slate-100 text-xs text-slate-600">
            Οριζόντιος υπολογισμός ανά εγγραφή αποκλειστικά στις αριθμητικές στήλες:{' '}
            <span className="font-mono font-medium text-slate-800">
              {numericHeaders.length > 0 ? numericHeaders.join(' · ') : 'Καμία αριθμητική στήλη'}
            </span>
          </div>
        )}

        {/* Table Content */}
        <div className="mt-4 overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          {mode === 'vertical' && (
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-600 sticky left-0 bg-slate-50 z-30 min-w-[210px] border-r border-slate-200">
                    Στατιστική Παράμετρος
                  </th>
                  {headers.map((h) => (
                    <th
                      key={h}
                      className="py-3 px-4 text-xs font-semibold text-slate-800 text-right whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {VERTICAL_PARAMS.map((param) => (
                  <tr key={param.key} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 text-xs font-medium text-slate-700 sticky left-0 bg-white border-r border-slate-100">
                      {param.label}
                    </td>
                    {headers.map((h) => {
                      const stats = verticalStatsMap[h];
                      const raw = stats
                        ? (stats as unknown as Record<string, number | null>)[param.key]
                        : null;
                      if (raw === null || raw === undefined || !Number.isFinite(raw)) {
                        return (
                          <td
                            key={h}
                            className="py-2.5 px-4 text-xs font-mono tabular-nums text-right text-slate-300"
                          >
                            —
                          </td>
                        );
                      }
                      let formatted: string;
                      if ('isInt' in param && param.isInt) {
                        formatted = raw.toLocaleString('el-GR');
                      } else if ('isPercent' in param && param.isPercent) {
                        formatted = `${raw.toFixed(2)}%`;
                      } else {
                        formatted = raw.toLocaleString('el-GR', { maximumFractionDigits: 3 });
                      }
                      return (
                        <td
                          key={h}
                          className={cn(
                            'py-2.5 px-4 text-xs font-mono tabular-nums text-right',
                            param.key === 'correlation' && Math.abs(raw) >= 0.7
                              ? 'text-blue-700 font-semibold'
                              : 'text-slate-800'
                          )}
                        >
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {mode === 'horizontal' && (
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-700 sticky left-0 bg-slate-50 z-30 border-r border-slate-200">
                    {headers[0] || 'Γραμμή'}
                  </th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">Μέση Τιμή</th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">Διάμεσος</th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">Άθροισμα</th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">Τυπ. Απόκλιση</th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">CV (%)</th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">Min</th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">Max</th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">Εύρος</th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">95% CI</th>
                  <th className="py-3 px-3 text-xs font-semibold text-slate-600 text-right">N</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.slice(0, 150).map((row, idx) => {
                  const nums = numericHeaders
                    .map((h) => parseNumberSafely(row[h]))
                    .filter((v) => Number.isFinite(v));
                  const s = calculateFullStats(nums);
                  if (!s) return null;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 text-xs font-medium text-slate-800 sticky left-0 bg-white border-r border-slate-100 whitespace-nowrap">
                        {String(row[headers[0]] || `Γραμμή ${idx + 1}`)}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right">
                        {s.mean.toLocaleString('el-GR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right">
                        {s.median.toLocaleString('el-GR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right">
                        {s.sum.toLocaleString('el-GR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right">
                        {s.stdDev.toLocaleString('el-GR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right text-blue-700">
                        {s.cv.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right">
                        {s.min.toLocaleString('el-GR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right">
                        {s.max.toLocaleString('el-GR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right">
                        {s.range.toLocaleString('el-GR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right text-slate-600 whitespace-nowrap">
                        [{s.ciLower.toLocaleString('el-GR', { maximumFractionDigits: 1 })},{' '}
                        {s.ciUpper.toLocaleString('el-GR', { maximumFractionDigits: 1 })}]
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-right text-slate-500">
                        {s.count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {mode === 'correlation' && (
            <div>
              {numericHeaders.length < 2 ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  Απαιτούνται τουλάχιστον 2 αριθμητικές στήλες για τον υπολογισμό του πίνακα συσχετίσεων.
                </div>
              ) : (
                <>
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-xs font-semibold text-slate-600 sticky left-0 bg-slate-50 z-30 border-r border-slate-200">
                          Μεταβλητή (Pearson r)
                        </th>
                        {numericHeaders.map((col) => (
                          <th
                            key={col}
                            className="py-3 px-3 text-xs font-semibold text-slate-800 text-center whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {numericHeaders.map((colA) => (
                        <tr key={colA}>
                          <td className="py-3 px-4 text-xs font-semibold text-slate-800 sticky left-0 bg-white border-r border-slate-200 whitespace-nowrap">
                            {colA}
                          </td>
                          {numericHeaders.map((colB) => {
                            const val = correlationMatrix[colA]?.[colB] ?? null;
                            return (
                              <td
                                key={colB}
                                title={`${colA} × ${colB}: ${val !== null ? val.toFixed(4) : 'N/A'}`}
                                className={cn(
                                  'py-3 px-3 text-xs font-mono tabular-nums text-center border border-white',
                                  getCorrCellClasses(val)
                                )}
                              >
                                {val !== null ? val.toFixed(2) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>Κλίμακα συσχέτισης Pearson:</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block" /> Ισχυρή θετική (≥ 0,75)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-blue-100 border border-blue-200 inline-block" /> Μέτρια θετική (0,40–0,74)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-red-100 border border-red-200 inline-block" /> Μέτρια αρνητική (-0,74 έως -0,40)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-red-600 inline-block" /> Ισχυρή αρνητική (≤ -0,75)
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
