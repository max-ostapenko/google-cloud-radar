export interface SharePayload {
  slug: string;
  title: string;
  service: string;
  api: string;
  summary: string;
  methods?: string[];
  isBreaking?: boolean;
  leadTimeDays?: number;
}

export interface BoundedRedditBodyOptions {
  maxSummaryLength?: number;
  maxMethods?: number;
  maxUrlLength?: number;
}

export const REDDIT_SUBMIT_BASE_URL = 'https://www.reddit.com/r/googlecloud/submit';
export const MAX_REDDIT_SUBMIT_URL_LENGTH = 1000;
export const DEFAULT_REDDIT_URL_BUDGET = 990;
export const DEFAULT_REDDIT_SUMMARY_MAX_CHARS = 250;
export const DEFAULT_REDDIT_MAX_METHODS = 3;
export const REDDIT_MAX_TITLE_CHARS = 300;

/**
 * Truncates text to `maxLength` characters without splitting UTF-16 surrogate pairs.
 * Strings already within `maxLength` are returned unchanged without trailing ellipsis.
 */
export function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (text.length <= maxLength) return text;
  if (maxLength === 1) return '…';

  let sliced = text.slice(0, maxLength - 1);
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    sliced = sliced.slice(0, -1);
  }
  return `${sliced.trimEnd()}…`;
}

export function buildPermalink(slug: string): string {
  return `https://google-cloud-radar.com/changes/${slug}`;
}

export function buildRedditPostTitle(data: SharePayload): string {
  return `[Google Cloud Radar] ${data.service}: ${data.title}${data.isBreaking ? ' [Breaking Change]' : ''}`;
}

/**
 * Preserves Reddit post titles up to Reddit's 300-character limit verbatim,
 * only truncating if the formatted title exceeds 300 characters.
 */
export function buildRedditSubmitTitle(data: SharePayload): string {
  return truncateText(buildRedditPostTitle(data), REDDIT_MAX_TITLE_CHARS);
}

/**
 * Builds the complete, untruncated Reddit markdown post body for manual copy-paste.
 */
export function buildFullRedditBody(data: SharePayload): string {
  const permalink = buildPermalink(data.slug);
  const methods = (data.methods || []).filter((m) => m.trim().length > 0);
  return `New API changes detected for **${data.service}** (\`${data.api}\`) ahead of official release notes:\n\n**Summary:**\n${data.summary}\n\n${methods.length > 0 ? `**Methods Updated:**\n${methods.map((m) => `- \`${m}\``).join('\n')}\n` : ''}Tracked live on Google Cloud Radar:\n${permalink}`;
}

export function buildRedditSubmitUrl(title: string, submitBody: string): string {
  return `${REDDIT_SUBMIT_BASE_URL}?title=${encodeURIComponent(title)}&text=${encodeURIComponent(submitBody)}`;
}

function formatBoundedMethodsSection(
  methods: string[],
  maxMethodsToShow: number,
  maxMethodNameLength?: number
): string {
  if (methods.length === 0) return '';

  if (maxMethodsToShow <= 0) {
    const noun = methods.length === 1 ? 'method' : 'methods';
    return `**Methods Updated:** +${methods.length} ${noun}\n`;
  }

  const displayed = methods.slice(0, maxMethodsToShow).map((m) => {
    const formatted = maxMethodNameLength ? truncateText(m, maxMethodNameLength) : m;
    return `- \`${formatted}\``;
  });
  const remaining = methods.length - displayed.length;
  if (remaining > 0) {
    displayed.push(`- +${remaining} more ${remaining === 1 ? 'method' : 'methods'}`);
  }

  return `**Methods Updated:**\n${displayed.join('\n')}\n`;
}

/**
 * Builds a concise Reddit submit body that truncates long summaries, caps displayed
 * methods (with a `+N more methods` indicator), and dynamically respects the GET URL
 * length budget so generated Reddit submit URLs strictly remain under 1,000 characters.
 */
export function buildBoundedRedditSubmitBody(
  data: SharePayload,
  options: BoundedRedditBodyOptions = {}
): string {
  const maxSummaryLength = options.maxSummaryLength ?? DEFAULT_REDDIT_SUMMARY_MAX_CHARS;
  const maxMethods = options.maxMethods ?? DEFAULT_REDDIT_MAX_METHODS;
  const targetMaxUrlLength = Math.min(
    options.maxUrlLength ?? DEFAULT_REDDIT_URL_BUDGET,
    MAX_REDDIT_SUBMIT_URL_LENGTH - 1
  );

  const permalink = buildPermalink(data.slug);
  const rawSummary = (data.summary || '').trim();
  const methods = (data.methods || []).map((m) => m.trim()).filter((m) => m.length > 0);

  const fullTitle = buildRedditPostTitle(data);
  const submitTitle = buildRedditSubmitTitle(data);
  // Budget against the longer of submitTitle and fullTitle whenever feasible so
  // callers using either title representation stay strictly under 1,000 characters.
  const budgetTitle =
    buildRedditSubmitUrl(fullTitle, permalink).length <= targetMaxUrlLength
      ? fullTitle
      : submitTitle;

  const fitsBudget = (body: string): boolean =>
    buildRedditSubmitUrl(budgetTitle, body).length <= targetMaxUrlLength;

  const assembleStandardBody = (
    summaryCap: number,
    methodsCap: number,
    methodNameCap?: number
  ): string => {
    const boundedSummary = truncateText(rawSummary, summaryCap);
    const summaryBlock = boundedSummary ? `**Summary:**\n${boundedSummary}\n\n` : '';
    const methodsBlock = formatBoundedMethodsSection(methods, methodsCap, methodNameCap);
    return `New API changes detected for **${data.service}** (\`${data.api}\`) ahead of official release notes:\n\n${summaryBlock}${methodsBlock}Tracked live on Google Cloud Radar:\n${permalink}`;
  };

  const initialSummaryCap = Math.min(rawSummary.length, maxSummaryLength);
  const initialBody = assembleStandardBody(initialSummaryCap, maxMethods);
  if (fitsBudget(initialBody)) {
    return initialBody;
  }

  const findBestSummaryBody = (
    minSummary: number,
    maxSummary: number,
    buildWithSummary: (cap: number) => string
  ): string | null => {
    if (!fitsBudget(buildWithSummary(minSummary))) {
      return null;
    }
    let low = minSummary;
    let high = Math.max(minSummary, maxSummary);
    let best = buildWithSummary(minSummary);
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = buildWithSummary(mid);
      if (fitsBudget(candidate)) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  };

  // Step 1: Keep all capped methods (up to 3) while tightening summary down to 100 chars.
  if (rawSummary.length > 0) {
    const tightenedSummary = findBestSummaryBody(100, initialSummaryCap, (cap) =>
      assembleStandardBody(cap, maxMethods)
    );
    if (tightenedSummary !== null) {
      return tightenedSummary;
    }
  }

  // Step 2: Progressively reduce displayed method count and cap very long RPC names.
  for (let mCount = Math.min(methods.length, maxMethods); mCount >= 0; mCount--) {
    for (const methodNameCap of [undefined, 60, 40]) {
      const candidate = findBestSummaryBody(
        rawSummary.length > 0 ? Math.min(50, rawSummary.length) : 0,
        initialSummaryCap,
        (cap) => assembleStandardBody(cap, mCount, methodNameCap)
      );
      if (candidate !== null) {
        return candidate;
      }
    }
  }

  // Step 3: Compact fallback when long titles (~300 chars) or heavy percent-encoding consume most of the budget.
  const assembleCompactBody = (summaryCap: number, includeMethodCount: boolean): string => {
    const boundedSummary = truncateText(rawSummary, summaryCap);
    const parts: string[] = [];
    if (boundedSummary) parts.push(boundedSummary);
    if (includeMethodCount && methods.length > 0) {
      parts.push(`+${methods.length} updated ${methods.length === 1 ? 'method' : 'methods'}`);
    }
    parts.push(`Tracked live on Google Cloud Radar:\n${permalink}`);
    return parts.join('\n\n');
  };

  for (const includeMethodCount of [true, false]) {
    const compact = findBestSummaryBody(0, initialSummaryCap, (cap) =>
      assembleCompactBody(cap, includeMethodCount)
    );
    if (compact !== null) {
      return compact;
    }
  }

  if (fitsBudget(permalink)) {
    return permalink;
  }

  return '';
}
