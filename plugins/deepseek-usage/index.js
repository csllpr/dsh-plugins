/**
 * Host half of the DeepSeek usage/balance/peak-valley plugin.
 *
 * Responsibilities:
 *  - Read the DeepSeek API balance. Two sources, in order:
 *      1. the live `deepseekAccount` service when a DeepSeek account credential is stored;
 *      2. the `DEEPSEEK_API_KEY` credential (resolved through `ctx.credentials`, with the
 *         launching environment as fallback) against `GET {baseURL}/user/balance`.
 *  - Aggregate token usage for "today" and for one session from the durable session log
 *    (`ctx.sessionQuery`), and estimate cost with the current peak/off-peak price schedule.
 *  - Expose the state as JSON to the browser half over two transports: an exact route below
 *    Connection's authenticated `/api` channel (`GET /api/dsh-plugin-deepseek-usage/state`,
 *    preferred) and a Host/Sec-Fetch-Site fenced same-origin route
 *    (`GET /dsh-plugin/deepseek-usage/state`, fallback). `?sessionId=<id>` adds that session's
 *    usage; `?refresh=1` bypasses caches.
 *
 * The plugin is deliberately dependency-free so it can be installed from a workspace
 * directory: it only imports Node/browser globals and uses optional Cordis services through
 * `ctx.get` / `ctx.inject`. It stays inert in profiles without a web server.
 *
 * Configuration (all optional, set on the `deepseek-usage` row in `cordis.patch.yml`):
 *
 *   apiKeyEnv           credential reference for the API key       (default DEEPSEEK_API_KEY)
 *   baseURL             DeepSeek API base URL                      (default https://api.deepseek.com)
 *   balanceRefreshMs    balance cache TTL                          (default 300000)
 *   usageRefreshMs      usage cache TTL                            (default 60000)
 *   requestTimeoutMs    upstream balance request timeout           (default 15000)
 *   maxSessions         session logs read for today's usage        (default 200)
 *   accountFirst        try the signed-in DeepSeek account first   (default true)
 *   accountLocale       locale sent to the account service         (default zh)
 *   allowedHosts        extra Host names for the fallback route    (default [])
 *   replaceHolidays     true replaces the built-in 2026-2027 CN holiday table instead of appending
 *   pricing             { currency, unitTokens, models{}, fallbackModel }
 *   schedule            { timezone, utcOffsetMinutes, peakWindows[], weekdaysOnly,
 *                         holidays[], replaceHolidays, peakMultiplier, offPeakMultiplier, note }
 *   links               { usageUrl, topUpUrl } platform page fallbacks
 */

/** Bundle-internal route the browser half fetches (authenticated-connection fallback path). */
const ROUTE_PATH = '/dsh-plugin/deepseek-usage/state';
/** Exact route on Connection's authenticated `/api` channel (full pathname). Keep in sync with client.js. */
const AUTH_ROUTE_PATH = '/api/dsh-plugin-deepseek-usage/state';

/**
 * Price table: prices are CNY per million tokens at PEAK; off-peak multiplies them.
 *
 * Source: official DeepSeek pricing page (CNY table), fetched 2026-11-09; V4.1-Flash price
 * level effective 2026-09-10. deepseek-flash is served by DeepSeek-V4.1-Flash-1017 and
 * deepseek-v4-pro by DeepSeek-V4-Pro-0813. `deepseek-chat`/`deepseek-reasoner` were retired
 * after 2026-07-24; `deepseek-v4-flash*` names are aliases billed at the Flash price.
 * The provider may change prices again: edit this table through the row config.
 */
const DEFAULT_PRICING = {
  currency: 'CNY',
  unitTokens: 1_000_000,
  models: {
    'deepseek-flash': {
      name: 'DeepSeek-V4.1-Flash',
      cacheHit: 0.04,
      cacheMiss: 2,
      output: 8,
    },
    'deepseek-v4-pro': {
      name: 'DeepSeek-V4-Pro',
      cacheHit: 0.3,
      cacheMiss: 9,
      output: 27,
    },
  },
  /** Non-canonical model ids that bill at one of the canonical price rows. */
  aliases: {
    'deepseek-v4-flash': 'deepseek-flash',
    'deepseek-v4-flash-vision-exp': 'deepseek-flash',
    'deepseek-pro': 'deepseek-v4-pro',
    'deepseek-v4.1-pro': 'deepseek-v4-pro',
  },
  fallbackModel: 'deepseek-flash',
};

/**
 * Peak/off-peak pricing schedule.
 *
 * DeepSeek's V4 series API moved to time-of-day pricing on 2026-08-17: peak hours are
 * Beijing 09:00-12:00 and 14:00-18:00 on weekdays (2x the off-peak price), while nights,
 * weekends and statutory holidays bill at the off-peak half-price rate. The windows below
 * are expressed in `schedule.timezone` wall-clock minutes and are configurable because the
 * provider may revise them again.
 */
const DEFAULT_SCHEDULE = {
  timezone: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  weekdaysOnly: true,
  // Chinese statutory holidays for 2026-2027 (State Council notices, fetched 2026-11-09).
  // Weekend makeup workdays stay off-peak because Saturdays and Sundays never bill at peak.
  holidays: [
    '2026-01-01', '2026-01-02', '2026-01-03', '2026-02-15', '2026-02-16', '2026-02-17',
    '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
    '2026-04-04', '2026-04-05', '2026-04-06', '2026-05-01', '2026-05-02', '2026-05-03',
    '2026-05-04', '2026-05-05', '2026-06-19', '2026-06-20', '2026-06-21', '2026-09-25',
    '2026-09-26', '2026-09-27', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    '2026-10-05', '2026-10-06', '2026-10-07', '2027-01-01', '2027-01-02', '2027-01-03',
    '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10',
    '2027-02-11', '2027-02-12', '2027-02-13', '2027-04-03', '2027-04-04', '2027-04-05',
    '2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-05', '2027-06-09',
    '2027-09-15', '2027-10-01', '2027-10-02', '2027-10-03', '2027-10-04', '2027-10-05',
    '2027-10-06', '2027-10-07',
  ],
  peakMultiplier: 2,
  offPeakMultiplier: 0.5,
  note: 'Peak: Beijing 09:00-12:00 & 14:00-18:00 on weekdays, excluding Chinese public holidays; all other times, weekends and holidays are off-peak.',
};

const DEFAULT_CONFIG = {
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  baseURL: 'https://api.deepseek.com',
  balanceRefreshMs: 300_000,
  usageRefreshMs: 60_000,
  requestTimeoutMs: 15_000,
  maxSessions: 200,
  accountFirst: true,
  accountLocale: 'zh',
  /** Extra hostnames the state endpoint accepts besides loopback and the server origin. */
  allowedHosts: [],
  pricing: DEFAULT_PRICING,
  schedule: DEFAULT_SCHEDULE,
  links: {
    usageUrl: 'https://platform.deepseek.com/usage',
    topUpUrl: 'https://platform.deepseek.com/top_up',
  },
};

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function positiveNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Parse `HH:MM` into minutes after local midnight; returns undefined when malformed. */
function parseClock(value) {
  const text = nonEmptyString(value);
  if (text === undefined) return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (match === null) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return undefined;
  return hours * 60 + minutes;
}

/** Normalize one pricing table entry; returns undefined when unusable. */
function normalizePrice(entry) {
  if (!isPlainObject(entry)) return undefined;
  const cacheHit = Number(entry.cacheHit);
  const cacheMiss = Number(entry.cacheMiss);
  const output = Number(entry.output);
  if (!Number.isFinite(cacheHit) || !Number.isFinite(cacheMiss) || !Number.isFinite(output)) return undefined;
  const name = nonEmptyString(entry.name);
  return { name, cacheHit, cacheMiss, output };
}

/** Merge user pricing config over the defaults; keeps every valid model entry. */
function resolvePricing(raw) {
  const base = {
    currency: nonEmptyString(raw?.currency) ?? DEFAULT_PRICING.currency,
    unitTokens: positiveNumber(raw?.unitTokens, DEFAULT_PRICING.unitTokens),
    models: {},
    aliases: { ...DEFAULT_PRICING.aliases },
    fallbackModel: nonEmptyString(raw?.fallbackModel) ?? DEFAULT_PRICING.fallbackModel,
  };
  for (const [model, entry] of Object.entries(DEFAULT_PRICING.models)) {
    base.models[model] = { ...entry };
  }
  if (isPlainObject(raw?.models)) {
    for (const [model, entry] of Object.entries(raw.models)) {
      const normalized = normalizePrice(entry);
      if (normalized !== undefined) base.models[model] = normalized;
    }
  }
  if (isPlainObject(raw?.aliases)) {
    for (const [alias, canonical] of Object.entries(raw.aliases)) {
      if (typeof canonical === 'string' && base.models[canonical] !== undefined) base.aliases[alias] = canonical;
    }
  }
  for (const [alias, canonical] of Object.entries(base.aliases)) {
    if (base.models[canonical] === undefined) delete base.aliases[alias];
  }
  if (Object.keys(base.models).length === 0) base.models = { ...DEFAULT_PRICING.models };
  if (base.models[base.fallbackModel] === undefined) {
    base.fallbackModel = Object.keys(base.models)[0];
  }
  return base;
}

/** Merge user schedule config over the defaults, dropping malformed windows. */
function resolveSchedule(raw) {
  const defaults = DEFAULT_SCHEDULE;
  const windows = [];
  const source = Array.isArray(raw?.peakWindows) ? raw.peakWindows : defaults.peakWindows;
  for (const window of source) {
    if (!isPlainObject(window)) continue;
    const start = parseClock(window.start);
    const end = parseClock(window.end);
    if (start === undefined || end === undefined || start === end) continue;
    windows.push({ start: window.start, end: window.end, startMin: start, endMin: end });
  }
  const configuredHolidays = Array.isArray(raw?.holidays)
    ? raw.holidays.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day))
    : [];
  const replaceHolidays = raw?.replaceHolidays === true;
  const offset = Number(raw?.utcOffsetMinutes);
  return {
    timezone: nonEmptyString(raw?.timezone) ?? defaults.timezone,
    utcOffsetMinutes: Number.isFinite(offset) && Math.abs(offset) <= 14 * 60 ? offset : defaults.utcOffsetMinutes,
    peakWindows: windows.length > 0 ? windows : defaults.peakWindows.map((window) => ({
      start: window.start,
      end: window.end,
      startMin: parseClock(window.start),
      endMin: parseClock(window.end),
    })),
    weekdaysOnly: typeof raw?.weekdaysOnly === 'boolean' ? raw.weekdaysOnly : defaults.weekdaysOnly,
    // Configured dates are appended to the built-in State Council table unless the row
    // explicitly sets `replaceHolidays: true`.
    holidays: replaceHolidays
      ? [...new Set(configuredHolidays)]
      : [...new Set([...defaults.holidays, ...configuredHolidays])],
    peakMultiplier: positiveNumber(raw?.peakMultiplier, defaults.peakMultiplier),
    offPeakMultiplier: positiveNumber(raw?.offPeakMultiplier, defaults.offPeakMultiplier),
    note: nonEmptyString(raw?.note) ?? defaults.note,
  };
}

/** Resolve the whole plugin config, tolerating partial or malformed rows. */
function resolveConfig(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const links = isPlainObject(source.links) ? source.links : {};
  return {
    apiKeyEnv: nonEmptyString(source.apiKeyEnv) ?? DEFAULT_CONFIG.apiKeyEnv,
    baseURL: (nonEmptyString(source.baseURL) ?? DEFAULT_CONFIG.baseURL).replace(/\/+$/, ''),
    balanceRefreshMs: positiveNumber(source.balanceRefreshMs, DEFAULT_CONFIG.balanceRefreshMs),
    usageRefreshMs: positiveNumber(source.usageRefreshMs, DEFAULT_CONFIG.usageRefreshMs),
    requestTimeoutMs: positiveNumber(source.requestTimeoutMs, DEFAULT_CONFIG.requestTimeoutMs),
    maxSessions: Math.max(1, Math.floor(positiveNumber(source.maxSessions, DEFAULT_CONFIG.maxSessions))),
    accountFirst: typeof source.accountFirst === 'boolean' ? source.accountFirst : DEFAULT_CONFIG.accountFirst,
    accountLocale: nonEmptyString(source.accountLocale) ?? DEFAULT_CONFIG.accountLocale,
    allowedHosts: Array.isArray(source.allowedHosts)
      ? source.allowedHosts
          .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
          .map((entry) => entry.trim().toLowerCase())
      : [],
    pricing: resolvePricing(isPlainObject(source.pricing) ? source.pricing : undefined),
    schedule: resolveSchedule(isPlainObject(source.schedule) ? source.schedule : undefined),
    links: {
      usageUrl: nonEmptyString(links.usageUrl) ?? DEFAULT_CONFIG.links.usageUrl,
      topUpUrl: nonEmptyString(links.topUpUrl) ?? DEFAULT_CONFIG.links.topUpUrl,
    },
  };
}

// ---------------------------------------------------------------------------
// Schedule math (shared shape with the browser half; both use utcOffsetMinutes)
// ---------------------------------------------------------------------------

/** Whether one minute-of-day falls inside [start, end), supporting an overnight wrap. */
function minuteInWindow(minute, startMin, endMin) {
  if (startMin <= endMin) return minute >= startMin && minute < endMin;
  return minute >= startMin || minute < endMin;
}

function isHolidayInSchedule(epochMs, schedule) {
  if (schedule.holidays.length === 0) return false;
  const shifted = new Date(epochMs + schedule.utcOffsetMinutes * 60_000);
  const key = `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
  return schedule.holidays.includes(key);
}

/** Whether one instant bills at the peak rate under the configured schedule. */
function isPeakInstant(epochMs, schedule) {
  if (isHolidayInSchedule(epochMs, schedule)) return false;
  const shifted = new Date(epochMs + schedule.utcOffsetMinutes * 60_000);
  const weekday = shifted.getUTCDay();
  if (schedule.weekdaysOnly && (weekday === 0 || weekday === 6)) return false;
  const minute = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return schedule.peakWindows.some((window) => minuteInWindow(minute, window.startMin, window.endMin));
}

/** Price multiplier for one instant: 1 at peak, offPeakMultiplier otherwise. */
function multiplierAt(epochMs, schedule) {
  return isPeakInstant(epochMs, schedule) ? 1 : schedule.offPeakMultiplier;
}

// ---------------------------------------------------------------------------
// Decimal helpers (upstream balance amounts are decimal strings)
// ---------------------------------------------------------------------------

/**
 * Add two upstream decimal strings without floating-point drift: the sum is computed in
 * 1e-8 fixed point and rendered with two decimals (the API's display precision).
 */
function addDecimalStrings(left, right) {
  const parse = (value) => {
    const match = /^(-?)(\d+)(?:\.(\d{1,8}))?$/.exec(String(value ?? '0').trim());
    if (match === null) return undefined;
    const sign = match[1] === '-' ? -1n : 1n;
    const whole = BigInt(match[2]);
    const fraction = BigInt((match[3] ?? '').padEnd(8, '0'));
    return sign * (whole * 100_000_000n + fraction);
  };
  const a = parse(left);
  const b = parse(right);
  if (a === undefined || b === undefined) return String(left ?? '0');
  const sum = a + b;
  const negative = sum < 0n;
  const absolute = negative ? -sum : sum;
  const whole = absolute / 100_000_000n;
  const fraction = (absolute % 100_000_000n).toString().padStart(8, '0').slice(0, 2);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

// ---------------------------------------------------------------------------
// Usage folding
// ---------------------------------------------------------------------------

function emptyTokens() {
  return { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
}

function emptyUsageTotals() {
  return { tokens: emptyTokens(), cost: 0, requests: 0, byModel: {} };
}

function addTokens(target, usage) {
  target.uncachedInput += Number(usage.inputTokens) || 0;
  target.cacheRead += Number(usage.cacheReadTokens) || 0;
  target.cacheWrite += Number(usage.cacheWriteTokens) || 0;
  target.output += Number(usage.outputTokens) || 0;
}

/** Merge already-normalized token buckets (uncachedInput/cacheRead/cacheWrite/output). */
function mergeTokens(target, source) {
  if (!isPlainObject(source)) return;
  target.uncachedInput += Number(source.uncachedInput) || 0;
  target.cacheRead += Number(source.cacheRead) || 0;
  target.cacheWrite += Number(source.cacheWrite) || 0;
  target.output += Number(source.output) || 0;
}

/** Find the last provider usage sample in one attempt/stream record list. */
function lastUsageInStream(stream) {
  if (!Array.isArray(stream)) return undefined;
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (!isPlainObject(record)) continue;
    if (record.type === 'chunk' && isPlainObject(record.chunk) && record.chunk.type === 'usage') {
      return record.chunk.usage;
    }
  }
  return undefined;
}

/** Choose the price entry for one model id (alias, exact, obvious family match, then fallback). */
function priceForModel(pricing, model) {
  if (typeof model === 'string' && model.length > 0) {
    const aliased = pricing.aliases?.[model];
    if (aliased !== undefined && pricing.models[aliased] !== undefined) {
      return { key: aliased, ...pricing.models[aliased] };
    }
    if (pricing.models[model] !== undefined) return { key: model, ...pricing.models[model] };
    const lower = model.toLowerCase();
    const match = Object.keys(pricing.models).find((key) => lower.includes(key.toLowerCase()));
    if (match !== undefined) return { key: match, ...pricing.models[match] };
    for (const [alias, canonical] of Object.entries(pricing.aliases ?? {})) {
      if (lower.includes(alias.toLowerCase()) && pricing.models[canonical] !== undefined) {
        return { key: canonical, ...pricing.models[canonical] };
      }
    }
    if (lower.includes('pro')) {
      const pro = Object.keys(pricing.models).find((key) => key.toLowerCase().includes('pro'));
      if (pro !== undefined) return { key: pro, ...pricing.models[pro] };
    }
    if (lower.includes('flash')) {
      const flash = Object.keys(pricing.models).find((key) => key.toLowerCase().includes('flash'));
      if (flash !== undefined) return { key: flash, ...pricing.models[flash] };
    }
  }
  const fallback = pricing.fallbackModel;
  if (fallback !== undefined && pricing.models[fallback] !== undefined) {
    return { key: fallback, ...pricing.models[fallback] };
  }
  const first = Object.keys(pricing.models)[0];
  return first === undefined ? undefined : { key: first, ...pricing.models[first] };
}

/**
 * Fold one session's committed events into token totals and a cost estimate.
 * Inherited events (a forked session's copied prefix) are skipped so they are never billed twice.
 * Retried model attempts that committed no message contribute through their streamed usage sample.
 */
function foldSessionUsage(events, inheritedEventCount, pricing, schedule, options = {}) {
  const totals = emptyUsageTotals();
  const filterFrom = typeof options.fromEpochMs === 'number' ? options.fromEpochMs : undefined;
  let latestModel;
  let requests = 0;
  for (const event of events) {
    if (!isPlainObject(event)) continue;
    if (typeof event.seq === 'number' && typeof inheritedEventCount === 'number' && event.seq < inheritedEventCount) continue;
    if (filterFrom !== undefined && typeof event.time === 'number' && event.time < filterFrom) continue;
    const data = isPlainObject(event.data) ? event.data : {};
    if (event.type === 'request/header') {
      const model = data.header?.config?.model;
      if (typeof model === 'string' && model.length > 0) latestModel = model;
      continue;
    }
    if (event.type === 'request/context') {
      if (typeof data.model === 'string' && data.model.length > 0) latestModel = data.model;
      continue;
    }
    let usage;
    let model;
    if (event.type === 'assistant/message') {
      usage = data.usage;
      model = data.message?.source?.model ?? latestModel;
    } else if (event.type === 'assistant/attempt') {
      usage = lastUsageInStream(data.stream);
      model = latestModel;
    } else {
      continue;
    }
    if (!isPlainObject(usage)) continue;
    const price = priceForModel(pricing, model);
    if (price === undefined) continue;
    addTokens(totals.tokens, usage);
    const billedInput = (Number(usage.inputTokens) || 0) + (Number(usage.cacheWriteTokens) || 0);
    const perToken =
      billedInput * price.cacheMiss +
      (Number(usage.cacheReadTokens) || 0) * price.cacheHit +
      (Number(usage.outputTokens) || 0) * price.output;
    const eventTime = typeof event.time === 'number' ? event.time : Date.now();
    const cost = (perToken / pricing.unitTokens) * multiplierAt(eventTime, schedule);
    totals.cost += cost;
    requests += 1;
    const bucket = totals.byModel[price.key] ?? (totals.byModel[price.key] = { cost: 0, tokens: emptyTokens() });
    addTokens(bucket.tokens, usage);
    bucket.cost += cost;
  }
  totals.requests = requests;
  for (const key of Object.keys(totals.byModel)) {
    totals.byModel[key].cost = roundCost(totals.byModel[key].cost);
  }
  totals.cost = roundCost(totals.cost);
  return totals;
}

function roundCost(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1e8) / 1e8;
}

// ---------------------------------------------------------------------------
// Host application
// ---------------------------------------------------------------------------

class DeepSeekUsageHost {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    /** Last known balance snapshot, successful or failed. */
    this.balance = null;
    this.balanceFetchedAt = 0;
    this.balanceInflight = null;
    /** Failure backoff for the balance endpoint. */
    this.balanceFailures = 0;
    this.balanceNextAttempt = 0;
    /** Today's usage cache keyed by local day start. */
    this.today = null;
    this.todayInflight = null;
    /** Per-session usage cache: sessionId -> { at, value }. */
    this.sessionCache = new Map();
    /** Transport registration diagnostics surfaced in the state payload. */
    this.transport = {
      authenticatedFetch: 'not-attempted',
      authenticatedFetchError: null,
      webServer: 'not-attempted',
      authenticatedFetchHits: 0,
      fallbackRouteHits: 0,
      lastAuthenticatedFetchAt: 0,
      lastFallbackRouteAt: 0,
    };
    this.stopped = false;
  }

  dispose() {
    this.stopped = true;
    this.balanceInflight = null;
    this.todayInflight = null;
    this.sessionCache.clear();
  }

  // -- credentials ----------------------------------------------------------

  async resolveApiKey() {
    const credentials = this.ctx.get('credentials');
    const candidates = [this.config.apiKeyEnv, 'DEEPSEEK_BALANCE_API_KEY', 'DEEPSEEK_API_KEY'];
    const seen = new Set();
    for (const ref of candidates) {
      if (typeof ref !== 'string' || ref.length === 0 || seen.has(ref)) continue;
      seen.add(ref);
      if (credentials !== undefined && typeof credentials.resolve === 'function') {
        try {
          // Credential references are branded strings at compile time only.
          const resolved = await credentials.resolve(ref);
          const value = resolved?.value;
          if (typeof value === 'string' && value.length > 0) return value;
        } catch {
          // Fall through to the process environment for this reference.
        }
      }
      const fromEnv = process.env[ref];
      if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
    }
    return undefined;
  }

  // -- balance --------------------------------------------------------------

  /** Read the latest cached balance, refreshing when stale or when `force` is set. */
  async readBalance(force = false) {
    const now = Date.now();
    const failed = this.balance !== null && this.balance.ok !== true;
    // Back off after failures instead of hammering the endpoint, but honour an explicit refresh.
    if (failed && !force && now < this.balanceNextAttempt) return this.balance;
    const fresh =
      this.balance !== null && this.balance.ok === true && now - this.balanceFetchedAt < this.config.balanceRefreshMs;
    if (fresh && !force) return this.balance;
    if (this.balanceInflight !== null) return this.balanceInflight;
    const task = (async () => {
      let value;
      try {
        value = await this.fetchBalance();
        this.balanceFailures = 0;
      } catch (error) {
        value = {
          ok: false,
          fetchedAt: this.balanceFetchedAt,
          error: { code: error?.code ?? 'ERROR', message: errorMessage(error) },
        };
        this.balanceFailures += 1;
        const backoff = Math.min(30_000 * 2 ** (this.balanceFailures - 1), this.config.balanceRefreshMs);
        this.balanceNextAttempt = Date.now() + backoff;
      }
      if (!this.stopped) {
        this.balance = value;
        if (value.ok === true) this.balanceFetchedAt = Date.now();
      }
      return value;
    })().finally(() => {
      this.balanceInflight = null;
    });
    this.balanceInflight = task;
    return task;
  }

  /** Query the balance from the account service, then from the API key. */
  async fetchBalance() {
    let accountError;
    if (this.config.accountFirst) {
      try {
        const fromAccount = await this.fetchAccountBalance();
        if (fromAccount !== undefined) return fromAccount;
      } catch (error) {
        accountError = error;
      }
    }
    try {
      return await this.fetchApiKeyBalance();
    } catch (error) {
      if (accountError !== undefined) {
        throw codedError(
          'ACCOUNT_ERROR',
          `The DeepSeek account balance query failed (${errorMessage(accountError)}) and no API key fallback is available.`,
        );
      }
      throw error;
    }
  }

  async fetchAccountBalance() {
    const account = this.ctx.get('deepseekAccount');
    if (account === undefined) return undefined;
    const state = await account.getState();
    if (!isPlainObject(state) || state.status !== 'credential-stored') return undefined;
    const metadata = {
      version: '0.1.0',
      locale: this.config.accountLocale,
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    };
    const details = await account.getBalance(metadata);
    if (!isPlainObject(details) || details.status !== 'ready') {
      throw codedError('ACCOUNT_ERROR', 'The DeepSeek account balance query failed.');
    }
    const wallets = [];
    for (const wallet of Array.isArray(details.value) ? details.value : []) {
      const currency = typeof wallet?.currency === 'string' ? wallet.currency : 'CNY';
      const toppedUp = String(wallet?.balance ?? '0');
      wallets.push({ currency, total: toppedUp, granted: '0.00', toppedUp });
    }
    for (const wallet of Array.isArray(details.bonusWallets) ? details.bonusWallets : []) {
      const currency = typeof wallet?.currency === 'string' ? wallet.currency : 'CNY';
      const bonus = String(wallet?.balance ?? '0');
      const existing = wallets.find((entry) => entry.currency === currency);
      if (existing === undefined) {
        wallets.push({ currency, total: bonus, granted: bonus, toppedUp: undefined });
        continue;
      }
      existing.granted = addDecimalStrings(existing.granted, bonus);
      existing.total = addDecimalStrings(existing.total, bonus);
    }
    return {
      ok: true,
      source: 'account',
      fetchedAt: Date.now(),
      isAvailable: wallets.length > 0,
      wallets,
      links: this.accountLinks(state),
    };
  }

  accountLinks(state) {
    const links = isPlainObject(state?.links) ? state.links : {};
    return {
      usageUrl: nonEmptyString(links.usageUrl) ?? this.config.links.usageUrl,
      topUpUrl: nonEmptyString(links.topUpUrl) ?? this.config.links.topUpUrl,
    };
  }

  async fetchApiKeyBalance() {
    const apiKey = await this.resolveApiKey();
    if (apiKey === undefined) {
      throw codedError(
        'NO_CREDENTIAL',
        `No DeepSeek API key: add the ${this.config.apiKeyEnv} credential to $DSH_HOME/.credentials.yaml, ` +
          'export it in the launching environment, or sign in to a DeepSeek account.',
      );
    }
    const url = `${this.config.baseURL}/user/balance`;
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'user-agent': 'dsh-plugin-deepseek-usage/0.1',
        },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      throw codedError('NETWORK', `DeepSeek balance request failed: ${errorMessage(error)}`);
    }
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        const message = payload?.error?.message ?? payload?.message;
        if (typeof message === 'string') detail = `: ${message}`;
      } catch {
        // Keep the status-only message.
      }
      throw codedError('HTTP_ERROR', `DeepSeek balance API returned HTTP ${response.status}${detail}`);
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw codedError('PROTOCOL', `DeepSeek balance API returned an unreadable body: ${errorMessage(error)}`);
    }
    if (!isPlainObject(payload) || !Array.isArray(payload.balance_infos)) {
      throw codedError('PROTOCOL', 'DeepSeek balance API response is missing balance_infos.');
    }
    const wallets = payload.balance_infos
      .filter((wallet) => isPlainObject(wallet))
      .map((wallet) => ({
        currency: typeof wallet.currency === 'string' ? wallet.currency : 'CNY',
        total: String(wallet.total_balance ?? '0'),
        granted: String(wallet.granted_balance ?? '0'),
        toppedUp: String(wallet.topped_up_balance ?? '0'),
      }));
    return {
      ok: true,
      source: 'api-key',
      fetchedAt: Date.now(),
      isAvailable: payload.is_available === true,
      wallets,
      links: {
        usageUrl: this.config.links.usageUrl,
        topUpUrl: this.config.links.topUpUrl,
      },
    };
  }

  // -- usage ----------------------------------------------------------------

  /** The configured-schedule day window that "today" covers (default Asia/Shanghai, UTC+8). */
  dayWindow(now = Date.now()) {
    const offsetMs = this.config.schedule.utcOffsetMinutes * 60_000;
    const dayStart = Math.floor((now + offsetMs) / DAY_MS) * DAY_MS - offsetMs;
    return { dayStart, dayEnd: dayStart + DAY_MS };
  }

  async sessionQuery() {
    return this.ctx.get('sessionQuery');
  }

  /** Read one session's complete event log, bounded by a soft timeout. */
  async readSessionEvents(sessionQuery, sessionId) {
    const read = sessionQuery.readSession(sessionId);
    const timeout = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(codedError('TIMEOUT', 'Session log read timed out.')), 15_000);
      if (typeof timer.unref === 'function') timer.unref();
    });
    const snapshot = await Promise.race([read, timeout]);
    if (!isPlainObject(snapshot) || !Array.isArray(snapshot.events)) return undefined;
    return snapshot;
  }

  /** Usage for one session (full log), cached briefly because the dock polls. */
  async readSessionUsage(sessionId, force = false) {
    const sessionQuery = await this.sessionQuery();
    if (sessionQuery === undefined) return { ok: false, error: 'The session query service is unavailable.' };
    const cached = this.sessionCache.get(sessionId);
    if (!force && cached !== undefined && Date.now() - cached.at < 10_000) return cached.value;
    try {
      const snapshot = await this.readSessionEvents(sessionQuery, sessionId);
      if (snapshot === undefined) return { ok: false, error: 'The session log could not be read.' };
      const totals = foldSessionUsage(
        snapshot.events,
        snapshot.inheritedEventCount,
        this.config.pricing,
        this.config.schedule,
      );
      this.sessionCache.set(sessionId, { at: Date.now(), value: totals });
      return totals;
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** Aggregate today's usage over every session log created today (persisted or live). */
  async readTodayUsage(force = false) {
    const { dayStart, dayEnd } = this.dayWindow();
    const cached = this.today;
    if (!force && cached !== null && cached.dayStart === dayStart && Date.now() - cached.at < this.config.usageRefreshMs) {
      return cached.value;
    }
    if (this.todayInflight !== null) return this.todayInflight;
    const task = this.computeTodayUsage(dayStart, dayEnd)
      .then((value) => {
        if (!this.stopped) this.today = { dayStart, dayEnd, at: Date.now(), value };
        return value;
      })
      .finally(() => {
        this.todayInflight = null;
      });
    this.todayInflight = task;
    return task;
  }

  async computeTodayUsage(dayStart, dayEnd) {
    const sessionQuery = await this.sessionQuery();
    if (sessionQuery === undefined) return { ok: false, error: 'The session query service is unavailable.' };
    let records;
    try {
      records = await sessionQuery.listSessions();
    } catch (error) {
      return { ok: false, error: `Session listing failed: ${errorMessage(error)}` };
    }
    if (!Array.isArray(records)) return { ok: false, error: 'Session listing returned an unexpected value.' };
    const live = new Set();
    const store = this.ctx.get('sessions');
    if (store !== undefined && typeof store.list === 'function') {
      try {
        for (const session of store.list()) live.add(session.id);
      } catch {
        // Live-session discovery is a best-effort widening.
      }
    }
    const targets = [];
    for (const record of records) {
      const header = record?.header;
      if (!isPlainObject(header) || typeof header.id !== 'string') continue;
      const createdAt = Number(header.createdAt);
      if (!Number.isFinite(createdAt)) continue;
      if (createdAt >= dayStart && createdAt < dayEnd) targets.push(record);
      else if (live.has(header.id)) targets.push(record);
    }
    targets.sort((left, right) => Number(right.header.createdAt) - Number(left.header.createdAt));
    const capped = targets.slice(0, this.config.maxSessions);
    const totals = emptyUsageTotals();
    let sessions = 0;
    let partial = targets.length > capped.length;
    const results = await runBounded(capped, 4, async (record) => {
      try {
        const snapshot = await this.readSessionEvents(sessionQuery, record.header.id);
        if (snapshot === undefined) return null;
        const folded = foldSessionUsage(
          snapshot.events,
          snapshot.inheritedEventCount,
          this.config.pricing,
          this.config.schedule,
          { fromEpochMs: dayStart },
        );
        return folded;
      } catch {
        return null;
      }
    });
    for (const folded of results) {
      if (folded === null || folded === undefined) {
        partial = true;
        continue;
      }
      if (folded.requests === 0) continue;
      sessions += 1;
      totals.requests += folded.requests;
      totals.cost += folded.cost;
      mergeTokens(totals.tokens, folded.tokens);
      for (const [model, bucket] of Object.entries(folded.byModel)) {
        const target = totals.byModel[model] ?? (totals.byModel[model] = { cost: 0, tokens: emptyTokens() });
        target.cost += bucket.cost;
        mergeTokens(target.tokens, bucket.tokens);
      }
    }
    totals.cost = roundCost(totals.cost);
    for (const key of Object.keys(totals.byModel)) totals.byModel[key].cost = roundCost(totals.byModel[key].cost);
    return {
      ok: true,
      dayStart,
      dayEnd,
      sessions,
      requests: totals.requests,
      tokens: totals.tokens,
      cost: totals.cost,
      byModel: totals.byModel,
      partial,
    };
  }

  // -- response -------------------------------------------------------------

  async buildState(sessionId, force = false) {
    const [balance, today, session] = await Promise.all([
      this.readBalance(force).catch((error) => ({
        ok: false,
        fetchedAt: 0,
        error: { code: error?.code ?? 'ERROR', message: errorMessage(error) },
      })),
      this.readTodayUsage(force).catch((error) => ({ ok: false, error: errorMessage(error) })),
      sessionId === undefined
        ? Promise.resolve(null)
        : this.readSessionUsage(sessionId, force).catch((error) => ({ ok: false, error: errorMessage(error) })),
    ]);
    return {
      v: 1,
      now: Date.now(),
      route: ROUTE_PATH,
      balance,
      links: {
        usageUrl: balance?.links?.usageUrl ?? this.config.links.usageUrl,
        topUpUrl: balance?.links?.topUpUrl ?? this.config.links.topUpUrl,
      },
      transport: {
        authenticatedFetch: this.transport.authenticatedFetch,
        authenticatedFetchError: this.transport.authenticatedFetchError,
        webServer: this.transport.webServer,
        authenticatedFetchHits: this.transport.authenticatedFetchHits,
        fallbackRouteHits: this.transport.fallbackRouteHits,
        lastAuthenticatedFetchAt: this.transport.lastAuthenticatedFetchAt,
        lastFallbackRouteAt: this.transport.lastFallbackRouteAt,
      },
      schedule: publicSchedule(this.config.schedule),
      pricing: publicPricing(this.config.pricing, this.config.schedule),
      usage: {
        ok: today?.ok === true || (session !== null && session?.ok === true),
        session: session,
        today: today,
        usageRefreshMs: this.config.usageRefreshMs,
        balanceRefreshMs: this.config.balanceRefreshMs,
      },
    };
  }

  /**
   * Same-origin fence for the state endpoint: the payload is private (account balance), so a
   * request whose Host names neither a loopback address nor this server's own origin is refused.
   * This stops DNS-rebinding pages from reading the JSON while leaving local and configured
   * hostnames working.
   */
  requestAllowed(request) {
    const headers = request?.headers;
    if (headers === undefined || typeof headers.get !== 'function') return true;
    if (headers.get('sec-fetch-site') === 'cross-site') return false;
    const hostHeader = headers.get('host');
    if (typeof hostHeader !== 'string' || hostHeader.length === 0) return true;
    let hostname;
    try {
      hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
    } catch {
      return false;
    }
    const allowed = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
    for (const entry of this.config.allowedHosts) allowed.add(entry.toLowerCase());
    if (allowed.has(hostname)) return true;
    const webServer = this.ctx.get('webServer');
    if (webServer !== undefined && typeof webServer.getOrigin === 'function') {
      try {
        if (new URL(webServer.getOrigin()).hostname.toLowerCase() === hostname) return true;
      } catch {
        // Unbound listener: fall through to the refusal.
      }
    }
    return false;
  }

  /**
   * Handler for the exact Fetch route below Connection's authenticated `/api` channel.
   * Connection applies its Host/Origin fence and browser authentication before dispatch, so no
   * extra fence is needed here; the request never reaches this handler for an anonymous peer.
   */
  async handleAuthenticatedFetch(request) {
    this.transport.authenticatedFetchHits += 1;
    this.transport.lastAuthenticatedFetchAt = Date.now();
    try {
      const url = new URL(request.url, 'http://localhost');
      const sessionId = nonEmptyString(url.searchParams.get('sessionId') ?? undefined);
      const force = url.searchParams.get('refresh') === '1';
      return jsonResponse(await this.buildState(sessionId, force));
    } catch (error) {
      return jsonResponse(
        { v: 1, ok: false, now: Date.now(), error: { code: 'INTERNAL', message: errorMessage(error) } },
        500,
      );
    }
  }

  async handleRequest(request) {
    let sessionId;
    try {
      this.transport.fallbackRouteHits += 1;
      this.transport.lastFallbackRouteAt = Date.now();
      if (!this.requestAllowed(request)) {
        return jsonResponse(
          { v: 1, ok: false, now: Date.now(), error: { code: 'FORBIDDEN', message: 'Unexpected Host header.' } },
          403,
        );
      }
      const url = new URL(request.url, 'http://localhost');
      sessionId = nonEmptyString(url.searchParams.get('sessionId') ?? undefined);
      const force = url.searchParams.get('refresh') === '1';
      return jsonResponse(await this.buildState(sessionId, force));
    } catch (error) {
      return jsonResponse(
        { v: 1, ok: false, now: Date.now(), error: { code: 'INTERNAL', message: errorMessage(error) } },
        500,
      );
    }
  }
}

/** Strip host-only schedule fields before publishing the schedule to the browser. */
function publicSchedule(schedule) {
  return {
    timezone: schedule.timezone,
    utcOffsetMinutes: schedule.utcOffsetMinutes,
    peakWindows: schedule.peakWindows.map((window) => ({ start: window.start, end: window.end })),
    weekdaysOnly: schedule.weekdaysOnly,
    holidays: schedule.holidays,
    peakMultiplier: schedule.peakMultiplier,
    offPeakMultiplier: schedule.offPeakMultiplier,
    note: schedule.note,
  };
}

/** Publish the price table with its derived off-peak amounts for direct display. */
function publicPricing(pricing, schedule) {
  const models = {};
  for (const [key, model] of Object.entries(pricing.models)) {
    const off = (value) => Math.round(value * 10_000) / 10_000;
    models[key] = {
      name: model.name ?? key,
      cacheHit: model.cacheHit,
      cacheMiss: model.cacheMiss,
      output: model.output,
      offPeak: {
        cacheHit: off(model.cacheHit * schedule.offPeakMultiplier),
        cacheMiss: off(model.cacheMiss * schedule.offPeakMultiplier),
        output: off(model.output * schedule.offPeakMultiplier),
      },
    };
  }
  return {
    currency: pricing.currency,
    unitTokens: pricing.unitTokens,
    models,
    fallbackModel: pricing.fallbackModel,
  };
}

/** Run `worker` over `items` with at most `limit` in flight, preserving order. */
async function runBounded(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = [];
  const count = Math.min(limit, items.length);
  for (let index = 0; index < count; index += 1) {
    runners.push(
      (async () => {
        while (cursor < items.length) {
          const position = cursor;
          cursor += 1;
          results[position] = await worker(items[position], position);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

/** Declare the plugin's display name for diagnostics. */
export const name = 'deepseek-usage';

/**
 * Apply the host half: register the JSON route and warm the caches.
 * @param ctx - owning Cordis context.
 * @param config - optional row config (see the file header).
 */
export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config);
  const host = new DeepSeekUsageHost(ctx, resolved);

  ctx.effect(() => {
    return () => host.dispose();
  });

  // Preferred transport: an exact Fetch route below Connection's authenticated `/api` channel.
  // Connection registers and fences the `/api` prefix itself, so the browser's session cookie
  // authenticates the request and an anonymous peer never reaches this handler. (The newer
  // `connection.rpc.handle` channel is unusable here: it registers through the Connection
  // plugin's own context, which does not inject `webServer` in this DSH build.)
  ctx.inject(['connection'], (scoped) => {
    scoped.effect(() => {
      try {
        const dispose = scoped.connection.fetch.register({
          path: AUTH_ROUTE_PATH,
          methods: ['GET', 'HEAD'],
          requestBody: 'buffered',
          fetch: (request) => host.handleAuthenticatedFetch(request),
        });
        host.transport.authenticatedFetch = 'registered';
        host.transport.authenticatedFetchError = null;
        return () => {
          host.transport.authenticatedFetch = 'disposed';
          void dispose();
        };
      } catch (error) {
        host.transport.authenticatedFetch = 'failed';
        host.transport.authenticatedFetchError = errorMessage(error);
        return undefined;
      }
    });
  });

  // Fallback transport for compositions without a usable Connection carrier: a same-origin JSON
  // route fenced to loopback/own-origin Host headers and rejecting cross-site browser requests.
  // It stays anonymous by design, so it is only a fallback for the authenticated route above;
  // the browser half never sends the API key, and the payload carries no credential.
  ctx.inject(['webServer'], (scoped) => {
    scoped.effect(() =>
      scoped.webServer.register({
        kind: 'exact',
        path: ROUTE_PATH,
        resource: (request) => host.handleRequest(request),
      }),
    );
    host.transport.webServer = 'registered';
  });

  // Warm both caches so the first page load usually has data.
  void host.readBalance(true).catch(() => undefined);
  void host.readTodayUsage().catch(() => undefined);
}
