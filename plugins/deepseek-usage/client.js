window.__ModuleLoader__.load({
  id: '@local/dsh-deepseek-usage',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /* ======================================================================
     * Constants
     * ==================================================================== */

    const NS = 'deepseekUsage';
    const AUTH_ROUTE_PATH = '/api/dsh-plugin-deepseek-usage/state';
    const ROUTE_PATH = '/dsh-plugin/deepseek-usage/state';
    /**
     * Retry gate for the authenticated route: a failed probe backs off for 60 s (5 min for an
     * explicit 401/403) instead of latching off, so a transient race during plugin reload heals.
     */
    let authenticatedRouteRetryAt = 0;
    const POLL_MS = 30000;
    const TICK_MS = 1000;
    const PRIMARY_CURRENCY = 'CNY';
    const DEFAULT_USAGE_URL = 'https://platform.deepseek.com/usage';
    const DEFAULT_TOP_UP_URL = 'https://platform.deepseek.com/top_up';
    const ERROR_CODES = ['NO_CREDENTIAL', 'HTTP_ERROR', 'NETWORK', 'PROTOCOL', 'ACCOUNT_ERROR'];

    /* ======================================================================
     * Locale dictionaries (en + zh; complete in both directions)
     * ==================================================================== */

    const DICT_ZH = {
      settingsNavLabel: '用量与余额',
      title: 'DeepSeek 用量与余额',
      description: '显示 DeepSeek API 余额、本会话与今日的 Token 用量估算，以及当前处于峰时还是谷时计费时段。',
      balance: '余额',
      balanceUnavailable: '余额不可用',
      balanceError: '余额读取失败',
      total: '总额',
      granted: '赠送',
      toppedUp: '充值',
      source: '来源',
      sourceApiKey: 'API Key',
      sourceAccount: '账户',
      updated: '更新于',
      refresh: '刷新',
      refreshing: '刷新中…',
      loading: '加载中…',
      retry: '重试',
      todayUsage: '今日用量',
      todayShort: '今',
      sessionUsage: '本会话',
      sessionShort: '会话',
      cost: '花费',
      costNote: '费用为根据会话 Token 用量计算的本地估算，仅供参考。',
      tokens: 'Tokens',
      requests: '请求数',
      sessions: '会话数',
      partial: '部分会话未能读取，数据不完整',
      cacheHitRate: '缓存命中率',
      peakState: '峰时计费中',
      offPeakState: '谷时计费中',
      peakName: '峰时',
      offPeakName: '谷时',
      nextTransition: '下次切换',
      inDuration: '剩余 {duration}',
      schedule: '计费时段',
      weekdaysOnly: '周一至周五',
      everyDay: '每天',
      timezone: '时区',
      holidaysCount: '含 {count} 个节假日',
      peakMultiplierText: '峰时 ×{multiplier}',
      offPeakMultiplierText: '谷时 ×{multiplier}',
      pricing: '价格',
      model: '模型',
      priceCacheHit: '缓存命中',
      priceCacheMiss: '缓存未命中',
      priceOutput: '输出',
      peakPrice: '峰时价格',
      offPeakPrice: '谷时价格',
      unitPerMillion: '价格单位为每百万 Tokens（{currency}）',
      usageUnavailable: '用量不可用',
      usageErrorHint: '会话用量暂时无法读取',
      refreshFailed: '刷新失败，当前显示上次数据',
      errorNoCredential: '未配置 DeepSeek 凭证或 API Key',
      errorHttp: 'DeepSeek 接口返回错误',
      errorNetwork: '网络请求失败',
      errorProtocol: '响应格式无法解析',
      errorAccount: '账户状态异常',
      missingData: '暂无数据',
      platformUsage: '查看用量',
      platformTopUp: '充值',
      serverTime: '服务器时间',
      localEstimate: '本地估算',
      officialBalance: '余额来自 DeepSeek 官方接口。',
      unknown: '未知',
      approx: '≈',
      inputUncached: '未缓存输入',
      cacheRead: '缓存读取',
      cacheWrite: '缓存写入',
      output: '输出',
      balanceLoading: '余额 …',
      balanceFailedShort: '余额 ?',
      balanceErrorShort: '余额 —',
      sessionHint: '本会话的用量与估算费用显示在输入框下方的余额条中。',
      settingsHint: '价格均为每百万 Tokens 的峰时 / 谷时费率。'
    };

    const DICT_EN = {
      settingsNavLabel: 'Usage & balance',
      title: 'DeepSeek usage and balance',
      description: 'Shows the DeepSeek API balance, estimated token usage and cost for this session and today, and whether the current time is peak or off-peak pricing.',
      balance: 'Balance',
      balanceUnavailable: 'Balance unavailable',
      balanceError: 'Balance read failed',
      total: 'Total',
      granted: 'Granted',
      toppedUp: 'Topped up',
      source: 'Source',
      sourceApiKey: 'API key',
      sourceAccount: 'Account',
      updated: 'Updated',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      loading: 'Loading…',
      retry: 'Retry',
      todayUsage: 'Today',
      todayShort: 'Today',
      sessionUsage: 'This session',
      sessionShort: 'Session',
      cost: 'Cost',
      costNote: 'Costs are local estimates from session token usage and are for reference only.',
      tokens: 'Tokens',
      requests: 'Requests',
      sessions: 'Sessions',
      partial: 'Some sessions could not be read; data is partial',
      cacheHitRate: 'Cache hit rate',
      peakState: 'Peak pricing active',
      offPeakState: 'Off-peak pricing active',
      peakName: 'Peak',
      offPeakName: 'Off-peak',
      nextTransition: 'Next switch',
      inDuration: 'in {duration}',
      schedule: 'Billing periods',
      weekdaysOnly: 'Mon–Fri',
      everyDay: 'Every day',
      timezone: 'Time zone',
      holidaysCount: 'includes {count} holidays',
      peakMultiplierText: 'Peak ×{multiplier}',
      offPeakMultiplierText: 'Off-peak ×{multiplier}',
      pricing: 'Pricing',
      model: 'Model',
      priceCacheHit: 'Cache hit',
      priceCacheMiss: 'Cache miss',
      priceOutput: 'Output',
      peakPrice: 'Peak price',
      offPeakPrice: 'Off-peak price',
      unitPerMillion: 'Prices are per 1M tokens ({currency})',
      usageUnavailable: 'Usage unavailable',
      usageErrorHint: 'Session usage could not be read',
      refreshFailed: 'Refresh failed; showing previous data',
      errorNoCredential: 'No DeepSeek credential or API key configured',
      errorHttp: 'The DeepSeek API returned an error',
      errorNetwork: 'Network request failed',
      errorProtocol: 'Could not parse the response',
      errorAccount: 'Account state error',
      missingData: 'No data',
      platformUsage: 'View usage',
      platformTopUp: 'Top up',
      serverTime: 'Server time',
      localEstimate: 'Local estimate',
      officialBalance: 'Balance comes from the official DeepSeek API.',
      unknown: 'Unknown',
      approx: '≈',
      inputUncached: 'Uncached input',
      cacheRead: 'Cache read',
      cacheWrite: 'Cache write',
      output: 'Output',
      balanceLoading: 'Balance …',
      balanceFailedShort: 'Balance ?',
      balanceErrorShort: 'Balance —',
      sessionHint: "This session's usage and estimated cost appear in the balance pill below the composer.",
      settingsHint: 'Prices are per 1M tokens at peak and off-peak rates.'
    };

    /* ======================================================================
     * Theme tokens (host look; no literal UI colors)
     * ==================================================================== */

    const C = {
      labelPrimary: 'var(--dsw-alias-label-primary)',
      labelSecondary: 'var(--dsw-alias-label-secondary)',
      labelTertiary: 'var(--dsw-alias-label-tertiary)',
      borderL1: 'var(--dsw-alias-border-l1)',
      borderL2: 'var(--dsw-alias-border-l2)',
      borderL3: 'var(--dsw-alias-border-l3)',
      stateSuccess: 'var(--dsw-alias-state-success-primary)',
      stateWarn: 'var(--dsw-alias-state-warn-primary)',
      stateWarnLabel: 'var(--dsw-alias-state-warn-label)',
      stateError: 'var(--dsw-alias-state-error-primary)',
      stateBusiness: 'var(--dsw-alias-state-business-primary)',
      interactiveHover: 'var(--dsw-alias-interactive-bg-hover)',
      link: 'var(--dsw-alias-link)',
      panelBg: 'var(--dsw-alias-bg-layer-1)',
      cardBg: 'var(--dsw-alias-settings-card-fill)',
      cardStroke: 'var(--dsw-alias-settings-card-stroke)',
      radiusSm: 'var(--dsw-radius-sm)',
      radiusMd: 'var(--dsw-radius-md)',
      radiusXl: 'var(--dsw-radius-xl)',
      font: 'inherit'
    };

    const PILL_STYLE = {
      boxSizing: 'border-box',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      maxWidth: '100%',
      padding: '1px 8px',
      border: 'none',
      borderRadius: C.radiusSm,
      background: 'transparent',
      color: C.labelTertiary,
      fontFamily: C.font,
      fontSize: '12px',
      lineHeight: '20px',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      cursor: 'pointer'
    };

    const PILL_HOVER_STYLE = {
      background: C.interactiveHover,
      color: C.labelSecondary
    };

    const SMALL_BUTTON_STYLE = {
      boxSizing: 'border-box',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '26px',
      padding: '0 10px',
      border: '0.5px solid ' + C.borderL3,
      borderRadius: C.radiusSm,
      background: 'transparent',
      color: C.labelPrimary,
      fontFamily: C.font,
      fontSize: '12px',
      lineHeight: '18px',
      cursor: 'pointer'
    };

    const SMALL_BUTTON_HOVER_STYLE = {
      background: C.interactiveHover
    };

    const PANEL_STYLE = {
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: '280px',
      maxWidth: 'min(460px, 92vw)',
      marginTop: '6px',
      padding: '10px 12px',
      border: '0.5px solid ' + C.borderL1,
      borderRadius: C.radiusMd,
      background: C.panelBg,
      color: C.labelPrimary,
      fontFamily: C.font,
      fontSize: '12px',
      lineHeight: '18px'
    };

    const SECTION_STYLE = {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      padding: '8px 0',
      color: C.labelPrimary,
      fontSize: '13px',
      lineHeight: '22px'
    };

    const CARD_STYLE = {
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px 16px',
      border: '0.5px solid ' + C.cardStroke,
      borderRadius: C.radiusXl,
      background: C.cardBg
    };

    const LINK_STYLE = {
      color: C.link,
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
      cursor: 'pointer'
    };

    const MUTED_STYLE = {
      color: C.labelSecondary
    };

    const HINT_STYLE = {
      color: C.labelTertiary,
      fontSize: '11px',
      lineHeight: '16px'
    };

    /* ======================================================================
     * Generic helpers
     * ==================================================================== */

    function isFiniteNumber(value) {
      return typeof value === 'number' && isFinite(value);
    }

    function numberOr(value, fallback) {
      return isFiniteNumber(value) ? value : fallback;
    }

    function optionalNumber(value) {
      return isFiniteNumber(value) ? value : null;
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value);
    }

    function trimNumber(value) {
      return String(Number(value.toFixed(1)));
    }

    function groupInteger(digits) {
      return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function parseHm(value) {
      if (typeof value !== 'string') return null;
      const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
      if (match === null) return null;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;
      if (hours === 24 && minutes !== 0) return null;
      return hours * 60 + minutes;
    }

    function minutesToClock(totalMinutes) {
      const minutes = ((totalMinutes % 1440) + 1440) % 1440;
      return pad2(Math.floor(minutes / 60)) + ':' + pad2(minutes % 60);
    }

    function safeHttpUrl(value) {
      return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
    }

    /* ======================================================================
     * Normalization (defensive: unknown fields ignored, partial data tolerated)
     * ==================================================================== */

    function normalizeError(value) {
      if (typeof value === 'string') return { code: 'UNKNOWN', message: value };
      if (value !== null && typeof value === 'object') {
        return {
          code: ERROR_CODES.indexOf(value.code) >= 0 ? value.code : 'UNKNOWN',
          message: typeof value.message === 'string' ? value.message : ''
        };
      }
      return { code: 'UNKNOWN', message: '' };
    }

    function normalizeLinks(value) {
      if (value === null || typeof value !== 'object') return { usageUrl: null, topUpUrl: null };
      return {
        usageUrl: safeHttpUrl(value.usageUrl),
        topUpUrl: safeHttpUrl(value.topUpUrl)
      };
    }

    function normalizeWallet(value) {
      if (value === null || typeof value !== 'object') return null;
      const total = typeof value.total === 'string' && value.total.trim() !== ''
        ? value.total.trim()
        : optionalNumber(value.total) === null ? null : String(value.total);
      if (total === null) return null;
      const granted = typeof value.granted === 'string' && value.granted.trim() !== ''
        ? value.granted.trim()
        : optionalNumber(value.granted) === null ? null : String(value.granted);
      const toppedUp = typeof value.toppedUp === 'string' && value.toppedUp.trim() !== ''
        ? value.toppedUp.trim()
        : optionalNumber(value.toppedUp) === null ? null : String(value.toppedUp);
      return {
        currency: typeof value.currency === 'string' && value.currency.trim() !== ''
          ? value.currency.trim().toUpperCase()
          : PRIMARY_CURRENCY,
        total: total,
        granted: granted,
        toppedUp: toppedUp
      };
    }

    function normalizeBalance(value) {
      if (value === null || typeof value !== 'object') {
        return { ok: false, error: { code: 'UNKNOWN', message: '' }, wallets: [], source: null, fetchedAt: 0, isAvailable: false };
      }
      if (value.ok === false) {
        return {
          ok: false,
          error: normalizeError(value.error),
          wallets: [],
          source: null,
          fetchedAt: numberOr(value.fetchedAt, 0),
          isAvailable: false
        };
      }
      const wallets = [];
      if (Array.isArray(value.wallets)) {
        for (let index = 0; index < value.wallets.length; index += 1) {
          const wallet = normalizeWallet(value.wallets[index]);
          if (wallet !== null) wallets.push(wallet);
        }
      }
      return {
        ok: true,
        error: null,
        wallets: wallets,
        source: value.source === 'account' ? 'account' : 'api-key',
        fetchedAt: numberOr(value.fetchedAt, 0),
        isAvailable: value.isAvailable !== false
      };
    }

    function normalizeSchedule(value) {
      if (value === null || typeof value !== 'object') return null;
      const windows = [];
      if (Array.isArray(value.peakWindows)) {
        for (let index = 0; index < value.peakWindows.length; index += 1) {
          const window = value.peakWindows[index];
          if (window === null || typeof window !== 'object') continue;
          const start = parseHm(window.start);
          const end = parseHm(window.end);
          if (start === null || end === null) continue;
          windows.push({ start: start, end: end });
        }
      }
      const holidays = [];
      if (Array.isArray(value.holidays)) {
        for (let index = 0; index < value.holidays.length; index += 1) {
          const day = value.holidays[index];
          if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) holidays.push(day);
        }
      }
      return {
        timezone: typeof value.timezone === 'string' && value.timezone !== '' ? value.timezone : 'Asia/Shanghai',
        utcOffsetMinutes: numberOr(value.utcOffsetMinutes, 480),
        windows: windows,
        weekdaysOnly: value.weekdaysOnly !== false,
        holidays: holidays,
        peakMultiplier: numberOr(value.peakMultiplier, 2),
        offPeakMultiplier: numberOr(value.offPeakMultiplier, 0.5),
        note: typeof value.note === 'string' && value.note !== '' ? value.note : null
      };
    }

    function normalizeModelPrices(value) {
      if (value === null || typeof value !== 'object') {
        return { cacheHit: null, cacheMiss: null, output: null };
      }
      return {
        cacheHit: optionalNumber(value.cacheHit),
        cacheMiss: optionalNumber(value.cacheMiss),
        output: optionalNumber(value.output)
      };
    }

    function normalizePricing(value) {
      if (value === null || typeof value !== 'object') return null;
      const source = value.models !== null && typeof value.models === 'object' ? value.models : {};
      const models = [];
      const keys = Object.keys(source);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const model = source[key];
        if (model === null || typeof model !== 'object') continue;
        models.push({
          key: key,
          name: typeof model.name === 'string' && model.name !== '' ? model.name : key,
          peak: normalizeModelPrices(model),
          offPeak: model.offPeak !== null && typeof model.offPeak === 'object' ? normalizeModelPrices(model.offPeak) : null
        });
      }
      if (models.length === 0) return null;
      return {
        currency: typeof value.currency === 'string' && value.currency !== '' ? value.currency.toUpperCase() : PRIMARY_CURRENCY,
        unitTokens: numberOr(value.unitTokens, 1000000),
        models: models,
        fallbackModel: typeof value.fallbackModel === 'string' ? value.fallbackModel : null
      };
    }

    function normalizeTokens(value) {
      if (value === null || typeof value !== 'object') {
        return { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
      }
      return {
        uncachedInput: numberOr(value.uncachedInput, 0),
        cacheRead: numberOr(value.cacheRead, 0),
        cacheWrite: numberOr(value.cacheWrite, 0),
        output: numberOr(value.output, 0)
      };
    }

    function normalizeUsageBlock(value) {
      if (value === null || typeof value !== 'object') return null;
      return {
        tokens: normalizeTokens(value.tokens),
        cost: optionalNumber(value.cost),
        requests: numberOr(value.requests, 0),
        sessions: optionalNumber(value.sessions),
        partial: value.partial === true
      };
    }

    function normalizeUsage(value) {
      if (value === null || typeof value !== 'object') {
        return { ok: false, error: 'MISSING', today: null, session: null };
      }
      if (value.ok === false) {
        return {
          ok: false,
          error: typeof value.error === 'string' && value.error !== '' ? value.error : 'PROTOCOL',
          today: null,
          session: null
        };
      }
      return {
        ok: true,
        error: null,
        today: normalizeUsageBlock(value.today),
        session: normalizeUsageBlock(value.session)
      };
    }

    function normalizeState(raw) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
      return {
        version: numberOr(raw.v, 0),
        now: numberOr(raw.now, 0),
        links: normalizeLinks(raw.links),
        balance: normalizeBalance(raw.balance),
        schedule: normalizeSchedule(raw.schedule),
        pricing: normalizePricing(raw.pricing),
        usage: normalizeUsage(raw.usage)
      };
    }

    /* ======================================================================
     * Formatting
     * ==================================================================== */

    function currencySymbol(currency) {
      const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
      if (code === 'CNY' || code === 'RMB') return '¥';
      if (code === 'USD') return '$';
      if (code === 'EUR') return '€';
      return code === '' ? '' : code + ' ';
    }

    function formatDecimalString(value, fractionDigits) {
      const text = String(value).trim();
      const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
      if (match === null) return '—';
      const sign = match[1] === '-' ? '-' : '';
      let fraction = match[3] === undefined ? '' : match[3];
      if (fraction.length < fractionDigits) {
        fraction = fraction + '0'.repeat(fractionDigits - fraction.length);
      } else if (fraction.length > fractionDigits) {
        fraction = fraction.slice(0, fractionDigits);
      }
      return sign + groupInteger(match[2]) + (fractionDigits > 0 ? '.' + fraction : '');
    }

    function formatWalletTotal(wallet) {
      if (wallet === null || wallet === undefined) return '—';
      return currencySymbol(wallet.currency) + formatDecimalString(wallet.total, 2);
    }

    function formatOptionalAmount(value) {
      return value === null || value === undefined ? '—' : formatDecimalString(value, 2);
    }

    function formatCost(value, currency) {
      const symbol = currencySymbol(currency === undefined ? PRIMARY_CURRENCY : currency);
      if (!isFiniteNumber(value)) return '—';
      const sign = value < 0 ? '-' : '';
      const absolute = Math.abs(value);
      if (absolute > 0 && absolute < 0.0001) return sign + '<' + symbol + '0.0001';
      const fixed = absolute.toFixed(4);
      const dot = fixed.indexOf('.');
      const integerPart = fixed.slice(0, dot);
      let fraction = fixed.slice(dot + 1).replace(/0+$/, '');
      if (fraction.length < 2) fraction = (fraction + '00').slice(0, 2);
      return sign + symbol + groupInteger(integerPart) + '.' + fraction;
    }

    function approximateCost(value, currency, t) {
      if (!isFiniteNumber(value)) return '—';
      return t('approx') + formatCost(value, currency);
    }

    function formatTokens(value) {
      if (!isFiniteNumber(value)) return '—';
      const absolute = Math.abs(value);
      if (absolute >= 1000000) return trimNumber(value / 1000000) + 'M';
      if (absolute >= 1000) return trimNumber(value / 1000) + 'K';
      return String(Math.round(value));
    }

    function sumTokens(tokens) {
      if (tokens === null || tokens === undefined) return 0;
      return numberOr(tokens.uncachedInput, 0)
        + numberOr(tokens.cacheRead, 0)
        + numberOr(tokens.cacheWrite, 0)
        + numberOr(tokens.output, 0);
    }

    function cacheHitRate(tokens) {
      if (tokens === null || tokens === undefined) return null;
      const read = numberOr(tokens.cacheRead, 0);
      const total = read + numberOr(tokens.uncachedInput, 0);
      if (total <= 0) return null;
      return Math.round((read / total) * 1000) / 10;
    }

    function formatPercent(value) {
      if (!isFiniteNumber(value)) return '—';
      return trimNumber(value) + '%';
    }

    function formatCountdown(milliseconds) {
      const total = Math.max(0, Math.floor((isFiniteNumber(milliseconds) ? milliseconds : 0) / 1000));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      return pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
    }

    /* ======================================================================
     * Mock-safe: keep optional top-level links available while loading
     * ==================================================================== */

    function resolveLinks(data) {
      const links = data === null || data === undefined ? null : data.links;
      const usageUrl = links === null || links === undefined || links.usageUrl === null ? DEFAULT_USAGE_URL : links.usageUrl;
      const topUpUrl = links === null || links === undefined || links.topUpUrl === null ? DEFAULT_TOP_UP_URL : links.topUpUrl;
      return { usageUrl: usageUrl, topUpUrl: topUpUrl };
    }

    function pickPrimaryWallet(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return null;
      for (let index = 0; index < wallets.length; index += 1) {
        if (wallets[index] !== null && wallets[index].currency === PRIMARY_CURRENCY) return wallets[index];
      }
      return wallets[0];
    }

    /* ======================================================================
     * Peak / off-peak schedule (fixed UTC offset, [start, end) windows)
     * ==================================================================== */

    function wallClock(epochMs, schedule) {
      const offset = schedule !== null && schedule !== undefined && isFiniteNumber(schedule.utcOffsetMinutes)
        ? schedule.utcOffsetMinutes
        : 480;
      const date = new Date(epochMs + offset * 60000);
      const hours = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      const seconds = date.getUTCSeconds();
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();
      return {
        year: year,
        month: month,
        day: day,
        weekday: date.getUTCDay(),
        minutesOfDay: hours * 60 + minutes,
        dateKey: year + '-' + pad2(month) + '-' + pad2(day),
        timeLabel: pad2(hours) + ':' + pad2(minutes),
        timeLabelSeconds: pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds)
      };
    }

    function isHoliday(schedule, dateKey) {
      if (schedule === null || schedule === undefined) return false;
      return schedule.holidays.indexOf(dateKey) >= 0;
    }

    function isPeakDay(schedule, clock) {
      if (schedule.weekdaysOnly && !(clock.weekday >= 1 && clock.weekday <= 5)) return false;
      if (isHoliday(schedule, clock.dateKey)) return false;
      return true;
    }

    function insidePeakWindow(schedule, minutesOfDay) {
      const windows = schedule.windows;
      for (let index = 0; index < windows.length; index += 1) {
        const window = windows[index];
        if (window.start === window.end) continue;
        if (window.start < window.end) {
          if (minutesOfDay >= window.start && minutesOfDay < window.end) return true;
        } else if (minutesOfDay >= window.start || minutesOfDay < window.end) {
          /* start > end wraps midnight: [start, 24h) ∪ [0, end) */
          return true;
        }
      }
      return false;
    }

    function phaseAt(schedule, epochMs) {
      if (schedule === null || schedule === undefined || schedule.windows.length === 0) return 'offpeak';
      const clock = wallClock(epochMs, schedule);
      if (!isPeakDay(schedule, clock)) return 'offpeak';
      return insidePeakWindow(schedule, clock.minutesOfDay) ? 'peak' : 'offpeak';
    }

    /**
     * Earliest instant after `nowMs` whose phase differs from the phase 1ms
     * before it. Scans day boundaries and window boundaries for up to 21 days
     * (a weekly cycle plus holidays). Returns epoch ms or null.
     */
    function computeNextTransition(schedule, nowMs) {
      if (schedule === null || schedule === undefined || schedule.windows.length === 0) return null;
      const offset = isFiniteNumber(schedule.utcOffsetMinutes) ? schedule.utcOffsetMinutes : 480;
      const nowClock = wallClock(nowMs, schedule);
      const baseDay = Date.UTC(nowClock.year, nowClock.month - 1, nowClock.day);
      for (let dayIndex = 0; dayIndex <= 21; dayIndex += 1) {
        const dayStart = baseDay + dayIndex * 86400000 - offset * 60000;
        const candidates = [dayStart, dayStart + 86400000];
        for (let windowIndex = 0; windowIndex < schedule.windows.length; windowIndex += 1) {
          const window = schedule.windows[windowIndex];
          candidates.push(dayStart + window.start * 60000);
          candidates.push(dayStart + window.end * 60000);
        }
        candidates.sort(function (left, right) { return left - right; });
        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
          const candidate = candidates[candidateIndex];
          if (candidate <= nowMs) continue;
          if (phaseAt(schedule, candidate) !== phaseAt(schedule, candidate - 1)) return candidate;
        }
      }
      return null;
    }

    function computePeakInfo(schedule, serverNowMs) {
      if (schedule === null || schedule === undefined) return null;
      const phase = phaseAt(schedule, serverNowMs);
      let transitionAt = null;
      try {
        transitionAt = computeNextTransition(schedule, serverNowMs);
      } catch (error) {
        transitionAt = null;
      }
      return {
        phase: phase,
        transitionAt: transitionAt,
        nextPhase: transitionAt === null ? null : phaseAt(schedule, transitionAt),
        countdownMs: transitionAt === null ? null : Math.max(0, transitionAt - serverNowMs)
      };
    }

    function formatWindows(schedule) {
      if (schedule === null || schedule === undefined || schedule.windows.length === 0) return '—';
      const parts = [];
      for (let index = 0; index < schedule.windows.length; index += 1) {
        parts.push(minutesToClock(schedule.windows[index].start) + '–' + minutesToClock(schedule.windows[index].end));
      }
      return parts.join(', ');
    }

    function formatTransitionClock(epochMs, schedule, nowMs) {
      if (!isFiniteNumber(epochMs)) return '—';
      if (schedule === null || schedule === undefined) return '—';
      const transitionClock = wallClock(epochMs, schedule);
      const nowClock = wallClock(nowMs, schedule);
      if (transitionClock.dateKey === nowClock.dateKey) return transitionClock.timeLabel;
      return pad2(transitionClock.month) + '-' + pad2(transitionClock.day) + ' ' + transitionClock.timeLabel;
    }

    function formatInstant(epochMs, schedule, withSeconds) {
      if (!isFiniteNumber(epochMs) || epochMs <= 0) return '—';
      if (schedule !== null && schedule !== undefined) {
        const clock = wallClock(epochMs, schedule);
        return withSeconds ? clock.timeLabelSeconds : clock.timeLabel;
      }
      const date = new Date(epochMs);
      return pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + (withSeconds ? ':' + pad2(date.getSeconds()) : '');
    }

    /* ======================================================================
     * Data fetching (component-local fetch + polling + AbortController)
     * ==================================================================== */

    /** Fetch and decode one JSON state response, carrying its HTTP status on failures. */
    async function fetchJson(url, signal) {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        signal: signal
      });
      if (!response.ok) {
        const httpError = new Error('DeepSeek usage state HTTP ' + response.status);
        httpError.code = 'HTTP_ERROR';
        httpError.status = response.status;
        throw httpError;
      }
      return response.json();
    }

    /**
     * Read the shared state object. Prefers the Host's exact route below Connection's
     * authenticated `/api` channel; when that route is unavailable it falls back to the
     * same-origin fenced route. Both return the identical JSON state object.
     */
    async function readState(ctx, options, signal) {
      const sessionId = options === null || options === undefined ? null : options.sessionId;
      const refresh = options !== null && options !== undefined && options.refresh === true;
      const query = new URLSearchParams();
      if (typeof sessionId === 'string' && sessionId !== '') query.set('sessionId', sessionId);
      if (refresh) query.set('refresh', '1');
      const queryText = query.toString();
      const suffix = queryText === '' ? '' : '?' + queryText;

      // Preferred: the Host registers an exact route below Connection's authenticated /api
      // channel, so the browser's session cookie authenticates the request.
      if (Date.now() >= authenticatedRouteRetryAt) {
        try {
          return await fetchJson(AUTH_ROUTE_PATH + suffix, signal);
        } catch (authError) {
          if (authError !== null && authError !== undefined && authError.name === 'AbortError') throw authError;
          const status = authError !== null && authError !== undefined ? authError.status : undefined;
          // An unauthenticated peer will not become authenticated by retrying often: back off
          // longer for 401/403; missing routes (reload races) retry after a minute.
          authenticatedRouteRetryAt = Date.now() + (status === 401 || status === 403 ? 300_000 : 60_000);
          /* Fall through to the same-origin fenced route. */
        }
      }

      // Fallback: the exact same-origin route, fenced to loopback/own-origin Host headers.
      return fetchJson(ROUTE_PATH + suffix, signal);
    }

    function describeFetchError(error) {
      if (error !== null && error !== undefined && error.code === 'HTTP_ERROR') {
        return { code: 'HTTP_ERROR', message: error.message === undefined ? '' : String(error.message) };
      }
      if (error !== null && error !== undefined && error.name === 'SyntaxError') {
        return { code: 'PROTOCOL', message: 'invalid JSON' };
      }
      return {
        code: 'NETWORK',
        message: error !== null && error !== undefined && error.message !== undefined ? String(error.message) : 'network error'
      };
    }

    function useRemoteState(ctx, sessionId) {
      const [state, setState] = React.useState({
        status: 'loading',
        data: null,
        error: null,
        fetchedAt: 0,
        serverOffset: 0,
        refreshing: false
      });
      const abortRef = React.useRef(null);
      const mountedRef = React.useRef(true);
      const id = typeof sessionId === 'string' && sessionId !== '' ? sessionId : null;

      const load = React.useCallback(function load(forceRefresh, manual) {
        const controller = new AbortController();
        if (abortRef.current !== null) abortRef.current.abort();
        abortRef.current = controller;
        setState(function (previous) {
          return {
            status: previous.data === null ? 'loading' : previous.status,
            data: previous.data,
            error: previous.error,
            fetchedAt: previous.fetchedAt,
            serverOffset: previous.serverOffset,
            refreshing: manual === true
          };
        });
        readState(ctx, { sessionId: id, refresh: forceRefresh === true }, controller.signal).then(function (raw) {
          if (controller.signal.aborted || !mountedRef.current) return;
          const receivedAt = Date.now();
          const data = normalizeState(raw);
          if (data === null) {
            const protocolError = new Error('invalid state payload');
            protocolError.code = 'PROTOCOL';
            throw protocolError;
          }
          const serverOffset = isFiniteNumber(raw.now) && raw.now > 0 ? raw.now - receivedAt : 0;
          setState({
            status: 'ready',
            data: data,
            error: null,
            fetchedAt: receivedAt,
            serverOffset: serverOffset,
            refreshing: false
          });
        }).catch(function (error) {
          if (controller.signal.aborted || !mountedRef.current) return;
          if (error !== null && error !== undefined && error.name === 'AbortError') return;
          const described = describeFetchError(error);
          setState(function (previous) {
            return {
              status: previous.data === null ? 'error' : 'ready',
              data: previous.data,
              error: described,
              fetchedAt: previous.fetchedAt,
              serverOffset: previous.serverOffset,
              refreshing: false
            };
          });
        });
      }, [ctx, id]);

      React.useEffect(function () {
        mountedRef.current = true;
        load(false, false);
        const timer = setInterval(function () {
          load(false, false);
        }, POLL_MS);
        return function () {
          mountedRef.current = false;
          clearInterval(timer);
          if (abortRef.current !== null) abortRef.current.abort();
        };
      }, [load]);

      const refresh = React.useCallback(function refresh() {
        load(true, true);
      }, [load]);

      return { state: state, refresh: refresh };
    }

    function useTicker() {
      const [now, setNow] = React.useState(function () { return Date.now(); });
      React.useEffect(function () {
        const timer = setInterval(function () {
          setNow(Date.now());
        }, TICK_MS);
        return function () {
          clearInterval(timer);
        };
      }, []);
      return now;
    }

    function useLocaleRevision(locale) {
      const subscribe = React.useCallback(function subscribeToLocale(onStoreChange) {
        return locale.subscribe(onStoreChange);
      }, [locale]);
      const getSnapshot = React.useCallback(function getLocaleSnapshot() {
        return locale.getSnapshot().revision;
      }, [locale]);
      return React.useSyncExternalStore(subscribe, getSnapshot);
    }

    /* ======================================================================
     * Shared small components
     * ==================================================================== */

    function ActionButton(props) {
      const [hovered, setHovered] = React.useState(false);
      const [focusVisible, setFocusVisible] = React.useState(false);
      const style = Object.assign({}, props.baseStyle === undefined ? null : props.baseStyle);
      if (props.active === true || (hovered && props.disabled !== true)) {
        if (props.hoverStyle !== undefined) Object.assign(style, props.hoverStyle);
      }
      if (focusVisible) {
        style.outline = '2px solid ' + C.stateBusiness;
        style.outlineOffset = '2px';
      }
      if (props.disabled === true) {
        style.opacity = 0.6;
        style.cursor = 'default';
      }
      const buttonProps = {
        type: 'button',
        style: style,
        onClick: props.onClick,
        onMouseEnter: function () { setHovered(true); },
        onMouseLeave: function () { setHovered(false); },
        onFocus: function (event) {
          const target = event === null || event === undefined ? null : event.currentTarget;
          let nextVisible = true;
          try {
            nextVisible = target !== null && typeof target.matches === 'function' ? target.matches(':focus-visible') : true;
          } catch (error) {
            nextVisible = true;
          }
          setFocusVisible(nextVisible);
        },
        onBlur: function () { setFocusVisible(false); }
      };
      if (props.disabled === true) buttonProps.disabled = true;
      if (props.title !== undefined) buttonProps.title = props.title;
      if (props.ariaLabel !== undefined) buttonProps['aria-label'] = props.ariaLabel;
      if (props.ariaExpanded !== undefined) buttonProps['aria-expanded'] = props.ariaExpanded;
      if (props.ariaControls !== undefined) buttonProps['aria-controls'] = props.ariaControls;
      return h('button', buttonProps, props.children);
    }

    /* ======================================================================
     * Shared render helpers
     * ==================================================================== */

    function panelRow(label, value, options) {
      const settings = options === undefined ? null : options;
      const rowStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '12px',
        minHeight: '18px'
      };
      const labelStyle = { color: C.labelSecondary, flex: 'none' };
      const valueStyle = {
        color: C.labelPrimary,
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        wordBreak: 'break-word'
      };
      if (settings !== null && settings.labelStyle !== undefined) Object.assign(labelStyle, settings.labelStyle);
      if (settings !== null && settings.valueStyle !== undefined) Object.assign(valueStyle, settings.valueStyle);
      return h('div', { key: settings === null ? undefined : settings.key, style: rowStyle },
        h('span', { style: labelStyle }, label),
        h('span', { style: valueStyle }, value));
    }

    function panelTitle(text) {
      return h('div', {
        style: {
          color: C.labelTertiary,
          fontSize: '11px',
          lineHeight: '16px',
          fontWeight: 600
        }
      }, text);
    }

    function separator(key) {
      return h('span', { key: key, styles: undefined, style: { color: C.labelTertiary, margin: '0 1px' } }, '·');
    }

    function divider(key) {
      return h('div', { key: key, style: { borderTop: '0.5px solid ' + C.borderL1, margin: '2px 0' } });
    }

    function stateBadge(phase, t, extraStyle) {
      const isPeak = phase === 'peak';
      const style = Object.assign({
        color: isPeak ? C.stateWarn : C.stateSuccess,
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }, extraStyle === undefined ? null : extraStyle);
      return h('span', { style: style }, t(isPeak ? 'peakName' : 'offPeakName'));
    }

    function stateLabel(phase, t) {
      return t(phase === 'peak' ? 'peakState' : 'offPeakState');
    }

    function externalLink(href, text) {
      return h('a', { href: href, target: '_blank', rel: 'noreferrer', style: LINK_STYLE }, text);
    }

    function errorText(error, t) {
      if (error === null || error === undefined) return t('unknown');
      if (error.code === 'NO_CREDENTIAL') return t('errorNoCredential');
      if (error.code === 'HTTP_ERROR') return t('errorHttp') + (error.message === '' ? '' : ' (' + error.message + ')');
      if (error.code === 'NETWORK') return t('errorNetwork');
      if (error.code === 'PROTOCOL') return t('errorProtocol');
      if (error.code === 'ACCOUNT_ERROR') return t('errorAccount');
      return t('balanceError') + (error.message === '' ? '' : ': ' + error.message);
    }

    function usageUnavailableText(usage, t) {
      if (usage === null || usage === undefined) return t('usageUnavailable');
      const detail = typeof usage.error === 'string' && usage.error !== '' ? ' (' + usage.error + ')' : '';
      return t('usageUnavailable') + detail;
    }

    function pricingTable(pricing, schedule, peakInfo, t) {
      if (pricing === null || pricing === undefined) {
        return h('div', { style: MUTED_STYLE }, t('unknown'));
      }
      const peakPhase = peakInfo !== null && peakInfo !== undefined ? peakInfo.phase : null;
      const offPeakMultiplier = schedule !== null && schedule !== undefined && isFiniteNumber(schedule.offPeakMultiplier)
        ? schedule.offPeakMultiplier
        : 0.5;
      const headCellStyle = {
        padding: '2px 4px',
        borderBottom: '0.5px solid ' + C.borderL1,
        color: C.labelTertiary,
        fontSize: '11px',
        fontWeight: 500,
        textAlign: 'right'
      };
      const headFirstCellStyle = Object.assign({}, headCellStyle, { textAlign: 'left' });
      const modelRowStyle = {
        padding: '4px 4px 1px 4px',
        color: C.labelPrimary,
        fontWeight: 600,
        textAlign: 'left'
      };
      const priceLabelStyle = {
        padding: '1px 4px',
        fontWeight: 400,
        textAlign: 'left',
        color: C.labelSecondary,
        whiteSpace: 'nowrap'
      };
      const priceCellStyle = {
        padding: '1px 4px',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        color: C.labelPrimary,
        whiteSpace: 'nowrap'
      };
      const rows = [
        h('thead', { key: 'head' },
          h('tr', null,
            h('th', { style: headFirstCellStyle }, t('model')),
            h('th', { style: headCellStyle }, t('priceCacheHit')),
            h('th', { style: headCellStyle }, t('priceCacheMiss')),
            h('th', { style: headCellStyle }, t('priceOutput'))))
      ];
      const bodyRows = [];
      for (let index = 0; index < pricing.models.length; index += 1) {
        const model = pricing.models[index];
        const offPeak = model.offPeak !== null && model.offPeak !== undefined
          ? model.offPeak
          : {
            cacheHit: isFiniteNumber(model.peak.cacheHit) ? model.peak.cacheHit * offPeakMultiplier : null,
            cacheMiss: isFiniteNumber(model.peak.cacheMiss) ? model.peak.cacheMiss * offPeakMultiplier : null,
            output: isFiniteNumber(model.peak.output) ? model.peak.output * offPeakMultiplier : null
          };
        const peakLabelStyle = Object.assign({}, priceLabelStyle, {
          color: peakPhase === 'peak' ? C.stateWarnLabel : C.labelSecondary
        });
        const offPeakLabelStyle = Object.assign({}, priceLabelStyle, {
          color: peakPhase === 'offpeak' ? C.stateSuccess : C.labelSecondary
        });
        bodyRows.push(h('tr', { key: 'model-' + model.key },
          h('th', { scope: 'row', colSpan: 4, style: modelRowStyle }, model.name)));
        bodyRows.push(h('tr', { key: 'peak-' + model.key },
          h('th', { scope: 'row', style: peakLabelStyle }, t('peakPrice')),
          h('td', { style: priceCellStyle }, formatCost(model.peak.cacheHit, pricing.currency)),
          h('td', { style: priceCellStyle }, formatCost(model.peak.cacheMiss, pricing.currency)),
          h('td', { style: priceCellStyle }, formatCost(model.peak.output, pricing.currency))));
        bodyRows.push(h('tr', { key: 'offpeak-' + model.key },
          h('th', { scope: 'row', style: offPeakLabelStyle }, t('offPeakPrice')),
          h('td', { style: priceCellStyle }, formatCost(offPeak.cacheHit, pricing.currency)),
          h('td', { style: priceCellStyle }, formatCost(offPeak.cacheMiss, pricing.currency)),
          h('td', { style: priceCellStyle }, formatCost(offPeak.output, pricing.currency))));
      }
      rows.push(h('tbody', { key: 'body' }, bodyRows));
      return h('table', {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
          lineHeight: '17px'
        }
      }, rows);
    }

    function pricingNotes(pricing, schedule, t) {
      const notes = [];
      if (pricing !== null && pricing !== undefined) {
        notes.push(t('unitPerMillion', { currency: pricing.currency }));
      }
      if (schedule !== null && schedule !== undefined) {
        notes.push(t('peakMultiplierText', { multiplier: schedule.peakMultiplier })
          + ' · ' + t('offPeakMultiplierText', { multiplier: schedule.offPeakMultiplier }));
      }
      return notes;
    }

    function usageBreakdownRows(tokens, t, keyPrefix) {
      return [
        panelRow(t('inputUncached'), formatTokens(numberOr(tokens.uncachedInput, 0)), { key: keyPrefix + '-uncached' }),
        panelRow(t('cacheRead'), formatTokens(numberOr(tokens.cacheRead, 0)), { key: keyPrefix + '-read' }),
        panelRow(t('cacheWrite'), formatTokens(numberOr(tokens.cacheWrite, 0)), { key: keyPrefix + '-write' }),
        panelRow(t('output'), formatTokens(numberOr(tokens.output, 0)), { key: keyPrefix + '-output' })
      ];
    }

    /* ======================================================================
     * Dock badge (compact pill + inline expanded panel)
     * ==================================================================== */

    function dockBalanceText(data, status, t) {
      if (data === null || data === undefined) {
        return status === 'error' ? t('balanceErrorShort') : t('balanceLoading');
      }
      if (data.balance === null || data.balance.ok !== true) return t('balanceFailedShort');
      const wallet = pickPrimaryWallet(data.balance.wallets);
      if (wallet === null) return t('balanceFailedShort');
      return t('balance') + ' ' + formatWalletTotal(wallet);
    }

    function dockPeakParts(peakInfo, t) {
      if (peakInfo === null || peakInfo === undefined) return { badge: null, countdown: null };
      return {
        badge: stateBadge(peakInfo.phase, t),
        countdown: peakInfo.countdownMs === null ? null : formatCountdown(peakInfo.countdownMs)
      };
    }

    function renderDockBalanceSection(data, fetchedAt, t, children) {
      children.push(panelTitle(t('balance')));
      if (data.balance === null || data === undefined || data.balance.ok !== true) {
        children.push(h('div', { key: 'balance-unavailable', style: { color: C.stateError } },
          t('balanceUnavailable') + ': ' + errorText(data.balance === null || data.balance === undefined ? null : data.balance.error, t)));
      } else {
        const wallets = data.balance.wallets;
        if (wallets.length === 0) {
          children.push(panelRow(t('total'), '—', { key: 'wallet-empty' }));
        } else {
          for (let index = 0; index < wallets.length; index += 1) {
            const wallet = wallets[index];
            const suffix = wallets.length > 1 ? ' · ' + wallet.currency : '';
            children.push(panelRow(t('total') + suffix, formatWalletTotal(wallet), { key: 'wallet-total-' + index }));
            children.push(panelRow(t('granted') + suffix, formatOptionalAmount(wallet.granted), { key: 'wallet-granted-' + index }));
            children.push(panelRow(t('toppedUp') + suffix, formatOptionalAmount(wallet.toppedUp), { key: 'wallet-topup-' + index }));
          }
        }
        children.push(panelRow(t('source'), data.balance.source === 'account' ? t('sourceAccount') : t('sourceApiKey'), { key: 'balance-source' }));
        children.push(panelRow(t('updated'), formatInstant(data.balance.fetchedAt > 0 ? data.balance.fetchedAt : fetchedAt, data.schedule, true), { key: 'balance-updated' }));
      }
    }

    function renderDockUsageSections(data, sessionId, t, children) {
      const pricingCurrency = data.pricing !== null && data.pricing !== undefined ? data.pricing.currency : PRIMARY_CURRENCY;
      const usage = data.usage;
      children.push(divider('usage-divider'));
      children.push(panelTitle(t('todayUsage')));
      if (usage === null || usage === undefined || usage.ok !== true) {
        children.push(h('div', { key: 'usage-unavailable', style: { color: C.stateError } }, usageUnavailableText(usage, t)));
        children.push(h('div', { key: 'usage-unavailable-hint', style: HINT_STYLE }, t('usageErrorHint')));
      } else if (usage.today === null) {
        children.push(panelRow(t('cost'), '—', { key: 'today-cost' }));
        children.push(panelRow(t('tokens'), '—', { key: 'today-tokens' }));
      } else {
        const today = usage.today;
        children.push(panelRow(t('cost'), approximateCost(today.cost, pricingCurrency, t), { key: 'today-cost' }));
        children.push(panelRow(t('tokens'), formatTokens(sumTokens(today.tokens)), { key: 'today-tokens' }));
        children.push(panelRow(t('requests'), String(Math.round(today.requests)), { key: 'today-requests' }));
        children.push(panelRow(t('sessions'), String(Math.round(numberOr(today.sessions, 0))), { key: 'today-sessions' }));
        children.push(panelRow(t('cacheHitRate'), formatPercent(cacheHitRate(today.tokens)), { key: 'today-cache' }));
        if (today.partial) {
          children.push(h('div', { key: 'today-partial', style: { color: C.stateWarnLabel } }, t('partial')));
        }
      }
      if (typeof sessionId === 'string' && sessionId !== '') {
        children.push(divider('session-divider'));
        children.push(panelTitle(t('sessionUsage')));
        if (usage === null || usage === undefined || usage.ok !== true) {
          children.push(h('div', { key: 'session-unavailable', style: { color: C.stateError } }, usageUnavailableText(usage, t)));
        } else if (usage.session === null) {
          children.push(panelRow(t('cost'), '—', { key: 'session-cost' }));
          children.push(panelRow(t('tokens'), '—', { key: 'session-tokens' }));
          children.push(h('div', { key: 'session-hint', style: HINT_STYLE }, t('usageErrorHint')));
        } else {
          const session = usage.session;
          children.push(panelRow(t('cost'), approximateCost(session.cost, pricingCurrency, t), { key: 'session-cost' }));
          children.push(panelRow(t('tokens'), formatTokens(sumTokens(session.tokens)), { key: 'session-tokens' }));
          children.push(panelRow(t('requests'), String(Math.round(session.requests)), { key: 'session-requests' }));
          children.push(panelRow(t('cacheHitRate'), formatPercent(cacheHitRate(session.tokens)), { key: 'session-cache' }));
        }
      }
    }

    function renderDockScheduleSection(data, serverNow, peakInfo, t, children) {
      const schedule = data.schedule;
      children.push(divider('schedule-divider'));
      children.push(panelTitle(t('schedule')));
      if (schedule === null || schedule === undefined || peakInfo === null) {
        children.push(panelRow(t('peakState'), t('unknown'), { key: 'peak-unknown' }));
        return;
      }
      const countdownText = peakInfo.countdownMs === null ? '—' : formatCountdown(peakInfo.countdownMs);
      children.push(h('div', {
        key: 'peak-banner',
        style: {
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px'
        }
      },
        h('span', { style: { color: peakInfo.phase === 'peak' ? C.stateWarn : C.stateSuccess, fontWeight: 600 } }, stateLabel(peakInfo.phase, t)),
        h('span', { style: { color: C.labelSecondary, fontVariantNumeric: 'tabular-nums' } }, t('inDuration', { duration: countdownText }))));
      const nextPhaseText = peakInfo.nextPhase === null ? '' : ' · ' + t(peakInfo.nextPhase === 'peak' ? 'peakName' : 'offPeakName');
      children.push(panelRow(t('nextTransition'),
        formatTransitionClock(peakInfo.transitionAt, schedule, serverNow) + nextPhaseText,
        { key: 'peak-next' }));
      children.push(panelRow(t('schedule'), formatWindows(schedule) + ' · ' + (schedule.weekdaysOnly ? t('weekdaysOnly') : t('everyDay')), { key: 'peak-windows' }));
      children.push(panelRow(t('timezone'), schedule.timezone, { key: 'peak-timezone' }));
      if (schedule.holidays.length > 0) {
        children.push(panelRow(t('schedule'), t('holidaysCount', { count: schedule.holidays.length }), { key: 'peak-holidays' }));
      }
      children.push(panelRow(t('serverTime'), wallClock(serverNow, schedule).timeLabelSeconds, { key: 'peak-server-time' }));
      if (schedule.note !== null) {
        children.push(h('div', { key: 'peak-note', style: HINT_STYLE }, schedule.note));
      }
    }

    function renderDockPricingSection(data, peakInfo, t, children) {
      children.push(divider('pricing-divider'));
      children.push(panelTitle(t('pricing')));
      children.push(pricingTable(data.pricing, data.schedule, peakInfo, t));
      const notes = pricingNotes(data.pricing, data.schedule, t);
      for (let index = 0; index < notes.length; index += 1) {
        children.push(h('div', { key: 'pricing-note-' + index, style: HINT_STYLE }, notes[index]));
      }
    }

    function renderDockFooter(data, t, refreshing, onRefresh, children) {
      const links = resolveLinks(data);
      children.push(divider('footer-divider'));
      children.push(h('div', {
        key: 'footer-actions',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap'
        }
      },
        h(ActionButton, {
          key: 'refresh',
          baseStyle: SMALL_BUTTON_STYLE,
          hoverStyle: SMALL_BUTTON_HOVER_STYLE,
          disabled: refreshing,
          onClick: onRefresh,
          ariaLabel: t('refresh')
        }, refreshing ? t('refreshing') : t('refresh')),
        externalLink(links.usageUrl, t('platformUsage')),
        externalLink(links.topUpUrl, t('platformTopUp'))));
      children.push(h('div', { key: 'footer-footnote', style: HINT_STYLE }, t('localEstimate')));
    }

    function renderDockPanel(options) {
      const data = options.data;
      const children = [];
      if (data === null || data === undefined) {
        if (options.status === 'error') {
          children.push(h('div', { key: 'panel-error', role: 'alert', style: { color: C.stateError } },
            options.t('balanceError') + ': ' + errorText(options.error, options.t)));
          children.push(h('div', {
            key: 'panel-error-actions',
            style: { display: 'flex', gap: '8px', marginTop: '2px' }
          }, h(ActionButton, {
            baseStyle: SMALL_BUTTON_STYLE,
            hoverStyle: SMALL_BUTTON_HOVER_STYLE,
            onClick: options.onRefresh,
            disabled: options.refreshing
          }, options.refreshing ? options.t('refreshing') : options.t('retry'))));
        } else {
          children.push(h('div', { key: 'panel-loading', role: 'status', style: MUTED_STYLE }, options.t('loading')));
        }
      } else {
        if (options.error !== null) {
          children.push(h('div', { key: 'panel-stale', style: { color: C.stateWarnLabel } }, options.t('refreshFailed')));
        }
        renderDockBalanceSection(data, options.fetchedAt, options.t, children);
        renderDockUsageSections(data, options.sessionId, options.t, children);
        renderDockScheduleSection(data, options.serverNow, options.peakInfo, options.t, children);
        renderDockPricingSection(data, options.peakInfo, options.t, children);
        renderDockFooter(data, options.t, options.refreshing, options.onRefresh, children);
      }
      return h('div', {
        id: options.panelId,
        role: 'region',
        'aria-label': options.t('title'),
        style: PANEL_STYLE
      }, children);
    }

    /* ======================================================================
     * Settings page cards
     * ==================================================================== */

    function settingsCard(title, action, children, key) {
      return h('div', { key: key, style: CARD_STYLE },
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }
        },
          h('h3', {
            style: {
              margin: 0,
              fontSize: '13px',
              fontWeight: 600,
              lineHeight: '22px',
              color: C.labelPrimary
            }
          }, title),
          action === null || action === undefined ? null : action),
        h('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }
        }, children));
    }

    function renderSettingsBalanceCard(options) {
      const data = options.data;
      const t = options.t;
      const action = h(ActionButton, {
        baseStyle: SMALL_BUTTON_STYLE,
        hoverStyle: SMALL_BUTTON_HOVER_STYLE,
        disabled: options.refreshing,
        onClick: options.onRefresh,
        ariaLabel: t('refresh')
      }, options.refreshing ? t('refreshing') : t('refresh'));
      const children = [];
      if (data === null || data === undefined) {
        if (options.status === 'error') {
          children.push(h('div', { key: 'error', role: 'alert', style: { color: C.stateError } },
            t('balanceError') + ': ' + errorText(options.error, t)));
          children.push(h('div', { key: 'retry', style: { display: 'flex', gap: '8px' } },
            h(ActionButton, {
              baseStyle: SMALL_BUTTON_STYLE,
              hoverStyle: SMALL_BUTTON_HOVER_STYLE,
              onClick: options.onRefresh,
              disabled: options.refreshing
            }, options.refreshing ? t('refreshing') : t('retry'))));
        } else {
          children.push(h('div', { key: 'loading', role: 'status', style: MUTED_STYLE }, t('loading')));
        }
      } else if (data.balance === null || data.balance === undefined || data.balance.ok !== true) {
        children.push(h('div', { key: 'unavailable', style: { color: C.stateError } },
          t('balanceUnavailable') + ': ' + errorText(data.balance === null || data.balance === undefined ? null : data.balance.error, t)));
      } else {
        if (options.error !== null) {
          children.push(h('div', { key: 'stale', style: { color: C.stateWarnLabel } }, t('refreshFailed')));
        }
        const wallets = data.balance.wallets;
        if (wallets.length === 0) {
          children.push(panelRow(t('total'), '—', { key: 'wallet-empty' }));
        } else {
          for (let index = 0; index < wallets.length; index += 1) {
            const wallet = wallets[index];
            const suffix = wallets.length > 1 ? ' · ' + wallet.currency : '';
            children.push(panelRow(t('total') + suffix, formatWalletTotal(wallet), {
              key: 'wallet-total-' + index,
              valueStyle: { fontSize: '18px', lineHeight: '26px', fontWeight: 500 }
            }));
            children.push(panelRow(t('granted') + suffix, formatOptionalAmount(wallet.granted), { key: 'wallet-granted-' + index }));
            children.push(panelRow(t('toppedUp') + suffix, formatOptionalAmount(wallet.toppedUp), { key: 'wallet-topup-' + index }));
          }
        }
        children.push(panelRow(t('source'), data.balance.source === 'account' ? t('sourceAccount') : t('sourceApiKey'), { key: 'source' }));
        children.push(panelRow(t('updated'), formatInstant(data.balance.fetchedAt > 0 ? data.balance.fetchedAt : options.fetchedAt, data.schedule, true), { key: 'updated' }));
      }
      return settingsCard(t('balance'), action, children, 'balance-card');
    }

    function renderSettingsScheduleCard(options) {
      const data = options.data;
      const t = options.t;
      const children = [];
      const schedule = data !== null && data !== undefined ? data.schedule : null;
      const peakInfo = options.peakInfo;
      if (schedule === null || peakInfo === null) {
        children.push(panelRow(t('peakState'), t('unknown'), { key: 'unknown' }));
        return settingsCard(t('schedule'), null, children, 'schedule-card');
      }
      const countdownText = peakInfo.countdownMs === null ? '—' : formatCountdown(peakInfo.countdownMs);
      children.push(h('div', {
        key: 'banner',
        style: {
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }
      },
        h('span', { style: { color: peakInfo.phase === 'peak' ? C.stateWarn : C.stateSuccess, fontWeight: 600, fontSize: '13px' } }, stateLabel(peakInfo.phase, t)),
        h('span', { style: { color: C.labelPrimary, fontVariantNumeric: 'tabular-nums', fontSize: '15px', fontWeight: 500, lineHeight: '24px' } }, countdownText)));
      const nextPhaseText = peakInfo.nextPhase === null ? '' : ' · ' + t(peakInfo.nextPhase === 'peak' ? 'peakName' : 'offPeakName');
      children.push(panelRow(t('nextTransition'),
        formatTransitionClock(peakInfo.transitionAt, schedule, options.serverNow) + nextPhaseText,
        { key: 'next' }));
      children.push(panelRow(t('inDuration'), countdownText, { key: 'duration' }));
      children.push(panelRow(t('schedule'), formatWindows(schedule), { key: 'windows' }));
      children.push(panelRow(t('timezone'), schedule.timezone, { key: 'timezone' }));
      children.push(panelRow(t('weekdaysOnly'), schedule.weekdaysOnly ? t('weekdaysOnly') : t('everyDay'), { key: 'weekdays' }));
      if (schedule.holidays.length > 0) {
        children.push(panelRow(t('schedule'), t('holidaysCount', { count: schedule.holidays.length }), { key: 'holidays' }));
      }
      children.push(panelRow(t('serverTime'), wallClock(options.serverNow, schedule).timeLabelSeconds, { key: 'server-time' }));
      if (schedule.note !== null) {
        children.push(h('div', { key: 'note', style: HINT_STYLE }, schedule.note));
      }
      return settingsCard(t('schedule'), null, children, 'schedule-card');
    }

    function renderSettingsUsageCard(options) {
      const data = options.data;
      const t = options.t;
      const children = [];
      if (data === null || data === undefined) {
        children.push(h('div', { key: 'loading', role: 'status', style: MUTED_STYLE }, t('loading')));
        return settingsCard(t('todayUsage'), null, children, 'usage-card');
      }
      const usage = data.usage;
      if (usage === null || usage === undefined || usage.ok !== true) {
        children.push(h('div', { key: 'unavailable', style: { color: C.stateError } }, usageUnavailableText(usage, t)));
      } else if (usage.today === null) {
        children.push(panelRow(t('cost'), '—', { key: 'cost' }));
      } else {
        const today = usage.today;
        const currency = data.pricing !== null && data.pricing !== undefined ? data.pricing.currency : PRIMARY_CURRENCY;
        children.push(panelRow(t('cost'), approximateCost(today.cost, currency, t), {
          key: 'cost',
          valueStyle: { fontSize: '15px', lineHeight: '22px', fontWeight: 500 }
        }));
        children.push(panelRow(t('tokens'), formatTokens(sumTokens(today.tokens)), { key: 'tokens' }));
        children.push(panelRow(t('requests'), String(Math.round(today.requests)), { key: 'requests' }));
        children.push(panelRow(t('sessions'), String(Math.round(numberOr(today.sessions, 0))), { key: 'sessions' }));
        children.push(panelRow(t('cacheHitRate'), formatPercent(cacheHitRate(today.tokens)), { key: 'cache' }));
        if (today.partial) {
          children.push(h('div', { key: 'partial', style: { color: C.stateWarnLabel } }, t('partial')));
        }
        const breakdown = usageBreakdownRows(today.tokens, t, 'today');
        for (let index = 0; index < breakdown.length; index += 1) children.push(breakdown[index]);
      }
      children.push(h('div', { key: 'hint', style: { color: C.labelTertiary, fontSize: '12px', lineHeight: '18px' } }, t('sessionHint')));
      return settingsCard(t('todayUsage'), null, children, 'usage-card');
    }

    function renderSettingsPricingCard(options) {
      const data = options.data;
      const t = options.t;
      const children = [];
      children.push(pricingTable(data === null || data === undefined ? null : data.pricing, data === null || data === undefined ? null : data.schedule, options.peakInfo, t));
      if (data !== null && data !== undefined) {
        const notes = pricingNotes(data.pricing, data.schedule, t);
        for (let index = 0; index < notes.length; index += 1) {
          children.push(h('div', { key: 'note-' + index, style: HINT_STYLE }, notes[index]));
        }
      }
      return settingsCard(t('pricing'), null, children, 'pricing-card');
    }

    /* ======================================================================
     * Component factories (bound to t + locale for the registration lifetime)
     * ==================================================================== */

    function createComponents(ctx, t, locale) {
      function DockBadge(props) {
        useLocaleRevision(locale);
        const sessionId = props !== null && props !== undefined && typeof props.sessionId === 'string' ? props.sessionId : null;
        const remote = useRemoteState(ctx, sessionId);
        const now = useTicker();
        const [expanded, setExpanded] = React.useState(false);
        const panelIdRef = React.useRef(null);
        if (panelIdRef.current === null) {
          panelIdRef.current = 'deepseek-usage-dock-' + Math.random().toString(36).slice(2);
        }
        const state = remote.state;
        const data = state.data;
        const serverNow = now + state.serverOffset;
        const schedule = data !== null && data !== undefined ? data.schedule : null;
        const peakInfo = computePeakInfo(schedule, serverNow);
        const balanceText = dockBalanceText(data, state.status, t);
        const today = data !== null && data !== undefined && data.usage !== null && data.usage !== undefined && data.usage.ok === true ? data.usage.today : null;
        const session = data !== null && data !== undefined && data.usage !== null && data.usage !== undefined && data.usage.ok === true ? data.usage.session : null;
        const currency = data !== null && data !== undefined && data.pricing !== null && data.pricing !== undefined ? data.pricing.currency : PRIMARY_CURRENCY;
        const todayText = today !== null && today !== undefined && isFiniteNumber(today.cost)
          ? t('todayShort') + ' ' + approximateCost(today.cost, currency, t)
          : null;
        const sessionText = session !== null && session !== undefined && isFiniteNumber(session.cost)
          ? t('sessionShort') + ' ' + approximateCost(session.cost, currency, t)
          : null;
        const peakParts = dockPeakParts(peakInfo, t);
        const summaryParts = [balanceText];
        if (peakParts.badge !== null) summaryParts.push(t(peakInfo.phase === 'peak' ? 'peakName' : 'offPeakName'));
        if (todayText !== null) summaryParts.push(todayText);
        if (sessionText !== null) summaryParts.push(sessionText);
        const summaryText = summaryParts.join(' · ');
        const countdownTitle = peakInfo !== null && peakInfo.countdownMs !== null
          ? t('nextTransition') + ' ' + formatTransitionClock(peakInfo.transitionAt, schedule, serverNow) + ' · ' + t('inDuration', { duration: formatCountdown(peakInfo.countdownMs) })
          : summaryText;
        const children = [
          h('span', {
            key: 'dot',
            'aria-hidden': true,
            style: {
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              flex: 'none',
              background: data !== null && data !== undefined && data.balance !== null && data.balance.ok === true
                ? C.stateSuccess
                : C.stateWarn
            }
          }),
          h('span', { key: 'balance', style: { color: C.labelSecondary } }, balanceText)
        ];
        if (peakParts.badge !== null) {
          children.push(separator('sep-1'));
          children.push(h('span', { key: 'peak', title: countdownTitle }, peakParts.badge));
        }
        if (todayText !== null) {
          children.push(separator('sep-2'));
          children.push(h('span', { key: 'today' }, todayText));
        }
        if (sessionText !== null) {
          children.push(separator('sep-3'));
          children.push(h('span', { key: 'session' }, sessionText));
        }
        return h('div', {
          style: {
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            minWidth: 0,
            maxWidth: '100%'
          }
        },
          h(ActionButton, {
            key: 'pill',
            baseStyle: PILL_STYLE,
            hoverStyle: PILL_HOVER_STYLE,
            active: expanded,
            onClick: function () { setExpanded(!expanded); },
            title: summaryText + (peakInfo !== null && peakInfo.countdownMs !== null ? ' · ' + countdownTitle : ''),
            ariaLabel: summaryText,
            ariaExpanded: expanded,
            ariaControls: panelIdRef.current
          }, children),
          expanded ? renderDockPanel({
            panelId: panelIdRef.current,
            data: data,
            status: state.status,
            error: state.error,
            fetchedAt: state.fetchedAt,
            refreshing: state.refreshing,
            onRefresh: remote.refresh,
            serverNow: serverNow,
            peakInfo: peakInfo,
            sessionId: sessionId,
            t: t
          }) : null);
      }

      function SettingsPage() {
        useLocaleRevision(locale);
        const remote = useRemoteState(ctx, null);
        const now = useTicker();
        const state = remote.state;
        const data = state.data;
        const serverNow = now + state.serverOffset;
        const peakInfo = computePeakInfo(data !== null && data !== undefined ? data.schedule : null, serverNow);
        const links = resolveLinks(data);
        return h('section', { style: SECTION_STYLE, 'aria-label': t('title') },
          h('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }
          },
            h('h2', {
              style: {
                margin: 0,
                fontSize: '13px',
                fontWeight: 600,
                lineHeight: '22px',
                color: C.labelPrimary
              }
            }, t('title')),
            h('p', {
              style: {
                margin: 0,
                color: C.labelSecondary,
                fontSize: '12px',
                lineHeight: '18px'
              }
            }, t('description'))),
          renderSettingsBalanceCard({
            data: data,
            status: state.status,
            error: state.error,
            fetchedAt: state.fetchedAt,
            refreshing: state.refreshing,
            onRefresh: remote.refresh,
            t: t
          }),
          renderSettingsScheduleCard({
            data: data,
            serverNow: serverNow,
            peakInfo: peakInfo,
            t: t
          }),
          renderSettingsUsageCard({ data: data, t: t }),
          renderSettingsPricingCard({ data: data, peakInfo: peakInfo, t: t }),
          h('div', {
            key: 'links',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap'
            }
          },
            externalLink(links.usageUrl, t('platformUsage')),
            externalLink(links.topUpUrl, t('platformTopUp'))),
          h('div', {
            key: 'footnote',
            style: {
              color: C.labelTertiary,
              fontSize: '11px',
              lineHeight: '16px'
            }
          }, t('localEstimate') + ' · ' + t('costNote') + ' ' + t('officialBalance') + ' ' + t('settingsHint')));
      }

      return { DockBadge: DockBadge, SettingsPage: SettingsPage };
    }

    /* ======================================================================
     * Plugin definition
     * ==================================================================== */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);

        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN });
        }, 'deepseek-usage: locale dictionaries');

        const components = createComponents(ctx, t, ctx.locale);

        ctx.slots.inject('conversation.composer.dock', function () {
          return ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'deepseek-usage',
            order: 2
          }, components.DockBadge);
        });

        ctx.slots.inject('settings.section', function () {
          return ctx.slots.register({
            name: 'settings.section',
            id: 'deepseek-usage',
            order: 30,
            label: function () { return t('settingsNavLabel'); }
          }, components.SettingsPage);
        });
      }
    };
  }
});
