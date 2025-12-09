#!/usr/bin/env ts-node

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getBasePath } from "../src/util/platform";

const SQLS_REPO = "https://github.com/BenLocal/sqls.git";
const SQLS_BRANCH = "self";
const PROJECT_ROOT = path.join(__dirname, "..");
const BUILD_DIR = path.join(PROJECT_ROOT, ".build");
const SQLS_DIR = path.join(BUILD_DIR, "sqls");
const IS_RELEASE = process.argv.includes("--release");
const CURRENT_REVISION = execSync("git rev-parse --short HEAD", {
  encoding: "utf-8",
}).trim();
const BUILD_LDFLAGS = `-s -w -X main.revision=${CURRENT_REVISION}`;

function execCommand(command: string, cwd?: string): string {
  console.log(`\x1b[36m[RUN]\x1b[0m ${command}`);
  try {
    const output = execSync(command, {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "inherit"],
    });
    return output;
  } catch (error: any) {
    console.error(`\x1b[31m[ERROR]\x1b[0m Command failed: ${command}`);
    throw error;
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    console.log(`\x1b[33m[CREATE DIR]\x1b[0m ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
}

function checkGoInstalled(): boolean {
  try {
    execSync("go version", { encoding: "utf-8", stdio: "pipe" });
  } catch {
    return false;
  }
  return true;
}

function cloneOrUpdateRepo(): void {
  if (fs.existsSync(SQLS_DIR)) {
    console.log(`\x1b[33m[UPDATE REPO]\x1b[0m ${SQLS_DIR}`);
    execCommand("git fetch --all", SQLS_DIR);
  } else {
    console.log(`\x1b[32m[CLONE REPO]\x1b[0m ${SQLS_REPO} -> ${SQLS_DIR}`);
    ensureDir(BUILD_DIR);
    execCommand(`git clone ${SQLS_REPO} ${SQLS_DIR}`);
  }
}

function checkoutBranch(): void {
  console.log(`\x1b[32m[CHECKOUT BRANCH]\x1b[0m ${SQLS_BRANCH}`);
  execCommand(`git checkout ${SQLS_BRANCH}`, SQLS_DIR);
  execCommand(`git pull origin ${SQLS_BRANCH}`, SQLS_DIR);
}

function buildSqls() {
  if (IS_RELEASE) {
    console.log(`\x1b[32m[RELEASE sqls]\x1b[0m xgo cross build...`);
    buildWithXgo();
  } else {
    console.log(`\x1b[32m[BUILD sqls]\x1b[0m Go build...`);
    execCommand("make", SQLS_DIR);
    const binaryPath = path.join(SQLS_DIR, "sqls");
    console.log("\n\x1b[1m\x1b[32m✓ Build succeeded!\x1b[0m");
    console.log(`\x1b[32m[BINARY]\x1b[0m ${binaryPath}`);

    // Print version info
    try {
      const version = execCommand(`${binaryPath} -version`);
      console.log(`\x1b[32m[VERSION]\x1b[0m ${version.trim()}`);
    } catch {
      // sqls may not support -version
      console.log("\x1b[33m[INFO]\x1b[0m Cannot get version info");
    }

    copySqls();
  }
}

function buildWithXgo(): void {
  // install xgo
  execCommand("go install src.techknowlogick.com/xgo@latest");

  const goTarget = getGoTarget();
  const outPrefix = "sqls";
  // --out sqls-<os>-<arch>[.exe]
  execCommand(
    `xgo --out ${outPrefix} --targets=${goTarget} --ldflags='${BUILD_LDFLAGS}' .`,
    SQLS_DIR
  );

  const osArchs = getOsArchs();
  clearServerDir();
  osArchs.forEach(({ osName, arch }) => {
    const suffix = osName === "windows" ? `${arch}.exe` : `${arch}`;
    let platformVersion: string = "";
    if (osName === "windows") {
      platformVersion = "4.0";
    } else if (osName === "darwin") {
      platformVersion = "10.12";
    }
    const dest = path.join(PROJECT_ROOT, "server", `${osName}_${arch}`);
    const file =
      platformVersion === ""
        ? `${outPrefix}-${osName}-${suffix}`
        : `${outPrefix}-${osName}-${platformVersion}-${suffix}`;
    const destFile = osName === "windows" ? `sqls.exe` : `sqls`;
    const srcFile = path.join(SQLS_DIR, file);
    if (fs.existsSync(srcFile)) {
      ensureDir(dest);
      fs.copyFileSync(srcFile, path.join(dest, destFile));
    } else {
      console.error(`\x1b[31m[ERROR]\x1b[0m ${srcFile} not found`);
    }
  });
}

function getOsArchs(): Array<{
  osName: "linux" | "darwin" | "windows";
  arch: "amd64" | "arm64";
}> {
  const archs = ["amd64", "arm64"];
  const osNames = ["linux", "darwin", "windows"];
  return archs.flatMap((arch) =>
    osNames.map((osName) => ({
      osName: osName as "linux" | "darwin" | "windows",
      arch: arch as "amd64" | "arm64",
    }))
  );
}

function getGoTarget(): string {
  const osArchs = getOsArchs();
  return osArchs.map(({ osName, arch }) => `${osName}/${arch}`).join(",");
}

function main(): void {
  console.log("\x1b[1m\x1b[35m=== Start building SQLS ===\x1b[0m\n");

  try {
    // Check Go availability
    if (!checkGoInstalled()) {
      console.error(
        "\x1b[31m[ERROR]\x1b[0m Go is not installed. Please install Go: https://golang.org/dl/"
      );
      process.exit(1);
    }

    const goVersion = execSync("go version", { encoding: "utf-8" }).trim();
    console.log(`\x1b[32m[Go VERSION]\x1b[0m ${goVersion}\n`);

    // Clone or update repo
    cloneOrUpdateRepo();

    // Switch to branch
    checkoutBranch();

    // Build
    buildSqls();

    console.log("\n\x1b[1m\x1b[35m=== Build complete ===\x1b[0m");
  } catch (error: any) {
    console.error("\n\x1b[1m\x1b[31m✗ Build failed\x1b[0m");
    console.error(error.message);
    process.exit(1);
  }
}

function clearServerDir(): void {
  console.log(`\x1b[32m[CLEAR SERVER DIR]\x1b[0m ${PROJECT_ROOT}`);
  fs.rmSync(path.join(PROJECT_ROOT, "server"), {
    recursive: true,
    force: true,
  });
}

function copySqls(): void {
  clearServerDir();
  console.log(`\x1b[32m[COPY sqls]\x1b[0m ${SQLS_DIR} -> ${PROJECT_ROOT}`);
  const file = os.platform() === "win32" ? "sqls.exe" : "sqls";
  const perfix = getBasePath();
  const dest = path.join(PROJECT_ROOT, "server", perfix);
  ensureDir(dest);
  fs.copyFileSync(path.join(SQLS_DIR, file), path.join(dest, file));
}

if (require.main === module) {
  main();
}

export { main as buildSqls };
