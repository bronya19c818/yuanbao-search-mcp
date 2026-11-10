/**
 * 用 npx 方式拉起已安装的包，验证 bin 入口与真实检索。
 * 用法：node scripts/verify-npx.mjs <工作目录>
 */
import { spawn } from 'node:child_process';

const cwd = process.argv[2];
const apiKey = process.env.TENCENTCLOUD_WSA_APIKEY ?? '';

const child = spawn('npx', ['--no-install', 'yuanbao-search-mcp'], {
  cwd,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true,
  env: { ...process.env, TENCENTCLOUD_WSA_APIKEY: apiKey },
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
const call = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    waiters.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => {
      if (waiters.delete(id)) reject(new Error(`超时：${method}\n${stderr.join('')}`));
    }, 60000);
  });

try {
  const init = await call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'verify-npx', version: '1.0.0' },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  console.log('initialize ->', init.result?.serverInfo?.name, init.result?.serverInfo?.version);

  const list = await call('tools/list', {});
  console.log('tools/list ->', (list.result?.tools ?? []).map((t) => t.name).join(', '));

  const result = await call('tools/call', {
    name: 'yuanbao_search',
    arguments: { query: '腾讯云元宝搜索', count: 10 },
  });
  const structured = result.result?.structuredContent;
  console.log('tools/call -> isError:', result.result?.isError === true, 'total:', structured?.total);
  if (structured?.results?.[0]) {
    console.log('  首条:', structured.results[0].title);
    console.log('  链接:', structured.results[0].url);
  }
  const ok = init.result?.serverInfo?.name === 'yuanbao-search' && (structured?.total ?? 0) > 0;
  console.log(ok ? '\nnpx 入口验证通过。' : '\nnpx 入口验证失败。');
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error('验证失败：', error.message);
  console.error(stderr.join('').slice(0, 800));
  process.exitCode = 1;
} finally {
  child.kill();
}