import React, { useState } from 'react';
import {
  AlertCircle,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import { ChatMessage, DataInsight } from '../types';

interface AIInsightsViewProps {
  insights: DataInsight | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onExportWord: () => void;
  chatMessages: ChatMessage[];
  isAsking: boolean;
  askError: string | null;
  onAskQuestion: (question: string) => void;
}

const SUGGESTED_QUESTIONS = [
  'Ποιες στήλες παρουσιάζουν τη μεγαλύτερη διακύμανση;',
  'Υπάρχουν ακραίες τιμές (outliers) ή ανισορροπίες στα δεδομένα;',
  'Ποια είναι τα 3 σημαντικότερα συμπεράσματα για λήψη αποφάσεων;',
];

export const AIInsightsView: React.FC<AIInsightsViewProps> = ({
  insights,
  isLoading,
  error,
  onRefresh,
  onExportWord,
  chatMessages,
  isAsking,
  askError,
  onAskQuestion,
}) => {
  const [questionInput, setQuestionInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = questionInput.trim();
    if (!q || isAsking) return;
    setQuestionInput('');
    onAskQuestion(q);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left / Primary: AI Executive Summary & Column Interpretations */}
      <div className="lg:col-span-8 space-y-6">
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                AI Επιτελική Σύνοψη &amp; Στατιστικά Ευρήματα
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Βασίζεται στους πραγματικούς τοπικούς στατιστικούς υπολογισμούς του συνόλου δεδομένων.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Ανανέωση
              </button>
              <button
                onClick={onExportWord}
                disabled={!insights || isLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                Εξαγωγή Word (.docx)
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-5 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Αποτυχία δημιουργίας ανάλυσης AI</p>
                  <p className="mt-1 text-red-700">{error}</p>
                </div>
              </div>
              <button
                onClick={onRefresh}
                className="px-3 py-1.5 text-xs font-medium text-red-800 bg-white border border-red-200 hover:bg-red-50 rounded-md shrink-0"
              >
                Επανάληψη
              </button>
            </div>
          )}

          {isLoading && !insights && (
            <div className="py-12 space-y-4">
              <div className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                Ανάλυση στατιστικών δεικτών και σύνθεση αναφοράς...
              </div>
              <div className="space-y-2.5 animate-pulse">
                <div className="h-3.5 bg-slate-100 rounded w-full" />
                <div className="h-3.5 bg-slate-100 rounded w-11/12" />
                <div className="h-3.5 bg-slate-100 rounded w-4/5" />
              </div>
            </div>
          )}

          {!isLoading && !insights && !error && (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-500 mb-4">
                Δεν έχει εκτελεστεί ακόμη ανάλυση AI για το τρέχον φύλλο.
              </p>
              <button
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                <Sparkles className="w-4 h-4" />
                Έναρξη Ανάλυσης AI
              </button>
            </div>
          )}

          {insights && (
            <div className="mt-5 space-y-6">
              {/* Executive Summary */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 tracking-wide">
                  Γενικό Συμπέρασμα
                </h3>
                <div className="text-sm text-slate-700 leading-relaxed space-y-3 max-w-[75ch]">
                  {insights.summary
                    .split(/\n+/)
                    .filter(Boolean)
                    .map((para, idx) => (
                      <p key={idx}>{para}</p>
                    ))}
                </div>
              </div>

              {/* Key Findings */}
              {insights.keyFindings && insights.keyFindings.length > 0 && (
                <div className="pt-5 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-500 tracking-wide mb-3">
                    Βασικά Ευρήματα
                  </h3>
                  <ul className="space-y-2.5">
                    {insights.keyFindings.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-slate-800">
                        <span className="font-mono text-xs font-semibold text-blue-600 mt-0.5 tabular-nums">
                          0{idx + 1}.
                        </span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Column-by-column statistical interpretations */}
              {insights.statistics && insights.statistics.length > 0 && (
                <div className="pt-5 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-500 tracking-wide mb-4">
                    Αναλυτική Ερμηνεία ανά Στήλη
                  </h3>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {insights.statistics.map((stat, idx) => (
                      <div key={idx} className="p-4 bg-white">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                          <h4 className="text-sm font-semibold text-slate-900">{stat.column}</h4>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {stat.type === 'numeric' ? 'Αριθμητική' : 'Κατηγορική'} · N={stat.count}
                          </span>
                        </div>

                        {stat.type === 'numeric' ? (
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono tabular-nums text-slate-700 mb-2">
                            <span>
                              Μέσος όρος:{' '}
                              <strong>
                                {stat.mean?.toLocaleString('el-GR', { maximumFractionDigits: 2 }) ?? '—'}
                              </strong>
                            </span>
                            {stat.median !== undefined && (
                              <span>
                                Διάμεσος:{' '}
                                <strong>
                                  {stat.median.toLocaleString('el-GR', { maximumFractionDigits: 2 })}
                                </strong>
                              </span>
                            )}
                            <span>
                              Min:{' '}
                              <strong>
                                {stat.min?.toLocaleString('el-GR', { maximumFractionDigits: 2 }) ?? '—'}
                              </strong>
                            </span>
                            <span>
                              Max:{' '}
                              <strong>
                                {stat.max?.toLocaleString('el-GR', { maximumFractionDigits: 2 }) ?? '—'}
                              </strong>
                            </span>
                          </div>
                        ) : (
                          stat.topValues &&
                          stat.topValues.length > 0 && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mb-2">
                              <span className="font-medium text-slate-500">Κυρίαρχες τιμές:</span>
                              {stat.topValues.slice(0, 3).map((v, i) => (
                                <span key={i} className="font-mono tabular-nums">
                                  {v.value} ({v.count})
                                </span>
                              ))}
                            </div>
                          )
                        )}

                        {stat.description && (
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {stat.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Right Sidebar: Interactive Data Q&A */}
      <aside className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 flex flex-col lg:sticky lg:top-24 max-h-[720px]">
        <div className="pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Ερωτήσεις για τα Δεδομένα</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ρωτήστε οτιδήποτε για τις στήλες, τις τάσεις ή τις συγκρίσεις του αρχείου σας.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-3 min-h-[260px]">
          {chatMessages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 font-medium">Προτεινόμενες ερωτήσεις:</p>
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => onAskQuestion(q)}
                  disabled={isAsking}
                  className="block w-full text-left text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          ) : (
            chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={
                  msg.role === 'user'
                    ? 'ml-6 bg-blue-600 text-white rounded-xl rounded-tr-xs px-3.5 py-2.5 text-xs leading-relaxed'
                    : 'mr-4 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl rounded-tl-xs px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line'
                }
              >
                {msg.text}
              </div>
            ))
          )}

          {isAsking && (
            <div className="mr-4 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              Ανάλυση ερώτησης...
            </div>
          )}

          {askError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {askError}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="pt-3 border-t border-slate-100 flex items-center gap-2">
          <input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="Γράψτε μια ερώτηση..."
            className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isAsking || !questionInput.trim()}
            aria-label="Αποστολή ερώτησης"
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </aside>
    </div>
  );
};
