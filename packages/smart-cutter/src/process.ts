import { spawn } from "node:child_process";
import { SmartError } from "./types.ts";

export function runProcess(command: string, args: string[], options: {
  signal?: AbortSignal; cwd?: string; input?: string;
  onLine?: (line: string) => void; env?: NodeJS.ProcessEnv;
} = {}): Promise<string> {
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true, shell: false, cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"], signal: options.signal, env: options.env ?? process.env
    });
    const output: string[] = []; let size = 0, errorTail = "", lineBuffer = "";
    child.stdin.on("error", () => { /* Spawn/abort failures are reported by process events. */ });
    child.stdout.on("data", (chunk: Buffer) => {
      const value = chunk.toString(); size += chunk.length;
      if (size < 2_000_000) output.push(value);
      if (options.onLine) {
        lineBuffer += value;
        const lines = lineBuffer.split(/\r?\n/); lineBuffer = lines.pop() ?? "";
        for (const line of lines) options.onLine(line);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { errorTail = (errorTail + chunk.toString()).slice(-2500); });
    child.once("error", error => reject(options.signal?.aborted ? error : new SmartError("runtime_process", `无法启动本机运行组件：${command}`, 503)));
    child.once("close", code => {
      if (options.signal?.aborted) reject(new DOMException("任务已停止", "AbortError"));
      else if (code === 0) resolve(output.join(""));
      else reject(new SmartError("runtime_process", `本机处理失败：${errorTail.trim().slice(-1500) || `退出码 ${code}`}`, 422));
    });
    child.stdin.end(options.input ?? "");
  });
}
