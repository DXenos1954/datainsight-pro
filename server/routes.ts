import crypto from 'crypto';
import express, { Express, Request, Response } from 'express';
import {
  AuthedRequest,
  clearSessionCookie,
  getRequestUser,
  requireAdmin,
  requireAuth,
  setSessionCookie,
} from './auth';
import { db, hashPassword, sanitizeUser, verifyPassword } from './db';
import { isValidPlanId, PAID_PLAN_LIST, PLANS } from './plans';
import {
  PaymentRecord,
  PaymentSettings,
  PlanId,
  SubscriptionStatus,
  UserRole,
} from '../src/types';

function isStripeConfigured(): boolean {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  return key.startsWith('sk_');
}

function isVivaConfigured(): boolean {
  const clientId = (process.env.VIVA_CLIENT_ID || '').trim();
  const clientSecret = (process.env.VIVA_CLIENT_SECRET || '').trim();
  const sourceCode = (process.env.VIVA_SOURCE_CODE || '').trim();
  return Boolean(clientId && clientSecret && sourceCode);
}

function getVivaHosts(): { accountsHost: string; apiHost: string; checkoutHost: string } {
  const isDemo = (process.env.VIVA_DEMO_MODE || '').trim().toLowerCase() === 'true';
  return isDemo
    ? {
        accountsHost: 'https://demo-accounts.vivapayments.com',
        apiHost: 'https://demo-api.vivapayments.com',
        checkoutHost: 'https://demo.vivapayments.com',
      }
    : {
        accountsHost: 'https://accounts.vivapayments.com',
        apiHost: 'https://api.vivapayments.com',
        checkoutHost: 'https://www.vivapayments.com',
      };
}

function getBaseUrl(req: Request): string {
  const configured = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (configured && configured !== 'MY_APP_URL') return configured;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

async function getVivaAccessToken(): Promise<string> {
  const clientId = (process.env.VIVA_CLIENT_ID || '').trim();
  const clientSecret = (process.env.VIVA_CLIENT_SECRET || '').trim();
  const { accountsHost } = getVivaHosts();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${accountsHost}/connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || 'Αποτυχία αυθεντικοποίησης με Viva.com.');
  }
  return data.access_token;
}

async function createVivaCheckoutOrder(params: {
  planId: PlanId;
  userEmail: string;
  userName: string;
  paymentId: string;
}): Promise<{ orderCode: string; checkoutUrl: string }> {
  const token = await getVivaAccessToken();
  const { apiHost, checkoutHost } = getVivaHosts();
  const sourceCode = (process.env.VIVA_SOURCE_CODE || '').trim();
  const plan = PLANS[params.planId];

  const orderBody = {
    amount: Math.round(plan.priceEur * 100),
    customerTrns: `DataInsight Pro — ${plan.name}`,
    customer: {
      email: params.userEmail,
      fullName: params.userName,
      countryCode: 'GR',
      requestLang: 'el-GR',
    },
    sourceCode,
    merchantTrns: params.paymentId,
    allowRecurring: plan.billingType === 'monthly',
    paymentTimeout: 1800,
    disableCash: true,
    disableWallet: false,
  };

  const res = await fetch(`${apiHost}/checkout/v2/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderBody),
  });

  const data = (await res.json()) as { orderCode?: number | string; message?: string };
  if (!res.ok || !data.orderCode) {
    throw new Error(data.message || 'Αποτυχία δημιουργίας παραγγελίας Viva.com Smart Checkout.');
  }

  const orderCode = String(data.orderCode);
  return {
    orderCode,
    checkoutUrl: `${checkoutHost}/web/checkout?ref=${encodeURIComponent(orderCode)}`,
  };
}

async function createStripeCheckoutSession(params: {
  planId: PlanId;
  userId: string;
  userEmail: string;
  paymentId: string;
  baseUrl: string;
}): Promise<{ id: string; url: string }> {
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const plan = PLANS[params.planId];
  const isSubscription = plan.billingType === 'monthly';

  const body = new URLSearchParams();
  body.set('mode', isSubscription ? 'subscription' : 'payment');
  body.set('customer_email', params.userEmail);
  body.set('success_url', `${params.baseUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`);
  body.set('cancel_url', `${params.baseUrl}/?payment=cancelled`);
  body.set('line_items[0][quantity]', '1');
  body.set('line_items[0][price_data][currency]', 'eur');
  body.set('line_items[0][price_data][unit_amount]', String(Math.round(plan.priceEur * 100)));
  body.set('line_items[0][price_data][product_data][name]', `DataInsight Pro — ${plan.name}`);
  body.set('line_items[0][price_data][product_data][description]', plan.description);
  if (isSubscription) {
    body.set('line_items[0][price_data][recurring][interval]', 'month');
  }
  body.set('metadata[userId]', params.userId);
  body.set('metadata[planId]', params.planId);
  body.set('metadata[paymentId]', params.paymentId);

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = (await response.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.id || !data.url) {
    throw new Error(data.error?.message || 'Αποτυχία δημιουργίας Stripe Checkout Session.');
  }
  return { id: data.id, url: data.url };
}

function verifyStripeWebhookSignature(
  rawBody: Buffer,
  sigHeader: string,
  webhookSecret: string
): boolean {
  const parts: Record<string, string> = {};
  for (const item of sigHeader.split(',')) {
    const [k, v] = item.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  }
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;
  const signedPayload = `${timestamp}.${rawBody.toString('utf-8')}`;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');
  const sigBuf = Buffer.from(v1);
  const expBuf = Buffer.from(expected);
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

export function registerStripeWebhookRoute(app: Express): void {
  app.post(
    '/api/billing/webhook',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      try {
        const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
        const sigHeader = String(req.headers['stripe-signature'] || '');
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));

        if (webhookSecret && !verifyStripeWebhookSignature(rawBody, sigHeader, webhookSecret)) {
          res.status(400).json({ error: 'Invalid Stripe signature' });
          return;
        }

        const event = JSON.parse(rawBody.toString('utf-8')) as {
          type?: string;
          data?: {
            object?: {
              id?: string;
              metadata?: { userId?: string; planId?: string; paymentId?: string };
            };
          };
        };

        if (event.type === 'checkout.session.completed') {
          const obj = event.data?.object;
          const userId = obj?.metadata?.userId;
          const planId = obj?.metadata?.planId;
          const paymentId = obj?.metadata?.paymentId;

          if (paymentId) {
            const existing = await db.findPaymentById(paymentId);
            if (existing && existing.status !== 'paid') {
              await db.updatePaymentStatus(paymentId, 'paid', 'Επιβεβαιώθηκε αυτόματα μέσω Stripe.');
              if (userId && isValidPlanId(planId)) {
                await db.grantPlanToUser(userId, planId);
                await db.addLog(
                  userId,
                  existing.userEmail,
                  'payment',
                  `Επιβεβαιωμένη πληρωμή Stripe (${existing.planName} — €${existing.amountEur})`
                );
              }
            }
          }
        }

        res.json({ received: true });
      } catch (err) {
        console.error('Error in /api/billing/webhook:', err);
        res.status(400).json({ error: 'Webhook error' });
      }
    }
  );
}

export function registerPlatformRoutes(app: Express, modelName: string): void {
  // ---------------- AUTH ROUTES ----------------
  app.get('/api/auth/me', async (req: Request, res: Response) => {
    try {
      const [user, paymentSettings] = await Promise.all([
        getRequestUser(req),
        db.getPaymentSettings(),
      ]);
      res.json({
        user: user ? sanitizeUser(user) : null,
        plans: PAID_PLAN_LIST,
        freePlan: PLANS.free,
        vivaConfigured: isVivaConfigured(),
        stripeConfigured: isStripeConfigured(),
        paymentSettings,
      });
    } catch (err) {
      console.error('Error in /api/auth/me:', err);
      res.status(500).json({ error: 'Σφάλμα ελέγχου συνεδρίας.' });
    }
  });

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body ?? {};
      const cleanName = typeof name === 'string' ? name.trim() : '';
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const cleanPassword = typeof password === 'string' ? password : '';

      if (cleanName.length < 2) {
        res.status(400).json({ error: 'Παρακαλώ εισάγετε το ονοματεπώνυμό σας (τουλάχιστον 2 χαρακτήρες).' });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ error: 'Παρακαλώ εισάγετε μια έγκυρη διεύθυνση email.' });
        return;
      }
      if (cleanPassword.length < 6) {
        res.status(400).json({ error: 'Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον 6 χαρακτήρες.' });
        return;
      }

      const existing = await db.findUserByEmail(cleanEmail);
      if (existing) {
        res.status(409).json({ error: 'Υπάρχει ήδη λογαριασμός με αυτό το email.' });
        return;
      }

      const now = new Date().toISOString();
      const user = await db.createUser({
        id: `usr_${crypto.randomUUID().slice(0, 12)}`,
        email: cleanEmail,
        name: cleanName,
        passwordHash: hashPassword(cleanPassword),
        role: 'user',
        plan: 'free',
        credits: PLANS.free.credits,
        subscriptionStatus: 'inactive',
        subscriptionExpiresAt: null,
        isActive: true,
        createdAt: now,
        lastLoginAt: now,
      });

      await db.addLog(user.id, user.email, 'register', `Νέα εγγραφή χρήστη (${user.name})`);
      setSessionCookie(res, user.id);
      res.status(201).json({ user: sanitizeUser(user) });
    } catch (err) {
      console.error('Error in /api/auth/register:', err);
      res.status(500).json({ error: 'Αποτυχία εγγραφής λογαριασμού.' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const cleanPassword = typeof password === 'string' ? password : '';

      if (!cleanEmail || !cleanPassword) {
        res.status(400).json({ error: 'Εισάγετε email και κωδικό πρόσβασης.' });
        return;
      }

      const user = await db.findUserByEmail(cleanEmail);
      if (!user || !verifyPassword(cleanPassword, user.passwordHash)) {
        res.status(401).json({ error: 'Λάθος email ή κωδικός πρόσβασης.' });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({
          error: 'Ο λογαριασμός σας έχει ανασταλεί. Επικοινωνήστε με τον διαχειριστή.',
        });
        return;
      }

      const updated = (await db.updateUser(user.id, { lastLoginAt: new Date().toISOString() })) || user;
      await db.addLog(user.id, user.email, 'login', 'Επιτυχής είσοδος στην εφαρμογή');
      setSessionCookie(res, user.id);
      res.json({ user: sanitizeUser(updated) });
    } catch (err) {
      console.error('Error in /api/auth/login:', err);
      res.status(500).json({ error: 'Αποτυχία σύνδεσης.' });
    }
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // ---------------- BILLING / PAYMENTS ROUTES ----------------
  app.get('/api/billing/plans', async (_req: Request, res: Response) => {
    const paymentSettings = await db.getPaymentSettings();
    res.json({
      plans: PAID_PLAN_LIST,
      freePlan: PLANS.free,
      vivaConfigured: isVivaConfigured(),
      stripeConfigured: isStripeConfigured(),
      paymentSettings,
    });
  });

  app.get('/api/billing/history', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const payments = await db.listPayments(req.user!.id);
      res.json({ payments });
    } catch (err) {
      console.error('Error in /api/billing/history:', err);
      res.status(500).json({ error: 'Αποτυχία φόρτωσης ιστορικού πληρωμών.' });
    }
  });

  // Viva.com Webhook verification (GET) + Event handler (POST)
  app.get('/api/billing/viva-webhook', (_req: Request, res: Response) => {
    const key = (process.env.VIVA_WEBHOOK_KEY || '').trim();
    if (!key) {
      res.status(400).json({ error: 'VIVA_WEBHOOK_KEY is not configured' });
      return;
    }
    res.json({ Key: key });
  });

  app.post('/api/billing/viva-webhook', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        EventTypeId?: number;
        EventData?: {
          OrderCode?: number | string;
          MerchantTrns?: string;
          StatusId?: string;
          TransactionId?: string;
        };
      };

      // EventTypeId 1796 = Transaction Payment Created (StatusId 'F' = Finished/Paid)
      if (body?.EventTypeId === 1796 && body.EventData?.StatusId === 'F') {
        const merchantTrns = String(body.EventData.MerchantTrns || '').trim();
        const orderCode = String(body.EventData.OrderCode || '').trim();
        const existing =
          (merchantTrns ? await db.findPaymentById(merchantTrns) : null) ||
          (orderCode ? await db.findPaymentByProviderRef(orderCode) : null);

        if (existing && existing.status !== 'paid') {
          await db.updatePaymentStatus(
            existing.id,
            'paid',
            `Επιβεβαιώθηκε αυτόματα μέσω Viva.com (Tx: ${body.EventData.TransactionId || orderCode})`
          );
          await db.grantPlanToUser(existing.userId, existing.planId);
          await db.addLog(
            existing.userId,
            existing.userEmail,
            'payment',
            `Αυτόματη πληρωμή Viva.com (${existing.planName} — €${existing.amountEur})`
          );
        }
      }
      res.json({ received: true });
    } catch (err) {
      console.error('Error in /api/billing/viva-webhook:', err);
      res.status(400).json({ error: 'Viva webhook error' });
    }
  });

  app.post('/api/billing/checkout', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { planId, method, referenceNote } = req.body ?? {};
      if (!isValidPlanId(planId) || planId === 'free') {
        res.status(400).json({ error: 'Επιλέξτε ένα έγκυρο πακέτο πληρωμής.' });
        return;
      }

      const plan = PLANS[planId];
      const user = req.user!;
      const settings = await db.getPaymentSettings();
      const now = new Date().toISOString();
      const paymentId = `pay_${crypto.randomUUID().slice(0, 12)}`;
      const shortCode = `DIP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const validMethods = new Set(['viva', 'stripe', 'iris', 'web_banking', 'manual', 'demo']);
      const requestedMethod = validMethods.has(method)
        ? (method as 'viva' | 'stripe' | 'iris' | 'web_banking' | 'manual' | 'demo')
        : isVivaConfigured()
          ? 'viva'
          : isStripeConfigured()
            ? 'stripe'
            : 'iris';

      // 1. Live Viva.com Smart Checkout (Cards + Automatic IRIS + Apple/Google Pay)
      if (requestedMethod === 'viva') {
        if (!isVivaConfigured() || !settings.vivaEnabled) {
          res.status(400).json({
            error:
              'Το Viva.com Smart Checkout δεν έχει ρυθμιστεί ακόμα στον server (λείπουν VIVA_CLIENT_ID / VIVA_CLIENT_SECRET / VIVA_SOURCE_CODE). Επιλέξτε Απευθείας IRIS, Web Banking ή Stripe.',
          });
          return;
        }

        const order = await createVivaCheckoutOrder({
          planId,
          userEmail: user.email,
          userName: user.name,
          paymentId,
        });

        const record: PaymentRecord = {
          id: paymentId,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          planId,
          planName: plan.name,
          amountEur: plan.priceEur,
          currency: 'EUR',
          billingType: plan.billingType === 'monthly' ? 'monthly' : 'one_time',
          provider: 'viva',
          providerRef: order.orderCode,
          status: 'pending',
          note: 'Viva.com Smart Checkout (Κάρτα / Αυτόματο IRIS)',
          createdAt: now,
          updatedAt: now,
        };
        await db.createPayment(record);
        await db.addLog(
          user.id,
          user.email,
          'payment',
          `Έναρξη Viva.com Smart Checkout για ${plan.name} (€${plan.priceEur})`
        );

        res.json({ checkoutUrl: order.checkoutUrl, payment: record });
        return;
      }

      // 2. Live Stripe Checkout (Cards + Apple/Google Pay + Subscriptions)
      if (requestedMethod === 'stripe') {
        if (!isStripeConfigured() || !settings.stripeEnabled) {
          res.status(400).json({
            error:
              'Το Stripe δεν έχει ρυθμιστεί ακόμα στον server (λείπει το STRIPE_SECRET_KEY). Επιλέξτε IRIS, Web Banking ή Viva.com.',
          });
          return;
        }

        const session = await createStripeCheckoutSession({
          planId,
          userId: user.id,
          userEmail: user.email,
          paymentId,
          baseUrl: getBaseUrl(req),
        });

        const record: PaymentRecord = {
          id: paymentId,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          planId,
          planName: plan.name,
          amountEur: plan.priceEur,
          currency: 'EUR',
          billingType: plan.billingType === 'monthly' ? 'monthly' : 'one_time',
          provider: 'stripe',
          providerRef: session.id,
          status: 'pending',
          note: 'Stripe Checkout σε εξέλιξη',
          createdAt: now,
          updatedAt: now,
        };
        await db.createPayment(record);
        await db.addLog(
          user.id,
          user.email,
          'payment',
          `Έναρξη Stripe Checkout για ${plan.name} (€${plan.priceEur})`
        );

        res.json({ checkoutUrl: session.url, payment: record });
        return;
      }

      // 3. Direct IRIS payment (0% fee, Admin confirms)
      if (requestedMethod === 'iris') {
        if (!settings.irisEnabled) {
          res.status(400).json({ error: 'Η πληρωμή μέσω IRIS είναι προσωρινά απενεργοποιημένη.' });
          return;
        }
        const cleanNote =
          typeof referenceNote === 'string' && referenceNote.trim()
            ? referenceNote.trim().slice(0, 240)
            : `Πληρωμή IRIS — Αιτιολογία: ${shortCode}`;

        const record: PaymentRecord = {
          id: paymentId,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          planId,
          planName: plan.name,
          amountEur: plan.priceEur,
          currency: 'EUR',
          billingType: plan.billingType === 'monthly' ? 'monthly' : 'one_time',
          provider: 'iris',
          providerRef: shortCode,
          status: 'pending',
          note: cleanNote,
          createdAt: now,
          updatedAt: now,
        };
        await db.createPayment(record);
        await db.addLog(
          user.id,
          user.email,
          'payment',
          `Αίτημα πληρωμής IRIS για ${plan.name} (€${plan.priceEur}) — Κωδικός: ${shortCode}`
        );

        res.status(201).json({
          payment: record,
          referenceCode: shortCode,
          message: `Η παραγγελία IRIS καταχωρήθηκε με κωδικό αιτιολογίας ${shortCode}. Ολοκληρώστε τη μεταφορά €${plan.priceEur} μέσω IRIS και το πακέτο ${plan.name} θα ενεργοποιηθεί άμεσα μόλις επιβεβαιωθεί.`,
        });
        return;
      }

      // 4. Direct Web Banking / IBAN transfer (0% fee, Admin confirms)
      if (requestedMethod === 'web_banking' || requestedMethod === 'manual') {
        if (!settings.webBankingEnabled && requestedMethod === 'web_banking') {
          res.status(400).json({
            error: 'Η τραπεζική κατάθεση / Web Banking είναι προσωρινά απενεργοποιημένη.',
          });
          return;
        }
        const cleanNote =
          typeof referenceNote === 'string' && referenceNote.trim()
            ? referenceNote.trim().slice(0, 240)
            : `Web Banking έμβασμα — Αιτιολογία: ${shortCode}`;

        const record: PaymentRecord = {
          id: paymentId,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          planId,
          planName: plan.name,
          amountEur: plan.priceEur,
          currency: 'EUR',
          billingType: plan.billingType === 'monthly' ? 'monthly' : 'one_time',
          provider: 'web_banking',
          providerRef: shortCode,
          status: 'pending',
          note: cleanNote,
          createdAt: now,
          updatedAt: now,
        };
        await db.createPayment(record);
        await db.addLog(
          user.id,
          user.email,
          'payment',
          `Αίτημα Web Banking για ${plan.name} (€${plan.priceEur}) — Κωδικός: ${shortCode}`
        );

        res.status(201).json({
          payment: record,
          referenceCode: shortCode,
          message: `Η παραγγελία Web Banking καταχωρήθηκε με κωδικό αιτιολογίας ${shortCode}. Ολοκληρώστε το έμβασμα €${plan.priceEur} στο IBAN και μόλις επιβεβαιωθεί από τον διαχειριστή το πακέτο ${plan.name} θα ενεργοποιηθεί αυτόματα.`,
        });
        return;
      }

      // 5. Sandbox Demo Checkout (only allowed when neither Viva nor Stripe is configured)
      if (isStripeConfigured() || isVivaConfigured()) {
        res.status(400).json({
          error: 'Η δοκιμαστική πληρωμή είναι απενεργοποιημένη όταν υπάρχει ενεργή πύλη πληρωμών.',
        });
        return;
      }

      const demoRecord: PaymentRecord = {
        id: paymentId,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        planId,
        planName: plan.name,
        amountEur: plan.priceEur,
        currency: 'EUR',
        billingType: plan.billingType === 'monthly' ? 'monthly' : 'one_time',
        provider: 'demo',
        providerRef: `DEMO-${shortCode}`,
        status: 'paid',
        note: 'Δοκιμαστική άμεση ενεργοποίηση (Sandbox)',
        createdAt: now,
        updatedAt: now,
      };
      await db.createPayment(demoRecord);
      const updatedUser = await db.grantPlanToUser(user.id, planId);
      await db.addLog(
        user.id,
        user.email,
        'payment',
        `Ενεργοποίηση πακέτου ${plan.name} (€${plan.priceEur}) μέσω Sandbox`
      );

      res.status(201).json({
        payment: demoRecord,
        user: updatedUser ? sanitizeUser(updatedUser) : sanitizeUser(user),
        message: `Το πακέτο ${plan.name} ενεργοποιήθηκε επιτυχώς!`,
      });
    } catch (err) {
      console.error('Error in /api/billing/checkout:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Σφάλμα κατά την επεξεργασία πληρωμής.',
      });
    }
  });

  // ---------------- ADMIN PANEL ROUTES ----------------
  app.get('/api/admin/overview', requireAdmin, async (_req: AuthedRequest, res: Response) => {
    try {
      const [users, payments, logs] = await Promise.all([
        db.listUsers(),
        db.listPayments(),
        db.listLogs(500),
      ]);

      const totalRevenueEur = payments
        .filter((p) => p.status === 'paid')
        .reduce((sum, p) => sum + p.amountEur, 0);
      const pendingPayments = payments.filter((p) => p.status === 'pending').length;
      const paidUsers = users.filter((u) => u.plan !== 'free' || u.subscriptionStatus === 'active').length;
      const totalAnalyses = logs.filter((l) => l.action === 'analyze').length;
      const rawGeminiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();

      res.json({
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.isActive).length,
        paidUsers,
        totalRevenueEur,
        pendingPayments,
        totalAnalyses,
        dbEngine: db.getEngine(),
        vivaConfigured: isVivaConfigured(),
        stripeConfigured: isStripeConfigured(),
        geminiConfigured: Boolean(rawGeminiKey && rawGeminiKey !== 'MY_GEMINI_API_KEY'),
        geminiModel: modelName,
      });
    } catch (err) {
      console.error('Error in /api/admin/overview:', err);
      res.status(500).json({ error: 'Αποτυχία φόρτωσης στατιστικών διαχειριστή.' });
    }
  });

  app.get('/api/admin/payment-settings', requireAdmin, async (_req: AuthedRequest, res: Response) => {
    try {
      const settings = await db.getPaymentSettings();
      res.json({
        settings,
        vivaConfigured: isVivaConfigured(),
        stripeConfigured: isStripeConfigured(),
      });
    } catch (err) {
      console.error('Error in GET /api/admin/payment-settings:', err);
      res.status(500).json({ error: 'Αποτυχία φόρτωσης ρυθμίσεων πληρωμών.' });
    }
  });

  app.put('/api/admin/payment-settings', requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const body = (req.body ?? {}) as Partial<PaymentSettings>;
      const cleanStr = (v: unknown, max = 180) =>
        typeof v === 'string' ? v.trim().slice(0, max) : undefined;

      const updates: Partial<PaymentSettings> = {};
      const bankName = cleanStr(body.bankName, 120);
      if (bankName !== undefined) updates.bankName = bankName;
      const iban = cleanStr(body.iban, 60);
      if (iban !== undefined) updates.iban = iban.toUpperCase();
      const beneficiaryName = cleanStr(body.beneficiaryName, 140);
      if (beneficiaryName !== undefined) updates.beneficiaryName = beneficiaryName;
      const bicSwift = cleanStr(body.bicSwift, 32);
      if (bicSwift !== undefined) updates.bicSwift = bicSwift.toUpperCase();
      const irisIdentifier = cleanStr(body.irisIdentifier, 60);
      if (irisIdentifier !== undefined) updates.irisIdentifier = irisIdentifier;
      const irisRecipientName = cleanStr(body.irisRecipientName, 140);
      if (irisRecipientName !== undefined) updates.irisRecipientName = irisRecipientName;
      const paymentInstructions = cleanStr(body.paymentInstructions, 500);
      if (paymentInstructions !== undefined) updates.paymentInstructions = paymentInstructions;

      if (typeof body.irisEnabled === 'boolean') updates.irisEnabled = body.irisEnabled;
      if (typeof body.webBankingEnabled === 'boolean')
        updates.webBankingEnabled = body.webBankingEnabled;
      if (typeof body.vivaEnabled === 'boolean') updates.vivaEnabled = body.vivaEnabled;
      if (typeof body.stripeEnabled === 'boolean') updates.stripeEnabled = body.stripeEnabled;

      const updated = await db.updatePaymentSettings(updates);
      await db.addLog(
        req.user!.id,
        req.user!.email,
        'admin_action',
        'Ενημέρωση ρυθμίσεων πληρωμών (IBAN / IRIS / Viva / Stripe)'
      );
      res.json({ settings: updated });
    } catch (err) {
      console.error('Error in PUT /api/admin/payment-settings:', err);
      res.status(500).json({ error: 'Αποτυχία αποθήκευσης ρυθμίσεων πληρωμών.' });
    }
  });

  app.get('/api/admin/users', requireAdmin, async (_req: AuthedRequest, res: Response) => {
    try {
      const users = await db.listUsers();
      res.json({ users: users.map(sanitizeUser) });
    } catch (err) {
      console.error('Error in /api/admin/users:', err);
      res.status(500).json({ error: 'Αποτυχία φόρτωσης χρηστών.' });
    }
  });

  app.patch('/api/admin/users/:id', requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const targetId = req.params.id;
      const target = await db.findUserById(targetId);
      if (!target) {
        res.status(404).json({ error: 'Ο χρήστης δεν βρέθηκε.' });
        return;
      }

      const { role, plan, credits, isActive, subscriptionStatus } = req.body ?? {};
      const updates: {
        role?: UserRole;
        plan?: PlanId;
        credits?: number;
        isActive?: boolean;
        subscriptionStatus?: SubscriptionStatus;
        subscriptionExpiresAt?: string | null;
      } = {};

      if (role === 'user' || role === 'admin') {
        if (targetId === req.user!.id && role !== 'admin') {
          res.status(400).json({ error: 'Δεν μπορείτε να αφαιρέσετε τα δικαιώματα διαχειριστή από τον εαυτό σας.' });
          return;
        }
        updates.role = role;
      }
      if (isValidPlanId(plan)) {
        updates.plan = plan;
        if (plan === 'pro_monthly') {
          updates.credits = -1;
          updates.subscriptionStatus = 'active';
          const exp = new Date();
          exp.setDate(exp.getDate() + 30);
          updates.subscriptionExpiresAt = exp.toISOString();
        }
      }
      if (typeof credits === 'number' && Number.isFinite(credits)) {
        updates.credits = Math.floor(credits);
      }
      if (typeof isActive === 'boolean') {
        if (targetId === req.user!.id && !isActive) {
          res.status(400).json({ error: 'Δεν μπορείτε να απενεργοποιήσετε τον δικό σας λογαριασμό.' });
          return;
        }
        updates.isActive = isActive;
      }
      if (
        subscriptionStatus === 'active' ||
        subscriptionStatus === 'inactive' ||
        subscriptionStatus === 'pending' ||
        subscriptionStatus === 'cancelled'
      ) {
        updates.subscriptionStatus = subscriptionStatus;
      }

      const updated = await db.updateUser(targetId, updates);
      await db.addLog(
        req.user!.id,
        req.user!.email,
        'admin_action',
        `Ενημέρωση χρήστη ${target.email} (${JSON.stringify(updates)})`
      );
      res.json({ user: updated ? sanitizeUser(updated) : null });
    } catch (err) {
      console.error('Error in PATCH /api/admin/users/:id:', err);
      res.status(500).json({ error: 'Αποτυχία ενημέρωσης χρήστη.' });
    }
  });

  app.delete('/api/admin/users/:id', requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const targetId = req.params.id;
      if (targetId === req.user!.id) {
        res.status(400).json({ error: 'Δεν μπορείτε να διαγράψετε τον δικό σας λογαριασμό.' });
        return;
      }
      const target = await db.findUserById(targetId);
      if (!target) {
        res.status(404).json({ error: 'Ο χρήστης δεν βρέθηκε.' });
        return;
      }
      await db.deleteUser(targetId);
      await db.addLog(
        req.user!.id,
        req.user!.email,
        'admin_action',
        `Διαγραφή χρήστη ${target.email}`
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('Error in DELETE /api/admin/users/:id:', err);
      res.status(500).json({ error: 'Αποτυχία διαγραφής χρήστη.' });
    }
  });

  app.get('/api/admin/payments', requireAdmin, async (_req: AuthedRequest, res: Response) => {
    try {
      const payments = await db.listPayments();
      res.json({ payments });
    } catch (err) {
      console.error('Error in /api/admin/payments:', err);
      res.status(500).json({ error: 'Αποτυχία φόρτωσης πληρωμών.' });
    }
  });

  app.patch('/api/admin/payments/:id', requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const paymentId = req.params.id;
      const { status, note } = req.body ?? {};
      if (!['paid', 'rejected', 'refunded', 'pending'].includes(status)) {
        res.status(400).json({ error: 'Μη έγκυρη κατάσταση πληρωμής.' });
        return;
      }

      const existing = await db.findPaymentById(paymentId);
      if (!existing) {
        res.status(404).json({ error: 'Η πληρωμή δεν βρέθηκε.' });
        return;
      }

      const updated = await db.updatePaymentStatus(paymentId, status, note);

      if (status === 'paid' && existing.status !== 'paid') {
        await db.grantPlanToUser(existing.userId, existing.planId);
      }

      await db.addLog(
        req.user!.id,
        req.user!.email,
        'admin_action',
        `Αλλαγή κατάστασης πληρωμής ${existing.providerRef} (${existing.userEmail}) σε ${status}`
      );

      res.json({ payment: updated });
    } catch (err) {
      console.error('Error in PATCH /api/admin/payments/:id:', err);
      res.status(500).json({ error: 'Αποτυχία ενημέρωσης πληρωμής.' });
    }
  });

  app.get('/api/admin/logs', requireAdmin, async (_req: AuthedRequest, res: Response) => {
    try {
      const logs = await db.listLogs(150);
      res.json({ logs });
    } catch (err) {
      console.error('Error in /api/admin/logs:', err);
      res.status(500).json({ error: 'Αποτυχία φόρτωσης ιστορικού.' });
    }
  });
}
