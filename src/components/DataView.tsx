import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';
import {
  CleaningOptions,
  CleaningStats,
  DataRow,
  MissingValueStrategy,
  ValidationIssue,
  ValidationIssueType,
  ValidationReport,
} from '../types';
import { parseNumberSafely } from '../lib/statistics';
import { cn } from '../lib/utils';

interface DataViewProps {
  data: DataRow[];
  displayData: DataRow[];
  headers: string[];
  currentSheet: string;
  cleaningOptions: CleaningOptions;
  onUpdateCleaningOptions: (updates: Partial<CleaningOptions>) => void;
  cleaningStats: CleaningStats | null;
  cleaningLog: string[];
  validationReport: ValidationReport | null;
  onDownloadExcel: () => void;
  onDownloadCSV: () => void;
}

const ISSUE_TYPE_LABELS: Record<ValidationIssueType, string> = {
  formula_mismatch: 'Ασυμφωνία Τύπου',
  excel_error: 'Σφάλμα Excel',
  math_expression: 'Μαθηματική Έκφραση',
  format_error: 'Σφάλμα Μορφής',
  summary_mismatch: 'Ασυμφωνία Συνόλου',
  outlier_warning: 'Ακραία Τιμή',
};

export const DataView: React.FC<DataViewProps> = ({
  data,
  displayData,
  headers,
  currentSheet,
  cleaningOptions,
  onUpdateCleaningOptions,
  cleaningStats,
  cleaningLog,
  validationReport,
  onDownloadExcel,
  onDownloadCSV,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(
    null
  );
  const [previewRows, setPreviewRows] = useState<number>(20);
  const [showLogs, setShowLogs] = useState(false);
  const [showValidationDetails, setShowValidationDetails] = useState(true);
  const [issueFilter, setIssueFilter] = useState<'all' | 'fixed' | 'warning'>('all');

  const numericSet = useMemo(
    () => new Set(cleaningStats?.numericColumns || []),
    [cleaningStats]
  );

  const handleSort = (col: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.column !== col) return { column: col, direction: 'asc' };
      if (prev.direction === 'asc') return { column: col, direction: 'desc' };
      return null;
    });
  };

  const indexedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = displayData.map((dispRow, idx) => ({
      dispRow,
      rawRow: data[idx] || dispRow,
      origIndex: idx,
    }));

    const filtered = q
      ? list.filter(({ dispRow }) =>
          headers.some((h) => String(dispRow[h] ?? '').toLowerCase().includes(q))
        )
      : list;

    if (!sortConfig) return filtered;

    const { column, direction } = sortConfig;
    const isNumCol = numericSet.has(column);

    return [...filtered].sort((a, b) => {
      const valA = a.rawRow[column];
      const valB = b.rawRow[column];
      const emptyA = valA === '' || valA === null || valA === undefined;
      const emptyB = valB === '' || valB === null || valB === undefined;
      if (emptyA && emptyB) return 0;
      if (emptyA) return 1;
      if (emptyB) return -1;

      if (isNumCol) {
        const numA = parseNumberSafely(valA);
        const numB = parseNumberSafely(valB);
        if (Number.isFinite(numA) && Number.isFinite(numB)) {
          return direction === 'asc' ? numA - numB : numB - numA;
        }
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return direction === 'asc'
        ? strA.localeCompare(strB, 'el')
        : strB.localeCompare(strA, 'el');
    });
  }, [displayData, data, headers, searchQuery, sortConfig, numericSet]);

  const visibleRows = previewRows === -1 ? indexedRows : indexedRows.slice(0, previewRows);

  const filteredIssues: ValidationIssue[] = useMemo(() => {
    if (!validationReport) return [];
    if (issueFilter === 'all') return validationReport.issues;
    if (issueFilter === 'fixed') return validationReport.issues.filter((i) => i.autoFixed);
    return validationReport.issues.filter((i) => i.severity === 'warning' || !i.autoFixed);
  }, [validationReport, issueFilter]);

  return (
    <div className="space-y-6">
      {/* Cleaning & Integrity Controls */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <h2 className="text-base font-semibold tracking-tight">
                Αυτόματος Καθαρισμός, Μαθηματική Επικύρωση &amp; Διόρθωση Λαθών
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Ρυθμίστε τους κανόνες προεπεξεργασίας — όλοι οι μαθηματικοί τύποι, τα σφάλματα, τα στατιστικά και τα γραφήματα ενημερώνονται άμεσα.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onDownloadCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Εξαγωγή CSV
            </button>
            <button
              onClick={onDownloadExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Λήψη Καθαρισμένου Excel
            </button>
          </div>
        </div>

        {/* Interactive Cleaning Rule Toggles */}
        <div className="py-4 border-b border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Κανόνες:
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-800 font-medium select-none">
            <input
              type="checkbox"
              checked={cleaningOptions.autoFixErrors}
              onChange={(e) => onUpdateCleaningOptions({ autoFixErrors: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Μαθηματική επικύρωση &amp; αυτόματη διόρθωση λαθών
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 select-none">
            <input
              type="checkbox"
              checked={cleaningOptions.removeSummaryRows}
              onChange={(e) => onUpdateCleaningOptions({ removeSummaryRows: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Αφαίρεση γραμμών «Σύνολο / Total»
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 select-none">
            <input
              type="checkbox"
              checked={cleaningOptions.removeDuplicates}
              onChange={(e) => onUpdateCleaningOptions({ removeDuplicates: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Αφαίρεση διπλότυπων εγγραφών
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 select-none">
            <input
              type="checkbox"
              checked={cleaningOptions.trimWhitespace}
              onChange={(e) => onUpdateCleaningOptions({ trimWhitespace: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Καθαρισμός κενών διαστημάτων
          </label>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-slate-500">Κενές αριθμητικές τιμές:</span>
            <select
              value={cleaningOptions.missingValueStrategy}
              onChange={(e) =>
                onUpdateCleaningOptions({
                  missingValueStrategy: e.target.value as MissingValueStrategy,
                })
              }
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="omit">Παράλειψη από υπολογισμούς (Συνιστάται)</option>
              <option value="mean">Συμπλήρωση με Μέσο Όρο στήλης</option>
              <option value="median">Συμπλήρωση με Διάμεσο στήλης</option>
              <option value="zero">Αντικατάσταση με 0</option>
            </select>
          </div>
        </div>

        {/* KPI Strip - flat separated cells */}
        {cleaningStats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 pt-4">
            <div className="pr-4 py-2">
              <p className="text-xs text-slate-500">Έγκυρες Εγγραφές</p>
              <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
                {data.length.toLocaleString('el-GR')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {headers.length} στήλες · {cleaningStats.totalCells.toLocaleString('el-GR')} κελιά
              </p>
            </div>

            <div className="lg:px-5 py-2">
              <p className="text-xs text-slate-500">Αριθμητικές Τιμές</p>
              <p className="text-2xl font-semibold font-mono tabular-nums text-blue-600 mt-1">
                {cleaningStats.parsedNumbers.toLocaleString('el-GR')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {cleaningStats.numericColumns.length} αριθμητικές στήλες
              </p>
            </div>

            <div className="lg:px-5 py-2">
              <p className="text-xs text-slate-500">Ελλιπή Κελιά</p>
              <p className="text-2xl font-semibold font-mono tabular-nums text-amber-600 mt-1">
                {cleaningStats.emptyCells.toLocaleString('el-GR')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {cleaningStats.imputedCells > 0
                  ? `${cleaningStats.imputedCells} συμπληρώθηκαν αυτόματα`
                  : 'Παραλείπονται από τα στατιστικά'}
              </p>
            </div>

            <div className="lg:pl-5 py-2">
              <p className="text-xs text-slate-500">Φιλτραρισμένες Γραμμές</p>
              <p className="text-2xl font-semibold font-mono tabular-nums text-slate-700 mt-1">
                {(
                  cleaningStats.removedSummaryRows + cleaningStats.removedDuplicateRows
                ).toLocaleString('el-GR')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {cleaningStats.removedSummaryRows} σύνολα · {cleaningStats.removedDuplicateRows} διπλότυπα
              </p>
            </div>
          </div>
        )}

        {/* Column classification - clean unboxed metadata */}
        {cleaningStats && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="space-y-1.5">
              <div className="text-slate-600">
                <span className="font-semibold text-slate-800">Αριθμητικές στήλες:</span>{' '}
                {cleaningStats.numericColumns.length > 0
                  ? cleaningStats.numericColumns.join(' · ')
                  : 'Καμία'}
              </div>
              <div className="text-slate-600">
                <span className="font-semibold text-slate-800">Κατηγορικές στήλες:</span>{' '}
                {cleaningStats.categoricalColumns.length > 0
                  ? cleaningStats.categoricalColumns.join(' · ')
                  : 'Καμία'}
              </div>
            </div>

            {cleaningLog.length > 0 && (
              <button
                onClick={() => setShowLogs((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 self-start md:self-center whitespace-nowrap shrink-0"
              >
                {showLogs ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                Αναφορά καθαρισμού ({cleaningLog.length})
              </button>
            )}
          </div>
        )}

        {showLogs && cleaningLog.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <ul className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar text-xs font-mono text-slate-600">
              {cleaningLog.map((entry, idx) => (
                <li key={idx} className="py-1 border-b border-slate-50 last:border-0">
                  {entry}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Mathematical Expression Validation & Error Auto-Correction Panel */}
      {validationReport && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Calculator className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Μαθηματική Επικύρωση Εκφράσεων &amp; Έλεγχος Λαθών
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Επανυπολογισμός Excel τύπων, έλεγχος μαθηματικών εκφράσεων, ασυμφωνιών αθροισμάτων και αυτόματη επιδιόρθωση σφαλμάτων.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border',
                  validationReport.healthScore >= 95
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : validationReport.healthScore >= 75
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                )}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ακεραιότητα: {validationReport.healthScore}%
              </span>

              {validationReport.issues.length > 0 && (
                <button
                  onClick={() => setShowValidationDetails((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {showValidationDetails ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  Λεπτομέρειες ({validationReport.issues.length})
                </button>
              )}
            </div>
          </div>

          {/* Validation KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 px-6 py-4 bg-slate-50/60">
            <div className="pr-4 py-1">
              <p className="text-xs text-slate-500">Μαθηματικοί Τύποι Excel</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {validationReport.totalFormulas}
              </p>
              <p className="text-[11px] text-slate-500">
                {validationReport.validFormulas} έγκυροι · {validationReport.fixedFormulaMismatches}{' '}
                ασυμφωνίες
              </p>
            </div>

            <div className="lg:px-5 py-1">
              <p className="text-xs text-slate-500">Λάθη που Εντοπίστηκαν</p>
              <p
                className={cn(
                  'text-lg font-bold font-mono tabular-nums mt-0.5',
                  validationReport.totalErrorsFound > 0 ? 'text-amber-600' : 'text-emerald-600'
                )}
              >
                {validationReport.totalErrorsFound}
              </p>
              <p className="text-[11px] text-slate-500">
                {validationReport.fixedExcelErrors} Excel · {validationReport.fixedFormatErrors}{' '}
                μορφής · {validationReport.summaryRowDiscrepancies} συνόλων
              </p>
            </div>

            <div className="lg:px-5 py-1">
              <p className="text-xs text-slate-500">Αυτόματες Διορθώσεις</p>
              <p className="text-lg font-bold font-mono tabular-nums text-emerald-600 mt-0.5">
                {validationReport.totalAutoFixed}
              </p>
              <p className="text-[11px] text-slate-500">
                {cleaningOptions.autoFixErrors
                  ? 'Ενεργή αυτόματη διόρθωση'
                  : 'Απενεργοποιημένη (μόνο προβολή)'}
              </p>
            </div>

            <div className="lg:pl-5 py-1">
              <p className="text-xs text-slate-500">Προειδοποιήσεις Outliers</p>
              <p className="text-lg font-bold font-mono tabular-nums text-indigo-600 mt-0.5">
                {validationReport.outlierWarnings}
              </p>
              <p className="text-[11px] text-slate-500">Ακραίες τιμές (κανόνας 3×IQR)</p>
            </div>
          </div>

          {validationReport.issues.length === 0 ? (
            <div className="px-6 py-4 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/40 border-t border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Όλες οι μαθηματικές εκφράσεις, οι τύποι Excel και οι αριθμητικές τιμές επικυρώθηκαν χωρίς σφάλματα.
              </span>
            </div>
          ) : (
            showValidationDetails && (
              <div className="border-t border-slate-100">
                <div className="px-6 py-3 bg-white flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 text-xs">
                  <span className="font-medium text-slate-700 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-blue-600" />
                    Αναλυτικός Πίνακας Ευρημάτων &amp; Διορθώσεων
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: `Όλα (${validationReport.issues.length})` },
                        {
                          id: 'fixed',
                          label: `Διορθωμένα (${validationReport.totalAutoFixed})`,
                        },
                        {
                          id: 'warning',
                          label: `Προειδοποιήσεις / Ανεπίλυτα (${
                            validationReport.issues.length - validationReport.totalAutoFixed
                          })`,
                        },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setIssueFilter(f.id)}
                        className={cn(
                          'px-2.5 py-1 rounded-md font-medium transition-colors',
                          issueFilter === f.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto max-h-72 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Κελί</th>
                        <th className="px-4 py-2.5 font-semibold">Στήλη</th>
                        <th className="px-4 py-2.5 font-semibold">Κατηγορία</th>
                        <th className="px-4 py-2.5 font-semibold">Τύπος</th>
                        <th className="px-4 py-2.5 font-semibold">Πριν → Μετά</th>
                        <th className="px-4 py-2.5 font-semibold">Επεξήγηση</th>
                        <th className="px-4 py-2.5 font-semibold">Κατάσταση</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredIssues.map((issue) => (
                        <tr key={issue.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 font-mono font-semibold text-slate-800 whitespace-nowrap">
                            {issue.cellRef}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                            {issue.column}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                              {ISSUE_TYPE_LABELS[issue.type]}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-indigo-700 whitespace-nowrap">
                            {issue.formula || '—'}
                          </td>
                          <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                            {issue.type === 'outlier_warning' ? (
                              <span className="text-amber-700">{issue.originalValue}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-red-600 line-through">
                                  {issue.originalValue}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className="text-emerald-700 font-semibold">
                                  {issue.correctedValue}
                                </span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-md">{issue.message}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {issue.autoFixed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                Διορθώθηκε
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                {issue.type === 'outlier_warning' ? 'Έλεγχος' : 'Εκκρεμεί'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </section>
      )}

      {/* Interactive Data Table */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Πίνακας Δεδομένων — {currentSheet}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Εμφάνιση {visibleRows.length.toLocaleString('el-GR')} από{' '}
              {indexedRows.length.toLocaleString('el-GR')} εγγραφές
              {searchQuery ? ' (φιλτραρισμένες)' : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Αναζήτηση σε όλες τις στήλες..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>

            <select
              value={previewRows}
              onChange={(e) => setPreviewRows(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={10}>10 γραμμές</option>
              <option value={20}>20 γραμμές</option>
              <option value={50}>50 γραμμές</option>
              <option value={100}>100 γραμμές</option>
              <option value={-1}>Όλες ({indexedRows.length})</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[540px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 w-12 text-right">
                  #
                </th>
                {headers.map((h) => {
                  const isNumeric = numericSet.has(h);
                  const isSorted = sortConfig?.column === h;
                  return (
                    <th
                      key={h}
                      onClick={() => handleSort(h)}
                      className={cn(
                        'px-4 py-3 text-xs font-semibold text-slate-700 cursor-pointer select-none hover:bg-slate-100 transition-colors whitespace-nowrap',
                        isNumeric ? 'text-right' : 'text-left'
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {h}
                        {isSorted ? (
                          sortConfig.direction === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={headers.length + 1}
                    className="px-6 py-12 text-center text-sm text-slate-400"
                  >
                    Δεν βρέθηκαν εγγραφές που να ταιριάζουν με «{searchQuery}».
                  </td>
                </tr>
              ) : (
                visibleRows.map(({ dispRow, origIndex }) => (
                  <tr
                    key={origIndex}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-xs font-mono tabular-nums text-slate-400 text-right">
                      {origIndex + 1}
                    </td>
                    {headers.map((h) => {
                      const val = dispRow[h];
                      const isNumeric = numericSet.has(h);
                      const isEmpty = val === undefined || val === null || val === '';
                      return (
                        <td
                          key={h}
                          className={cn(
                            'px-4 py-2.5 text-xs whitespace-nowrap',
                            isNumeric
                              ? 'font-mono tabular-nums text-right text-slate-800'
                              : 'text-slate-700',
                            isEmpty && 'text-slate-300'
                          )}
                        >
                          {isEmpty ? '—' : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
