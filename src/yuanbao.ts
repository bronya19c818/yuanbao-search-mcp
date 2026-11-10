/**
 * 腾讯云元宝搜索（WSA）SearchPro 客户端。
 *
 * 走「服务 API KEY 方式」：`POST https://api.wsa.cloud.tencent.com/SearchPro`，
 * 请求头 `Authorization: Bearer <sk- 开头的服务密钥>`。
 *
 * 文档：
 * - 接入方式 https://cloud.tencent.com/document/product/1806/130615
 * - 接口出入参 https://cloud.tencent.com/document/product/1806/121811
 */

import type { YuanbaoPageWire, YuanbaoResponse } from './types.js';

/** 默认接口域名。 */
export const DEFAULT_BASE_URL = 'https://api.wsa.cloud.tencent.com';

/** SearchPro 的接口路径。 */
export const SEARCH_PATH = '/SearchPro';

/** `Cnt` 允许的取值，服务端只接受这五档。 */
export const ALLOWED_COUNTS = [10, 20, 30, 40, 50] as const;

/** 垂直领域 `Industry` 允许的取值。 */
export const INDUSTRIES = ['gov', 'news', 'acad', 'finance'] as const;

/** 结果类型 `Mode` 允许的取值：0 公开网页 / 1 垂直权威 / 2 混合。 */
export const SEARCH_MODES = [0, 1, 2] as const;

/**
 * `Freshness` 允许的五种入参形态：
 * `dN` 最近 N 天(1-30)、`mN` 最近 N 月(1-12)、`yN` 最近 N 年(1-5)、
 * `yyyy-mm-dd` 指定日、`yyyy-mm-dd,yyyy-mm-dd` 区间。
 */
const FRESHNESS_PATTERN =
  /^(?:d(?:[1-9]|[12]\d|30)?|m(?:[1-9]|1[0-2])?|y(?:[1-5])?|\d{4}-\d{2}-\d{2}(?:,\d{4}-\d{2}-\d{2})?)$/;

/** 调用方传入的检索参数。 */
export interface SearchArgs {
  query: string;
  count?: number;
  mode?: number;
  site?: string;
  industry?: string;
  freshness?: string;
  deeplinks?: boolean;
}

/** 单条检索结果，字段来自 `Pages`，日期已归一化。 */
export interface SearchResultItem {
  title?: string;
  url?: string;
  site?: string;
  /** ISO-8601 时间；无法解析时保留接口原值 */
  published_at?: string;
  /** 标准摘要（对应接口 `passage`） */
  summary?: string;
  /** 动态摘要（对应接口 `content`） */
  content?: string;
  score?: number;
  authority_level?: number;
  favicon?: string;
  pics?: Array<{ caption?: string; url?: string }>;
  deeplinks?: Array<{ title?: string; url?: string }>;
}

/** 一次检索的完整结果。 */
export interface SearchResult {
  query: string;
  service_version?: string;
  request_id?: string;
  /** 接口 `Msg` 提示信息，例如命中黑名单查询 */
  message?: string;
  total: number;
  results: SearchResultItem[];
}

/** 元宝搜索调用失败。`code` 保留接口错误码，便于调用方按码路由。 */
export class YuanbaoError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'YuanbaoError';
    this.code = code;
  }
}

/** 常见错误码的处理建议，用来说明下一步该做什么。 */
const ERROR_HINTS: Record<string, string> = {
  UnauthorizedOperation:
    '密钥未通过授权。请在元宝搜索控制台「服务 API KEY 方式」确认密钥为 sk- 开头、且当前账号已开通并购买元宝搜索服务。',
  ResourceNotFound: '当前账号尚未开通元宝搜索服务，请前往 https://console.cloud.tencent.com/wsapi/index 开通。',
  ResourceUnavailable: '元宝搜索服务当前不可用，请稍后重试。',
  RequestLimitExceeded: '请求超过频率限制，请降低并发后重试。',
  InternalError: '元宝搜索内部错误，请稍后重试。',
  InvalidParameter: '请求参数不合法，请核对参数取值。',
  MissingParameter: '缺少必填参数。',
};

/** 取第一个非空白字符串。 */
function pick(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** 把 `YYYY/MM/DD HH:mm:ss` 归一化为 ISO-8601；无法解析时原样返回入参。 */
function normalizeDate(value: string): string {
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (match === null) return value;
  const [, year, month, day, hours = '00', minutes = '00', seconds = '00'] = match;
  const p2 = (part: string) => part.padStart(2, '0');
  return `${year}-${p2(month)}-${p2(day)}T${p2(hours)}:${p2(minutes)}:${p2(seconds)}`;
}

/** 把一条 `Pages` 元素映射为结果项；无法解释的元素返回 undefined。 */
function mapPage(raw: unknown): SearchResultItem | undefined {
  let page: unknown = raw;
  if (typeof raw === 'string') {
    try {
      page = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (page === null || typeof page !== 'object' || Array.isArray(page)) return undefined;

  const wire = page as YuanbaoPageWire;
  const item: SearchResultItem = {};

  const title = pick(wire.title);
  if (title !== undefined) item.title = title;
  const url = pick(wire.url);
  if (url !== undefined) item.url = url;
  const site = pick(wire.site);
  if (site !== undefined) item.site = site;
  const date = pick(wire.date);
  if (date !== undefined) item.published_at = normalizeDate(date);
  const summary = pick(wire.passage);
  if (summary !== undefined) item.summary = summary;
  const content = pick(wire.content);
  if (content !== undefined) item.content = content;
  if (typeof wire.score === 'number') item.score = wire.score;
  if (typeof wire.authority_level === 'number') item.authority_level = wire.authority_level;
  const favicon = pick(wire.favicon);
  if (favicon !== undefined) item.favicon = favicon;

  if (Array.isArray(wire.pics)) {
    const pics = wire.pics
      .filter((pic) => pic !== null && typeof pic === 'object')
      .map((pic) => {
        const caption = pick(pic.caption);
        const origin = pick(pic.origin_url);
        return {
          ...(caption === undefined ? {} : { caption }),
          ...(origin === undefined ? {} : { url: origin }),
        };
      })
      .filter((pic) => Object.keys(pic).length > 0);
    if (pics.length > 0) item.pics = pics;
  }

  if (Array.isArray(wire.deeplinks)) {
    const deeplinks = wire.deeplinks
      .filter((link) => link !== null && typeof link === 'object')
      .map((link) => {
        const title = pick(link.title);
        const url = pick(link.url);
        return {
          ...(title === undefined ? {} : { title }),
          ...(url === undefined ? {} : { url }),
        };
      })
      .filter((link) => Object.keys(link).length > 0);
    if (deeplinks.length > 0) item.deeplinks = deeplinks;
  }

  return Object.keys(item).length > 0 ? item : undefined;
}

/** 校验并组装请求体，非法参数直接给出可读错误。 */
function buildRequestBody(args: SearchArgs): Record<string, unknown> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (query.length === 0) throw new YuanbaoError('query 不能为空。', 'InvalidParameter');

  const body: Record<string, unknown> = { Query: query };

  if (args.count !== undefined) {
    if (!(ALLOWED_COUNTS as readonly number[]).includes(args.count)) {
      throw new YuanbaoError(
        `count 只支持 ${ALLOWED_COUNTS.join(' / ')}，收到 ${args.count}。`,
        'InvalidParameter',
      );
    }
    body.Cnt = args.count;
  }

  if (args.mode !== undefined) {
    if (!(SEARCH_MODES as readonly number[]).includes(args.mode)) {
      throw new YuanbaoError('mode 只支持 0（公开网页）/ 1（垂直权威）/ 2（混合）。', 'InvalidParameter');
    }
    body.Mode = args.mode;
  }

  const site = typeof args.site === 'string' ? args.site.trim() : '';
  if (site.length > 0) body.Site = site;

  if (args.industry !== undefined) {
    if (!(INDUSTRIES as readonly string[]).includes(args.industry)) {
      throw new YuanbaoError(
        `industry 只支持 ${INDUSTRIES.join(' / ')}。`,
        'InvalidParameter',
      );
    }
    body.Industry = args.industry;
  }

  const freshness = typeof args.freshness === 'string' ? args.freshness.trim() : '';
  if (freshness.length > 0) {
    if (!FRESHNESS_PATTERN.test(freshness)) {
      throw new YuanbaoError(
        'freshness 支持 dN（最近 N 天，1-30）、mN（最近 N 月，1-12）、yN（最近 N 年，1-5）、yyyy-mm-dd（指定日）、yyyy-mm-dd,yyyy-mm-dd（区间）。',
        'InvalidParameter',
      );
    }
    body.Freshness = freshness;
  }

  if (args.deeplinks === true) body.Deeplinks = true;

  return body;
}

/** 从错误码给出下一步建议。 */
function hintFor(code: string): string | undefined {
  if (ERROR_HINTS[code] !== undefined) return ERROR_HINTS[code];
  if (code.startsWith('AuthFailure')) {
    return '密钥鉴权失败，请确认使用的是元宝搜索控制台创建的 sk- 开头服务 API KEY。';
  }
  return undefined;
}

/** 接口域名，可用 `YUANBAO_BASE_URL` 覆盖（例如指向内网网关）。 */
function resolveBaseUrl(): string {
  const configured = process.env.YUANBAO_BASE_URL?.trim();
  return (configured !== undefined && configured.length > 0 ? configured : DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * 执行一次元宝搜索。
 *
 * @param apiKey 服务 API KEY（sk- 开头）
 * @param args 检索参数
 * @param signal 取消信号
 * @throws {YuanbaoError} 参数非法、网络失败、响应异常或接口返回错误码
 */
export async function searchYuanbao(
  apiKey: string,
  args: SearchArgs,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const body = buildRequestBody(args);
  const endpoint = `${resolveBaseUrl()}${SEARCH_PATH}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new YuanbaoError(`请求元宝搜索失败：${detail}`, 'NetworkError');
  }

  const text = await response.text();
  let payload: YuanbaoResponse;
  try {
    payload = JSON.parse(text) as YuanbaoResponse;
  } catch {
    throw new YuanbaoError(
      `元宝搜索返回了无法解析的响应（HTTP ${response.status}）：${text.slice(0, 200)}`,
      'InvalidResponse',
    );
  }

  const envelope = payload.Response;
  if (envelope === undefined || envelope === null || typeof envelope !== 'object') {
    throw new YuanbaoError(
      `元宝搜索响应缺少 Response 字段（HTTP ${response.status}）：${text.slice(0, 200)}`,
      'InvalidResponse',
    );
  }

  if (envelope.Error !== undefined && envelope.Error !== null) {
    const code = envelope.Error.Code ?? 'UnknownError';
    const message = envelope.Error.Message ?? '未知错误';
    const hint = hintFor(code);
    throw new YuanbaoError(
      `元宝搜索接口错误 ${code}：${message}${hint === undefined ? '' : ` ${hint}`}` +
        (envelope.RequestId === undefined ? '' : `（RequestId: ${envelope.RequestId}）`),
      code,
    );
  }

  if (!response.ok) {
    throw new YuanbaoError(`元宝搜索请求失败（HTTP ${response.status}）：${text.slice(0, 200)}`, 'HttpError');
  }

  const pages = Array.isArray(envelope.Pages) ? envelope.Pages : [];
  const results: SearchResultItem[] = [];
  for (const page of pages) {
    const item = mapPage(page);
    if (item !== undefined) results.push(item);
  }

  return {
    query: pick(envelope.Query) ?? String(body.Query),
    ...(pick(envelope.Version) === undefined ? {} : { service_version: pick(envelope.Version) }),
    ...(pick(envelope.RequestId) === undefined ? {} : { request_id: pick(envelope.RequestId) }),
    ...(pick(envelope.Msg) === undefined ? {} : { message: pick(envelope.Msg) }),
    total: results.length,
    results,
  };
}