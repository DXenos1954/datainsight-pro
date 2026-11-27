import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Loader2,
  Receipt,
  Sparkles,
  X,
} from 'lucide-react';
import { PaymentRecord, PlanId, PlanInfo, UserProfile } from '../types';
import { cn } from '../lib/utils';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  plans: PlanInfo[];
  stripeConfigured: boolean;
  onUserUpdated: (user: UserProfile) => void;
}

export const BillingModal: React.FC<BillingModalProps> = ({
  isOpen,
  onClose,
  user,
  plans,
  stripeConfigured,
  onUserUpdated,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('pro_pack');
  const [method, setMethod] = useState<'stripe' | 'manual' | 'demo'>(
    stripeConfigured ? 'stripe' : 'manual'
  );
  const [referenceNote, setReferenceNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/billing/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data.payments) ? data.payments : []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      setMethod(stripeConfigured ? 'stripe' : 'manual');
      loadHistory();
    }
  }, [isOpen, stripeConfigured]);

  if (!isOpen) return null;

  const activePlan = plans.find((p) => p.id === selectedPlan) || plans[0];

  const handleCheckout = async () => {
    if (!activePlan) return;
    setError(null);
    setSuccessMsg(null);
    setIsProcessing(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activePlan.id,
          method,
          referenceNote: method === 'manual' ? referenceNote : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Σφάλμα πληρωμής.');
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.user) {
        onUserUpdated(data.user);
      }
      setSuccessMsg(data.message || 'Η συναλλαγή ολοκληρώθηκε επιτυχώς.');
      setReferenceNote('');
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα κατά την πληρωμή.');
    } finally {
      setIsProcessing(false);
    }
  };

  const statusBadge = (status: PaymentRecord['status']) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'rejected':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'refunded':
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const statusLabel = (status: PaymentRecord['status']) => {
    switch (status) {
      case 'paid':
        return 'Ολοκληρωμένη';
      case 'pending':
        return 'Σε αναμονή έγκρισης';
      case 'rejected':
        return 'Απορρίφθηκε';
      case 'refunded':
        return 'Επιστροφή';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              Πακέτα Συνδρομής &amp; Πληρωμές
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Τρέχον πλάνο: <span className="font-semibold text-slate-800">{user.plan}</span> ·
              Διαθέσιμες μονάδες AI:{' '}
              <span className="font-mono font-semibold text-blue-600">
                {user.credits < 0 ? 'Απεριόριστες' : user.credits}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Κλείσιμο"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          {/* 4 Plans Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(plan.id)}
                  className={cn(
                    'text-left rounded-xl border-2 p-4 transition-all flex flex-col justify-between relative',
                    isSelected
                      ? 'border-blue-600 bg-blue-50/30 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{plan.name}</h3>
                      {plan.badge && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-100 text-blue-700">
                          {plan.badge}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                        €{plan.priceEur}
                      </span>
                      <span className="text-xs text-slate-500">
                        {plan.billingType === 'monthly' ? '/ μήνα' : 'εφάπαξ'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      {plan.description}
                    </p>

                    <ul className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 pt-2">
                    <span
                      className={cn(
                        'block text-center py-1.5 rounded-lg text-xs font-semibold',
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700'
                      )}
                    >
                      {isSelected ? 'Επιλεγμένο' : 'Επιλογή'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Payment Method Selector */}
          {activePlan && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Ολοκλήρωση Παραγγελίας: {activePlan.name} (€{activePlan.priceEur}
                    {activePlan.billingType === 'monthly' ? '/μήνα' : ''})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Επιλέξτε τρόπο πληρωμής για άμεση ενεργοποίηση ή έγκριση από τον διαχειριστή.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  disabled={!stripeConfigured}
                  onClick={() => setMethod('stripe')}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-colors',
                    method === 'stripe'
                      ? 'border-blue-600 bg-white ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                    !stripeConfigured && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    Κάρτα (Stripe)
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {stripeConfigured
                      ? 'Άμεση & ασφαλής χρέωση Visa / Mastercard.'
                      : 'Απαιτείται STRIPE_SECRET_KEY στον server.'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('manual')}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-colors',
                    method === 'manual'
                      ? 'border-blue-600 bg-white ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                    <Building2 className="w-4 h-4 text-slate-700" />
                    Τραπεζική Κατάθεση / IRIS
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Καταχώρηση αιτήματος &amp; ενεργοποίηση από τον διαχειριστή.
                  </p>
                </button>

                {!stripeConfigured && (
                  <button
                    type="button"
                    onClick={() => setMethod('demo')}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-colors',
                      method === 'demo'
                        ? 'border-blue-600 bg-white ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Δοκιμαστική Πληρωμή (Sandbox)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Άμεση ενεργοποίηση για έλεγχο της ροής πριν συνδεθεί το Stripe.
                    </p>
                  </button>
                )}
              </div>

              {method === 'manual' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Σημείωση / Αριθμός Απόδειξης Κατάθεσης ή IRIS (προαιρετικά)
                  </label>
                  <input
                    type="text"
                    value={referenceNote}
                    onChange={(e) => setReferenceNote(e.target.value)}
                    placeholder="π.χ. Κατάθεση Eurobank / IRIS από Ι. Παπαδόπουλος"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleCheckout}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {method === 'stripe'
                    ? `Πληρωμή €${activePlan.priceEur} με Stripe`
                    : method === 'demo'
                      ? `Δοκιμαστική Ενεργοποίηση €${activePlan.priceEur}`
                      : `Υποβολή Αιτήματος Πληρωμής (€${activePlan.priceEur})`}
                </button>
              </div>
            </div>
          )}

          {/* User Payment History */}
          <div>
            <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 mb-2.5">
              <Receipt className="w-3.5 h-3.5 text-slate-500" />
              Ιστορικό Πληρωμών Λογαριασμού
            </h3>
            {isLoadingHistory ? (
              <p className="text-xs text-slate-400">Φόρτωση...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-400">Δεν υπάρχουν καταχωρημένες πληρωμές ακόμα.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3.5 py-2.5 font-semibold">Ημερομηνία</th>
                      <th className="px-3.5 py-2.5 font-semibold">Πακέτο</th>
                      <th className="px-3.5 py-2.5 font-semibold">Ποσό</th>
                      <th className="px-3.5 py-2.5 font-semibold">Τρόπος</th>
                      <th className="px-3.5 py-2.5 font-semibold">Κωδικός</th>
                      <th className="px-3.5 py-2.5 font-semibold">Κατάσταση</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3.5 py-2.5 text-slate-500 font-mono whitespace-nowrap">
                          {new Date(p.createdAt).toLocaleDateString('el-GR')}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-800">{p.planName}</td>
                        <td className="px-3.5 py-2.5 font-mono tabular-nums text-slate-800">
                          €{p.amountEur}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600 capitalize">{p.provider}</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">
                          {p.providerRef}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span
                            className={cn(
                              'inline-flex px-2 py-0.5 rounded-full border text-[11px] font-medium',
                              statusBadge(p.status)
                            )}
                          >
                            {statusLabel(p.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
