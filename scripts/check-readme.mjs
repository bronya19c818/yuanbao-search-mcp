/**
 * 校验 README 里的服务配置块是否符合 ModelScope 快速创建与托管部署的要求。
 * 仅本地自检用，不属于 npm 包内容。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, '..', 'README.md'), 'utf8');

const blocks = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
console.log(`json 代码块数量：${blocks.length}`);

const found = [];
blocks.forEach((block, index) => {
  let parsed;
  try {
    parsed = JSON.parse(block);
  } catch (error) {
    console.log(`  块 ${index}：JSON 解析失败 -> ${error.message}`);
    return;
  }
  if (parsed.mcpServers === undefined) return;
  found.push(parsed);
  for (const [name, config] of Object.entries(parsed.mcpServers)) {
    console.log(
      `  块 ${index}：server=${name} command=${config.command} args=${JSON.stringify(config.args)} env=${Object.keys(config.env ?? {}).join(',')}`,
    );
  }
});

const problems = [];
if (found.length !== 1) problems.push(`服务配置块数量应为 1，实际 ${found.length}`);
const config = Object.values(found[0]?.mcpServers ?? {})[0];
if (config) {
  if (config.command !== 'npx' && config.command !== 'uvx') {
    problems.push(`command 必须为 npx 或 uvx，实际 ${config.command}`);
  }
  const argsText = JSON.stringify(config.args ?? []);
  if (!/@latest/.test(argsText)) problems.push('args 中缺少 @latest 包名');
  if (!/yuanbao-search-mcp/.test(argsText)) problems.push('args 中缺少包名 yuanbao-search-mcp');
  if (/["'][A-Za-z]:\\\\|^\//.test(argsText)) problems.push('args 中出现本地绝对路径');
  if (!config.env || !config.env.TENCENTCLOUD_WSA_APIKEY) problems.push('env 中缺少 TENCENTCLOUD_WSA_APIKEY');
}
if (!text.includes('## 功能特点')) problems.push('缺少服务介绍小节');

console.log(problems.length === 0 ? '\n全部检查通过。' : `\n问题：\n- ${problems.join('\n- ')}`);
process.exit(problems.length === 0 ? 0 : 1);