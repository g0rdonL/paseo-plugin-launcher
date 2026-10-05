import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";
import { expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The mobile app runs plugin client code on Hermes, which rejects syntax that desktop's V8
// accepts (notably `class`). react-native ships the matching ahead-of-time compiler.
const hermescDir = { darwin: "osx-bin", linux: "linux64-bin", win32: "win64-bin" }[
  process.platform as "darwin" | "linux" | "win32"
];
const hermesc = join(root, "node_modules/react-native/sdks/hermesc", hermescDir, "hermesc");

test("the client bundle compiles under Hermes", async () => {
  expect(existsSync(hermesc), `hermesc not found at ${hermesc}`).toBe(true);
  const bundle = await build({
    entryPoints: [join(root, "index.client.tsx")],
    bundle: true,
    write: false,
    format: "cjs",
    target: "es2016",
    jsx: "automatic",
    external: ["react", "react/jsx-runtime", "react-native", "@getpaseo/*", "@tanstack/*", "zod"],
    logLevel: "silent",
  });
  const dir = await mkdtemp(join(tmpdir(), "plugin-hermes-"));
  try {
    const file = join(dir, "index.client.js");
    await writeFile(file, bundle.outputFiles[0]?.text ?? "");
    // hermesc exits non-zero on a parse error; the diagnostics are on stderr either way.
    const stderr = await promisify(execFile)(hermesc, [
      "-emit-binary",
      "-out",
      join(dir, "index.client.hbc"),
      file,
    ]).then(
      (result) => result.stderr,
      (error: { stderr?: string }) => error.stderr ?? String(error),
    );
    const errors = stderr.split("\n").filter((line) => line.includes("error:"));
    expect(errors, stderr).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
