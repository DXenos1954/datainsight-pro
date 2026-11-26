import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Presentation,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ChartSuggestion, DataInsight, DataRow, SlideOutline } from '../types';
import { ChartRenderer } from './ChartRenderer';
import { cn } from '../lib/utils';

interface PresentationViewProps {
  insights: DataInsight | null;
  charts: ChartSuggestion[];
  data: DataRow[];
  headers: string[];
  numericColumns: string[];
  currentSheet: string;
  isLoading: boolean;
  error: string | null;
  onUpdatePresentation: (
    updater: (outline: DataInsight['presentationOutline']) => DataInsight['presentationOutline']
  ) => void;
  onRefreshAI: () => void;
  onExportPPTX: () => Promise<void>;
}

export const PresentationView: React.FC<PresentationViewProps> = ({
  insights,
  charts,
  data,
  headers,
  numericColumns,
  currentSheet,
  isLoading,
  error,
  onUpdatePresentation,
  onRefreshAI,
  onExportPPTX,
}) => {
  const slides = insights?.presentationOutline?.slides || [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (slides.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= slides.length) {
      setSelectedIndex(slides.length - 1);
    }
  }, [slides.length, selectedIndex]);

  const activeSlide: SlideOutline | undefined = slides[selectedIndex];
  const attachedChart =
    activeSlide?.chartIndex !== undefined &&
    activeSlide.chartIndex >= 0 &&
    charts[activeSlide.chartIndex]
      ? charts[activeSlide.chartIndex]
      : undefined;

  const handleUpdateSlide = (idx: number, updates: Partial<SlideOutline>) => {
    onUpdatePresentation((outline) => ({
      ...outline,
      slides: outline.slides.map((s, i) => (i === idx ? { ...s, ...updates } : s)),
    }));
  };

  const handleAddSlide = () => {
    const newSlide: SlideOutline = {
      id: `slide-${Date.now()}`,
      title: 'Νέα Διαφάνεια',
      content: ['Βασικό σημείο ανάλυσης 1', 'Βασικό σημείο ανάλυσης 2'],
    };
    onUpdatePresentation((outline) => ({
      ...outline,
      slides: [...outline.slides, newSlide],
    }));
    setSelectedIndex(slides.length);
  };

  const handleDeleteSlide = (idx: number) => {
    onUpdatePresentation((outline) => ({
      ...outline,
      slides: outline.slides.filter((_, i) => i !== idx),
    }));
    if (selectedIndex >= idx && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleUpdateBullet = (bulletIdx: number, value: string) => {
    if (!activeSlide) return;
    const next = [...activeSlide.content];
    next[bulletIdx] = value;
    handleUpdateSlide(selectedIndex, { content: next });
  };

  const handleAddBullet = () => {
    if (!activeSlide) return;
    handleUpdateSlide(selectedIndex, {
      content: [...activeSlide.content, 'Νέο σημείο ανάλυσης'],
    });
  };

  const handleRemoveBullet = (bulletIdx: number) => {
    if (!activeSlide) return;
    handleUpdateSlide(selectedIndex, {
      content: activeSlide.content.filter((_, i) => i !== bulletIdx),
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExportPPTX();
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading && !insights) {
    return (
      <section className="bg-white rounded-xl border border-slate-200 py-20 text-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-700">
          Δημιουργία δομής παρουσίασης και διαφανειών από την AI...
        </p>
      </section>
    );
  }

  if (!insights) {
    return (
      <section className="bg-white rounded-xl border border-slate-200 py-16 px-6 text-center">
        {error && (
          <div className="max-w-lg mx-auto mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}
        <Presentation className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-900">
          Η παρουσίαση δεν έχει δημιουργηθεί ακόμα
        </h3>
        <p className="text-xs text-slate-500 mt-1 mb-5">
          Εκτελέστε την ανάλυση AI για να συνταχθούν αυτόματα οι διαφάνειες με τα στατιστικά και τα γραφήματα του φύλλου {currentSheet}.
        </p>
        <button
          onClick={onRefreshAI}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <Sparkles className="w-4 h-4" />
          Δημιουργία Παρουσίασης AI
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Presentation Controls */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">
            Τίτλος Παρουσίασης
          </label>
          <input
            type="text"
            value={insights.presentationOutline.title}
            onChange={(e) =>
              onUpdatePresentation((outline) => ({ ...outline, title: e.target.value }))
            }
            className="text-base font-semibold text-slate-900 bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none w-full max-w-xl pb-1"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAddSlide}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Νέα Διαφάνεια
          </button>
          <button
            onClick={handleExport}
            disabled={slides.length === 0 || isExporting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Εξαγωγή PowerPoint (.pptx)
          </button>
        </div>
      </section>

      {/* Slide Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Slide Rail */}
        <aside className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-3 space-y-1.5 max-h-[640px] overflow-y-auto custom-scrollbar">
          {slides.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              Πατήστε «Νέα Διαφάνεια» για να ξεκινήσετε.
            </p>
          ) : (
            slides.map((slide, idx) => (
              <div
                key={slide.id || idx}
                onClick={() => setSelectedIndex(idx)}
                className={cn(
                  'group flex items-start justify-between gap-2 p-3 rounded-lg border cursor-pointer transition-colors',
                  selectedIndex === idx
                    ? 'bg-blue-50/70 border-blue-200'
                    : 'bg-white border-transparent hover:bg-slate-50'
                )}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={cn(
                      'text-xs font-mono font-semibold tabular-nums mt-0.5 w-5 shrink-0',
                      selectedIndex === idx ? 'text-blue-600' : 'text-slate-400'
                    )}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-slate-900 truncate">
                      {slide.title || 'Χωρίς τίτλο'}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {slide.content.length} σημεία
                      {slide.chartIndex !== undefined && charts[slide.chartIndex]
                        ? ' · Με γράφημα'
                        : ''}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSlide(idx);
                  }}
                  title="Διαγραφή διαφάνειας"
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 rounded transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </aside>

        {/* Active Slide Live Editor & Preview */}
        <section className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 flex flex-col min-h-[540px]">
          {activeSlide ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <span className="text-xs font-mono font-semibold text-blue-600 tabular-nums">
                  Διαφάνεια {selectedIndex + 1} από {slides.length}
                </span>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Συνδεδεμένο γράφημα:</label>
                  <select
                    value={activeSlide.chartIndex ?? -1}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      handleUpdateSlide(selectedIndex, {
                        chartIndex: val >= 0 ? val : undefined,
                      });
                    }}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px]"
                  >
                    <option value={-1}>Κανένα γράφημα</option>
                    {charts.map((c, idx) => (
                      <option key={c.id} value={idx}>
                        {idx + 1}. {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Slide Canvas */}
              <div className="flex-1 py-5 flex flex-col">
                <input
                  type="text"
                  value={activeSlide.title}
                  onChange={(e) =>
                    handleUpdateSlide(selectedIndex, { title: e.target.value })
                  }
                  className="text-xl font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none pb-1 mb-5"
                />

                <div
                  className={cn(
                    'grid gap-6 flex-1 items-start',
                    attachedChart ? 'grid-cols-1 xl:grid-cols-12' : 'grid-cols-1'
                  )}
                >
                  {/* Editable Bullet Points */}
                  <div className={cn('space-y-2.5', attachedChart ? 'xl:col-span-6' : '')}>
                    {activeSlide.content.map((point, bIdx) => (
                      <div key={bIdx} className="flex items-start gap-2 group">
                        <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                        <textarea
                          rows={2}
                          value={point}
                          onChange={(e) => handleUpdateBullet(bIdx, e.target.value)}
                          className="flex-1 text-sm text-slate-700 bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-transparent focus:border-blue-300 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none leading-relaxed"
                        />
                        <button
                          onClick={() => handleRemoveBullet(bIdx)}
                          title="Αφαίρεση σημείου"
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600 transition-opacity mt-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={handleAddBullet}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 pt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Προσθήκη σημείου
                    </button>
                  </div>

                  {/* Live Attached Chart Preview */}
                  {attachedChart && (
                    <div className="xl:col-span-6 border border-slate-200 rounded-xl p-3 bg-slate-50/40">
                      <p className="text-xs font-semibold text-slate-800 mb-2 truncate">
                        {attachedChart.title}
                      </p>
                      <div className="h-[250px] bg-white rounded-lg p-1">
                        <ChartRenderer
                          chart={attachedChart}
                          data={data}
                          headers={headers}
                          numericColumns={numericColumns}
                          height={240}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Slide Navigation Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="truncate max-w-xs">{insights.presentationOutline.title}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedIndex((p) => Math.max(0, p - 1))}
                    disabled={selectedIndex === 0}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Προηγούμενη
                  </button>
                  <button
                    onClick={() => setSelectedIndex((p) => Math.min(slides.length - 1, p + 1))}
                    disabled={selectedIndex >= slides.length - 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Επόμενη
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Επιλέξτε ή προσθέστε μια διαφάνεια για επεξεργασία.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
