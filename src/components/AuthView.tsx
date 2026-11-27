import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { PlanInfo, UserProfile } from '../types';
import { cn } from '../lib/utils';

interface AuthViewProps {
  plans: PlanInfo[];
  onAuthenticated: (user: UserProfile) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ plans, onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (name.trim().length < 2) {
        setError('Εισάγετε το ονοματεπώνυμό σας (τουλάχιστον 2 χαρακτήρες).');
        return;
      }
      if (password.length < 6) {
        setError('Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Οι κωδικοί πρόσβασης δεν ταιριάζουν.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { email: email.trim(), password }
          : { name: name.trim(), email: email.trim(), password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Αποτυχία σύνδεσης.');
      }
      onAuthenticated(payload.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα επικοινωνίας με τον διακομιστή.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-lg font-bold tracking-tight text-slate-900">
            DataInsight <span className="text-blue-600">Pro</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={cn(
                'px-3.5 py-2 text-xs font-medium rounded-lg transition-colors',
                mode === 'login'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              Είσοδος
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={cn(
                'px-3.5 py-2 text-xs font-medium rounded-lg transition-colors',
                mode === 'register'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              Δωρεάν Εγγραφή
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Platform Capabilities & Pricing Overview */}
        <div className="lg:col-span-7 space-y-8 pt-2">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Μαθηματική Επικύρωση · Αυτόματη Διόρθωση · AI Insights
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
              Επαγγελματική ανάλυση, μαθηματικός έλεγχος και παρουσιάσεις από αρχεία Excel &amp; CSV
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-4 leading-relaxed max-w-2xl">
              Αυτόματος καθαρισμός δεδομένων, επαλήθευση και επανυπολογισμός Excel τύπων και μαθηματικών εκφράσεων, αυτόματη διόρθωση σφαλμάτων (<code className="text-xs bg-slate-200/70 px-1 py-0.5 rounded">#DIV/0!</code>, ασυμφωνίες αθροισμάτων, τυπογραφικά) και έτοιμες εξαγωγές PowerPoint &amp; Word.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: 'Μαθηματική Επικύρωση Τύπων',
                desc: 'Επανυπολογισμός Excel formulas (SUM, AVERAGE, IF, πράξεις) & εντοπισμός ασυμφωνιών.',
              },
              {
                title: 'Αυτόματη Διόρθωση Λαθών',
                desc: 'Αναγνώριση και επιδιόρθωση #DIV/0!, #VALUE!, τυπογραφικών αριθμών & διπλότυπων.',
              },
              {
                title: 'Περιγραφική Στατιστική & Γραφήματα',
                desc: 'Μέσος όρος, διάμεσος, IQR, 95% CI, συσχετίσεις Pearson και διαδραστικά charts.',
              },
              {
                title: 'Αναφορές AI, PowerPoint & Word',
                desc: 'Επιτελική σύνοψη στα Ελληνικά, AI Q&A και αυτόματη εξαγωγή .pptx / .docx / .xlsx.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3"
              >
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-semibold text-slate-900">{item.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Pricing Preview Strip */}
          {plans.length > 0 && (
            <div className="pt-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Διαθέσιμα Πακέτα (3 δωρεάν αναλύσεις AI με κάθε εγγραφή)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {plans.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      'bg-white rounded-xl border p-3.5',
                      p.id === 'pro_monthly'
                        ? 'border-blue-300 bg-blue-50/30'
                        : 'border-slate-200'
                    )}
                  >
                    <p className="text-xs font-semibold text-slate-900">{p.name}</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      €{p.priceEur}
                      {p.billingType === 'monthly' && (
                        <span className="text-[11px] font-sans font-normal text-slate-500">
                          /μήνα
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {p.credits < 0 ? 'Απεριόριστες αναλύσεις' : `+${p.credits} αναλύσεις AI`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Auth Card */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={cn(
                  'flex-1 py-2 text-xs font-semibold rounded-md transition-colors',
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                Είσοδος
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={cn(
                  'flex-1 py-2 text-xs font-semibold rounded-md transition-colors',
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                Νέα Εγγραφή
              </button>
            </div>

            <h2 className="text-lg font-bold text-slate-900">
              {mode === 'login' ? 'Σύνδεση στον λογαριασμό σας' : 'Δημιουργία λογαριασμού'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-6">
              {mode === 'login'
                ? 'Εισάγετε τα στοιχεία σας για πρόσβαση στο DataInsight Pro.'
                : 'Ξεκινήστε δωρεάν με 3 αναλύσεις AI και απεριόριστο καθαρισμό δεδομένων.'}
            </p>

            {error && (
              <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Ονοματεπώνυμο
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="π.χ. Γιώργος Παπαδόπουλος"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.gr"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Κωδικός πρόσβασης
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Τουλάχιστον 6 χαρακτήρες"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Επιβεβαίωση κωδικού
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Επαναλάβετε τον κωδικό"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'login' ? 'Είσοδος στην Εφαρμογή' : 'Δημιουργία Δωρεάν Λογαριασμού'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 space-y-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Ασφαλής κρυπτογράφηση κωδικών (scrypt) &amp; HttpOnly session cookies</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Πληρωμές με κάρτα (Stripe) ή τραπεζική κατάθεση / IRIS</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
