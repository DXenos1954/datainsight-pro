import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart2,
  BarChart3,
  FileSpreadsheet,
  Loader2,
  Presentation,
  Printer,
  Sparkles,
  Table as TableIcon,
  Upload,
} from 'lucide-react';
import {
  ChartSuggestion,
  ChatMessage,
  CleaningOptions,
  DataInsight,
  DataRow,
  WorkspaceTab,
} from './types';
import {
  buildLocalStatsSummaryForAI,
  cleanDataset,
  getColumnStatsForDataset,
} from './lib/statistics';
import { createSampleWorkbook } from './lib/sampleData';
import {
  exportChartsToWord,
  exportCleanedCSV,
  exportCleanedWorkbook,
  exportPresentationPPTX,
  exportStatsToExcel,
  exportSummaryToWord,
} from './lib/exporters';
import { DataView } from './components/DataView';
import { StatsView } from './components/StatsView';
import { ChartsView } from './components/ChartsView';
import { AIInsightsView } from './components/AIInsightsView';
import { PresentationView } from './components/PresentationView';
import { ChartRenderer } from './components/ChartRenderer';
import { cn } from './lib/utils';

const DEFAULT_CLEANING_OPTIONS: CleaningOptions = {
  removeSummaryRows: true,
  removeDuplicates: false,
  missingValueStrategy: 'omit',
  trimWhitespace: true,
};

interface RawSheetPayload {
  headers: string[];
  rawRows: DataRow[];
  rawDisplayRows: DataRow[];
}

export default function App() {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [currentSheet, setCurrentSheet] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [rawSheet, setRawSheet] = useState<RawSheetPayload | null>(null);

  const [cleaningOptions, setCleaningOptions] = useState<CleaningOptions>(
    DEFAULT_CLEANING_OPTIONS
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('data');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // AI State
  const [insights, setInsights] = useState<DataInsight | null>(null);
  const [orderedCharts, setOrderedCharts] = useState<ChartSuggestion[]>([]);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Interactive Q&A State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);

  // Compute cleaned dataset reactively whenever rawSheet or cleaningOptions change
  const cleanedResult = useMemo(() => {
    if (!rawSheet) return null;
    return cleanDataset(
      rawSheet.rawRows,
      rawSheet.rawDisplayRows,
      rawSheet.headers,
      cleaningOptions
    );
  }, [rawSheet, cleaningOptions]);

  const data = cleanedResult?.cleaned ?? [];
  const displayData = cleanedResult?.display ?? [];
  const headers = rawSheet?.headers ?? [];
  const cleaningStats = cleanedResult?.stats ?? null;
  const cleaningLog = cleanedResult?.log ?? [];
  const numericColumns = cleaningStats?.numericColumns ?? [];

  const runAIAnalysis = useCallback(
    async (
      targetData: DataRow[],
      targetHeaders: string[],
      sheetLabel: string,
      fileLabel: string
    ) => {
      if (targetData.length === 0 || targetHeaders.length === 0) return;

      analysisAbortRef.current?.abort();
      const controller = new AbortController();
      analysisAbortRef.current = controller;

      setIsAnalyzingAI(true);
      setAiError(null);

      try {
        const computedColStats = buildLocalStatsSummaryForAI(targetData, targetHeaders);
        const sample = targetData.slice(0, 6).map((row) => {
          const obj: DataRow = {};
          targetHeaders.slice(0, 15).forEach((k) => {
            const val = row[k];
            obj[k] = typeof val === 'string' && val.length > 60 ? val.slice(0, 60) + '…' : val;
          });
          return obj;
        });

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            headers: targetHeaders,
            computedColStats,
            sample,
            rowCount: targetData.length,
            sheetName: sheetLabel,
            fileName: fileLabel,
          }),
        });

        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error || `Σφάλμα εξυπηρετητή (${res.status})`);
        }

        const validTypes = new Set(['bar', 'line', 'pie', 'scatter']);
        const validSeriesModes = new Set(['avg', 'sum', 'row', 'multi']);
        const chartsWithIds: ChartSuggestion[] = (payload.suggestedCharts || [])
          .filter((c: ChartSuggestion) => c && (c.orientation === 'columns' || (c.xAxis && c.yAxis)))
          .map((c: ChartSuggestion, idx: number) => ({
            ...c,
            type: validTypes.has(c.type) ? c.type : 'bar',
            orientation: c.orientation === 'columns' ? 'columns' : 'rows',
            xColumns: Array.isArray(c.xColumns) ? c.xColumns : undefined,
            seriesMode:
              c.seriesMode && validSeriesModes.has(c.seriesMode) ? c.seriesMode : undefined,
            id: `ai-chart-${Date.now()}-${idx}`,
            aggregation: 'none',
          }));

        const slidesWithIds = (payload.presentationOutline?.slides || []).map(
          (s: { title: string; content: string[]; chartIndex?: number }, idx: number) => ({
            ...s,
            id: `slide-${Date.now()}-${idx}`,
            content: Array.isArray(s.content) ? s.content : [],
          })
        );

        const normalizedInsight: DataInsight = {
          summary: payload.summary || '',
          keyFindings: Array.isArray(payload.keyFindings) ? payload.keyFindings : [],
          statistics: Array.isArray(payload.statistics) ? payload.statistics : [],
          suggestedCharts: chartsWithIds,
          presentationOutline: {
            title: payload.presentationOutline?.title || `Αναφορά Ανάλυσης — ${sheetLabel}`,
            slides: slidesWithIds,
          },
        };

        setInsights(normalizedInsight);
        setOrderedCharts(chartsWithIds);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message =
          err instanceof Error ? err.message : 'Αδυναμία επικοινωνίας με την υπηρεσία AI.';
        setAiError(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsAnalyzingAI(false);
        }
      }
    },
    []
  );

  const extractSheet = useCallback(
    (wb: XLSX.WorkBook, sheetName: string, fileLabel: string, opts: CleaningOptions) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return;

      const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      const formattedMatrix = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
      }) as unknown[][];

      if (rawMatrix.length < 2) {
        setUploadError(`Το φύλλο «${sheetName}» δεν περιέχει αρκετές γραμμές δεδομένων.`);
        setRawSheet(null);
        return;
      }

      setUploadError(null);

      // Smart header row detection: skip leading empty/title rows (e.g., single-cell sheet title)
      let headerRowIndex = 0;
      const nonEmptyCount = (row: unknown[] | undefined) =>
        (row || []).filter((c) => c !== undefined && c !== null && String(c).trim() !== '').length;

      const scanLimit = Math.min(6, rawMatrix.length - 1);
      for (let i = 0; i < scanLimit; i++) {
        const count = nonEmptyCount(rawMatrix[i]);
        if (count >= 2) {
          headerRowIndex = i;
          break;
        }
        if (count > nonEmptyCount(rawMatrix[headerRowIndex])) {
          headerRowIndex = i;
        }
      }

      const headerRow = rawMatrix[headerRowIndex] || [];
      const maxCols = Math.max(
        headerRow.length,
        ...rawMatrix.slice(headerRowIndex + 1, headerRowIndex + 20).map((r) => (r ? r.length : 0))
      );

      const computedHeaders: string[] = [];
      for (let idx = 0; idx < maxCols; idx++) {
        const val = headerRow[idx];
        const base =
          val !== undefined && val !== null && String(val).trim() !== ''
            ? String(val).trim()
            : `Στήλη_${idx + 1}`;
        let unique = base;
        let counter = 1;
        while (computedHeaders.includes(unique)) {
          unique = `${base}_${counter++}`;
        }
        computedHeaders.push(unique);
      }

      const rawRows: DataRow[] = [];
      const rawDisplayRows: DataRow[] = [];

      for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
        const row = rawMatrix[i];
        if (
          !row ||
          !row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== '')
        ) {
          continue;
        }
        const fRow = formattedMatrix[i] || [];
        const rawObj: DataRow = {};
        const dispObj: DataRow = {};

        computedHeaders.forEach((h, colIdx) => {
          const rawVal = row[colIdx] as DataRow[string];
          const fVal = fRow[colIdx] as DataRow[string];
          rawObj[h] = rawVal;
          dispObj[h] =
            fVal !== undefined && fVal !== null && String(fVal).trim() !== ''
              ? fVal
              : rawVal ?? '';
        });

        rawRows.push(rawObj);
        rawDisplayRows.push(dispObj);
      }

      setRawSheet({ headers: computedHeaders, rawRows, rawDisplayRows });
      setInsights(null);
      setOrderedCharts([]);
      setChatMessages([]);
      setAskError(null);

      // Clean immediately with current options to kick off AI analysis
      const initialClean = cleanDataset(rawRows, rawDisplayRows, computedHeaders, opts);
      runAIAnalysis(initialClean.cleaned, computedHeaders, sheetName, fileLabel);
    },
    [runAIAnalysis]
  );

  const loadFile = useCallback(
    (file: File) => {
      setUploadError(null);
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const buffer = evt.target?.result;
          if (!buffer) throw new Error('Αδυναμία ανάγνωσης του αρχείου.');
          const wb = XLSX.read(buffer, { type: 'array' });
          if (!wb.SheetNames.length) {
            throw new Error('Το αρχείο δεν περιέχει φύλλα εργασίας.');
          }
          setWorkbook(wb);
          setSheetNames(wb.SheetNames);
          setCurrentSheet(wb.SheetNames[0]);
          setFileName(file.name);
          setActiveTab('data');
          extractSheet(wb, wb.SheetNames[0], file.name, cleaningOptions);
        } catch (err) {
          setUploadError(
            err instanceof Error
              ? err.message
              : 'Μη έγκυρη μορφή αρχείου. Υποστηρίζονται .xlsx, .xls και .csv.'
          );
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [cleaningOptions, extractSheet]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  const handleLoadSample = () => {
    const sample = createSampleWorkbook();
    setWorkbook(sample.workbook);
    setSheetNames(sample.workbook.SheetNames);
    setCurrentSheet(sample.workbook.SheetNames[0]);
    setFileName(sample.fileName);
    setActiveTab('data');
    extractSheet(
      sample.workbook,
      sample.workbook.SheetNames[0],
      sample.fileName,
      cleaningOptions
    );
  };

  const handleSheetChange = (nextSheet: string) => {
    if (!workbook) return;
    setCurrentSheet(nextSheet);
    extractSheet(workbook, nextSheet, fileName, cleaningOptions);
  };

  const handleResetWorkspace = () => {
    analysisAbortRef.current?.abort();
    setWorkbook(null);
    setSheetNames([]);
    setCurrentSheet('');
    setFileName('');
    setRawSheet(null);
    setInsights(null);
    setOrderedCharts([]);
    setChatMessages([]);
    setAiError(null);
    setAskError(null);
    setUploadError(null);
  };

  const handleAskQuestion = async (question: string) => {
    if (!data.length) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: question,
    };
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setIsAskingAI(true);
    setAskError(null);

    try {
      const computedColStats = buildLocalStatsSummaryForAI(data, headers);
      const sample = data.slice(0, 6);
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          headers,
          computedColStats,
          sample,
          rowCount: data.length,
          history: nextHistory,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Αποτυχία απάντησης από την AI.');
      }
      setChatMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', text: payload.answer },
      ]);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Σφάλμα επικοινωνίας.');
    } finally {
      setIsAskingAI(false);
    }
  };

  const navItems: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
    { id: 'data', label: 'Δεδομένα', icon: <TableIcon className="w-3.5 h-3.5" /> },
    { id: 'stats', label: 'Στατιστική', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'charts', label: 'Γραφήματα', icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { id: 'ai', label: 'Ανάλυση AI', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'presentation', label: 'Παρουσίαση', icon: <Presentation className="w-3.5 h-3.5" /> },
  ];

  const hasData = data.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 no-print">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            onClick={hasData ? () => setActiveTab('data') : undefined}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            DataInsight <span className="text-blue-600">Pro</span>
          </button>

          {/* Zone 2: Clean Single-Line Navigation Links */}
          {hasData ? (
            <nav className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0',
                    activeTab === item.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
          ) : (
            <div />
          )}

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            {hasData ? (
              <button
                onClick={handleResetWorkspace}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Νέο Αρχείο
              </button>
            ) : (
              <button
                onClick={handleLoadSample}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Δείγμα Δεδομένων
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 no-print">
        {!hasData ? (
          <div className="max-w-3xl mx-auto pt-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
                Καθαρισμός, στατιστική ανάλυση και παρουσιάσεις από τα δεδομένα σας
              </h1>
              <p className="text-sm sm:text-base text-slate-500 mt-3 max-w-xl mx-auto leading-relaxed">
                Ανεβάστε ένα αρχείο Excel ή CSV για αυτόματο καθαρισμό, υπολογισμό περιγραφικής στατιστικής, πίνακα συσχετίσεων, διαδραστικά γραφήματα και εξαγωγή σε PowerPoint ή Word.
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) loadFile(dropped);
              }}
              className={cn(
                'bg-white rounded-2xl border-2 border-dashed p-12 text-center transition-colors',
                isDraggingFile
                  ? 'border-blue-500 bg-blue-50/40'
                  : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <div className="w-14 h-14 bg-slate-100 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-5">
                <Upload className="w-7 h-7" />
              </div>

              <h2 className="text-lg font-semibold text-slate-900">
                Σύρετε εδώ το αρχείο Excel ή CSV
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 mb-6">
                Υποστηρίζονται μορφές .xlsx, .xls και .csv (με πλήρη υποστήριξη ελληνικών χαρακτήρων)
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Επιλογή Αρχείου
                </button>
                <button
                  onClick={handleLoadSample}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  Φόρτωση Δείγματος Δεδομένων
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileInputChange}
              />

              {uploadError && (
                <p className="mt-5 text-xs font-medium text-red-600">{uploadError}</p>
              )}
            </div>

            {/* Quiet Capabilities Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10 pt-8 border-t border-slate-200 text-left">
              <div>
                <h3 className="text-xs font-semibold text-slate-900">01. Στατιστική Ακρίβεια</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Μέσος όρος, διάμεσος, IQR, τυπική απόκλιση, κύρτωση, ασυμμετρία, 95% CI και πίνακας συσχετίσεων Pearson.
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-900">02. Στούντιο Οπτικοποίησης</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Ραβδογράμματα, γραμμές, κυκλικά και διαγράμματα διασποράς με ομαδοποίηση, φίλτρα τιμών και εξαγωγή PNG.
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-900">03. Έτοιμες Αναφορές</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Εξαγωγή σε PowerPoint (.pptx), Word (.docx) με ενσωματωμένα γραφήματα, Excel 3 φύλλων και CSV.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Workbook Context Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-900">{fileName}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {data.length.toLocaleString('el-GR')} εγγραφές
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{headers.length} στήλες</span>
                {isAnalyzingAI && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5 text-blue-600 font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Ανάλυση AI σε εξέλιξη
                    </span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {sheetNames.length > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <label htmlFor="sheet-select" className="text-slate-500 font-medium">
                      Φύλλο:
                    </label>
                    <select
                      id="sheet-select"
                      value={currentSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {sheetNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Εκτύπωση / PDF
                </button>
              </div>
            </div>

            {/* Active Workspace View */}
            {activeTab === 'data' && (
              <DataView
                data={data}
                displayData={displayData}
                headers={headers}
                currentSheet={currentSheet}
                cleaningOptions={cleaningOptions}
                onUpdateCleaningOptions={(updates) =>
                  setCleaningOptions((prev) => ({ ...prev, ...updates }))
                }
                cleaningStats={cleaningStats}
                cleaningLog={cleaningLog}
                onDownloadExcel={() =>
                  exportCleanedWorkbook(workbook, sheetNames, currentSheet, data, fileName)
                }
                onDownloadCSV={() => exportCleanedCSV(headers, data, fileName)}
              />
            )}

            {activeTab === 'stats' && (
              <StatsView
                data={data}
                headers={headers}
                numericHeaders={numericColumns}
                currentSheet={currentSheet}
                onExportExcel={(refCol) =>
                  exportStatsToExcel(data, headers, numericColumns, refCol, currentSheet)
                }
              />
            )}

            {activeTab === 'charts' && (
              <ChartsView
                charts={orderedCharts}
                onSetCharts={setOrderedCharts}
                data={data}
                headers={headers}
                numericColumns={numericColumns}
                isLoadingAI={isAnalyzingAI}
                aiError={aiError}
                onRequestAICharts={() => runAIAnalysis(data, headers, currentSheet, fileName)}
                onExportWord={(images) => exportChartsToWord(orderedCharts, data, fileName, images)}
              />
            )}

            {activeTab === 'ai' && (
              <AIInsightsView
                insights={insights}
                isLoading={isAnalyzingAI}
                error={aiError}
                onRefresh={() => runAIAnalysis(data, headers, currentSheet, fileName)}
                onExportWord={() => {
                  if (insights) exportSummaryToWord(insights, fileName, currentSheet);
                }}
                chatMessages={chatMessages}
                isAsking={isAskingAI}
                askError={askError}
                onAskQuestion={handleAskQuestion}
              />
            )}

            {activeTab === 'presentation' && (
              <PresentationView
                insights={insights}
                charts={orderedCharts}
                data={data}
                headers={headers}
                numericColumns={numericColumns}
                currentSheet={currentSheet}
                isLoading={isAnalyzingAI}
                error={aiError}
                onUpdatePresentation={(updater) =>
                  setInsights((prev) =>
                    prev
                      ? { ...prev, presentationOutline: updater(prev.presentationOutline) }
                      : prev
                  )
                }
                onRefreshAI={() => runAIAnalysis(data, headers, currentSheet, fileName)}
                onExportPPTX={async () => {
                  if (insights) {
                    await exportPresentationPPTX(
                      insights,
                      orderedCharts,
                      data,
                      fileName,
                      currentSheet
                    );
                  }
                }}
              />
            )}
          </div>
        )}
      </main>

      {/* Dedicated Print Report Layout (no window.open needed) */}
      {hasData && (
        <div className="hidden print-only p-6 space-y-8 bg-white text-slate-900">
          <div className="border-b-2 border-slate-900 pb-4 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold">Ολοκληρωμένη Έκθεση Ανάλυσης Δεδομένων</h1>
              <p className="text-xs text-slate-500 mt-1">
                DataInsight Pro · {fileName} · Φύλλο: {currentSheet}
              </p>
            </div>
            <div className="text-xs text-slate-500 text-right tabular-nums">
              Ημερομηνία: {new Date().toLocaleDateString('el-GR')}
              <br />
              Εγγραφές: {data.length.toLocaleString('el-GR')}
            </div>
          </div>

          {insights?.summary && (
            <section>
              <h2 className="text-base font-bold mb-2">1. Επιτελική Σύνοψη</h2>
              <p className="text-xs leading-relaxed whitespace-pre-line">{insights.summary}</p>
            </section>
          )}

          <section>
            <h2 className="text-base font-bold mb-3">2. Περιγραφική Στατιστική ανά Στήλη</h2>
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-2 border border-slate-300">Παράμετρος</th>
                  {numericColumns.map((h) => (
                    <th key={h} className="p-2 border border-slate-300 text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Μέση Τιμή', key: 'mean' },
                  { label: 'Διάμεσος', key: 'median' },
                  { label: 'Τυπ. Απόκλιση', key: 'stdDev' },
                  { label: 'Ελάχιστο', key: 'min' },
                  { label: 'Μέγιστο', key: 'max' },
                  { label: 'Πλήθος (N)', key: 'count' },
                ].map((param) => (
                  <tr key={param.key}>
                    <td className="p-2 border border-slate-200 font-semibold">{param.label}</td>
                    {numericColumns.map((h) => {
                      const s = getColumnStatsForDataset(data, h, numericColumns[0]);
                      const val = s ? (s as unknown as Record<string, number | null>)[param.key] : null;
                      return (
                        <td
                          key={h}
                          className="p-2 border border-slate-200 text-right font-mono tabular-nums"
                        >
                          {typeof val === 'number'
                            ? val.toLocaleString('el-GR', { maximumFractionDigits: 2 })
                            : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {orderedCharts.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-base font-bold">3. Γραφικές Παραστάσεις</h2>
              <div className="grid grid-cols-2 gap-6">
                {orderedCharts.slice(0, 6).map((chart) => (
                  <div
                    key={chart.id}
                    className="border border-slate-200 rounded-lg p-4 break-inside-avoid"
                  >
                    <h3 className="text-xs font-bold mb-1">{chart.title}</h3>
                    <p className="text-[10px] text-slate-500 mb-2">{chart.description}</p>
                    <div className="h-[220px]">
                      <ChartRenderer
                        chart={chart}
                        data={data}
                        headers={headers}
                        numericColumns={numericColumns}
                        height={220}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
