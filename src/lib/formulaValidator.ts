import * as XLSX from 'xlsx';
import { DataRow, ValidationIssue, ValidationReport } from '../types';
import { parseNumberSafely } from './statistics';

const EXCEL_ERROR_REGEX = /^#(DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|NULL!|CALC!|SPILL!|GETTING_DATA)$/i;
const DATE_LIKE_REGEX = /^\d{1,4}[-/]\d{1,2}([-/]\d{1,4})?(\s+\d{1,2}:\d{2}(:\d{2})?)?$/;
const SUMMARY_ROW_REGEX = /^(σύνολο|συνολο|γενικό σύνολο|γενικο συνολο|υποσύνολο|υποσυνολο|total|grand total|subtotal|sum|average|μέσος όρος|μεσος ορος)$/i;

type EvalValue = number | string | boolean | null;

class FormulaError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.code = code;
  }
}

type TokenType =
  | 'number'
  | 'string'
  | 'ident'
  | 'cell'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'sep'
  | 'colon'
  | 'eof';

interface Token {
  type: TokenType;
  value: string;
}

function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '"') {
      let str = '';
      i++;
      while (i < len) {
        if (expr[i] === '"' && expr[i + 1] === '"') {
          str += '"';
          i += 2;
        } else if (expr[i] === '"') {
          i++;
          break;
        } else {
          str += expr[i++];
        }
      }
      tokens.push({ type: 'string', value: str });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < len && /[0-9]/.test(expr[i + 1]))) {
      let numStr = '';
      while (i < len && /[0-9.]/.test(expr[i])) {
        numStr += expr[i++];
      }
      if (i < len && (expr[i] === 'e' || expr[i] === 'E')) {
        numStr += expr[i++];
        if (i < len && (expr[i] === '+' || expr[i] === '-')) {
          numStr += expr[i++];
        }
        while (i < len && /[0-9]/.test(expr[i])) {
          numStr += expr[i++];
        }
      }
      tokens.push({ type: 'number', value: numStr });
      continue;
    }

    // Two-char comparison operators
    const two = expr.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>' || two === '!=') {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }

    if ('+-*/^%=<>'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
      i++;
      continue;
    }
    if (ch === ',' || ch === ';') {
      tokens.push({ type: 'sep', value: ch });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ch });
      i++;
      continue;
    }

    // Cell reference ($A$1) or identifier (SUM, TRUE, STDEV.S)
    if (/[A-Za-z$_]/.test(ch)) {
      let ident = '';
      while (i < len && /[A-Za-z0-9$_.]/.test(expr[i])) {
        ident += expr[i++];
      }
      const cleanRef = ident.replace(/\$/g, '');
      if (/^[A-Za-z]{1,3}[0-9]{1,7}$/.test(cleanRef) && expr[i] !== '(') {
        tokens.push({ type: 'cell', value: cleanRef.toUpperCase() });
      } else {
        tokens.push({ type: 'ident', value: ident.toUpperCase() });
      }
      continue;
    }

    throw new FormulaError('#NAME?', `Μη αναγνωρίσιμος χαρακτήρας «${ch}»`);
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

function toNum(v: EvalValue): number {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new FormulaError('#NUM!');
    return v;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === '') return 0;
  const parsed = parseNumberSafely(v);
  if (Number.isFinite(parsed)) return parsed;
  throw new FormulaError('#VALUE!', `Μη αριθμητική τιμή «${v}»`);
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseCellRef(ref: string): { c: number; r: number } {
  const match = ref.match(/^([A-Z]{1,3})([0-9]{1,7})$/);
  if (!match) throw new FormulaError('#REF!', `Μη έγκυρη αναφορά κελιού ${ref}`);
  return {
    c: colLettersToIndex(match[1]),
    r: parseInt(match[2], 10) - 1,
  };
}

function expandRange(startRef: string, endRef: string): string[] {
  const s = parseCellRef(startRef);
  const e = parseCellRef(endRef);
  const minR = Math.min(s.r, e.r);
  const maxR = Math.max(s.r, e.r);
  const minC = Math.min(s.c, e.c);
  const maxC = Math.max(s.c, e.c);
  if ((maxR - minR + 1) * (maxC - minC + 1) > 50000) {
    throw new FormulaError('#NUM!', 'Υπερβολικά μεγάλο εύρος κελιών');
  }
  const refs: string[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      refs.push(XLSX.utils.encode_cell({ r, c }));
    }
  }
  return refs;
}

class FormulaEvaluator {
  private ws: XLSX.WorkSheet;
  private autoFix: boolean;
  private cache = new Map<string, EvalValue>();
  private visiting = new Set<string>();

  constructor(ws: XLSX.WorkSheet, autoFix = true) {
    this.ws = ws;
    this.autoFix = autoFix;
  }

  public getCellValue(addr: string): EvalValue {
    const key = addr.toUpperCase();
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (this.visiting.has(key)) {
      throw new FormulaError('#REF!', `Κυκλική αναφορά στο κελί ${key}`);
    }

    const cell = this.ws[key] as XLSX.CellObject | undefined;
    if (!cell) return null;

    if (cell.f) {
      this.visiting.add(key);
      try {
        const result = this.evaluate(cell.f);
        this.cache.set(key, result);
        return result;
      } finally {
        this.visiting.delete(key);
      }
    }

    if (cell.t === 'e') {
      throw new FormulaError(String(cell.w || cell.v || '#VALUE!'));
    }

    if (typeof cell.v === 'string' && cell.v.trim().startsWith('=')) {
      this.visiting.add(key);
      try {
        const result = this.evaluate(cell.v.trim().slice(1));
        this.cache.set(key, result);
        return result;
      } finally {
        this.visiting.delete(key);
      }
    }

    if (typeof cell.v === 'string' && EXCEL_ERROR_REGEX.test(cell.v.trim())) {
      throw new FormulaError(cell.v.trim().toUpperCase());
    }

    let val: EvalValue =
      cell.v === undefined || cell.v === null
        ? null
        : typeof cell.v === 'number' || typeof cell.v === 'boolean'
          ? cell.v
          : String(cell.v);

    if (this.autoFix && typeof val === 'string') {
      const repaired = tryRepairCorruptedNumber(val);
      if (repaired) {
        val = repaired.repaired;
      }
    }

    this.cache.set(key, val);
    return val;
  }

  public evaluate(rawFormula: string): EvalValue {
    const cleaned = rawFormula.trim().replace(/^=/, '').trim();
    if (!cleaned) return null;
    const tokens = tokenizeFormula(cleaned);
    let pos = 0;

    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    const parseComparison = (): EvalValue => {
      let left = parseAdditive();
      while (
        peek().type === 'op' &&
        ['=', '<>', '!=', '<', '>', '<=', '>='].includes(peek().value)
      ) {
        const op = consume().value;
        const right = parseAdditive();
        const bothNum =
          typeof left === 'number' && typeof right === 'number';
        const lVal = bothNum ? left : String(left ?? '').toLowerCase();
        const rVal = bothNum ? right : String(right ?? '').toLowerCase();
        if (op === '=') left = lVal === rVal;
        else if (op === '<>' || op === '!=') left = lVal !== rVal;
        else if (op === '<') left = toNum(left) < toNum(right);
        else if (op === '>') left = toNum(left) > toNum(right);
        else if (op === '<=') left = toNum(left) <= toNum(right);
        else if (op === '>=') left = toNum(left) >= toNum(right);
      }
      return left;
    };

    const parseAdditive = (): EvalValue => {
      let left = parseMultiplicative();
      while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const op = consume().value;
        const right = parseMultiplicative();
        left = op === '+' ? toNum(left) + toNum(right) : toNum(left) - toNum(right);
      }
      return left;
    };

    const parseMultiplicative = (): EvalValue => {
      let left = parsePower();
      while (peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        const op = consume().value;
        const right = parsePower();
        if (op === '*') {
          left = toNum(left) * toNum(right);
        } else {
          const denom = toNum(right);
          if (denom === 0) throw new FormulaError('#DIV/0!', 'Διαίρεση με το μηδέν');
          left = toNum(left) / denom;
        }
      }
      return left;
    };

    const parsePower = (): EvalValue => {
      const base = parseUnary();
      if (peek().type === 'op' && peek().value === '^') {
        consume();
        const exp = parsePower();
        const res = Math.pow(toNum(base), toNum(exp));
        if (!Number.isFinite(res)) throw new FormulaError('#NUM!');
        return res;
      }
      return base;
    };

    const parseUnary = (): EvalValue => {
      if (peek().type === 'op' && peek().value === '+') {
        consume();
        return toNum(parseUnary());
      }
      if (peek().type === 'op' && peek().value === '-') {
        consume();
        return -toNum(parseUnary());
      }
      let val = parsePrimary();
      while (peek().type === 'op' && peek().value === '%') {
        consume();
        val = toNum(val) / 100;
      }
      return val;
    };

    const parsePrimary = (): EvalValue => {
      const tok = peek();
      if (tok.type === 'number') {
        consume();
        return Number(tok.value);
      }
      if (tok.type === 'string') {
        consume();
        return tok.value;
      }
      if (tok.type === 'cell') {
        consume();
        return this.getCellValue(tok.value);
      }
      if (tok.type === 'ident') {
        consume();
        if (tok.value === 'TRUE') return true;
        if (tok.value === 'FALSE') return false;
        if (tok.value === 'PI' && peek().type === 'lparen') {
          consume();
          if (peek().type === 'rparen') consume();
          return Math.PI;
        }
        if (peek().type === 'lparen') {
          return parseFunctionCall(tok.value);
        }
        throw new FormulaError('#NAME?', `Άγνωστο αναγνωριστικό «${tok.value}»`);
      }
      if (tok.type === 'lparen') {
        consume();
        const inner = parseComparison();
        if (peek().type !== 'rparen') {
          throw new FormulaError('#VALUE!', 'Λείπει κλείσιμο παρένθεσης');
        }
        consume();
        return inner;
      }
      throw new FormulaError('#VALUE!', `Μη έγκυρη μαθηματική έκφραση`);
    };

    const parseFunctionArgs = (): { flatValues: EvalValue[]; rawArgs: EvalValue[][] } => {
      consume(); // '('
      const flatValues: EvalValue[] = [];
      const rawArgs: EvalValue[][] = [];

      if (peek().type === 'rparen') {
        consume();
        return { flatValues, rawArgs };
      }

      while (peek().type !== 'eof') {
        // Detect range argument A1:B5
        if (
          peek().type === 'cell' &&
          tokens[pos + 1]?.type === 'colon' &&
          tokens[pos + 2]?.type === 'cell'
        ) {
          const startRef = consume().value;
          consume(); // ':'
          const endRef = consume().value;
          const refs = expandRange(startRef, endRef);
          const group: EvalValue[] = [];
          for (const r of refs) {
            const v = this.getCellValue(r);
            group.push(v);
            flatValues.push(v);
          }
          rawArgs.push(group);
        } else {
          const v = parseComparison();
          rawArgs.push([v]);
          flatValues.push(v);
        }

        if (peek().type === 'sep') {
          consume();
        } else if (peek().type === 'rparen') {
          consume();
          break;
        } else {
          throw new FormulaError('#VALUE!', 'Σφάλμα σύνταξης ορισμάτων συνάρτησης');
        }
      }
      return { flatValues, rawArgs };
    };

    const extractNumericValues = (vals: EvalValue[]): number[] => {
      const nums: number[] = [];
      for (const v of vals) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          nums.push(v);
        } else if (typeof v === 'string' && v.trim() !== '') {
          const p = parseNumberSafely(v);
          if (Number.isFinite(p)) nums.push(p);
        }
      }
      return nums;
    };

    const parseFunctionCall = (fnName: string): EvalValue => {
      // Special short-circuiting for IF and IFERROR
      if (fnName === 'IFERROR') {
        consume(); // '('
        let primaryVal: EvalValue = null;
        let failed = false;
        try {
          primaryVal = parseComparison();
        } catch {
          failed = true;
          // Skip to separator at current paren depth
          let depth = 0;
          while (peek().type !== 'eof') {
            if (peek().type === 'lparen') depth++;
            else if (peek().type === 'rparen') {
              if (depth === 0) break;
              depth--;
            } else if (peek().type === 'sep' && depth === 0) {
              break;
            }
            consume();
          }
        }
        let fallbackVal: EvalValue = 0;
        if (peek().type === 'sep') {
          consume();
          fallbackVal = parseComparison();
        }
        if (peek().type === 'rparen') consume();
        return failed ? fallbackVal : primaryVal;
      }

      const { flatValues, rawArgs } = parseFunctionArgs();
      const nums = extractNumericValues(flatValues);

      switch (fnName) {
        case 'SUM':
          return nums.reduce((a, b) => a + b, 0);
        case 'AVERAGE':
        case 'AVG':
          if (nums.length === 0) throw new FormulaError('#DIV/0!', 'Κενό εύρος στον μέσο όρο');
          return nums.reduce((a, b) => a + b, 0) / nums.length;
        case 'MIN':
          return nums.length === 0 ? 0 : Math.min(...nums);
        case 'MAX':
          return nums.length === 0 ? 0 : Math.max(...nums);
        case 'COUNT':
          return nums.length;
        case 'COUNTA':
          return flatValues.filter((v) => v !== null && String(v).trim() !== '').length;
        case 'PRODUCT':
          return nums.length === 0 ? 0 : nums.reduce((a, b) => a * b, 1);
        case 'MEDIAN': {
          if (nums.length === 0) throw new FormulaError('#NUM!');
          const sorted = [...nums].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
        }
        case 'ABS':
          return Math.abs(toNum(flatValues[0] ?? 0));
        case 'SQRT': {
          const val = toNum(flatValues[0] ?? 0);
          if (val < 0) throw new FormulaError('#NUM!', 'Τετραγωνική ρίζα αρνητικού αριθμού');
          return Math.sqrt(val);
        }
        case 'POWER':
        case 'POW':
          return Math.pow(toNum(flatValues[0] ?? 0), toNum(flatValues[1] ?? 1));
        case 'ROUND': {
          const v = toNum(flatValues[0] ?? 0);
          const d = toNum(flatValues[1] ?? 0);
          const factor = Math.pow(10, d);
          return Math.round(v * factor) / factor;
        }
        case 'ROUNDUP': {
          const v = toNum(flatValues[0] ?? 0);
          const d = toNum(flatValues[1] ?? 0);
          const factor = Math.pow(10, d);
          return Math.ceil(v * factor) / factor;
        }
        case 'ROUNDDOWN':
        case 'TRUNC': {
          const v = toNum(flatValues[0] ?? 0);
          const d = toNum(flatValues[1] ?? 0);
          const factor = Math.pow(10, d);
          return Math.trunc(v * factor) / factor;
        }
        case 'INT':
        case 'FLOOR':
          return Math.floor(toNum(flatValues[0] ?? 0));
        case 'CEIL':
        case 'CEILING':
          return Math.ceil(toNum(flatValues[0] ?? 0));
        case 'MOD': {
          const a = toNum(flatValues[0] ?? 0);
          const b = toNum(flatValues[1] ?? 0);
          if (b === 0) throw new FormulaError('#DIV/0!');
          return a % b;
        }
        case 'LN': {
          const v = toNum(flatValues[0] ?? 0);
          if (v <= 0) throw new FormulaError('#NUM!');
          return Math.log(v);
        }
        case 'LOG10': {
          const v = toNum(flatValues[0] ?? 0);
          if (v <= 0) throw new FormulaError('#NUM!');
          return Math.log10(v);
        }
        case 'LOG': {
          const v = toNum(flatValues[0] ?? 0);
          const base = flatValues[1] !== undefined ? toNum(flatValues[1]) : 10;
          if (v <= 0 || base <= 0 || base === 1) throw new FormulaError('#NUM!');
          return Math.log(v) / Math.log(base);
        }
        case 'EXP':
          return Math.exp(toNum(flatValues[0] ?? 0));
        case 'STDEV':
        case 'STDEV.S': {
          if (nums.length < 2) throw new FormulaError('#DIV/0!');
          const m = nums.reduce((a, b) => a + b, 0) / nums.length;
          const v = nums.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (nums.length - 1);
          return Math.sqrt(v);
        }
        case 'STDEVP':
        case 'STDEV.P': {
          if (nums.length < 1) throw new FormulaError('#DIV/0!');
          const m = nums.reduce((a, b) => a + b, 0) / nums.length;
          const v = nums.reduce((a, b) => a + Math.pow(b - m, 2), 0) / nums.length;
          return Math.sqrt(v);
        }
        case 'VAR':
        case 'VAR.S': {
          if (nums.length < 2) throw new FormulaError('#DIV/0!');
          const m = nums.reduce((a, b) => a + b, 0) / nums.length;
          return nums.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (nums.length - 1);
        }
        case 'IF': {
          const cond = rawArgs[0]?.[0];
          const truthy = typeof cond === 'boolean' ? cond : Boolean(toNum(cond ?? 0));
          return truthy ? (rawArgs[1]?.[0] ?? true) : (rawArgs[2]?.[0] ?? false);
        }
        case 'AND':
          return flatValues.every((v) => Boolean(v));
        case 'OR':
          return flatValues.some((v) => Boolean(v));
        case 'NOT':
          return !Boolean(flatValues[0]);
        case 'SUMIF': {
          const rangeVals = rawArgs[0] || [];
          const crit = String(rawArgs[1]?.[0] ?? '').trim();
          const sumRange = rawArgs[2] || rangeVals;
          let total = 0;
          for (let idx = 0; idx < rangeVals.length; idx++) {
            if (matchesCriteria(rangeVals[idx], crit)) {
              const n = parseNumberSafely(sumRange[idx]);
              if (Number.isFinite(n)) total += n;
            }
          }
          return total;
        }
        case 'COUNTIF': {
          const rangeVals = rawArgs[0] || [];
          const crit = String(rawArgs[1]?.[0] ?? '').trim();
          let count = 0;
          for (const val of rangeVals) {
            if (matchesCriteria(val, crit)) count++;
          }
          return count;
        }
        default:
          throw new FormulaError('#NAME?', `Μη υποστηριζόμενη συνάρτηση ${fnName}()`);
      }
    };

    const result = parseComparison();
    if (peek().type !== 'eof') {
      throw new FormulaError('#VALUE!', 'Επιπλέον χαρακτήρες στη μαθηματική έκφραση');
    }
    return result;
  }
}

function matchesCriteria(value: EvalValue, criteria: string): boolean {
  const m = criteria.match(/^(>=|<=|<>|!=|>|<|=)(.+)$/);
  if (m) {
    const op = m[1];
    const rhs = parseNumberSafely(m[2]);
    const lhs = parseNumberSafely(value);
    if (Number.isFinite(lhs) && Number.isFinite(rhs)) {
      if (op === '>=') return lhs >= rhs;
      if (op === '<=') return lhs <= rhs;
      if (op === '>') return lhs > rhs;
      if (op === '<') return lhs < rhs;
      if (op === '=') return lhs === rhs;
      if (op === '<>' || op === '!=') return lhs !== rhs;
    }
    const ls = String(value ?? '').toLowerCase();
    const rs = m[2].trim().toLowerCase();
    if (op === '=') return ls === rs;
    if (op === '<>' || op === '!=') return ls !== rs;
    return false;
  }
  return String(value ?? '').trim().toLowerCase() === criteria.toLowerCase();
}

function isStandaloneMathExpression(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (s.startsWith('=')) return true;
  if (DATE_LIKE_REGEX.test(s)) return false;
  // Must contain at least one math operator between numbers and only math characters
  if (!/[+\-*/^]/.test(s)) return false;
  if (!/^[0-9\s.,()+\-*/^%]+$/.test(s)) return false;
  // Exclude plain negative numbers like "-125.5" or "-1.250,50"
  if (/^[+-]?[0-9.,\s]+%?$/.test(s)) return false;
  return true;
}

function normalizeEuropeanMathString(expr: string): string {
  // Replace decimal commas like 12,5 with 12.5 inside standalone math expressions
  return expr.replace(/(\d),(\d)/g, '$1.$2');
}

function tryRepairCorruptedNumber(raw: string): { repaired: number; reason: string } | null {
  let s = raw.replace(/[\u00A0\u200B\uFEFF]/g, ' ').trim();
  if (!s) return null;

  // Accounting negative format: (1.250,50) or (€1,250.50) -> -1250.5
  const acctMatch = s.match(/^\(([^()]+)\)$/);
  if (acctMatch) {
    const parsed = parseNumberSafely(acctMatch[1]);
    if (Number.isFinite(parsed)) {
      return {
        repaired: -Math.abs(parsed),
        reason: 'Μετατροπή λογιστικής αρνητικής μορφής σε αριθμό',
      };
    }
  }

  // Double decimal separator like 12..5 or 12,,5
  if (/(\.\.|,,)/.test(s)) {
    const fixed = s.replace(/\.\.+/g, '.').replace(/,,+/g, ',');
    const parsed = parseNumberSafely(fixed);
    if (Number.isFinite(parsed)) {
      return {
        repaired: parsed,
        reason: 'Διόρθωση διπλού διαχωριστικού δεκαδικών',
      };
    }
  }

  // OCR/typo lookalike letters inside numeric values (e.g., 12O0 -> 1200, 15l0 -> 1510)
  if (/[0-9]/.test(s) && /[OoΟοlI]/.test(s)) {
    const replaced = s
      .replace(/[OoΟο]/g, '0')
      .replace(/[lI]/g, '1');
    const parsed = parseNumberSafely(replaced);
    if (Number.isFinite(parsed)) {
      return {
        repaired: parsed,
        reason: 'Διόρθωση τυπογραφικού λάθους χαρακτήρα σε αριθμό (π.χ. O→0 / l→1)',
      };
    }
  }

  // Stray non-numeric trailing/leading garbage around a number like "~1250€!" or "approx 450"
  const stripped = s.replace(/[~≈!*?]/g, '').trim();
  if (stripped !== s) {
    const parsed = parseNumberSafely(stripped);
    if (Number.isFinite(parsed)) {
      return {
        repaired: parsed,
        reason: 'Αφαίρεση μη έγκυρων συμβόλων από αριθμητική τιμή',
      };
    }
  }

  return null;
}

function formatNumberDisplay(n: number): string {
  if (!Number.isFinite(n)) return '';
  const rounded = Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : Number(n.toFixed(4));
  return rounded.toLocaleString('el-GR', { maximumFractionDigits: 4 });
}

export interface WorksheetValidationResult {
  rawRows: DataRow[];
  rawDisplayRows: DataRow[];
  report: ValidationReport;
}

export function validateAndRepairWorksheet(
  ws: XLSX.WorkSheet,
  headerRowIndex: number,
  headers: string[],
  autoFix: boolean
): WorksheetValidationResult {
  const ref = ws['!ref'];
  const range = ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const evaluator = new FormulaEvaluator(ws, autoFix);

  const issues: ValidationIssue[] = [];
  let totalFormulas = 0;
  let validFormulas = 0;
  let fixedFormulaMismatches = 0;
  let fixedExcelErrors = 0;
  let fixedMathExpressions = 0;
  let fixedFormatErrors = 0;
  let summaryRowDiscrepancies = 0;
  let outlierWarnings = 0;

  const rawRows: DataRow[] = [];
  const rawDisplayRows: DataRow[] = [];
  const rowSheetIndices: number[] = [];

  // Pass 1: Read rows, evaluate & validate all formulas, Excel errors & inline math expressions
  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    let hasAnyValue = false;
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (
        cell &&
        (cell.f || (cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== ''))
      ) {
        hasAnyValue = true;
        break;
      }
    }
    if (!hasAnyValue) continue;

    const rawObj: DataRow = {};
    const dispObj: DataRow = {};
    const dataRowIdx = rawRows.length;
    rowSheetIndices.push(r);

    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as XLSX.CellObject | undefined;

      if (!cell) {
        rawObj[colName] = '';
        dispObj[colName] = '';
        continue;
      }

      const rawVal = cell.v;
      const formattedVal = cell.w;
      const formulaStr = cell.f ? `=${cell.f.replace(/^=/, '')}` : undefined;

      // Case A: Cell contains an Excel formula
      if (cell.f) {
        totalFormulas++;
        try {
          const computed = evaluator.evaluate(cell.f);
          const computedNum = typeof computed === 'number' ? computed : parseNumberSafely(computed);

          // Check if cached value was an Excel error
          if (cell.t === 'e' || (typeof rawVal === 'string' && EXCEL_ERROR_REGEX.test(rawVal.trim()))) {
            fixedExcelErrors++;
            const finalVal =
              typeof computed === 'number'
                ? Number(computed.toFixed(6))
                : computed ?? '';
            issues.push({
              id: `issue-${addr}-err`,
              cellRef: addr,
              rowIndex: dataRowIdx + 1,
              column: colName,
              type: 'excel_error',
              severity: autoFix ? 'fixed' : 'error',
              formula: formulaStr,
              originalValue: String(formattedVal || rawVal || '#ERROR'),
              correctedValue: typeof finalVal === 'number' ? formatNumberDisplay(finalVal) : String(finalVal),
              message: `Εντοπίστηκε σφάλμα Excel (${formattedVal || rawVal}) — επανυπολογίστηκε μαθηματικά από τον τύπο ${formulaStr}.`,
              autoFixed: autoFix,
            });
            rawObj[colName] = autoFix ? finalVal : String(formattedVal || rawVal || '');
            dispObj[colName] = autoFix
              ? typeof finalVal === 'number'
                ? formatNumberDisplay(finalVal)
                : String(finalVal)
              : String(formattedVal || rawVal || '');
            continue;
          }

          // Compare cached value vs recalculated mathematical value
          const cachedNum = parseNumberSafely(rawVal);
          if (Number.isFinite(computedNum)) {
            const diff = Number.isFinite(cachedNum) ? Math.abs(computedNum - cachedNum) : Infinity;
            const tol = Math.max(1e-5, Math.abs(computedNum) * 1e-5);
            if (diff > tol) {
              fixedFormulaMismatches++;
              const cleanNum = Number(computedNum.toFixed(6));
              issues.push({
                id: `issue-${addr}-mismatch`,
                cellRef: addr,
                rowIndex: dataRowIdx + 1,
                column: colName,
                type: 'formula_mismatch',
                severity: autoFix ? 'fixed' : 'error',
                formula: formulaStr,
                originalValue:
                  rawVal !== undefined && rawVal !== null && String(rawVal) !== ''
                    ? String(formattedVal || rawVal)
                    : '(κενό)',
                correctedValue: formatNumberDisplay(cleanNum),
                message: `Μαθηματική ασυμφωνία στον τύπο ${formulaStr}: η αποθηκευμένη τιμή (${formattedVal || rawVal || 'κενό'}) διαφέρει από το πραγματικό αποτέλεσμα (${formatNumberDisplay(cleanNum)}).`,
                autoFixed: autoFix,
              });
              rawObj[colName] = autoFix ? cleanNum : (rawVal as DataRow[string]);
              dispObj[colName] = autoFix
                ? formatNumberDisplay(cleanNum)
                : String(formattedVal ?? rawVal ?? '');
            } else {
              validFormulas++;
              rawObj[colName] = Number(computedNum.toFixed(6));
              dispObj[colName] = formattedVal || formatNumberDisplay(computedNum);
            }
          } else {
            validFormulas++;
            const val = computed ?? '';
            rawObj[colName] = val;
            dispObj[colName] = String(formattedVal || val);
          }
        } catch (err) {
          const code = err instanceof FormulaError ? err.code : '#VALUE!';
          const errMsg = err instanceof Error ? err.message : 'Σφάλμα υπολογισμού τύπου';
          fixedExcelErrors++;
          const safeReplacement = code === '#DIV/0!' ? 0 : '';
          issues.push({
            id: `issue-${addr}-evalerr`,
            cellRef: addr,
            rowIndex: dataRowIdx + 1,
            column: colName,
            type: 'excel_error',
            severity: autoFix ? 'fixed' : 'error',
            formula: formulaStr,
            originalValue: String(formattedVal || rawVal || code),
            correctedValue: safeReplacement === 0 ? '0' : '(κενό)',
            message: `Σφάλμα μαθηματικής έκφρασης ${formulaStr} (${code}: ${errMsg}). ${
              safeReplacement === 0
                ? 'Αντικαταστάθηκε με 0 ώστε να μη διαταραχθούν οι υπολογισμοί.'
                : 'Καθαρίστηκε ως κενό κελί για ασφαλή στατιστική ανάλυση.'
            }`,
            autoFixed: autoFix,
          });
          rawObj[colName] = autoFix ? safeReplacement : String(formattedVal || rawVal || code);
          dispObj[colName] = autoFix
            ? safeReplacement === 0
              ? '0'
              : ''
            : String(formattedVal || rawVal || code);
        }
        continue;
      }

      // Case B: Cell has an Excel error token without formula
      if (cell.t === 'e' || (typeof rawVal === 'string' && EXCEL_ERROR_REGEX.test(rawVal.trim()))) {
        fixedExcelErrors++;
        const errCode = String(formattedVal || rawVal || '#ERROR').trim();
        const safeReplacement = errCode.toUpperCase() === '#DIV/0!' ? 0 : '';
        issues.push({
          id: `issue-${addr}-rawerr`,
          cellRef: addr,
          rowIndex: dataRowIdx + 1,
          column: colName,
          type: 'excel_error',
          severity: autoFix ? 'fixed' : 'error',
          originalValue: errCode,
          correctedValue: safeReplacement === 0 ? '0' : '(κενό)',
          message: `Εντοπίστηκε σφάλμα κελιού Excel (${errCode}). ${
            safeReplacement === 0 ? 'Διορθώθηκε σε 0.' : 'Καθαρίστηκε σε κενή τιμή.'
          }`,
          autoFixed: autoFix,
        });
        rawObj[colName] = autoFix ? safeReplacement : errCode;
        dispObj[colName] = autoFix ? (safeReplacement === 0 ? '0' : '') : errCode;
        continue;
      }

      // Case C: String containing an inline mathematical expression (e.g. "=10+20*3" or "150+45")
      if (typeof rawVal === 'string' && isStandaloneMathExpression(rawVal)) {
        totalFormulas++;
        try {
          const expr = normalizeEuropeanMathString(rawVal.trim().replace(/^=/, ''));
          const evaluated = evaluator.evaluate(expr);
          if (typeof evaluated === 'number' && Number.isFinite(evaluated)) {
            fixedMathExpressions++;
            const cleanNum = Number(evaluated.toFixed(6));
            issues.push({
              id: `issue-${addr}-math`,
              cellRef: addr,
              rowIndex: dataRowIdx + 1,
              column: colName,
              type: 'math_expression',
              severity: autoFix ? 'fixed' : 'error',
              formula: rawVal.trim(),
              originalValue: rawVal.trim(),
              correctedValue: formatNumberDisplay(cleanNum),
              message: `Εντοπίστηκε μη υπολογισμένη μαθηματική έκφραση «${rawVal.trim()}» και επικυρώθηκε σε ${formatNumberDisplay(cleanNum)}.`,
              autoFixed: autoFix,
            });
            rawObj[colName] = autoFix ? cleanNum : rawVal;
            dispObj[colName] = autoFix ? formatNumberDisplay(cleanNum) : rawVal;
            continue;
          }
        } catch (err) {
          const code = err instanceof FormulaError ? err.code : '#VALUE!';
          fixedExcelErrors++;
          issues.push({
            id: `issue-${addr}-matherr`,
            cellRef: addr,
            rowIndex: dataRowIdx + 1,
            column: colName,
            type: 'excel_error',
            severity: autoFix ? 'fixed' : 'error',
            formula: rawVal.trim(),
            originalValue: rawVal.trim(),
            correctedValue: '(κενό)',
            message: `Άκυρη μαθηματική έκφραση «${rawVal.trim()}» (${code}). Καθαρίστηκε για ασφαλή ανάλυση.`,
            autoFixed: autoFix,
          });
          rawObj[colName] = autoFix ? '' : rawVal;
          dispObj[colName] = autoFix ? '' : rawVal;
          continue;
        }
      }

      // Normal cell
      const cleanStrVal =
        typeof rawVal === 'string'
          ? rawVal.replace(/[\u00A0\u200B\uFEFF]/g, ' ').trim()
          : rawVal;

      rawObj[colName] = cleanStrVal as DataRow[string];
      dispObj[colName] =
        formattedVal !== undefined && formattedVal !== null && String(formattedVal).trim() !== ''
          ? String(formattedVal).replace(/[\u00A0\u200B\uFEFF]/g, ' ').trim()
          : cleanStrVal !== undefined && cleanStrVal !== null
            ? String(cleanStrVal)
            : '';
    }

    rawRows.push(rawObj);
    rawDisplayRows.push(dispObj);
  }

  // Pass 2: Detect predominantly numeric columns and repair corrupted numeric / typo cells
  const numericCols = new Set<string>();
  for (const h of headers) {
    let numCount = 0;
    let nonEmpty = 0;
    for (const row of rawRows) {
      const v = row[h];
      if (v === '' || v === null || v === undefined) continue;
      nonEmpty++;
      if (Number.isFinite(parseNumberSafely(v))) numCount++;
    }
    if (nonEmpty > 0 && numCount / nonEmpty >= 0.6) {
      numericCols.add(h);
    }
  }

  for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
    const row = rawRows[rowIdx];
    const dispRow = rawDisplayRows[rowIdx];
    const sheetRow = rowSheetIndices[rowIdx];

    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      if (!numericCols.has(colName)) continue;

      const val = row[colName];
      if (val === '' || val === null || val === undefined) continue;
      if (Number.isFinite(parseNumberSafely(val))) continue;

      const addr = XLSX.utils.encode_cell({ r: sheetRow, c });
      const strVal = String(val).trim();

      // Check error placeholders like NaN, Infinity, ERROR, N/A, -
      if (/^(nan|infinity|-infinity|err|error|n\/a|null|none|undefined|-|—)$/i.test(strVal)) {
        fixedFormatErrors++;
        issues.push({
          id: `issue-${addr}-placeholder`,
          cellRef: addr,
          rowIndex: rowIdx + 1,
          column: colName,
          type: 'format_error',
          severity: autoFix ? 'fixed' : 'error',
          originalValue: strVal,
          correctedValue: '(κενό)',
          message: `Μη έγκυρη τιμή «${strVal}» σε αριθμητική στήλη — καθαρίστηκε σε κενό κελί.`,
          autoFixed: autoFix,
        });
        if (autoFix) {
          row[colName] = '';
          dispRow[colName] = '';
        }
        continue;
      }

      const repaired = tryRepairCorruptedNumber(strVal);
      if (repaired) {
        fixedFormatErrors++;
        issues.push({
          id: `issue-${addr}-typo`,
          cellRef: addr,
          rowIndex: rowIdx + 1,
          column: colName,
          type: 'format_error',
          severity: autoFix ? 'fixed' : 'error',
          originalValue: strVal,
          correctedValue: formatNumberDisplay(repaired.repaired),
          message: `${repaired.reason}: «${strVal}» → ${formatNumberDisplay(repaired.repaired)}.`,
          autoFixed: autoFix,
        });
        if (autoFix) {
          row[colName] = repaired.repaired;
          dispRow[colName] = formatNumberDisplay(repaired.repaired);
        }
      }
    }
  }

  // Pass 3: Mathematical cross-check on Total / Summary rows
  const firstCol = headers[0];
  const nonSummaryIndices: number[] = [];
  const summaryIndices: number[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const firstVal = String(rawRows[i][firstCol] ?? '').trim();
    if (SUMMARY_ROW_REGEX.test(firstVal)) {
      summaryIndices.push(i);
    } else {
      nonSummaryIndices.push(i);
    }
  }

  if (summaryIndices.length > 0 && nonSummaryIndices.length > 0) {
    for (const sIdx of summaryIndices) {
      const label = String(rawRows[sIdx][firstCol] ?? '').trim();
      const isAvgRow = /^(average|μέσος όρος|μεσος ορος)$/i.test(label);
      const sheetRow = rowSheetIndices[sIdx];

      for (let c = 0; c < headers.length; c++) {
        const colName = headers[c];
        if (!numericCols.has(colName)) continue;

        const recorded = parseNumberSafely(rawRows[sIdx][colName]);
        if (!Number.isFinite(recorded)) continue;

        const colValues = nonSummaryIndices
          .map((idx) => parseNumberSafely(rawRows[idx][colName]))
          .filter((n) => Number.isFinite(n));
        if (colValues.length === 0) continue;

        const expectedSum = colValues.reduce((a, b) => a + b, 0);
        const expected = isAvgRow ? expectedSum / colValues.length : expectedSum;
        const diff = Math.abs(recorded - expected);
        const tol = Math.max(0.05, Math.abs(expected) * 1e-4);

        if (diff > tol) {
          const addr = XLSX.utils.encode_cell({ r: sheetRow, c });
          const alreadyFlagged = issues.some((it) => it.cellRef === addr);
          if (!alreadyFlagged) {
            summaryRowDiscrepancies++;
            const cleanExpected = Number(expected.toFixed(4));
            issues.push({
              id: `issue-${addr}-sumcheck`,
              cellRef: addr,
              rowIndex: sIdx + 1,
              column: colName,
              type: 'summary_mismatch',
              severity: autoFix ? 'fixed' : 'error',
              originalValue: formatNumberDisplay(recorded),
              correctedValue: formatNumberDisplay(cleanExpected),
              message: `Ασυμφωνία στη γραμμή «${label}»: αναγραφόμενη τιμή ${formatNumberDisplay(recorded)} έναντι υπολογισμένου ${isAvgRow ? 'μέσου όρου' : 'αθροίσματος'} ${formatNumberDisplay(cleanExpected)}.`,
              autoFixed: autoFix,
            });
            if (autoFix) {
              rawRows[sIdx][colName] = cleanExpected;
              rawDisplayRows[sIdx][colName] = formatNumberDisplay(cleanExpected);
            }
          }
        }
      }
    }
  }

  // Pass 4: Extreme statistical outlier warnings (IQR 3x rule, warnings only - never auto-deleted)
  for (let c = 0; c < headers.length; c++) {
    const colName = headers[c];
    if (!numericCols.has(colName)) continue;

    const entries: { rowIdx: number; value: number }[] = [];
    for (const idx of nonSummaryIndices) {
      const n = parseNumberSafely(rawRows[idx][colName]);
      if (Number.isFinite(n)) entries.push({ rowIdx: idx, value: n });
    }
    if (entries.length < 6) continue;

    const sorted = entries.map((e) => e.value).sort((a, b) => a - b);
    const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
    const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)];
    const iqr = q3 - q1;
    if (iqr <= 0) continue;

    const lowerFence = q1 - 3 * iqr;
    const upperFence = q3 + 3 * iqr;

    for (const entry of entries) {
      if (entry.value < lowerFence || entry.value > upperFence) {
        const addr = XLSX.utils.encode_cell({ r: rowSheetIndices[entry.rowIdx], c });
        outlierWarnings++;
        issues.push({
          id: `issue-${addr}-outlier`,
          cellRef: addr,
          rowIndex: entry.rowIdx + 1,
          column: colName,
          type: 'outlier_warning',
          severity: 'warning',
          originalValue: formatNumberDisplay(entry.value),
          correctedValue: formatNumberDisplay(entry.value),
          message: `Ακραία τιμή (extreme outlier) εκτός ορίων 3×IQR [${formatNumberDisplay(lowerFence)}, ${formatNumberDisplay(upperFence)}]. Συνιστάται έλεγχος.`,
          autoFixed: false,
        });
      }
    }
  }

  const totalErrorsFound =
    fixedFormulaMismatches +
    fixedExcelErrors +
    fixedMathExpressions +
    fixedFormatErrors +
    summaryRowDiscrepancies;

  const totalAutoFixed = issues.filter((it) => it.autoFixed).length;
  const totalCellsChecked = Math.max(1, rawRows.length * headers.length);
  const unresolvedErrors = totalErrorsFound - totalAutoFixed;
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          (unresolvedErrors / totalCellsChecked) * 200 -
          (outlierWarnings / totalCellsChecked) * 20
      )
    )
  );

  return {
    rawRows,
    rawDisplayRows,
    report: {
      totalFormulas,
      validFormulas,
      fixedFormulaMismatches,
      fixedExcelErrors,
      fixedMathExpressions,
      fixedFormatErrors,
      summaryRowDiscrepancies,
      outlierWarnings,
      totalErrorsFound,
      totalAutoFixed,
      healthScore,
      issues,
    },
  };
}
