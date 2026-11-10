/**
 * MCP Server 装配：把元宝搜索注册成 `yuanbao_search` 工具。
 */

import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  ALLOWED_COUNTS,
  INDUSTRIES,
  SEARCH_MODES,
  YuanbaoError,
  searchYuanbao,
  type SearchResult,
} from './yuanbao.js';

/** `serverInfo.name`。 */
export const SERVER_NAME = 'yuanbao-search';

/** `serverInfo.version`，与 package.json 保持一致。 */
export const SERVER_VERSION = '1.0.0';

/** 工具名。 */
export const TOOL_NAME = 'yuanbao_search';

/** 读取服务 API KEY；支持两个环境变量名，便于不同客户端沿用既有配置。 */
export function resolveApiKey(): string | undefined {
  for (const name of ['TENCENTCLOUD_WSA_APIKEY', 'YUANBAO_API_KEY']) {
    const value = process.env[name]?.trim();
    if (value !== undefined && value.length > 0) return value;
  }
  return undefined;
}

/** 输入 schema。 */
const inputSchema = z.object({
  query: z.string().min(1).describe('搜索词，例如「今天北京的天气」。'),
  count: z
    .union([z.literal(10), z.literal(20), z.literal(30), z.literal(40), z.literal(50)])
    .optional()
    .describe('返回条数，只支持 10 / 20 / 30 / 40 / 50，默认由服务端决定（通常 10）。'),
  mode: z
    .union([z.literal(0), z.literal(1), z.literal(2)])
    .optional()
    .describe('结果类型：0 公开网页信源，1 优质权威垂直信源，2 混合；不传默认 0。'),
  site: z
    .string()
    .optional()
    .describe('指定站点检索（如 qq.com），或用 exclude:a.com|b.com 排除站点，最多五个。'),
  industry: z
    .enum(INDUSTRIES)
    .optional()
    .describe('垂直领域：gov 政府，news 新闻，acad 学术，finance 财经。'),
  freshness: z
    .string()
    .optional()
    .describe(
      '时效范围：dN 最近 N 天（1-30）、mN 最近 N 月（1-12）、yN 最近 N 年（1-5）、yyyy-mm-dd 指定日、yyyy-mm-dd,yyyy-mm-dd 区间。',
    ),
  deeplinks: z
    .boolean()
    .optional()
    .describe('是否返回附件子链信息，仅旗舰版实例生效。'),
});

/** 输出 schema，与 `searchYuanbao` 的返回结构一一对应。 */
const outputSchema = z.object({
  query: z.string(),
  service_version: z.string().optional(),
  request_id: z.string().optional(),
  message: z.string().optional(),
  total: z.number().int(),
  results: z.array(
    z.object({
      title: z.string().optional(),
      url: z.string().optional(),
      site: z.string().optional(),
      published_at: z.string().optional(),
      summary: z.string().optional(),
      content: z.string().optional(),
      score: z.number().optional(),
      authority_level: z.number().optional(),
      favicon: z.string().optional(),
      pics: z
        .array(z.object({ caption: z.string().optional(), url: z.string().optional() }))
        .optional(),
      deeplinks: z.array(z.object({ title: z.string().optional(), url: z.string().optional() })).optional(),
    }),
  ),
});

/** 缺少密钥时的可操作提示。 */
const MISSING_KEY_MESSAGE =
  '缺少元宝搜索 API KEY。请在元宝搜索控制台 https://console.cloud.tencent.com/wsapi/index 的「服务 API KEY 方式」创建 sk- 开头的服务密钥，' +
  '然后通过环境变量 TENCENTCLOUD_WSA_APIKEY（或 YUANBAO_API_KEY）提供给本服务。';

/** 把结果渲染成便于模型阅读的文本。 */
function renderText(result: SearchResult): string {
  const header: string[] = [`查询：${result.query}`, `结果数：${result.total}`];
  if (result.service_version !== undefined) header.push(`服务版本：${result.service_version}`);
  if (result.message !== undefined) header.push(`提示：${result.message}`);
  if (result.request_id !== undefined) header.push(`RequestId：${result.request_id}`);

  const lines: string[] = [header.join('\n')];

  result.results.forEach((item, index) => {
    const block: string[] = [`${index + 1}. ${item.title ?? '（无标题）'}`];
    if (item.url !== undefined) block.push(`   URL: ${item.url}`);
    const meta: string[] = [];
    if (item.site !== undefined) meta.push(`站点 ${item.site}`);
    if (item.published_at !== undefined) meta.push(`时间 ${item.published_at}`);
    if (item.score !== undefined) meta.push(`相关性 ${item.score}`);
    if (item.authority_level !== undefined) meta.push(`权威度 ${item.authority_level}`);
    if (meta.length > 0) block.push(`   ${meta.join(' | ')}`);
    // 接口的 `content`（动态摘要）通常与 `passage` 重复，正文里只渲染一份，
    // 完整字段留在 structuredContent，避免同一段文字占两倍上下文。
    const summary = item.summary ?? item.content;
    if (summary !== undefined) block.push(`   摘要：${summary}`);
    lines.push(block.join('\n'));
  });

  lines.push('说明：动态摘要 content、配图 pics、子链 deeplinks、favicon 等完整字段见 structuredContent。');

  return lines.join('\n\n');
}

/**
 * 构造一个已注册好工具的 MCP Server。
 *
 * 每次调用都新建实例：stdio 连接打开时由 `serveStdio` 的工厂取得，
 * 同一连接内复用同一个实例，避免状态在连接之间泄漏。
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    TOOL_NAME,
    {
      title: '元宝搜索',
      description:
        '用腾讯云元宝搜索（WSA）检索全网公开网页，中文资讯、新闻、攻略、百科与实时热点表现好。' +
        '支持限定站点、垂直领域与时间范围，返回标题、URL、摘要、发布时间、站点、相关性得分与配图。' +
        '注意：本工具只返回摘要，不抓取网页正文；需要正文时请再对结果 URL 取页面内容。',
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const apiKey = resolveApiKey();
      if (apiKey === undefined) {
        return { isError: true, content: [{ type: 'text', text: MISSING_KEY_MESSAGE }] };
      }

      try {
        const result = await searchYuanbao(apiKey, args, ctx.mcpReq.signal);
        return {
          content: [{ type: 'text', text: renderText(result) }],
          structuredContent: result,
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { isError: true, content: [{ type: 'text', text: '元宝搜索请求已取消。' }] };
        }
        if (error instanceof YuanbaoError) {
          return { isError: true, content: [{ type: 'text', text: error.message }] };
        }
        const detail = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: 'text', text: `元宝搜索调用失败：${detail}` }] };
      }
    },
  );

  return server;
}