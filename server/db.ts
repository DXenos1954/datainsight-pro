import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import {
  ActivityLogEntry,
  PaymentProvider,
  PaymentRecord,
  PaymentSettings,
  PlanId,
  SubscriptionStatus,
  UserProfile,
  UserRole,
} from '../src/types';
import { PLANS } from './plans';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_DB_DIR = path.resolve(__dirname, '..', 'data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'datainsight-db.json');

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

interface LocalDbSchema {
  users: StoredUser[];
  payments: PaymentRecord[];
  logs: ActivityLogEntry[];
  paymentSettings?: PaymentSettings;
}

function getDefaultPaymentSettings(): PaymentSettings {
  return {
    bankName: (process.env.BANK_NAME || 'Ελληνική Τράπεζα (ορίστε από το Πάνελ Διαχειριστή)').trim(),
    iban: (process.env.BANK_IBAN || '').trim(),
    beneficiaryName: (process.env.BANK_BENEFICIARY || 'DataInsight Pro').trim(),
    bicSwift: (process.env.BANK_BIC || '').trim(),
    irisEnabled: true,
    irisIdentifier: (process.env.IRIS_IDENTIFIER || '').trim(),
    irisRecipientName: (process.env.IRIS_RECIPIENT_NAME || process.env.BANK_BENEFICIARY || 'DataInsight Pro').trim(),
    webBankingEnabled: true,
    vivaEnabled: true,
    stripeEnabled: true,
    paymentInstructions:
      'Αναγράψτε υποχρεωτικά τον κωδικό αναφοράς (DIP-...) στην αιτιολογία της πληρωμής για άμεση ενεργοποίηση του πακέτου σας.',
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function sanitizeUser(user: StoredUser): UserProfile {
  const { passwordHash: _ignored, ...profile } = user;
  return profile;
}

class HybridDatabase {
  private pool: Pool | null = null;
  private engine: 'postgresql' | 'local-json' = 'local-json';
  private localCache: LocalDbSchema = { users: [], payments: [], logs: [] };
  private initialized = false;

  public getEngine(): 'postgresql' | 'local-json' {
    return this.engine;
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    const databaseUrl = (process.env.DATABASE_URL || '').trim();
    if (databaseUrl) {
      try {
        const useSsl =
          !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
        this.pool = new Pool({
          connectionString: databaseUrl,
          ssl: useSsl ? { rejectUnauthorized: false } : undefined,
        });
        await this.pool.query('SELECT 1');
        await this.createPostgresTables();
        this.engine = 'postgresql';
        console.log('[DB] Connected to PostgreSQL via DATABASE_URL');
      } catch (err) {
        console.error(
          '[DB] PostgreSQL connection failed, falling back to local JSON storage:',
          err
        );
        this.pool = null;
        this.engine = 'local-json';
        this.loadLocalDb();
      }
    } else {
      this.engine = 'local-json';
      this.loadLocalDb();
      console.log(`[DB] Using local persistent storage at ${LOCAL_DB_FILE}`);
    }

    this.initialized = true;
    await this.bootstrapAdminAccount();
  }

  private async createPostgresTables(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        plan TEXT NOT NULL DEFAULT 'free',
        credits INTEGER NOT NULL DEFAULT 3,
        subscription_status TEXT NOT NULL DEFAULT 'inactive',
        subscription_expires_at TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        user_name TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        amount_eur DOUBLE PRECISION NOT NULL,
        currency TEXT NOT NULL DEFAULT 'EUR',
        billing_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_ref TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        user_email TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private loadLocalDb(): void {
    try {
      if (!fs.existsSync(LOCAL_DB_DIR)) {
        fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
      }
      if (fs.existsSync(LOCAL_DB_FILE)) {
        const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<LocalDbSchema>;
        this.localCache = {
          users: Array.isArray(parsed.users) ? parsed.users : [],
          payments: Array.isArray(parsed.payments) ? parsed.payments : [],
          logs: Array.isArray(parsed.logs) ? parsed.logs : [],
          paymentSettings: parsed.paymentSettings
            ? { ...getDefaultPaymentSettings(), ...parsed.paymentSettings }
            : getDefaultPaymentSettings(),
        };
      } else {
        this.localCache = {
          users: [],
          payments: [],
          logs: [],
          paymentSettings: getDefaultPaymentSettings(),
        };
        this.saveLocalDb();
      }
    } catch (err) {
      console.error('[DB] Error reading local DB file, initializing fresh store:', err);
      this.localCache = { users: [], payments: [], logs: [] };
      this.saveLocalDb();
    }
  }

  private saveLocalDb(): void {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    const payload = JSON.stringify(this.localCache, null, 2);
    const tmpFile = `${LOCAL_DB_FILE}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmpFile, payload, 'utf-8');
      fs.renameSync(tmpFile, LOCAL_DB_FILE);
    } catch {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch {
        // ignore cleanup errors
      }
      fs.writeFileSync(LOCAL_DB_FILE, payload, 'utf-8');
    }
  }

  private async bootstrapAdminAccount(): Promise<void> {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@datainsight.pro').trim().toLowerCase();
    const adminPassword = (process.env.ADMIN_PASSWORD || 'Admin1234!').trim();
    const existing = await this.findUserByEmail(adminEmail);

    if (!existing) {
      const now = new Date().toISOString();
      await this.createUser({
        id: `usr_${crypto.randomUUID().slice(0, 12)}`,
        email: adminEmail,
        name: 'Διαχειριστής',
        passwordHash: hashPassword(adminPassword),
        role: 'admin',
        plan: 'pro_monthly',
        credits: -1,
        subscriptionStatus: 'active',
        subscriptionExpiresAt: null,
        isActive: true,
        createdAt: now,
        lastLoginAt: null,
      });
      console.log(`[Auth] Bootstrapped default admin account: ${adminEmail}`);
    } else if (existing.role !== 'admin') {
      await this.updateUser(existing.id, {
        role: 'admin',
        plan: 'pro_monthly',
        credits: -1,
        subscriptionStatus: 'active',
        isActive: true,
      });
    }
  }

  private mapPgUser(row: Record<string, unknown>): StoredUser {
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      passwordHash: String(row.password_hash),
      role: row.role as UserRole,
      plan: row.plan as PlanId,
      credits: Number(row.credits),
      subscriptionStatus: row.subscription_status as SubscriptionStatus,
      subscriptionExpiresAt: row.subscription_expires_at
        ? String(row.subscription_expires_at)
        : null,
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    };
  }

  private mapPgPayment(row: Record<string, unknown>): PaymentRecord {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      userEmail: String(row.user_email),
      userName: String(row.user_name),
      planId: row.plan_id as PlanId,
      planName: String(row.plan_name),
      amountEur: Number(row.amount_eur),
      currency: String(row.currency),
      billingType: row.billing_type as 'one_time' | 'monthly',
      provider: row.provider as PaymentProvider,
      providerRef: String(row.provider_ref),
      status: row.status as PaymentRecord['status'],
      note: String(row.note || ''),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  public async findUserByEmail(email: string): Promise<StoredUser | null> {
    const normalized = email.trim().toLowerCase();
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [
        normalized,
      ]);
      return res.rows[0] ? this.mapPgUser(res.rows[0]) : null;
    }
    return this.localCache.users.find((u) => u.email.toLowerCase() === normalized) || null;
  }

  public async findUserById(id: string): Promise<StoredUser | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] ? this.mapPgUser(res.rows[0]) : null;
    }
    return this.localCache.users.find((u) => u.id === id) || null;
  }

  public async listUsers(): Promise<StoredUser[]> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users ORDER BY created_at DESC');
      return res.rows.map((r) => this.mapPgUser(r));
    }
    return [...this.localCache.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public async createUser(user: StoredUser): Promise<StoredUser> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO users
         (id, email, name, password_hash, role, plan, credits, subscription_status, subscription_expires_at, is_active, created_at, last_login_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          user.id,
          user.email.toLowerCase(),
          user.name,
          user.passwordHash,
          user.role,
          user.plan,
          user.credits,
          user.subscriptionStatus,
          user.subscriptionExpiresAt,
          user.isActive,
          user.createdAt,
          user.lastLoginAt,
        ]
      );
      return user;
    }
    this.localCache.users.push({ ...user, email: user.email.toLowerCase() });
    this.saveLocalDb();
    return user;
  }

  public async updateUser(
    id: string,
    updates: Partial<Omit<StoredUser, 'id' | 'email' | 'createdAt'>>
  ): Promise<StoredUser | null> {
    const existing = await this.findUserById(id);
    if (!existing) return null;
    const merged: StoredUser = { ...existing, ...updates };

    if (this.pool) {
      await this.pool.query(
        `UPDATE users SET
          name = $1,
          password_hash = $2,
          role = $3,
          plan = $4,
          credits = $5,
          subscription_status = $6,
          subscription_expires_at = $7,
          is_active = $8,
          last_login_at = $9
         WHERE id = $10`,
        [
          merged.name,
          merged.passwordHash,
          merged.role,
          merged.plan,
          merged.credits,
          merged.subscriptionStatus,
          merged.subscriptionExpiresAt,
          merged.isActive,
          merged.lastLoginAt,
          id,
        ]
      );
      return merged;
    }

    const idx = this.localCache.users.findIndex((u) => u.id === id);
    if (idx !== -1) {
      this.localCache.users[idx] = merged;
      this.saveLocalDb();
    }
    return merged;
  }

  public async deleteUser(id: string): Promise<boolean> {
    if (this.pool) {
      const res = await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
      return (res.rowCount || 0) > 0;
    }
    const before = this.localCache.users.length;
    this.localCache.users = this.localCache.users.filter((u) => u.id !== id);
    if (this.localCache.users.length !== before) {
      this.saveLocalDb();
      return true;
    }
    return false;
  }

  public async grantPlanToUser(userId: string, planId: PlanId): Promise<StoredUser | null> {
    const user = await this.findUserById(userId);
    if (!user) return null;
    const plan = PLANS[planId];

    if (plan.billingType === 'monthly') {
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      return this.updateUser(userId, {
        plan: planId,
        credits: -1,
        subscriptionStatus: 'active',
        subscriptionExpiresAt: expires.toISOString(),
      });
    }

    if (plan.billingType === 'one_time') {
      const nextCredits = user.credits < 0 ? -1 : user.credits + plan.credits;
      return this.updateUser(userId, {
        plan: user.plan === 'pro_monthly' && user.subscriptionStatus === 'active' ? 'pro_monthly' : planId,
        credits: nextCredits,
        subscriptionStatus: 'active',
      });
    }

    return this.updateUser(userId, {
      plan: 'free',
      credits: plan.credits,
      subscriptionStatus: 'inactive',
      subscriptionExpiresAt: null,
    });
  }

  public async createPayment(payment: PaymentRecord): Promise<PaymentRecord> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO payments
         (id, user_id, user_email, user_name, plan_id, plan_name, amount_eur, currency, billing_type, provider, provider_ref, status, note, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          payment.id,
          payment.userId,
          payment.userEmail,
          payment.userName,
          payment.planId,
          payment.planName,
          payment.amountEur,
          payment.currency,
          payment.billingType,
          payment.provider,
          payment.providerRef,
          payment.status,
          payment.note,
          payment.createdAt,
          payment.updatedAt,
        ]
      );
      return payment;
    }
    this.localCache.payments.unshift(payment);
    this.saveLocalDb();
    return payment;
  }

  public async findPaymentById(id: string): Promise<PaymentRecord | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM payments WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] ? this.mapPgPayment(res.rows[0]) : null;
    }
    return this.localCache.payments.find((p) => p.id === id) || null;
  }

  public async listPayments(userId?: string): Promise<PaymentRecord[]> {
    if (this.pool) {
      const res = userId
        ? await this.pool.query(
            'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
          )
        : await this.pool.query('SELECT * FROM payments ORDER BY created_at DESC');
      return res.rows.map((r) => this.mapPgPayment(r));
    }
    const list = userId
      ? this.localCache.payments.filter((p) => p.userId === userId)
      : this.localCache.payments;
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public async updatePaymentStatus(
    id: string,
    status: PaymentRecord['status'],
    note?: string
  ): Promise<PaymentRecord | null> {
    const existing = await this.findPaymentById(id);
    if (!existing) return null;
    const updated: PaymentRecord = {
      ...existing,
      status,
      note: note !== undefined ? note : existing.note,
      updatedAt: new Date().toISOString(),
    };

    if (this.pool) {
      await this.pool.query(
        'UPDATE payments SET status = $1, note = $2, updated_at = $3 WHERE id = $4',
        [updated.status, updated.note, updated.updatedAt, id]
      );
      return updated;
    }
    const idx = this.localCache.payments.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.localCache.payments[idx] = updated;
      this.saveLocalDb();
    }
    return updated;
  }

  public async addLog(
    userId: string | null,
    userEmail: string,
    action: string,
    details: string
  ): Promise<void> {
    const entry: ActivityLogEntry = {
      id: `log_${crypto.randomUUID().slice(0, 12)}`,
      userId,
      userEmail,
      action,
      details,
      createdAt: new Date().toISOString(),
    };
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO activity_logs (id, user_id, user_email, action, details, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [entry.id, entry.userId, entry.userEmail, entry.action, entry.details, entry.createdAt]
      );
      return;
    }
    this.localCache.logs.unshift(entry);
    if (this.localCache.logs.length > 500) {
      this.localCache.logs = this.localCache.logs.slice(0, 500);
    }
    this.saveLocalDb();
  }

  public async findPaymentByProviderRef(providerRef: string): Promise<PaymentRecord | null> {
    if (this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM payments WHERE provider_ref = $1 LIMIT 1',
        [providerRef]
      );
      return res.rows[0] ? this.mapPgPayment(res.rows[0]) : null;
    }
    return this.localCache.payments.find((p) => p.providerRef === providerRef) || null;
  }

  public async getPaymentSettings(): Promise<PaymentSettings> {
    const defaults = getDefaultPaymentSettings();
    if (this.pool) {
      const res = await this.pool.query(
        'SELECT value FROM app_settings WHERE key = $1 LIMIT 1',
        ['payment_settings']
      );
      if (res.rows[0]?.value) {
        try {
          return { ...defaults, ...(JSON.parse(String(res.rows[0].value)) as Partial<PaymentSettings>) };
        } catch {
          return defaults;
        }
      }
      return defaults;
    }
    return { ...defaults, ...(this.localCache.paymentSettings || {}) };
  }

  public async updatePaymentSettings(
    updates: Partial<PaymentSettings>
  ): Promise<PaymentSettings> {
    const current = await this.getPaymentSettings();
    const merged: PaymentSettings = {
      ...current,
      ...updates,
    };
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        ['payment_settings', JSON.stringify(merged), new Date().toISOString()]
      );
      return merged;
    }
    this.localCache.paymentSettings = merged;
    this.saveLocalDb();
    return merged;
  }

  public async listLogs(limit = 100): Promise<ActivityLogEntry[]> {
    if (this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        userId: r.user_id ? String(r.user_id) : null,
        userEmail: String(r.user_email),
        action: String(r.action),
        details: String(r.details || ''),
        createdAt: String(r.created_at),
      }));
    }
    return this.localCache.logs.slice(0, limit);
  }
}

export const db = new HybridDatabase();
