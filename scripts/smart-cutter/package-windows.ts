import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { fileDigest } from '../../packages/smart-cutter/src/media.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.join(repo, 'apps/smart-cutter-desktop/src-tauri');
async function npm(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [process.env.npm_execpath!, ...args], { cwd: repo, stdio: 'inherit', shell: false });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Packaging step failed: ${args.join(' ')}`)));
  });
}
await mkdir(path.join(root, 'binaries'), { recursive: true });
await build({ entryPoints: [path.join(repo, 'scripts/servers/smart-cutter-api-server.ts')], outfile: path.join(root, 'binaries/smart-cutter-api.bundle.mjs'),
  bundle: true, platform: 'node', target: 'node24', format: 'esm', banner: { js: 'import {createRequire as __createRequire} from "node:module"; const require=__createRequire(import.meta.url);' }, sourcemap: false });
if (process.argv.includes('--bundle-only')) process.exit(0);
if (process.platform !== 'win32') throw new Error('NSIS 安装包需要 Windows 构建机；Mac 可使用 --bundle-only 验证本机引擎。');
await npm(['run', 'prepare:smart-cutter-runtime']);
await npm(['run', 'build', '-w', '@mixlab/smart-cutter-desktop']);
const nsis = path.join(root, 'target/release/bundle/nsis');
const installers = (await readdir(nsis)).filter(name => name.endsWith('.exe'));
if (installers.length !== 1) throw new Error('Windows packaging did not produce exactly one installer');
const artifact = path.join(nsis, installers[0]!), hash = await fileDigest(artifact);
await writeFile(path.join(nsis, 'installer.json'), JSON.stringify({ product: 'mixlab-smart-cutter', version: '0.1.0', file: installers[0], sha256: hash }, null, 2));
console.log(JSON.stringify({ installer: artifact, sha256: hash }));
