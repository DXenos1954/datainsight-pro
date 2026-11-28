import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Database,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import {
  ActivityLogEntry,
  AdminOverview,
  PaymentProvider,
  PaymentRecord,
  PaymentSettings,
  PlanId,
  UserProfile,
  UserRole,
} from '../types';
import { cn } from '../lib/utils';

interface AdminPanelProps {
  currentUser: UserProfile;
  onBack: () => void;
  onRefreshCurrentUser: () => void;
}

type AdminTab = 'overview' | 'users' | 'payments' | 'settings' | 'logs';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onBack,
  onRefreshCurrentUser,
}) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [paySettings, setPaySettings] = useState<PaymentSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [userSearch, setUserSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentRecord['status']>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ovRes, uRes, pRes, lRes, sRes] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/admin/users'),
        fetch('/api/admin/payments'),
        fetch('/api/admin/logs'),
        fetch('/api/admin/payment-settings'),
      ]);
      if (!ovRes.ok) throw new Error('Αποτυχία φόρτωσης δεδομένων διαχειριστή.');
      const [ovData, uData, pData, lData, sData] = await Promise.all([
        ovRes.json(),
        uRes.json(),
        pRes.json(),
        lRes.json(),
        sRes.json(),
      ]);
      setOverview(ovData);
      setUsers(uData.users || []);
      setPayments(pData.payments || []);
      setLogs(lData.logs || []);
      if (sData.settings) setPaySettings(sData.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySettings) return;
    setSavingSettings(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/payment-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paySettings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Αποτυχία αποθήκευσης.');
      setPaySettings(data.settings);
      onRefreshCurrentUser();
      showToast('Οι ρυθμίσεις πληρωμών (IBAN / IRIS / Κάρτες) αποθηκεύτηκαν!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα αποθήκευσης.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateUser = async (
    userId: string,
    updates: { role?: UserRole; plan?: PlanId; credits?: number; isActive?: boolean }
  ) => {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Αποτυχία ενημέρωσης.');
      await loadAll();
      if (userId === currentUser.id) onRefreshCurrentUser();
      showToast('Ο χρήστης ενημερώθηκε επιτυχώς.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα ενημέρωσης.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (!window.confirm(`Οριστική διαγραφή του χρήστη ${user.email};`)) return;
    setBusyId(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Αποτυχία διαγραφής.');
      await loadAll();
      showToast(`Ο χρήστης ${user.email} διαγράφηκε.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα διαγραφής.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePaymentAction = async (
    paymentId: string,
    status: PaymentRecord['status']
  ) => {
    setBusyId(paymentId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Αποτυχία ενημέρωσης πληρωμής.');
      await loadAll();
      onRefreshCurrentUser();
      showToast(
        status === 'paid'
          ? 'Η πληρωμή εγκρίθηκε και το πακέτο ενεργοποιήθηκε αυτόματα!'
          : `Η κατάσταση πληρωμής άλλαξε σε ${status}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα ενημέρωσης πληρωμής.');
    } finally {
      setBusyId(null);
    }
  };

  const providerLabel = (provider: PaymentProvider) => {
    switch (provider) {
      case 'viva':
        return 'VIVA.COM';
      case 'stripe':
        return 'STRIPE';
      case 'iris':
        return 'IRIS';
      case 'web_banking':
      case 'manual':
        return 'WEB BANKING';
      case 'demo':
        return 'SANDBOX';
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.plan.toLowerCase().includes(q)
    );
  });

  const filteredPayments =
    paymentFilter === 'all'
      ? payments
      : payments.filter((p) => p.status === paymentFilter);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-6">
      {/* Top Admin Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Επιστροφή στην Εφαρμογή
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600" />
              Πάνελ Διαχειριστή — DataInsight Pro
            </h1>
            <p className="text-xs text-slate-500">
              Διαχείριση χρηστών, πακέτων, πληρωμών (Viva.com · Stripe · IRIS · Web Banking) και συστήματος.
            </p>
          </div>
        </div>

        <button
          onClick={loadAll}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors self-start sm:self-center"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          Ανανέωση
        </button>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'overview' as AdminTab, label: 'Επισκόπηση', icon: <Database className="w-3.5 h-3.5" /> },
          {
            id: 'users' as AdminTab,
            label: `Χρήστες (${users.length})`,
            icon: <Users className="w-3.5 h-3.5" />,
          },
          {
            id: 'payments' as AdminTab,
            label: `Πληρωμές (${payments.length})`,
            icon: <CreditCard className="w-3.5 h-3.5" />,
            badge: overview?.pendingPayments || 0,
          },
          {
            id: 'settings' as AdminTab,
            label: 'Ρυθμίσεις Πληρωμών',
            icon: <Settings className="w-3.5 h-3.5" />,
          },
          {
            id: 'logs' as AdminTab,
            label: 'Ιστορικό Ενεργειών',
            icon: <Activity className="w-3.5 h-3.5" />,
          },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors',
              tab === item.id
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            )}
          >
            {item.icon}
            {item.label}
            {item.badge ? (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px]">
                {item.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {toast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{toast}</span>
        </div>
      )}

      {isLoading && !overview ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          Φόρτωση πίνακα διαχείρισης...
        </div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {tab === 'overview' && overview && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {[
                  { label: 'Σύνολο Χρηστών', value: overview.totalUsers, tone: 'text-slate-900' },
                  { label: 'Ενεργοί Χρήστες', value: overview.activeUsers, tone: 'text-blue-600' },
                  { label: 'Επί Πληρωμή', value: overview.paidUsers, tone: 'text-emerald-600' },
                  {
                    label: 'Συνολικά Έσοδα',
                    value: `€${overview.totalRevenueEur.toLocaleString('el-GR')}`,
                    tone: 'text-emerald-700',
                  },
                  {
                    label: 'Εκκρεμείς Πληρωμές',
                    value: overview.pendingPayments,
                    tone: overview.pendingPayments > 0 ? 'text-amber-600' : 'text-slate-700',
                  },
                  { label: 'AI Αναλύσεις', value: overview.totalAnalyses, tone: 'text-indigo-600' },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-white rounded-xl border border-slate-200 p-4"
                  >
                    <p className="text-xs text-slate-500">{kpi.label}</p>
                    <p className={cn('text-2xl font-bold font-mono tabular-nums mt-1.5', kpi.tone)}>
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  Κατάσταση Υποδομής &amp; Πυλών Πληρωμής
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-slate-500">Βάση Δεδομένων</p>
                    <p className="font-semibold text-slate-900 mt-1">
                      {overview.dbEngine === 'postgresql'
                        ? 'PostgreSQL (Μόνιμη)'
                        : 'Τοπικό αρχείο JSON'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {overview.dbEngine === 'postgresql'
                        ? 'Συνδεδεμένη μέσω DATABASE_URL.'
                        : 'Βάλτε DATABASE_URL στο Render για PostgreSQL.'}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-slate-500">Viva.com (Κάρτα &amp; Αυτόματο IRIS)</p>
                    <p
                      className={cn(
                        'font-semibold mt-1',
                        overview.vivaConfigured ? 'text-emerald-700' : 'text-amber-700'
                      )}
                    >
                      {overview.vivaConfigured ? 'Ενεργό' : 'Μη ρυθμισμένο'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Απαιτεί VIVA_CLIENT_ID, VIVA_CLIENT_SECRET &amp; VIVA_SOURCE_CODE.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-slate-500">Stripe (Κάρτες &amp; Συνδρομές)</p>
                    <p
                      className={cn(
                        'font-semibold mt-1',
                        overview.stripeConfigured ? 'text-emerald-700' : 'text-amber-700'
                      )}
                    >
                      {overview.stripeConfigured ? 'Ενεργό' : 'Μη ρυθμισμένο'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Απαιτεί STRIPE_SECRET_KEY &amp; STRIPE_WEBHOOK_SECRET.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-slate-500">Υπηρεσία Gemini AI</p>
                    <p
                      className={cn(
                        'font-semibold mt-1',
                        overview.geminiConfigured ? 'text-emerald-700' : 'text-red-600'
                      )}
                    >
                      {overview.geminiConfigured
                        ? `Ενεργό (${overview.geminiModel})`
                        : 'Λείπει το GEMINI_API_KEY'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Πακέτα: Starter €20 · Pro €35 · Ultimate €50 · Monthly €60
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USERS */}
          {tab === 'users' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Διαχείριση Χρηστών</h2>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Αναζήτηση email, ονόματος, πλάνου..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Χρήστης</th>
                      <th className="px-4 py-3 font-semibold">Ρόλος</th>
                      <th className="px-4 py-3 font-semibold">Πλάνο</th>
                      <th className="px-4 py-3 font-semibold">Μονάδες AI</th>
                      <th className="px-4 py-3 font-semibold">Κατάσταση</th>
                      <th className="px-4 py-3 font-semibold">Εγγραφή</th>
                      <th className="px-4 py-3 font-semibold text-right">Ενέργειες</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((u) => {
                      const isSelf = u.id === currentUser.id;
                      const isBusy = busyId === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">
                              {u.name}{' '}
                              {isSelf && (
                                <span className="text-[10px] font-medium text-blue-600">(Εσείς)</span>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500">{u.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              disabled={isSelf || isBusy}
                              value={u.role}
                              onChange={(e) =>
                                handleUpdateUser(u.id, { role: e.target.value as UserRole })
                              }
                              className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              disabled={isBusy}
                              value={u.plan}
                              onChange={(e) =>
                                handleUpdateUser(u.id, { plan: e.target.value as PlanId })
                              }
                              className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs"
                            >
                              <option value="free">Free (€0)</option>
                              <option value="starter">Starter (€20)</option>
                              <option value="pro_pack">Pro Pack (€35)</option>
                              <option value="ultimate">Ultimate (€50)</option>
                              <option value="pro_monthly">Pro Monthly (€60/μήνα)</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-slate-800">
                                {u.credits < 0 ? '∞' : u.credits}
                              </span>
                              <button
                                disabled={isBusy}
                                onClick={() =>
                                  handleUpdateUser(u.id, {
                                    credits: u.credits < 0 ? 20 : u.credits + 10,
                                  })
                                }
                                className="px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 rounded"
                                title="Προσθήκη +10 μονάδων"
                              >
                                +10
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              disabled={isSelf || isBusy}
                              onClick={() => handleUpdateUser(u.id, { isActive: !u.isActive })}
                              className={cn(
                                'px-2.5 py-0.5 rounded-full text-[11px] font-medium border',
                                u.isActive
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              )}
                            >
                              {u.isActive ? 'Ενεργός' : 'Σε αναστολή'}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                            {new Date(u.createdAt).toLocaleDateString('el-GR')}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!isSelf && (
                              <button
                                disabled={isBusy}
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Διαγραφή χρήστη"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: PAYMENTS */}
          {tab === 'payments' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Πληρωμές &amp; Αιτήματα Συνδρομών
                </h2>
                <div className="flex items-center gap-1.5 text-xs">
                  {(['all', 'pending', 'paid', 'rejected', 'refunded'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setPaymentFilter(f)}
                      className={cn(
                        'px-2.5 py-1 rounded-md font-medium transition-colors',
                        paymentFilter === f
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      {f === 'all'
                        ? 'Όλες'
                        : f === 'pending'
                          ? 'Εκκρεμείς'
                          : f === 'paid'
                            ? 'Εγκριμένες'
                            : f === 'rejected'
                              ? 'Απορριφθείσες'
                              : 'Επιστροφές'}
                    </button>
                  ))}
                </div>
              </div>

              {filteredPayments.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400">
                  Δεν υπάρχουν πληρωμές σε αυτή την κατηγορία.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Ημερομηνία</th>
                        <th className="px-4 py-3 font-semibold">Χρήστης</th>
                        <th className="px-4 py-3 font-semibold">Πακέτο</th>
                        <th className="px-4 py-3 font-semibold">Ποσό</th>
                        <th className="px-4 py-3 font-semibold">Μέθοδος / Αναφορά</th>
                        <th className="px-4 py-3 font-semibold">Κατάσταση</th>
                        <th className="px-4 py-3 font-semibold text-right">Ενέργειες</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPayments.map((p) => {
                        const isBusy = busyId === p.id;
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                              {new Date(p.createdAt).toLocaleString('el-GR')}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">{p.userName}</p>
                              <p className="text-[11px] text-slate-500">{p.userEmail}</p>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">{p.planName}</td>
                            <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                              €{p.amountEur}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-mono text-[11px] text-slate-700">
                                {providerLabel(p.provider)} · {p.providerRef}
                              </p>
                              {p.note && (
                                <p className="text-[11px] text-slate-500 truncate max-w-xs">
                                  {p.note}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border',
                                  p.status === 'paid'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : p.status === 'pending'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-red-50 text-red-700 border-red-200'
                                )}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                              {p.status === 'pending' && (
                                <>
                                  <button
                                    disabled={isBusy}
                                    onClick={() => handlePaymentAction(p.id, 'paid')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    Έγκριση
                                  </button>
                                  <button
                                    disabled={isBusy}
                                    onClick={() => handlePaymentAction(p.id, 'rejected')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-md"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Απόρριψη
                                  </button>
                                </>
                              )}
                              {p.status === 'paid' && (
                                <button
                                  disabled={isBusy}
                                  onClick={() => handlePaymentAction(p.id, 'refunded')}
                                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                                >
                                  Refund
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PAYMENT SETTINGS (IBAN / IRIS / VIVA / STRIPE) */}
          {tab === 'settings' && paySettings && (
            <form
              onSubmit={handleSavePaymentSettings}
              className="bg-white rounded-xl border border-slate-200 p-6 space-y-6"
            >
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Ρυθμίσεις Τρόπων Πληρωμής (IRIS, Web Banking / IBAN, Viva.com &amp; Stripe)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Τα στοιχεία που αποθηκεύετε εδώ εμφανίζονται άμεσα στους χρήστες στο παράθυρο πληρωμών.
                </p>
              </div>

              {/* Method Enable Toggles */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paySettings.irisEnabled}
                    onChange={(e) =>
                      setPaySettings({ ...paySettings, irisEnabled: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Απευθείας IRIS (0% προμήθεια)
                </label>

                <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paySettings.webBankingEnabled}
                    onChange={(e) =>
                      setPaySettings({ ...paySettings, webBankingEnabled: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Web Banking / IBAN
                </label>

                <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paySettings.vivaEnabled}
                    onChange={(e) =>
                      setPaySettings({ ...paySettings, vivaEnabled: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Viva.com (Κάρτα &amp; IRIS)
                </label>

                <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paySettings.stripeEnabled}
                    onChange={(e) =>
                      setPaySettings({ ...paySettings, stripeEnabled: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Stripe (Κάρτα)
                </label>
              </div>

              {/* IRIS & Bank Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    ΑΦΜ ή Κινητό για IRIS Payments
                  </label>
                  <input
                    type="text"
                    value={paySettings.irisIdentifier}
                    onChange={(e) =>
                      setPaySettings({ ...paySettings, irisIdentifier: e.target.value })
                    }
                    placeholder="π.χ. 123456789 (ΑΦΜ) ή 69XXXXXXXX"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Όνομα Δικαιούχου IRIS
                  </label>
                  <input
                    type="text"
                    value={paySettings.irisRecipientName}
                    onChange={(e) =>
                      setPaySettings({ ...paySettings, irisRecipientName: e.target.value })
                    }
                    placeholder="π.χ. ΔΗΜΗΤΡΙΟΣ ΞΕΝΟΣ / DataInsight Pro"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Τράπεζα (Web Banking)
                  </label>
                  <input
                    type="text"
                    value={paySettings.bankName}
                    onChange={(e) => setPaySettings({ ...paySettings, bankName: e.target.value })}
                    placeholder="π.χ. Eurobank / Alpha Bank / Πειραιώς / Εθνική"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Δικαιούχος Τραπεζικού Λογαριασμού
                  </label>
                  <input
                    type="text"
                    value={paySettings.beneficiaryName}
                    onChange={(e) =>
                      setPaySettings({ ...paySettings, beneficiaryName: e.target.value })
                    }
                    placeholder="Όνομα δικαιούχου"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">IBAN</label>
                  <input
                    type="text"
                    value={paySettings.iban}
                    onChange={(e) => setPaySettings({ ...paySettings, iban: e.target.value })}
                    placeholder="GR16 0110 1250 0000 0001 2300 695"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    BIC / SWIFT (προαιρετικά)
                  </label>
                  <input
                    type="text"
                    value={paySettings.bicSwift}
                    onChange={(e) => setPaySettings({ ...paySettings, bicSwift: e.target.value })}
                    placeholder="π.χ. ERBKGRAA / PIRBGRAA / ETHNGRAA"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Οδηγίες προς τον χρήστη
                  </label>
                  <textarea
                    rows={2}
                    value={paySettings.paymentInstructions}
                    onChange={(e) =>
                      setPaySettings({ ...paySettings, paymentInstructions: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Webhook Reference Box */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 text-xs space-y-1.5">
                <p className="font-semibold text-blue-900">
                  Webhooks για αυτόματη ενεργοποίηση (Viva.com &amp; Stripe):
                </p>
                <p className="font-mono text-[11px] text-blue-800 break-all">
                  Viva.com Webhook: {currentOrigin}/api/billing/viva-webhook
                </p>
                <p className="font-mono text-[11px] text-blue-800 break-all">
                  Stripe Webhook: {currentOrigin}/api/billing/webhook
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {savingSettings ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Αποθήκευση Ρυθμίσεων Πληρωμών
                </button>
              </div>
            </form>
          )}

          {/* TAB 5: ACTIVITY LOGS */}
          {tab === 'logs' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">
                  Πρόσφατη Δραστηριότητα Συστήματος
                </h2>
              </div>
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Ώρα</th>
                      <th className="px-4 py-3 font-semibold">Χρήστης</th>
                      <th className="px-4 py-3 font-semibold">Ενέργεια</th>
                      <th className="px-4 py-3 font-semibold">Λεπτομέρειες</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(l.createdAt).toLocaleString('el-GR')}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{l.userEmail}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                            {l.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{l.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
