import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    target: "node20",
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node20",
    dts: true,
    sourcemap: true,
    splitting: false,
  },
  {
    entry: ["src/action.ts"],
    format: ["esm"],
    target: "node20",
    dts: false,
    sourcemap: true,
    splitting: false,
  },
]);