const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_VIEWPORTS = [
  { height: 844, name: "mobile", width: 390 },
  { height: 900, name: "desktop", width: 1280 }
];
const PAGE_CHECKS = [
  {
    label: "Baltimore story",
    path: "/?chapter=baltimore&qa=render-smoke",
    requiredSelectors: ['id="jsu-wrapped"', "jsuw-story"],
    requiredText: ["Baltimore", "Share this recap"]
  },
  {
    label: "builder",
    path: "/builder.html?qa=render-smoke",
    requiredSelectors: ['id="wrapped-builder"', "builder-panel--preview"],
    requiredText: ["JSU/NCSY Wrapped customizer", "Send for review"]
  }
];

function hasText(html, text) {
  return String(html || "").toLowerCase().includes(String(text || "").toLowerCase());
}

function validateRenderedDom(check) {
  const errors = [];
  const html = String(check.html || "");
  const label = check.label || "rendered page";

  (check.requiredSelectors || []).forEach((selector) => {
    if (!html.includes(selector)) {
      errors.push(`${label} missing ${selector}`);
    }
  });

  (check.requiredText || []).forEach((text) => {
    if (!hasText(html, text)) {
      errors.push(`${label} missing text ${text}`);
    }
  });

  ["undefined", ">null<", "NaN"].forEach((text) => {
    if (html.includes(text)) {
      errors.push(`${label} contains broken text ${text}`);
    }
  });

  return {
    errors,
    ok: errors.length === 0
  };
}

function candidateBrowserPaths() {
  const env = process.env;
  const candidates = [
    env.BROWSER_BIN,
    env.CHROME_BIN,
    env.EDGE_BIN
  ];

  if (process.platform === "win32") {
    [
      env.PROGRAMFILES,
      env["PROGRAMFILES(X86)"],
      env.LOCALAPPDATA
    ].filter(Boolean).forEach((base) => {
      candidates.push(path.join(base, "Google", "Chrome", "Application", "chrome.exe"));
      candidates.push(path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"));
    });
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    candidates.push("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
  } else {
    candidates.push("/usr/bin/google-chrome");
    candidates.push("/usr/bin/google-chrome-stable");
    candidates.push("/usr/bin/chromium");
    candidates.push("/usr/bin/chromium-browser");
    candidates.push("/usr/bin/microsoft-edge");
  }

  return candidates.filter(Boolean);
}

function browserNamesForPath() {
  return process.platform === "win32"
    ? ["chrome.exe", "msedge.exe"]
    : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"];
}

function findBrowserOnPath() {
  const pathParts = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);

  for (const dir of pathParts) {
    for (const name of browserNamesForPath()) {
      const candidate = path.join(dir, name);

      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return "";
}

function findBrowserExecutable(settings) {
  const candidates = findBrowserCandidates(settings);

  return candidates[0] || "";
}

function uniqueValues(values) {
  const seen = new Set();

  return values.filter((value) => {
    const key = String(value || "").toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function findBrowserCandidates(settings) {
  const explicit = settings && settings.browser;
  const candidates = [];
  const pathBrowser = findBrowserOnPath();

  if (explicit) {
    return fs.existsSync(explicit) ? [explicit] : [];
  }

  if (pathBrowser) {
    candidates.push(pathBrowser);
  }

  candidateBrowserPaths().forEach((candidate) => {
    if (fs.existsSync(candidate)) {
      candidates.push(candidate);
    }
  });

  return uniqueValues(candidates);
}

function probeTimeoutMs(settings) {
  const timeout = Number(settings && settings.timeoutMs) || DEFAULT_TIMEOUT_MS;

  return settings && settings.browser ? timeout : Math.min(timeout, 4000);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function safeFilePath(root, requestUrl) {
  const parsed = new URL(requestUrl, "http://127.0.0.1");
  let pathname = decodeURIComponent(parsed.pathname);

  if (pathname.endsWith("/")) {
    pathname += "index.html";
  }

  pathname = pathname.replace(/^\/+/, "");

  const resolved = path.resolve(root, pathname || "index.html");
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return "";
  }

  return resolved;
}

function createStaticServer(root) {
  return http.createServer((request, response) => {
    const filePath = safeFilePath(root, request.url || "/");

    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentType(filePath)
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port || 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function profileRoot() {
  const dir = path.join(process.cwd(), "qa-artifacts");
  fs.mkdirSync(dir, { recursive: true });
  return fs.mkdtempSync(path.join(dir, "render-smoke-profile-"));
}

function removeProfile(profile) {
  try {
    fs.rmSync(profile, { force: true, recursive: true });
  } catch (error) {
    // A timed-out browser can hold a profile lock briefly on Windows. The
    // qa-artifacts directory is ignored, so cleanup is best effort.
  }
}

function renderWithBrowser(browser, url, viewport, settings) {
  const profile = profileRoot();
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    `--user-data-dir=${profile}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "--virtual-time-budget=7000",
    "--dump-dom",
    url
  ];

  try {
    const result = childProcess.spawnSync(browser, args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: settings.timeoutMs + 10000
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `browser exited with code ${result.status}`).trim());
    }

    return result.stdout || "";
  } finally {
    removeProfile(profile);
  }
}

function probeBrowser(browser, settings) {
  const profile = profileRoot();
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    `--user-data-dir=${profile}`,
    "--window-size=390,844",
    "--virtual-time-budget=1000",
    "--dump-dom",
    "data:text/html,<title>render-smoke-probe</title><main>render smoke probe</main>"
  ];

  try {
    const result = childProcess.spawnSync(browser, args, {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      timeout: probeTimeoutMs(settings)
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0 || !String(result.stdout || "").includes("render smoke probe")) {
      throw new Error((result.stderr || result.stdout || `browser exited with code ${result.status}`).trim());
    }
  } finally {
    removeProfile(profile);
  }
}

function renderPlan(baseUrl) {
  return PAGE_CHECKS.flatMap((check) => DEFAULT_VIEWPORTS.map((viewport) => ({
    label: `${check.label} / ${viewport.name}`,
    url: new URL(check.path, baseUrl).toString(),
    viewport
  })));
}

async function runRenderSmoke(settings) {
  const root = process.cwd();
  const browsers = findBrowserCandidates(settings);
  const launchErrors = [];

  if (!browsers.length) {
    if (settings.skipIfMissing) {
      console.log("render smoke skipped: Chrome/Edge browser executable not found");
      return { ok: true, skipped: true };
    }

    throw new Error("Chrome/Edge browser executable not found. Set BROWSER_BIN or pass --browser.");
  }

  const server = createStaticServer(root);
  const port = await listen(server, settings.port || 0);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const errors = [];

  try {
    for (const browser of browsers) {
      try {
        probeBrowser(browser, settings);

        renderPlan(baseUrl).forEach((item) => {
          const html = renderWithBrowser(browser, item.url, item.viewport, settings);
          const pageCheck = PAGE_CHECKS.find((check) => item.label.indexOf(check.label) === 0);
          const report = validateRenderedDom(Object.assign({}, pageCheck, {
            html,
            label: item.label
          }));

          errors.push(...report.errors);
        });

        return {
          browser,
          errors,
          ok: errors.length === 0,
          skipped: false
        };
      } catch (error) {
        launchErrors.push(`${browser}: ${error.message}`);
      }
    }
  } finally {
    await closeServer(server);
  }

  if (settings.skipIfMissing) {
    console.log("render smoke skipped: no installed Chrome/Edge candidate completed a headless render");
    launchErrors.forEach((error) => {
      console.log(`- ${error}`);
    });
    return { ok: true, skipped: true };
  }

  return {
    errors: launchErrors,
    ok: false,
    skipped: false
  };
}

function parseArgs(args) {
  const settings = {
    browser: "",
    dryRun: false,
    port: 0,
    skipIfMissing: false,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--browser") {
      settings.browser = args[index + 1] || "";
      index += 1;
    } else if (arg === "--port") {
      settings.port = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--timeout-ms") {
      settings.timeoutMs = Number(args[index + 1]) || DEFAULT_TIMEOUT_MS;
      index += 1;
    } else if (arg === "--skip-if-missing") {
      settings.skipIfMissing = true;
    } else if (arg === "--dry-run") {
      settings.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      settings.help = true;
    }
  }

  return settings;
}

function usage() {
  return [
    "Usage:",
    "  node render-smoke.js [--skip-if-missing] [--browser path/to/chrome] [--timeout-ms 20000] [--dry-run]",
    "",
    "Serves the static widget locally and uses Chrome/Edge headless to confirm the story and builder render real DOM."
  ].join("\n");
}

async function main() {
  const settings = parseArgs(process.argv.slice(2));

  if (settings.help) {
    console.log(usage());
    return;
  }

  if (settings.dryRun) {
    console.log("Render smoke plan for local static server:");
    renderPlan("http://127.0.0.1:12345/").forEach((item) => {
      console.log(`- ${item.label}: ${item.url}`);
    });
    return;
  }

  console.log("render smoke checking local story and builder");
  const report = await runRenderSmoke(settings);

  if (!report.ok) {
    console.error("render smoke failed:");
    report.errors.forEach((error) => {
      console.error(`- ${error}`);
    });
    process.exit(1);
  }

  console.log(report.skipped ? "render smoke skipped" : "render smoke ok");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`render smoke failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  findBrowserCandidates,
  findBrowserExecutable,
  probeTimeoutMs,
  renderPlan,
  runRenderSmoke,
  validateRenderedDom
};
