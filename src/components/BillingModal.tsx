import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Receipt,
  Smartphone,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import {
  PaymentProvider,
  PaymentRecord,
  PaymentSettings,
  PlanId,
  PlanInfo,
  UserProfile,
} from '../types';
import { cn } from '../lib/utils';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  plans: PlanInfo[];
  vivaConfigured: boolean;
  stripeConfigured: boolean;
  paymentSettings: PaymentSettings | null;
  onUserUpdated: (user: UserProfile) => void;
}

type CheckoutMethod = 'viva' | 'stripe' | 'iris' | 'web_banking' | 'demo';

export const BillingModal: React.FC<BillingModalProps> = ({
  isOpen,
  onClose,
  user,
  plans,
  vivaConfigured,
  stripeConfigured,
  paymentSettings,
  onUserUpdated,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('pro_pack');
  const [method, setMethod] = useState<CheckoutMethod>('iris');
  const [referenceNote, setReferenceNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [createdRefCode, setCreatedRefCode] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const settings: PaymentSettings = paymentSettings || {
    bankName: 'Ελληνική Τράπεζα',
    iban: '',
    beneficiaryName: 'DataInsight Pro',
    bicSwift: '',
    irisEnabled: true,
    irisIdentifier: '',
    irisRecipientName: 'DataInsight Pro',
    webBankingEnabled: true,
    vivaEnabled: true,
    stripeEnabled: true,
    paymentInstructions:
      'Αναγράψτε υποχρεωτικά τον κωδικό αναφοράς (DIP-...) στην αιτιολογία της πληρωμής.',
  };

  const canUseViva = vivaConfigured && settings.vivaEnabled;
  const canUseStripe = stripeConfigured && settings.stripeEnabled;
  const canUseIris = settings.irisEnabled;
  const canUseWebBanking = settings.webBankingEnabled;
  const canUseSandbox = !vivaConfigured && !stripeConfigured;

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
      setCreatedRefCode(null);
      if (canUseViva) setMethod('viva');
      else if (canUseStripe) setMethod('stripe');
      else if (canUseIris) setMethod('iris');
      else if (canUseWebBanking) setMethod('web_banking');
      else setMethod('demo');
      loadHistory();
    }
  }, [isOpen, canUseViva, canUseStripe, canUseIris, canUseWebBanking]);

  if (!isOpen) return null;

  const activePlan = plans.find((p) => p.id === selectedPlan) || plans[0];

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleCheckout = async () => {
    if (!activePlan) return;
    setError(null);
    setSuccessMsg(null);
    setCreatedRefCode(null);
    setIsProcessing(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activePlan.id,
          method,
          referenceNote:
            method === 'iris' || method === 'web_banking' ? referenceNote : undefined,
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
      if (data.referenceCode) {
        setCreatedRefCode(data.referenceCode);
      }
      setSuccessMsg(data.message || 'Η συναλλαγή καταχωρήθηκε επιτυχώς.');
      setReferenceNote('');
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα κατά την πληρωμή.');
    } finally {
      setIsProcessing(false);
    }
  };

  const providerLabel = (provider: PaymentProvider) => {
    switch (provider) {
      case 'viva':
        return 'Viva.com (Κάρτα / IRIS)';
      case 'stripe':
        return 'Stripe (Κάρτα)';
      case 'iris':
        return 'IRIS (Απευθείας)';
      case 'web_banking':
      case 'manual':
        return 'Web Banking / IBAN';
      case 'demo':
        return 'Sandbox';
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
              Πακέτα Συνδρομής &amp; Πληρωμές (Κάρτα · IRIS · Web Banking)
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

          {/* All Payment Methods Selector */}
          {activePlan && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Επιλέξτε Τρόπο Πληρωμής — {activePlan.name} (€{activePlan.priceEur}
                  {activePlan.billingType === 'monthly' ? '/μήνα' : ''})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Υποστηρίζονται Κάρτα (Viva.com / Stripe), IRIS Payments και Web Banking / IBAN.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* 1. Direct IRIS */}
                {canUseIris && (
                  <button
                    type="button"
                    onClick={() => setMethod('iris')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left transition-all',
                      method === 'iris'
                        ? 'border-blue-600 bg-white ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                        IRIS Payments
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        0% προμήθεια
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Άμεση μεταφορά από το mobile banking σας με ΑΦΜ ή κινητό IRIS.
                    </p>
                  </button>
                )}

                {/* 2. Web Banking / IBAN */}
                {canUseWebBanking && (
                  <button
                    type="button"
                    onClick={() => setMethod('web_banking')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left transition-all',
                      method === 'web_banking'
                        ? 'border-blue-600 bg-white ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <Building2 className="w-4 h-4 text-slate-700" />
                        Web Banking / IBAN
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        Έμβασμα
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Τραπεζική κατάθεση / έμβασμα σε ελληνικό IBAN με κωδικό αιτιολογίας.
                    </p>
                  </button>
                )}

                {/* 3. Viva.com Smart Checkout (Card + Auto IRIS + Apple/Google Pay) */}
                {settings.vivaEnabled && (
                  <button
                    type="button"
                    disabled={!canUseViva}
                    onClick={() => setMethod('viva')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left transition-all',
                      method === 'viva'
                        ? 'border-blue-600 bg-white ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                      !canUseViva && 'opacity-55 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <Wallet className="w-4 h-4 text-indigo-600" />
                        Viva.com (Κάρτα &amp; IRIS)
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                        Αυτόματο
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {canUseViva
                        ? 'Visa, Mastercard, αυτόματο IRIS, Apple Pay & Google Pay.'
                        : 'Διαθέσιμο μόλις προστεθούν τα Viva.com API keys στον server.'}
                    </p>
                  </button>
                )}

                {/* 4. Stripe (Cards + Apple/Google Pay) */}
                {settings.stripeEnabled && (
                  <button
                    type="button"
                    disabled={!canUseStripe}
                    onClick={() => setMethod('stripe')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left transition-all',
                      method === 'stripe'
                        ? 'border-blue-600 bg-white ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                      !canUseStripe && 'opacity-55 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <CreditCard className="w-4 h-4 text-blue-600" />
                        Κάρτα (Stripe)
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        Αυτόματο
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {canUseStripe
                        ? 'Άμεση χρέωση Visa / Mastercard / Apple Pay & μηνιαία συνδρομή.'
                        : 'Διαθέσιμο μόλις προστεθεί το STRIPE_SECRET_KEY στον server.'}
                    </p>
                  </button>
                )}

                {/* 5. Sandbox Demo (only when neither Viva nor Stripe is live yet) */}
                {canUseSandbox && (
                  <button
                    type="button"
                    onClick={() => setMethod('demo')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left transition-all',
                      method === 'demo'
                        ? 'border-blue-600 bg-white ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <Sparkles className="w-4 h-4 text-amber-600" />
                        Δοκιμαστική Πληρωμή
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                        Sandbox
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Άμεση δοκιμαστική ενεργοποίηση (μέχρι να συνδεθεί Viva ή Stripe).
                    </p>
                  </button>
                )}
              </div>

              {/* Dynamic Details Box for IRIS */}
              {method === 'iris' && (
                <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-3 text-xs">
                  <p className="font-semibold text-emerald-900 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    Στοιχεία Πληρωμής IRIS
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">ΑΦΜ ή Κινητό IRIS</span>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="font-mono font-semibold text-slate-900">
                          {settings.irisIdentifier || 'Δεν έχει οριστεί ακόμα'}
                        </span>
                        {settings.irisIdentifier && (
                          <button
                            type="button"
                            onClick={() => handleCopy(settings.irisIdentifier, 'iris')}
                            className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 text-[11px]"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedKey === 'iris' ? 'Αντιγράφηκε' : 'Αντιγραφή'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">Δικαιούχος</span>
                      <span className="font-semibold text-slate-900 mt-0.5 block">
                        {settings.irisRecipientName || settings.beneficiaryName}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">Ποσό Πληρωμής</span>
                      <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                        €{activePlan.priceEur},00
                      </span>
                    </div>
                  </div>
                  {settings.paymentInstructions && (
                    <p className="text-[11px] text-slate-600">{settings.paymentInstructions}</p>
                  )}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Ονοματεπώνυμο / Κινητό αποστολέα IRIS (προαιρετικά)
                    </label>
                    <input
                      type="text"
                      value={referenceNote}
                      onChange={(e) => setReferenceNote(e.target.value)}
                      placeholder="π.χ. IRIS από 69XXXXXXXX — Γ. Παπαδόπουλος"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Dynamic Details Box for Web Banking / IBAN */}
              {method === 'web_banking' && (
                <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3 text-xs">
                  <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    Στοιχεία Τραπεζικού Λογαριασμού (Web Banking)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 sm:col-span-2">
                      <span className="text-[11px] text-slate-500 block">IBAN</span>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="font-mono font-semibold text-slate-900 break-all">
                          {settings.iban || 'Δεν έχει οριστεί IBAN ακόμα από τον διαχειριστή'}
                        </span>
                        {settings.iban && (
                          <button
                            type="button"
                            onClick={() => handleCopy(settings.iban, 'iban')}
                            className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 text-[11px] shrink-0"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedKey === 'iban' ? 'Αντιγράφηκε' : 'Αντιγραφή'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">Τράπεζα</span>
                      <span className="font-semibold text-slate-900 mt-0.5 block">
                        {settings.bankName || '—'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">Δικαιούχος</span>
                      <span className="font-semibold text-slate-900 mt-0.5 block">
                        {settings.beneficiaryName || '—'}
                      </span>
                    </div>
                    {settings.bicSwift && (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-[11px] text-slate-500 block">BIC / SWIFT</span>
                        <span className="font-mono font-semibold text-slate-900 mt-0.5 block">
                          {settings.bicSwift}
                        </span>
                      </div>
                    )}
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">Ποσό</span>
                      <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                        €{activePlan.priceEur},00
                      </span>
                    </div>
                  </div>
                  {settings.paymentInstructions && (
                    <p className="text-[11px] text-slate-600">{settings.paymentInstructions}</p>
                  )}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Αριθμός συναλλαγής / Τράπεζα αποστολέα (προαιρετικά)
                    </label>
                    <input
                      type="text"
                      value={referenceNote}
                      onChange={(e) => setReferenceNote(e.target.value)}
                      placeholder="π.χ. Έμβασμα Eurobank / Πειραιώς — Αρ. Συναλλαγής..."
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-900">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    <span>{successMsg}</span>
                  </div>
                  {createdRefCode && (
                    <div className="flex items-center justify-between gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-[11px] text-slate-500 block">
                          Κωδικός Αιτιολογίας Πληρωμής
                        </span>
                        <span className="font-mono font-bold text-sm text-emerald-800">
                          {createdRefCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(createdRefCode, 'ref')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedKey === 'ref' ? 'Αντιγράφηκε!' : 'Αντιγραφή Κωδικού'}
                      </button>
                    </div>
                  )}
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
                  {method === 'viva'
                    ? `Πληρωμή €${activePlan.priceEur} με Viva.com (Κάρτα / IRIS)`
                    : method === 'stripe'
                      ? `Πληρωμή €${activePlan.priceEur} με Κάρτα (Stripe)`
                      : method === 'iris'
                        ? `Καταχώρηση Πληρωμής IRIS (€${activePlan.priceEur})`
                        : method === 'web_banking'
                          ? `Καταχώρηση Εμβάσματος Web Banking (€${activePlan.priceEur})`
                          : `Δοκιμαστική Ενεργοποίηση €${activePlan.priceEur}`}
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
                        <td className="px-3.5 py-2.5 text-slate-600">{providerLabel(p.provider)}</td>
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
