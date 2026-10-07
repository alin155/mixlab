import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { SmartError } from "./types.ts";

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a !== 169 && a! < 224 &&
      !(a === 172 && b! >= 16 && b! <= 31) && !(a === 192 && b === 168) &&
      !(a === 100 && b! >= 64 && b! <= 127) && !(a === 198 && (b === 18 || b === 19));
  }
  const value = address.toLowerCase();
  if (value.startsWith("::ffff:")) return publicAddress(value.slice(7));
  return isIP(address) === 6 && value !== "::1" && value !== "::" &&
    !/^(?:fc|fd|fe[89ab]|ff)/i.test(value);
}
function validateUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" ||
    /(^|\.)(?:localhost|local|internal)$/i.test(host) || isIP(host) && !publicAddress(host)) {
    throw new SmartError("download_address", "视频地址不是可访问的公开 HTTPS 地址", 422);
  }
  return url;
}

/** Pin each DNS resolution to a public address. Never forward API credentials to a CDN. */
export async function downloadPublicFile(value: string, file: string, maxBytes: number, signal?: AbortSignal): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.partial`;
  let next = value;
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      const url = validateUrl(next);
      const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
        const request = https.get(url, {
          headers: { "User-Agent": "Mozilla/5.0 MixLabSmartCutter/1.0" },
          signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(300_000)]),
          lookup: (hostname, options, callback) => {
            void lookup(hostname, { all: true }).then(addresses => {
              const valid = addresses.filter(address => publicAddress(address.address));
              if (!valid.length || valid.length !== addresses.length) { callback(new Error("private destination"), "", 0); return; }
              if (options.all) callback(null, valid as never, 0);
              else callback(null, valid[0]!.address, valid[0]!.family);
            }).catch(error => callback(error, "", 0));
          }
        }, resolve);
        request.once("error", () => reject(new SmartError("download_network", "视频下载连接失败，请重新获取地址后重试", 503)));
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        const location = response.headers.location; response.resume();
        if (!location) throw new SmartError("download_redirect", "视频地址重定向无效", 422);
        next = new URL(location, url).toString(); continue;
      }
      if (response.statusCode !== 200) { response.resume(); throw new SmartError("download_unavailable", `视频下载失败（${response.statusCode}），请刷新作品信息`, 422); }
      const length = Number(response.headers["content-length"] ?? 0);
      if (length > maxBytes) { response.destroy(); throw new SmartError("download_size", "该视频超过设置中的下载大小限制", 413); }
      let bytes = 0;
      const limiter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > maxBytes ? new SmartError("download_size", "视频超过下载大小限制", 413) : null, chunk);
      } });
      await pipeline(response, limiter, createWriteStream(temporary, { mode: 0o600 }), { signal });
      if (!bytes) throw new SmartError("download_empty", "下载视频为空，未创建有效缓存", 422);
      await rename(temporary, file); return;
    }
    throw new SmartError("download_redirect", "视频地址重定向过多，请刷新作品信息", 422);
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}
