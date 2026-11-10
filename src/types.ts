/**
 * 腾讯云元宝搜索（WSA）的线上报文类型。
 *
 * 接口文档：https://cloud.tencent.com/document/product/1806/121811
 * 返回的 `Pages` 是「JSON 字符串数组」，每条都要单独解析后才是下面这个结构。
 */

/** `Pages` 单条结果，字段含义与官方文档一致。 */
export interface YuanbaoPageWire {
  /** 结果标题 */
  title?: string;
  /** 内容发布时间，形如 `YYYY/MM/DD HH:mm:ss` */
  date?: string;
  /** 内容发布源 url */
  url?: string;
  /** 标准摘要 */
  passage?: string;
  /** 动态摘要（极速版不返回） */
  content?: string;
  /** 网站名称，部分不知名站点可能为空 */
  site?: string;
  /** 相关性得分，0～1 */
  score?: number;
  /** 权威度得分，0～5（仅旗舰版返回） */
  authority_level?: number;
  /** 图片列表，单个 doc 返回 0～10 条 */
  pics?: Array<{ caption?: string; origin_url?: string }>;
  /** 网站图标链接 */
  favicon?: string;
  /** 附件子链信息（仅旗舰版，受 Deeplinks 入参控制） */
  deeplinks?: Array<{ title?: string; url?: string }>;
}

/** `Response.Error` 错误对象。 */
export interface YuanbaoErrorWire {
  Code?: string;
  Message?: string;
}

/** 接口返回的完整响应信封。 */
export interface YuanbaoResponse {
  Response?: {
    /** 原始查询语 */
    Query?: string;
    /** 搜索结果页面详情，元素为 JSON 字符串或已解码对象 */
    Pages?: Array<string | YuanbaoPageWire>;
    /** 用户版本：lite / standard / flagship */
    Version?: string;
    /** 提示信息，例如 `hit black query` */
    Msg?: string;
    /** 唯一请求 ID */
    RequestId?: string;
    /** 失败时的错误对象 */
    Error?: YuanbaoErrorWire;
  };
}