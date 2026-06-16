import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const exportDir = path.join(process.cwd(), "emails", "export");
const securityExportDir = path.join(exportDir, "security");

await rm(exportDir, { recursive: true, force: true });

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "email",
    "export",
    "--dir",
    "emails/previews",
    "--outDir",
    "emails/export",
    "--pretty",
  ],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!existsSync(exportDir)) {
  process.exit(0);
}

await mkdir(securityExportDir, { recursive: true });

for (const fileName of await readdir(exportDir)) {
  if (!/^security-.+\.html$/.test(fileName)) {
    continue;
  }

  await rename(
    path.join(exportDir, fileName),
    path.join(securityExportDir, fileName)
  );
}
