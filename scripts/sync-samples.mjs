/**
 * 把 samples/ 下的脱敏样例复制到 public/samples/，供前端「一键体验」直接 fetch。
 * ------------------------------------------------------------------
 * 为什么不手工复制两份：
 *   仓库里只保留 samples/ 这一份真相，public/ 下的是构建产物（已 gitignore）。
 *   `npm run dev` / `npm run build` 前会自动执行本脚本（predev / prebuild）。
 */

import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, "samples");
const to = join(root, "public", "samples");

await mkdir(to, { recursive: true });

const files = (await readdir(from)).filter((f) => f.endsWith(".csv") || f.endsWith(".txt"));
for (const file of files) {
  await copyFile(join(from, file), join(to, file));
}

const bytes = (
  await Promise.all(files.map(async (f) => (await stat(join(from, f)).catch(() => ({ size: 0 }))).size))
).reduce((a, b) => a + b, 0);

console.log(`[sync-samples] ${files.length} 个样例已同步到 public/samples（${(bytes / 1024).toFixed(1)} KB）`);
