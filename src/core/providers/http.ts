import { requestUrl } from 'obsidian';
import type { HttpFn, HttpRequest, HttpResponse } from './types';

/**
 * 生产环境 HTTP 实现：走 Obsidian requestUrl（免 CORS，桌面/移动一致）。
 * 响应字段全部惰性求值：二进制响应（WAV/MP3）读 .json 会消耗/破坏响应体，
 * 只有真正被使用的字段才会触发底层读取（合成只读 arrayBuffer，错误路径才读 text/json）。
 */
export const obsidianHttp: HttpFn = async (req: HttpRequest): Promise<HttpResponse> => {
  const r = await requestUrl({
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    throw: false,
  });
  return {
    status: r.status,
    get json() {
      return r.json;
    },
    get arrayBuffer() {
      return r.arrayBuffer;
    },
    get text() {
      return r.text;
    },
    headers: (r as unknown as { headers?: Record<string, string> }).headers,
  };
};
