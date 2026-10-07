import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { runProcess } from '../../packages/smart-cutter/src/process.ts';
import { resolveFfmpegRuntime } from '../../packages/ffmpeg-core/src/index.ts';
import { fileDigest } from '../../packages/smart-cutter/src/media.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.join(repo, 'apps/smart-cutter-desktop/src-tauri/runtime');
interface Asset { file: string; url: string; sha256: string }
const manifest = JSON.parse(await readFile(path.join(repo, 'scripts/smart-cutter/runtime-assets.json'), 'utf8')) as {
  node_version: string; node_win_sha256: string; python_version: string; requirements: string[]; assets: Asset[];
};
async function download(url: string, file: string, sha256?: string): Promise<void> {
  if (sha256 && await fileDigest(file).catch(() => '') === sha256) return;
  await mkdir(path.dirname(file), { recursive: true });
  const result = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!result.ok || !result.body) throw new Error(`Runtime asset download failed: ${url} (${result.status})`);
  await pipeline(Readable.fromWeb(result.body as import('node:stream/web').ReadableStream), createWriteStream(file));
  if (sha256 && await fileDigest(file) !== sha256) throw new Error(`Runtime asset checksum mismatch: ${path.basename(file)}`);
}
async function unzip(file: string, destination: string): Promise<void> {
  const code = 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])';
  await runProcess(process.env.MIXLAB_SMART_BUILD_PYTHON || 'python', ['-c', code, file, destination]);
}
for (const asset of manifest.assets) await download(asset.url, path.join(root, asset.file), asset.sha256);
await copyFile(path.join(repo, 'scripts/smart-cutter/ai-worker.py'), path.join(root, 'ai-worker.py'));
await copyFile(path.join(repo, 'scripts/smart-cutter/runtime-assets.json'), path.join(root, 'runtime-assets.json'));
if (process.platform === 'win32') {
  const binaries = path.join(repo, 'apps/smart-cutter-desktop/src-tauri/binaries');
  const temp = path.join(repo, '.local-dev/smart-build-assets'); await mkdir(temp, { recursive: true }); await mkdir(binaries, { recursive: true });
  const archive = path.join(temp, 'node.zip');
  await download(`https://nodejs.org/dist/v${manifest.node_version}/node-v${manifest.node_version}-win-x64.zip`, archive, manifest.node_win_sha256);
  await unzip(archive, temp);
  const nodeRoot = path.join(temp, `node-v${manifest.node_version}-win-x64`);
  await copyFile(path.join(nodeRoot, 'node.exe'), path.join(binaries, 'node.exe'));
  await copyFile(path.join(nodeRoot, 'LICENSE'), path.join(root, 'Node-LICENSE.txt'));
  const python = path.join(root, 'python'); await mkdir(python, { recursive: true });
  const pythonZip = path.join(temp, 'python.zip');
  await download(`https://www.python.org/ftp/python/${manifest.python_version}/python-${manifest.python_version}-embed-amd64.zip`, pythonZip);
  await unzip(pythonZip, python);
  await writeFile(path.join(python, 'python312._pth'), 'python312.zip\n.\nLib/site-packages\nimport site\n');
  await runProcess(process.env.MIXLAB_SMART_BUILD_PYTHON || 'python', ['-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', '--no-compile', '--target', path.join(python, 'Lib/site-packages'), ...manifest.requirements]);
  const ffmpeg = resolveFfmpegRuntime();
  await copyFile(ffmpeg.ffmpeg_path, path.join(binaries, 'ffmpeg.exe')); await copyFile(ffmpeg.ffprobe_path, path.join(binaries, 'ffprobe.exe'));
  for (const [name, source] of [['ffmpeg', 'ffmpeg-static'], ['ffprobe', 'ffprobe-static']]) {
    await copyFile(path.join(repo, 'node_modules', source!, 'LICENSE'), path.join(root, `${name}-LICENSE.txt`)).catch(() => undefined);
  }
}
await writeFile(path.join(root, 'THIRD_PARTY_NOTICES.txt'), `Models: BAAI bge-small-zh-v1.5 (MIT), Xenova ONNX conversion; OpenCV YuNet (MIT).\nhttps://huggingface.co/BAAI/bge-small-zh-v1.5\nhttps://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet\nNoto Sans SC: SIL Open Font License, see fonts/OFL.txt.\nPython: PSF license (python/LICENSE.txt). Node.js: see Node-LICENSE.txt.\nPython dependencies preserve their dist-info license files in Lib/site-packages.\nFFmpeg/FFprobe: bundled static binaries, see ffmpeg-LICENSE.txt and ffprobe-LICENSE.txt.\nCorresponding source/build scripts: https://github.com/eugeneware/ffmpeg-static (b6.1.1), https://github.com/joshwnj/ffprobe-static.\n`);
console.log(JSON.stringify({ runtime_root: root, verified_assets: manifest.assets.length, manifest_sha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') }));
