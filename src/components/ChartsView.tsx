import React, { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  Columns3,
  Download,
  FileText,
  Filter,
  GripVertical,
  Loader2,
  Maximize2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AggregationMode,
  ChartSuggestion,
  ChartType,
  ColumnSeriesMode,
  DataRow,
} from '../types';
import { getRowLabels } from '../lib/statistics';
import { ChartRenderer } from './ChartRenderer';
import { cn } from '../lib/utils';

const COLUMNS_X_SENTINEL = '__COLUMNS__';

interface ChartsViewProps {
  charts: ChartSuggestion[];
  onSetCharts: React.Dispatch<React.SetStateAction<ChartSuggestion[]>>;
  data: DataRow[];
  headers: string[];
  numericColumns: string[];
  isLoadingAI: boolean;
  aiError?: string | null;
  onRequestAICharts: () => void;
  onExportWord: (chartImages: Record<string, string>) => Promise<void>;
}

interface SortableCardProps {
  chart: ChartSuggestion;
  headers: string[];
  numericColumns: string[];
  rowLabels: string[];
  data: DataRow[];
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onUpdate: (id: string, updates: Partial<ChartSuggestion>) => void;
  onDelete: (id: string) => void;
  onZoom: (id: string) => void;
}

const SortableChartCard: React.FC<SortableCardProps> = ({
  chart,
  headers,
  numericColumns,
  rowLabels,
  data,
  registerRef,
  onUpdate,
  onDelete,
  onZoom,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chart.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 40 : 'auto',
  };

  const isColMode = chart.orientation === 'columns';

  const handleXAxisSelect = (val: string) => {
    if (val === COLUMNS_X_SENTINEL) {
      onUpdate(chart.id, {
        orientation: 'columns',
        xAxis: COLUMNS_X_SENTINEL,
        xColumns: numericColumns.length > 0 ? numericColumns : headers,
        seriesMode: chart.seriesMode || (rowLabels.length <= 6 ? 'multi' : 'avg'),
        selectedRows: rowLabels.slice(0, 5),
        excludedXValues: [],
      });
    } else {
      onUpdate(chart.id, {
        orientation: 'rows',
        xAxis: val,
        yAxis:
          chart.yAxis && headers.includes(chart.yAxis)
            ? chart.yAxis
            : numericColumns[0] || headers[1] || headers[0] || '',
        excludedXValues: [],
      });
    }
  };

  const currentColSeriesValue = () => {
    const mode = chart.seriesMode || 'avg';
    if (mode === 'avg') return '__AVG__';
    if (mode === 'sum') return '__SUM__';
    if (mode === 'multi') return '__MULTI__';
    return chart.selectedRows?.[0] || rowLabels[0] || '__AVG__';
  };

  const handleColSeriesChange = (val: string) => {
    if (val === '__AVG__') {
      onUpdate(chart.id, { seriesMode: 'avg' });
    } else if (val === '__SUM__') {
      onUpdate(chart.id, { seriesMode: 'sum' });
    } else if (val === '__MULTI__') {
      onUpdate(chart.id, {
        seriesMode: 'multi',
        selectedRows:
          chart.selectedRows && chart.selectedRows.length > 1
            ? chart.selectedRows
            : rowLabels.slice(0, 5),
      });
    } else {
      onUpdate(chart.id, {
        seriesMode: 'row',
        selectedRows: [val],
      });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white rounded-xl border border-slate-200 p-5 flex flex-col transition-shadow',
        isDragging ? 'opacity-70 border-blue-400 shadow-lg' : 'hover:border-slate-300'
      )}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={chart.title}
            onChange={(e) => onUpdate(chart.id, { title: e.target.value })}
            aria-label="Τίτλος γραφήματος"
            className="text-sm font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none w-full pb-0.5 truncate"
          />
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{chart.description}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onZoom(chart.id)}
            title="Μεγέθυνση & Φίλτρα"
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-md transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(chart.id)}
            title="Διαγραφή γραφήματος"
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            {...attributes}
            {...listeners}
            title="Μετακίνηση σειράς"
            className="p-1.5 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md transition-colors"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Axis & Type Controls */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Τύπος</label>
          <select
            value={chart.type}
            onChange={(e) => onUpdate(chart.id, { type: e.target.value as ChartType })}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="bar">Ραβδόγραμμα (Bar)</option>
            <option value="line">Γραμμή (Line)</option>
            <option value="pie">Κυκλικό (Pie)</option>
            <option value="scatter">Διασπορά (Scatter)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Άξονας X</label>
          <select
            value={isColMode ? COLUMNS_X_SENTINEL : chart.xAxis}
            onChange={(e) => handleXAxisSelect(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={COLUMNS_X_SENTINEL}>
              Μεταβλητές στηλών (π.χ. Έτη)
            </option>
            <optgroup label="Μεμονωμένη στήλη">
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {isColMode ? (
          <>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Άξονας Y (Σειρά / Γραμμή)
              </label>
              <select
                value={currentColSeriesValue()}
                onChange={(e) => handleColSeriesChange(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="__MULTI__">Σύγκριση γραμμών (Πολλαπλές σειρές)</option>
                <option value="__AVG__">Μέσος Όρος (όλες οι γραμμές)</option>
                <option value="__SUM__">Άθροισμα (όλες οι γραμμές)</option>
                <optgroup label="Συγκεκριμένη γραμμή">
                  {rowLabels.slice(0, 60).map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Άξονας Y</label>
              <select
                value={chart.yAxis}
                onChange={(e) =>
                  onUpdate(chart.id, { yAxis: e.target.value, excludedYValues: [] })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Ομαδοποίηση
              </label>
              <select
                value={chart.aggregation || 'none'}
                disabled={chart.type === 'scatter'}
                onChange={(e) =>
                  onUpdate(chart.id, { aggregation: e.target.value as AggregationMode })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="none">Αρχικές τιμές</option>
                <option value="sum">Άθροισμα (Sum)</option>
                <option value="avg">Μέσος όρος (Avg)</option>
                <option value="count">Πλήθος (Count)</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Chart Canvas */}
      <div
        ref={(el) => registerRef(chart.id, el)}
        className="flex-1 min-h-[280px] bg-white rounded-lg"
      >
        <ChartRenderer
          chart={chart}
          data={data}
          headers={headers}
          numericColumns={numericColumns}
          height={280}
        />
      </div>
    </div>
  );
};

export const ChartsView: React.FC<ChartsViewProps> = ({
  charts,
  onSetCharts,
  data,
  headers,
  numericColumns,
  isLoadingAI,
  aiError,
  onRequestAICharts,
  onExportWord,
}) => {
  const [zoomedChartId, setZoomedChartId] = useState<string | null>(null);
  const [openFilterAxis, setOpenFilterAxis] = useState<'x' | 'y' | null>(null);
  const [isExportingWord, setIsExportingWord] = useState(false);

  const chartNodeMapRef = useRef<Record<string, HTMLDivElement | null>>({});
  const zoomChartContainerRef = useRef<HTMLDivElement>(null);

  const rowLabels = useMemo(
    () => getRowLabels(data, headers, numericColumns),
    [data, headers, numericColumns]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const zoomedChart = useMemo(
    () => charts.find((c) => c.id === zoomedChartId) || null,
    [charts, zoomedChartId]
  );

  const handleUpdate = (id: string, updates: Partial<ChartSuggestion>) => {
    onSetCharts((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const handleDelete = (id: string) => {
    onSetCharts((prev) => prev.filter((c) => c.id !== id));
    if (zoomedChartId === id) setZoomedChartId(null);
  };

  const handleAddChart = (orientation: 'rows' | 'columns' = 'rows') => {
    if (orientation === 'columns') {
      const cols = numericColumns.length > 0 ? numericColumns : headers;
      const newChart: ChartSuggestion = {
        id: `custom-col-chart-${Date.now()}`,
        type: 'line',
        orientation: 'columns',
        title: 'Εξέλιξη κατά Στήλες / Έτη',
        xAxis: COLUMNS_X_SENTINEL,
        yAxis: cols[0] || '',
        xColumns: cols,
        seriesMode: rowLabels.length <= 6 ? 'multi' : 'avg',
        selectedRows: rowLabels.slice(0, 5),
        description: 'Οπτικοποίηση των μεταβλητών από τις στήλες (π.χ. έτη) στον άξονα X.',
      };
      onSetCharts((prev) => [...prev, newChart]);
      return;
    }

    const defaultX = headers.find((h) => !numericColumns.includes(h)) || headers[0] || '';
    const defaultY = numericColumns[0] || headers[1] || headers[0] || '';
    const newChart: ChartSuggestion = {
      id: `custom-chart-${Date.now()}`,
      type: 'bar',
      orientation: 'rows',
      title: `${defaultY} ανά ${defaultX}`,
      xAxis: defaultX,
      yAxis: defaultY,
      aggregation: 'none',
      description: 'Προσαρμοσμένη γραφική παράσταση.',
    };
    onSetCharts((prev) => [...prev, newChart]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onSetCharts((items) => {
        const oldIdx = items.findIndex((i) => i.id === active.id);
        const newIdx = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  };

  const handleExportSinglePNG = async () => {
    if (!zoomChartContainerRef.current || !zoomedChart) return;
    try {
      const dataUrl = await toPng(zoomChartContainerRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `${(zoomedChart.title || 'chart').replace(/\s+/g, '_')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('PNG export failed:', err);
    }
  };

  const handleExportAllWord = async () => {
    setIsExportingWord(true);
    try {
      const images: Record<string, string> = {};
      for (const chart of charts) {
        const node = chartNodeMapRef.current[chart.id];
        if (node) {
          try {
            images[chart.id] = await toPng(node, {
              backgroundColor: '#ffffff',
              pixelRatio: 2,
            });
          } catch {
            // Skip image if capture fails; table will still export
          }
        }
      }
      await onExportWord(images);
    } finally {
      setIsExportingWord(false);
    }
  };

  const uniqueValuesForAxis = (axisCol: string) => {
    return Array.from(
      new Set(
        data
          .map((row) => row[axisCol])
          .filter((v) => v !== undefined && v !== null && v !== '')
          .map((v) => String(v))
      )
    ).slice(0, 80);
  };

  const zoomedIsColMode = zoomedChart?.orientation === 'columns';
  const zoomedBaseCols =
    zoomedChart?.xColumns && zoomedChart.xColumns.length > 0
      ? zoomedChart.xColumns
      : numericColumns.length > 0
        ? numericColumns
        : headers;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Στούντιο Γραφικών Παραστάσεων
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {charts.length} γραφήματα · Υποστηρίζει τόσο γραμμές όσο και μεταβλητές στηλών (π.χ. έτη) στον άξονα X.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleAddChart('columns')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Columns3 className="w-3.5 h-3.5" />
            Γράφημα Στηλών / Ετών (Άξονας X)
          </button>

          <button
            onClick={() => handleAddChart('rows')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Νέο Γράφημα
          </button>

          <button
            onClick={handleExportAllWord}
            disabled={charts.length === 0 || isExportingWord}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {isExportingWord ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            Αρχειοθέτηση σε Word (.docx)
          </button>
        </div>
      </section>

      {/* AI Error Banner */}
      {aiError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-4">
          <div className="flex items-start gap-2.5 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{aiError}</span>
          </div>
          <button
            onClick={onRequestAICharts}
            className="px-3 py-1.5 text-xs font-medium text-red-800 bg-white border border-red-200 hover:bg-red-50 rounded-md shrink-0"
          >
            Επανάληψη
          </button>
        </div>
      )}

      {/* Grid or Empty State */}
      {charts.length === 0 ? (
        <section className="bg-white rounded-xl border border-slate-200 py-16 px-6 text-center">
          {isLoadingAI ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
              <p className="text-sm font-medium text-slate-700">
                Δημιουργία προτεινόμενων γραφημάτων από την ανάλυση AI...
              </p>
            </div>
          ) : (
            <div className="max-w-lg mx-auto">
              <h3 className="text-sm font-semibold text-slate-900">
                Δεν υπάρχουν γραφήματα ακόμα
              </h3>
              <p className="text-xs text-slate-500 mt-1 mb-5">
                Δημιουργήστε γράφημα με τις στήλες/έτη στον άξονα X, προσθέστε ένα τυπικό γράφημα ή ζητήστε προτάσεις από την AI.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => handleAddChart('columns')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <Columns3 className="w-4 h-4" />
                  Γράφημα Στηλών / Ετών
                </button>
                <button
                  onClick={() => handleAddChart('rows')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Νέο Γράφημα
                </button>
                <button
                  onClick={onRequestAICharts}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Προτάσεις AI
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={charts.map((c) => c.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {charts.map((chart) => (
                <SortableChartCard
                  key={chart.id}
                  chart={chart}
                  headers={headers}
                  numericColumns={numericColumns}
                  rowLabels={rowLabels}
                  data={data}
                  registerRef={(id, el) => {
                    chartNodeMapRef.current[id] = el;
                  }}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onZoom={(id) => {
                    setZoomedChartId(id);
                    setOpenFilterAxis(null);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Fullscreen Zoom & Filter Modal */}
      {zoomedChart && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => {
            setZoomedChartId(null);
            setOpenFilterAxis(null);
          }}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl h-[84vh] p-6 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={zoomedChart.title}
                  onChange={(e) => handleUpdate(zoomedChart.id, { title: e.target.value })}
                  className="text-lg font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none w-full"
                />
                <input
                  type="text"
                  value={zoomedChart.description}
                  onChange={(e) => handleUpdate(zoomedChart.id, { description: e.target.value })}
                  className="text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none w-full mt-1"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleExportSinglePNG}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Λήψη PNG
                </button>
                <button
                  onClick={() => {
                    setZoomedChartId(null);
                    setOpenFilterAxis(null);
                  }}
                  aria-label="Κλείσιμο"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Controls & Multi-select Value/Column/Row Filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-4 border-b border-slate-100">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Τύπος</label>
                <select
                  value={zoomedChart.type}
                  onChange={(e) =>
                    handleUpdate(zoomedChart.id, { type: e.target.value as ChartType })
                  }
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="bar">Ραβδόγραμμα (Bar)</option>
                  <option value="line">Γραμμή (Line)</option>
                  <option value="pie">Κυκλικό (Pie)</option>
                  <option value="scatter">Διασπορά (Scatter)</option>
                </select>
              </div>

              {/* X-Axis Selector & Filter */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-500">Άξονας X</label>
                  <button
                    onClick={() => setOpenFilterAxis((p) => (p === 'x' ? null : 'x'))}
                    className={cn(
                      'inline-flex items-center gap-1 text-[11px] font-medium transition-colors',
                      (zoomedChart.excludedXValues?.length || 0) > 0
                        ? 'text-blue-600'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    <Filter className="w-3 h-3" />
                    {zoomedIsColMode ? 'Επιλογή στηλών' : 'Φίλτρο'}
                    {(zoomedChart.excludedXValues?.length || 0) > 0 &&
                      ` (-${zoomedChart.excludedXValues?.length})`}
                  </button>
                </div>
                <select
                  value={zoomedIsColMode ? COLUMNS_X_SENTINEL : zoomedChart.xAxis}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === COLUMNS_X_SENTINEL) {
                      handleUpdate(zoomedChart.id, {
                        orientation: 'columns',
                        xAxis: COLUMNS_X_SENTINEL,
                        xColumns: numericColumns.length > 0 ? numericColumns : headers,
                        seriesMode: zoomedChart.seriesMode || (rowLabels.length <= 6 ? 'multi' : 'avg'),
                        selectedRows: rowLabels.slice(0, 5),
                        excludedXValues: [],
                      });
                    } else {
                      handleUpdate(zoomedChart.id, {
                        orientation: 'rows',
                        xAxis: val,
                        yAxis:
                          zoomedChart.yAxis && headers.includes(zoomedChart.yAxis)
                            ? zoomedChart.yAxis
                            : numericColumns[0] || headers[1] || headers[0] || '',
                        excludedXValues: [],
                      });
                    }
                  }}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={COLUMNS_X_SENTINEL}>Μεταβλητές στηλών (π.χ. Έτη)</option>
                  <optgroup label="Μεμονωμένη στήλη">
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </optgroup>
                </select>

                {openFilterAxis === 'x' && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-64">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <span className="text-xs font-semibold text-slate-800">
                        {zoomedIsColMode ? 'Στήλες στον Άξονα X' : 'Φίλτρο τιμών X'}
                      </span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          onClick={() => handleUpdate(zoomedChart.id, { excludedXValues: [] })}
                          className="text-blue-600 hover:underline"
                        >
                          Όλες
                        </button>
                        <button
                          onClick={() => setOpenFilterAxis(null)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
                      {(zoomedIsColMode ? zoomedBaseCols : uniqueValuesForAxis(zoomedChart.xAxis)).map(
                        (valStr) => {
                          const excluded = zoomedChart.excludedXValues?.includes(valStr) ?? false;
                          return (
                            <label
                              key={valStr}
                              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={!excluded}
                                onChange={(e) => {
                                  const nextExcluded = e.target.checked
                                    ? (zoomedChart.excludedXValues || []).filter((v) => v !== valStr)
                                    : [...(zoomedChart.excludedXValues || []), valStr];
                                  handleUpdate(zoomedChart.id, { excludedXValues: nextExcluded });
                                }}
                                className="rounded border-slate-300 text-blue-600"
                              />
                              <span className="truncate">{valStr}</span>
                            </label>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Y-Axis Selector & Filter */}
              {zoomedIsColMode ? (
                <div className="col-span-2 relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-slate-500">
                      Άξονας Y (Σειρές / Γραμμές)
                    </label>
                    {(zoomedChart.seriesMode === 'multi' || !zoomedChart.seriesMode) && (
                      <button
                        onClick={() => setOpenFilterAxis((p) => (p === 'y' ? null : 'y'))}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
                      >
                        <Filter className="w-3 h-3" />
                        Επιλογή γραμμών ({zoomedChart.selectedRows?.length || Math.min(5, rowLabels.length)})
                      </button>
                    )}
                  </div>
                  <select
                    value={
                      zoomedChart.seriesMode === 'avg'
                        ? '__AVG__'
                        : zoomedChart.seriesMode === 'sum'
                          ? '__SUM__'
                          : zoomedChart.seriesMode === 'multi'
                            ? '__MULTI__'
                            : zoomedChart.selectedRows?.[0] || '__AVG__'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__AVG__' || val === '__SUM__' || val === '__MULTI__') {
                        const modeMap: Record<string, ColumnSeriesMode> = {
                          __AVG__: 'avg',
                          __SUM__: 'sum',
                          __MULTI__: 'multi',
                        };
                        handleUpdate(zoomedChart.id, {
                          seriesMode: modeMap[val],
                          selectedRows:
                            val === '__MULTI__'
                              ? zoomedChart.selectedRows?.length
                                ? zoomedChart.selectedRows
                                : rowLabels.slice(0, 5)
                              : zoomedChart.selectedRows,
                        });
                      } else {
                        handleUpdate(zoomedChart.id, {
                          seriesMode: 'row',
                          selectedRows: [val],
                        });
                      }
                    }}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="__MULTI__">Σύγκριση γραμμών (Πολλαπλές σειρές)</option>
                    <option value="__AVG__">Μέσος Όρος (όλες οι γραμμές)</option>
                    <option value="__SUM__">Άθροισμα (όλες οι γραμμές)</option>
                    <optgroup label="Συγκεκριμένη γραμμή">
                      {rowLabels.slice(0, 80).map((lbl) => (
                        <option key={lbl} value={lbl}>
                          {lbl}
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  {openFilterAxis === 'y' && (
                    <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-72">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <span className="text-xs font-semibold text-slate-800">
                          Επιλογή γραμμών σύγκρισης
                        </span>
                        <button
                          onClick={() => setOpenFilterAxis(null)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
                        {rowLabels.slice(0, 80).map((lbl) => {
                          const selected = (
                            zoomedChart.selectedRows && zoomedChart.selectedRows.length > 0
                              ? zoomedChart.selectedRows
                              : rowLabels.slice(0, 5)
                          ).includes(lbl);
                          return (
                            <label
                              key={lbl}
                              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => {
                                  const base =
                                    zoomedChart.selectedRows && zoomedChart.selectedRows.length > 0
                                      ? zoomedChart.selectedRows
                                      : rowLabels.slice(0, 5);
                                  const next = e.target.checked
                                    ? Array.from(new Set([...base, lbl]))
                                    : base.filter((item) => item !== lbl);
                                  handleUpdate(zoomedChart.id, {
                                    seriesMode: 'multi',
                                    selectedRows: next.length > 0 ? next : [lbl],
                                  });
                                }}
                                className="rounded border-slate-300 text-blue-600"
                              />
                              <span className="truncate">{lbl}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-slate-500">Άξονας Y</label>
                      <button
                        onClick={() => setOpenFilterAxis((p) => (p === 'y' ? null : 'y'))}
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-medium transition-colors',
                          (zoomedChart.excludedYValues?.length || 0) > 0
                            ? 'text-blue-600'
                            : 'text-slate-500 hover:text-slate-800'
                        )}
                      >
                        <Filter className="w-3 h-3" />
                        Φίλτρο
                        {(zoomedChart.excludedYValues?.length || 0) > 0 &&
                          ` (-${zoomedChart.excludedYValues?.length})`}
                      </button>
                    </div>
                    <select
                      value={zoomedChart.yAxis}
                      onChange={(e) =>
                        handleUpdate(zoomedChart.id, {
                          yAxis: e.target.value,
                          excludedYValues: [],
                        })
                      }
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>

                    {openFilterAxis === 'y' && (
                      <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-64">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                          <span className="text-xs font-semibold text-slate-800">
                            Φίλτρο τιμών Y
                          </span>
                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              onClick={() => handleUpdate(zoomedChart.id, { excludedYValues: [] })}
                              className="text-blue-600 hover:underline"
                            >
                              Όλες
                            </button>
                            <button
                              onClick={() => setOpenFilterAxis(null)}
                              className="text-slate-400 hover:text-slate-700"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
                          {uniqueValuesForAxis(zoomedChart.yAxis).map((valStr) => {
                            const excluded = zoomedChart.excludedYValues?.includes(valStr) ?? false;
                            return (
                              <label
                                key={valStr}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs text-slate-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={!excluded}
                                  onChange={(e) => {
                                    const nextExcluded = e.target.checked
                                      ? (zoomedChart.excludedYValues || []).filter(
                                          (v) => v !== valStr
                                        )
                                      : [...(zoomedChart.excludedYValues || []), valStr];
                                    handleUpdate(zoomedChart.id, { excludedYValues: nextExcluded });
                                  }}
                                  className="rounded border-slate-300 text-blue-600"
                                />
                                <span className="truncate">{valStr}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Ομαδοποίηση
                    </label>
                    <select
                      value={zoomedChart.aggregation || 'none'}
                      disabled={zoomedChart.type === 'scatter'}
                      onChange={(e) =>
                        handleUpdate(zoomedChart.id, {
                          aggregation: e.target.value as AggregationMode,
                        })
                      }
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="none">Αρχικές τιμές</option>
                      <option value="sum">Άθροισμα (Sum)</option>
                      <option value="avg">Μέσος όρος (Avg)</option>
                      <option value="count">Πλήθος (Count)</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Large Chart Render */}
            <div ref={zoomChartContainerRef} className="flex-1 min-h-0 pt-4 bg-white">
              <ChartRenderer
                chart={zoomedChart}
                data={data}
                headers={headers}
                numericColumns={numericColumns}
                height="100%"
                large
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
