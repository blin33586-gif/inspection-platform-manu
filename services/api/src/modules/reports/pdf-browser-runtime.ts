export function resolvePdfBrowserExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
) {
  if (env.PDF_BROWSER_EXECUTABLE?.trim()) return env.PDF_BROWSER_EXECUTABLE.trim();
  if (platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (platform === "win32") return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return "/usr/bin/chromium";
}
