import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [backend, versioned] = process.argv.slice(2);
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));

const env = {
  ...process.env,
  VITE_APP_BACKEND: backend || "nwjs",
};

if (versioned === "versioned") {
  env.VITE_APP_VERSION = process.env.npm_package_version;
}

const child = spawn(process.execPath, [viteBin, "build"], {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
