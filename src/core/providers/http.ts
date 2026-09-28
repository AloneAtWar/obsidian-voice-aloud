import { requestUrl } from 'obsidian';
import type { HttpFn, HttpRequest } from './types';

/**
 * 生产环境 HTTP 实现：走 Obsidian requestUrl（免 CORS，桌面/移动一致）。
 * 响应统一为 {status, json, arrayBuffer, text, headers}。
 */
export const obsidianHttp: HttpFn = async (req: HttpRequest) => {
  const r = await requestUrl({
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    throw: false,
  });
  return {
    status: r.status,
    json: r.json,
    arrayBuffer: r.arrayBuffer,
    text: r.text,
    headers: (r as unknown as { headers?: Record<string, string> }).headers,
  };
};
