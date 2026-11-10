#!/usr/bin/env node
/**
 * 可执行入口：以 stdio 方式运行元宝搜索 MCP Server。
 *
 * 客户端把本进程当作 MCP Server 拉起，通过 stdin/stdout 收发 JSON-RPC。
 * 需要环境变量 TENCENTCLOUD_WSA_APIKEY（或 YUANBAO_API_KEY）提供元宝搜索服务密钥。
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer, resolveApiKey } from './server.js';

if (resolveApiKey() === undefined) {
  // 只写 stderr，避免污染 stdio 的协议通道。
  process.stderr.write(
    '[yuanbao-search-mcp] 未检测到 TENCENTCLOUD_WSA_APIKEY，工具调用将返回缺少密钥的提示。\n',
  );
}

serveStdio(() => createServer());