#!/usr/bin/env node
/**
 * 端到端自检：以真实 stdio 拉起构建产物，走完 initialize → tools/list → tools/call。
 *
 * 用法：
 *   TENCENTCLOUD_WSA_APIKEY=sk-xxx node scripts/smoke.mjs [查询词]
 *
 * 未提供密钥时只做离线检查（握手、工具清单、参数校验），跳过真实检索。
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'dist', 'index.js');
const apiKey = (process.env.TENCENTCLOUD_WSA_APIKEY ?? process.env.YUANBAO_API_KEY ?? '').trim();
const query = process.argv[2] ?? '崩坏星穹铁道 前瞻直播 兑换码';

const failures = [];
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail === undefined ? '' : `：${detail}`}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  (${detail})`}`);
}

/** 拉起一个 server 实例。 */
function startServer(env) {
  const child = spawn(process.execPath, [entry], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

  let buffer = '';
  const waiters = new Map();
  const stderr = [];

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.length === 0) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.id !== undefined && waiters.has(message.id)) {
        waiters.get(message.id)(message);
        waiters.delete(message.id);
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => stderr.push(chunk));

  let nextId = 1;
  const call = (method, params, timeoutMs = 60000) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiters.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      setTimeout(() => {
        if (waiters.delete(id)) reject(new Error(`超时：${method}`));
      }, timeoutMs);
    });

  const notify = (method, params) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);

  return { child, call, notify, stderr };
}

async function handshake(server) {
  const init = await server.call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'yuanbao-smoke', version: '1.0.0' },
  });
  server.notify('notifications/initialized', {});
  return init;
}

// ---------------------------------------------------------------- 在线检查

if (apiKey.length > 0) {
  const server = startServer({ TENCENTCLOUD_WSA_APIKEY: apiKey });
  try {
    const init = await handshake(server);
    check('initialize 握手成功', init.result?.serverInfo?.name === 'yuanbao-search', init.result?.serverInfo?.version);

    const list = await server.call('tools/list', {});
    const tools = list.result?.tools ?? [];
    check('tools/list 返回 1 个工具', tools.length === 1, tools.map((tool) => tool.name).join(', '));

    const tool = tools[0] ?? {};
    const properties = tool.inputSchema?.properties ?? {};
    const expected = ['query', 'count', 'mode', 'site', 'industry', 'freshness', 'deeplinks'];
    const missing = expected.filter((name) => !(name in properties));
    check('入参覆盖 SearchPro 全部 7 个可选/必填参数', missing.length === 0, missing.length === 0 ? expected.join(', ') : `缺 ${missing.join(', ')}`);

    const call = await server.call('tools/call', {
      name: 'yuanbao_search',
      arguments: { query, count: 10, freshness: 'd30' },
    });
    const result = call.result ?? {};
    check('tools/call 未返回错误', result.isError !== true, result.isError === true ? result.content?.[0]?.text : undefined);

    const structured = result.structuredContent;
    check('返回 structuredContent', structured !== undefined && typeof structured === 'object');
    if (structured) {
      check('structuredContent.total 与 results 长度一致', structured.total === structured.results?.length, `total=${structured.total}`);
      check('检索到结果', (structured.results ?? []).length > 0, `共 ${structured.results?.length ?? 0} 条`);

      const first = structured.results?.[0] ?? {};
      const fieldHints = [];
      if (first.url === undefined) fieldHints.push('url');
      if (first.title === undefined) fieldHints.push('title');
      if (first.summary === undefined) fieldHints.push('summary(passage)');
      check('首条结果含 url/title/摘要', fieldHints.length === 0, fieldHints.length === 0 ? first.url : `缺 ${fieldHints.join(', ')}`);

      if (first.published_at !== undefined) {
        check('published_at 为 ISO-8601 或原值', /^\d{4}-\d{2}-\d{2}T/.test(first.published_at) || /\d{4}/.test(first.published_at), first.published_at);
      }
      console.log(`\n  样例：${first.title ?? '(无标题)'}\n  ${first.url ?? ''}\n  ${(first.summary ?? '').slice(0, 80)}…\n`);

      const text = result.content?.[0]?.text ?? '';
      check('文本内容非空', text.length > 0, `${text.length} 字符`);
    }

    const bad = await server.call('tools/call', {
      name: 'yuanbao_search',
      arguments: { query: '测试', count: 7 },
    });
    check('非法 count 被拒绝', bad.result?.isError === true || bad.error !== undefined);

    const badFresh = await server.call('tools/call', {
      name: 'yuanbao_search',
      arguments: { query: '测试', freshness: 'last-week' },
    });
    const badFreshText = badFresh.result?.content?.[0]?.text ?? JSON.stringify(badFresh.error ?? {});
    check('非法 freshness 给出可读提示', /freshness/.test(badFreshText), badFreshText.slice(0, 60));
  } finally {
    server.child.kill();
  }

  // 缺密钥场景
  const noKey = startServer({ TENCENTCLOUD_WSA_APIKEY: '', YUANBAO_API_KEY: '' });
  try {
    await handshake(noKey);
    const call = await noKey.call('tools/call', { name: 'yuanbao_search', arguments: { query: '测试' } });
    const text = call.result?.content?.[0]?.text ?? '';
    check('缺密钥时返回可操作提示', call.result?.isError === true && /API KEY/.test(text), text.slice(0, 50));
  } finally {
    noKey.child.kill();
  }
} else {
  console.log('未设置 TENCENTCLOUD_WSA_APIKEY，跳过真实检索，只做离线检查。\n');
  const server = startServer({ TENCENTCLOUD_WSA_APIKEY: '', YUANBAO_API_KEY: '' });
  try {
    const init = await handshake(server);
    check('initialize 握手成功', init.result?.serverInfo?.name === 'yuanbao-search');
    const list = await server.call('tools/list', {});
    check('tools/list 返回 1 个工具', (list.result?.tools ?? []).length === 1);
  } finally {
    server.child.kill();
  }
}

console.log(`\n通过 ${checks.filter((item) => item.ok).length}/${checks.length}`);
if (failures.length > 0) {
  console.error(`失败项：\n- ${failures.join('\n- ')}`);
  process.exit(1);
}