import { spawn } from 'node:child_process';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../../packages/smart-cutter/src/process.ts';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Mac 候选构建需要 Apple Silicon Mac。');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function npm(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [process.env.npm_execpath!, ...args], { cwd: repo, stdio: 'inherit', shell: false });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Mac packaging failed: ${args.join(' ')}`)));
  });
}
await npm(['run', 'prepare:smart-cutter-runtime']);
await npm(['run', 'package:smart-cutter:windows', '--', '--bundle-only']);
await npm(['run', 'build:macos:candidate', '-w', '@mixlab/smart-cutter-desktop']);
const app = path.join(repo, 'apps/smart-cutter-desktop/src-tauri/target/release/bundle/macos/MixLab Unified Cutter Candidate.app');
const resources = path.join(app, 'Contents/Resources');
for (const file of ['binaries/node', 'binaries/ffmpeg', 'binaries/ffprobe', 'binaries/smart-cutter-api.bundle.mjs', 'runtime/python/bin/python3', 'runtime/ai-worker.py', 'runtime/models/bge-small-zh.onnx', 'runtime/models/tokenizer.json', 'runtime/models/yunet.onnx', 'runtime/fonts/NotoSansSC.ttf', 'runtime/fonts/NotoSerifSC.ttf']) {
  if (!(await stat(path.join(resources, file))).isFile()) throw new Error(`Mac app missing runtime: ${file}`);
}
await runProcess('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
await runProcess('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
await writeFile(path.join(repo, '.local-dev/macos/candidate-manifest.json'), JSON.stringify({ app, product: 'mixlab-unified-cutter', candidate: true, version: '0.2.0', platform: 'darwin', arch: 'arm64', notarized: false }, null, 2));
console.log(JSON.stringify({ app }));
