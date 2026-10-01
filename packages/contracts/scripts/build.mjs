// Build 2 bản:
//  - ESM + .d.ts bằng tsc (dist/esm) cho Vite apps (game, admin) và cho type của mọi consumer.
//  - CJS một file bằng rolldown (dist/cjs/index.js, zod để external) cho NestJS (CommonJS).
// `--watch` chạy tsc --watch cho bản ESM (đủ cho dev game/admin); API dùng bản CJS build lúc chạy script này.
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { rolldown } from 'rolldown';

const watch = process.argv.includes('--watch');
const run = (cmd) => execSync(cmd, { stdio: 'inherit', shell: true });

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/cjs', { recursive: true });
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

const bundle = await rolldown({ input: 'src/index.ts', external: ['zod'], platform: 'node' });
await bundle.write({ format: 'cjs', file: 'dist/cjs/index.js', sourcemap: true });
await bundle.close();

run('tsc -p tsconfig.json');
if (watch) {
  spawn('tsc', ['-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { stdio: 'inherit', shell: true });
}
