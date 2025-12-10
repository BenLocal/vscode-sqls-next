export function getBasePath(): string {
  const arch = process.arch === "arm64" ? "arm64" : "amd64";

  let os = "linux";
  if (process.platform === "win32") {
    os = "windows";
  } else if (process.platform === "darwin") {
    os = "darwin";
  }

  return `${os}_${arch}`;
}
