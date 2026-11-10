# yuanbao-search-mcp

腾讯云**元宝搜索**（Tencent Yuanbao Search，WSA）的 MCP Server。一次调用即可检索全网公开网页，中文资讯、新闻、攻略、百科与实时热点表现好，返回标题、URL、摘要、发布时间、站点、相关性得分与配图。

服务基于腾讯云元宝搜索的 `SearchPro` 接口，走「服务 API KEY 方式」接入，请求头用 `Authorization: Bearer <sk- 开头的服务密钥>`。

## 功能特点

- **中文检索质量**：以全网公开资源为基础，叠加腾讯内容生态（腾讯新闻、搜狗百科、企鹅号等）。
- **参数完整**：结果条数、结果类型、指定/排除站点、垂直领域、时间范围、附件子链全部可用。
- **字段完整**：接口返回的每一个字段都会透传，日期统一归一化为 ISO-8601。
- **失败可读**：接口错误码与处理建议一并返回，缺密钥时直接提示去哪申请。
- **零额外依赖**：仅依赖 MCP 官方 TypeScript SDK，stdio 传输，单进程即用。

## 获取 API KEY

1. 登录并完成实名认证的[腾讯云](https://cloud.tencent.com)账号。
2. 进入[元宝搜索控制台](https://console.cloud.tencent.com/wsapi/index)，在概览页单击**开通服务**并按需购买。
3. 在**概览 > 服务 API KEY 方式**单击**创建 API KEY**，复制 `sk-` 开头的密钥。

> 密钥仅在创建时明文展示一次，请及时保存。每个账号最多同时持有 3 个服务 API KEY。

## 配置 MCP

把下面这段配置加入你的 MCP 客户端即可，`TENCENTCLOUD_WSA_APIKEY` 换成你自己的密钥：

```json
{
  "mcpServers": {
    "yuanbao-search": {
      "command": "npx",
      "args": ["-y", "yuanbao-search-mcp@latest"],
      "env": {
        "TENCENTCLOUD_WSA_APIKEY": "sk-xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

环境变量说明：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `TENCENTCLOUD_WSA_APIKEY` | 是 | 元宝搜索服务 API KEY，`sk-` 开头。也接受别名 `YUANBAO_API_KEY`。 |
| `YUANBAO_BASE_URL` | 否 | 覆盖接口域名，默认 `https://api.wsa.cloud.tencent.com`。 |

## 工具：`yuanbao_search`

检索全网公开网页，返回结构化结果与可阅读文本。

### 入参

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `query` | string | 是 | 搜索词，例如「今天北京的天气」。 |
| `count` | integer | 否 | 返回条数，只支持 `10` / `20` / `30` / `40` / `50`。 |
| `mode` | integer | 否 | 结果类型：`0` 公开网页信源，`1` 优质权威垂直信源，`2` 混合；默认 `0`。 |
| `site` | string | 否 | 指定站点检索（如 `qq.com`），或用 `exclude:a.com\|b.com` 排除站点，最多五个。 |
| `industry` | string | 否 | 垂直领域：`gov` 政府，`news` 新闻，`acad` 学术，`finance` 财经。 |
| `freshness` | string | 否 | 时效范围：`dN` 最近 N 天（1-30）、`mN` 最近 N 月（1-12）、`yN` 最近 N 年（1-5）、`yyyy-mm-dd` 指定日、`yyyy-mm-dd,yyyy-mm-dd` 区间。 |
| `deeplinks` | boolean | 否 | 是否返回附件子链，仅旗舰版实例生效。 |

### 返回

外层字段：

| 字段 | 说明 |
| --- | --- |
| `query` | 实际执行的查询语。 |
| `service_version` | 账户版本：`lite` 极速版 / `standard` 标准版 / `flagship` 旗舰版。 |
| `request_id` | 接口请求 ID，反馈问题时提供。 |
| `message` | 接口提示信息，例如命中黑名单查询时给出 `hit black query`。 |
| `total` | 本次返回的结果条数。 |
| `results` | 结果数组。 |

每条结果：

| 字段 | 说明 |
| --- | --- |
| `title` | 结果标题。 |
| `url` | 内容发布源 URL。 |
| `site` | 网站名称，部分不知名站点可能为空。 |
| `published_at` | 内容发布时间，归一化为 ISO-8601；无法解析时保留接口原值。 |
| `summary` | 标准摘要（接口 `passage`）。 |
| `content` | 动态摘要（接口 `content`），标准版及以上返回。 |
| `score` | 相关性得分，0～1，越接近 1 越相关。 |
| `authority_level` | 权威度得分，0～5，仅旗舰版返回。 |
| `favicon` | 网站图标链接。 |
| `pics` | 图片列表，每项含 `caption` 与 `url`。 |
| `deeplinks` | 附件子链，每项含 `title` 与 `url`，需 `deeplinks=true` 且为旗舰版。 |

结果同时以两种形式返回：`content` 是便于阅读的文本摘要，`structuredContent` 是上述完整结构。

## 覆盖范围

元宝搜索当前对外开放的接口只有 `SearchPro` 一个（见 [API 概览](https://cloud.tencent.com/document/api/1806/121821)），本服务把它完整包了一层：

- **入参**：`Query`、`Mode`、`Site`、`Cnt`、`Industry`、`Freshness`、`Deeplinks` 七个参数全部开放，取值校验与官方枚举一致。
- **出参**：`Pages` 的 `title`、`date`、`url`、`passage`、`content`、`site`、`score`、`authority_level`、`pics`、`favicon`、`deeplinks` 十一个字段全部映射；信封里的 `Query`、`Version`、`Msg`、`RequestId` 也全部保留。

受账户版本限制的字段（`content`、`score`、`pics` 需标准版及以上，`authority_level`、`deeplinks` 需旗舰版）在接口不返回时自动省略，不会补空值。

本服务只做检索，不抓取网页正文；接口返回的是标准摘要与动态摘要，需要正文时请再用页面抓取工具读取结果中的 `url`。

## 本地开发

```bash
npm install
npm run build
TENCENTCLOUD_WSA_APIKEY=sk-xxx npm run smoke
```

`npm run smoke` 会以真实 stdio 拉起构建产物，依次校验握手、工具清单、参数覆盖、真实检索、非法参数与缺密钥提示。未设置密钥时只跑离线检查。

## 许可

[MIT](./LICENSE)