import { PlanId, PlanInfo } from '../src/types';

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Δωρεάν (Free)',
    priceEur: 0,
    billingType: 'free',
    credits: 3,
    description: 'Ιδανικό για δοκιμή της πλατφόρμας και βασικό καθαρισμό αρχείων.',
    features: [
      'Αυτόματος καθαρισμός & μαθηματική επικύρωση',
      'Έλεγχος & αυτόματη διόρθωση λαθών Excel',
      'Περιγραφική στατιστική & διαδραστικά γραφήματα',
      '3 δωρεάν αναλύσεις AI Insights',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter Pack',
    priceEur: 20,
    billingType: 'one_time',
    credits: 20,
    description: 'Εφάπαξ πακέτο για ατομική χρήση και περιστασιακές αναφορές.',
    features: [
      '+20 μονάδες πλήρους ανάλυσης AI Insights',
      'Απεριόριστη μαθηματική επικύρωση & διόρθωση λαθών',
      'Εξαγωγές PowerPoint (.pptx), Word (.docx) & Excel',
      'Δεν λήγουν οι μονάδες — πληρωμή μία φορά',
    ],
  },
  pro_pack: {
    id: 'pro_pack',
    name: 'Pro Pack',
    priceEur: 35,
    billingType: 'one_time',
    credits: 50,
    badge: 'Δημοφιλές',
    description: 'Ιδανικό για αναλυτές, λογιστές και επαγγελματίες δεδομένων.',
    features: [
      '+50 μονάδες πλήρους ανάλυσης AI Insights & Q&A',
      'Πλήρης έλεγχος μαθηματικών τύπων & αθροισμάτων',
      'Όλες οι εξαγωγές PowerPoint, Word, PDF & Excel',
      'Εξοικονόμηση 30% ανά ανάλυση έναντι Starter',
    ],
  },
  ultimate: {
    id: 'ultimate',
    name: 'Ultimate Pack',
    priceEur: 50,
    billingType: 'one_time',
    credits: 120,
    badge: 'Καλύτερη Αξία',
    description: 'Μεγάλο πακέτο μονάδων για ομάδες και συχνές παρουσιάσεις.',
    features: [
      '+120 μονάδες πλήρους ανάλυσης AI Insights & Q&A',
      'Απεριόριστη μαθηματική επικύρωση & διόρθωση σφαλμάτων',
      'Προτεραιότητα υποστήριξης & όλες οι εξαγωγές',
      'Εφάπαξ χρέωση χωρίς δεσμεύσεις',
    ],
  },
  pro_monthly: {
    id: 'pro_monthly',
    name: 'Pro Monthly',
    priceEur: 60,
    billingType: 'monthly',
    credits: -1,
    badge: 'Απεριόριστο',
    description: 'Μηνιαία συνδρομή με απεριόριστες αναλύσεις AI και πλήρη πρόσβαση.',
    features: [
      'Απεριόριστες αναλύσεις AI Insights & ερωτήσεις Q&A',
      'Απεριόριστη μαθηματική επικύρωση & αυτόματη διόρθωση',
      'Απεριόριστες εξαγωγές PowerPoint, Word, Excel & PDF',
      'Ακύρωση οποιαδήποτε στιγμή',
    ],
  },
};

export const PAID_PLAN_LIST: PlanInfo[] = [
  PLANS.starter,
  PLANS.pro_pack,
  PLANS.ultimate,
  PLANS.pro_monthly,
];

export function isValidPlanId(val: unknown): val is PlanId {
  return typeof val === 'string' && val in PLANS;
}
