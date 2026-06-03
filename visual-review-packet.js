const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const api = require("./jsu-wrapped.js");
const renderSmoke = require("./render-smoke.js");

const DEFAULT_URL = "https://ncsy.org/ncsy-wrapped/?chapter=baltimore";
const DEFAULT_TIMEOUT_MS = 30000;
const VIEWPORTS = [
  { height: 844, name: "mobile", width: 390 },
  { height: 900, name: "desktop", width: 1280 }
];
const CAPTURES = [
  { card: null, id: "chapter-picker", picker: true },
  { card: 1, id: "chapter-cover" },
  { card: 4, id: "chapter-moments" },
  { card: "final", id: "chapter-final" }
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "capture";
}

function defaultOutputDir() {
  return path.join(process.cwd(), "qa-artifacts", `visual-review-${timestamp()}`);
}

function withCaptureParams(baseUrl, capture) {
  const parsed = new URL(baseUrl || DEFAULT_URL);

  parsed.searchParams.set("qa", "visual-review");
  parsed.searchParams.delete("autoplay");
  parsed.searchParams.delete("duration");

  if (capture.picker) {
    parsed.searchParams.delete("chapter");
    parsed.searchParams.delete("scope");
    parsed.searchParams.delete("region");
    parsed.searchParams.delete("program");
    parsed.searchParams.delete("campaign");
    parsed.searchParams.delete("mode");
    parsed.searchParams.delete("teen");
    parsed.searchParams.delete("card");
    return parsed.toString();
  }

  parsed.searchParams.set("card", String(capture.card));
  return parsed.toString();
}

function loadJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), filePath), "utf8"));
  } catch (error) {
    return null;
  }
}

function finalCardIndex(baseUrl) {
  try {
    const href = baseUrl || DEFAULT_URL;
    const records = loadJsonSafe("sample-wrapped-2026.json");
    const config = loadJsonSafe("wrapped-config-2026.json") || {};
    const request = api.getStoryRequest(href);
    const record = records && api.findStoryRecord(records, request);

    if (!record) {
      return 12;
    }

    const storyConfig = api.resolveStoryConfig(config, record, {
      program: api.getProgramSlug(href),
      variant: api.getVariantSlug(href)
    });
    const cards = api.createCards(api.createEffectiveRecord(record, storyConfig), {
      storyConfig
    });

    return Math.max(1, cards.length || 12);
  } catch (error) {
    return 12;
  }
}

function resolvedCaptures(baseUrl) {
  const finalIndex = finalCardIndex(baseUrl || DEFAULT_URL);

  return CAPTURES.map((capture) => capture.card === "final"
    ? Object.assign({}, capture, { card: finalIndex })
    : capture);
}

function visualReviewPlan(baseUrl) {
  return resolvedCaptures(baseUrl).flatMap((capture) => VIEWPORTS.map((viewport) => ({
    fileName: `${capture.id}-${viewport.name}.png`,
    label: `${capture.id}-${viewport.name}`,
    url: withCaptureParams(baseUrl || DEFAULT_URL, capture),
    viewport
  })));
}

function profileRoot() {
  const dir = path.join(process.cwd(), "qa-artifacts");
  fs.mkdirSync(dir, { recursive: true });
  return fs.mkdtempSync(path.join(dir, "visual-review-profile-"));
}

function removeProfile(profile) {
  try {
    fs.rmSync(profile, { force: true, recursive: true });
  } catch (error) {
    // Chrome can briefly hold profile files on Windows. qa-artifacts is ignored.
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = require("http").get(url, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${url} returned ${response.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`${url} timed out`));
    });
    request.on("error", reject);
  });
}

function openPort() {
  return new Promise((resolve, reject) => {
    const server = require("http").createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForDevTools(port, timeoutMs) {
  const start = Date.now();
  const url = `http://127.0.0.1:${port}/json/version`;

  while (Date.now() - start < timeoutMs) {
    try {
      const version = await requestJson(url, 1000);

      if (version.webSocketDebuggerUrl) {
        return version;
      }
    } catch (error) {
      // Chrome may need a moment to publish the DevTools endpoint.
    }

    await delay(150);
  }

  throw new Error("Chrome DevTools endpoint did not start");
}

function browserArgs(options) {
  const settings = options || {};

  return [
    "--headless",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    `--remote-debugging-port=${settings.port}`,
    `--user-data-dir=${settings.profile}`,
    "about:blank"
  ];
}

async function launchBrowser(browserPath, settings) {
  const port = await openPort();
  const profile = profileRoot();
  const args = browserArgs({ port, profile });
  const child = childProcess.spawn(browserPath, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });
  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    const version = await waitForDevTools(port, Math.min(settings.timeoutMs, 10000));

    return {
      child,
      port,
      profile,
      stderr,
      version
    };
  } catch (error) {
    child.kill("SIGKILL");
    removeProfile(profile);
    throw error;
  }
}

function stopBrowser(browser) {
  if (!browser) {
    return;
  }

  try {
    browser.child.kill("SIGKILL");
  } catch (error) {
    // Already stopped.
  }

  removeProfile(browser.profile);
}

function connectCdp(webSocketUrl) {
  if (typeof WebSocket === "undefined") {
    throw new Error("Node global WebSocket is not available. Use Node 22+ or pass a browser check through another runtime.");
  }

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 1;

    const client = {
      close() {
        socket.close();
      },
      send(method, params) {
        const id = nextId;
        nextId += 1;

        return new Promise((sendResolve, sendReject) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            sendReject(new Error(`CDP command timed out: ${method}`));
          }, 10000);

          pending.set(id, {
            reject: sendReject,
            resolve: sendResolve,
            timer
          });
          socket.send(JSON.stringify({ id, method, params: params || {} }));
        });
      }
    };

    socket.addEventListener("open", () => resolve(client));
    socket.addEventListener("error", (event) => reject(new Error(event.message || "CDP websocket error")));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.id && pending.has(message.id)) {
        const item = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(item.timer);

        if (message.error) {
          item.reject(new Error(message.error.message || "CDP command failed"));
        } else {
          item.resolve(message.result || {});
        }
      }
    });
    socket.addEventListener("close", () => {
      pending.forEach((item) => {
        clearTimeout(item.timer);
        item.reject(new Error("CDP websocket closed"));
      });
      pending.clear();
    });
  });
}

async function createPageCdp(browser, settings) {
  const browserCdp = await connectCdp(browser.version.webSocketDebuggerUrl);
  const target = await browserCdp.send("Target.createTarget", {
    url: "about:blank"
  });
  browserCdp.close();

  const targets = await requestJson(`http://127.0.0.1:${browser.port}/json/list`, settings.timeoutMs);
  const page = targets.find((item) => item.id === target.targetId) || targets.find((item) => item.type === "page");

  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error("Could not locate Chrome page target");
  }

  return connectCdp(page.webSocketDebuggerUrl);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }

  return result.result && result.result.value;
}

async function waitFor(cdp, expression, timeoutMs, label) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await evaluate(cdp, expression)) {
      return true;
    }

    await delay(200);
  }

  throw new Error(`${label} did not become ready`);
}

function readyExpression(item) {
  if (item.label.indexOf("chapter-picker") === 0) {
    return "!!document.querySelector('#jsu-wrapped .jsuw-picker')";
  }

  return "!!document.querySelector('#jsu-wrapped .jsuw-story') && !document.querySelector('#jsu-wrapped .jsuw-loading')";
}

async function captureScreenshot(cdp, item, settings) {
  const outputPath = path.join(settings.outputDir, item.fileName);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: item.viewport.height,
    mobile: item.viewport.name === "mobile",
    width: item.viewport.width
  });
  await cdp.send("Page.navigate", { url: item.url });
  await waitFor(cdp, "document.readyState === 'interactive' || document.readyState === 'complete'", settings.timeoutMs, "document load");
  await waitFor(cdp, readyExpression(item), settings.timeoutMs, item.label);
  await delay(700);

  const result = await cdp.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true
  });
  const bytes = Buffer.from(result.data || "", "base64");

  if (bytes.length < 1024) {
    throw new Error(`screenshot was not captured or is too small: ${item.label}`);
  }

  fs.writeFileSync(outputPath, bytes);
  return outputPath;
}

function writeManifest(outputDir, baseUrl, files) {
  const lines = [
    "# JSU/NCSY Wrapped Visual Review Packet",
    "",
    `Source URL: ${baseUrl}`,
    "",
    "Review these screenshots for clipped controls, overlapping text, missing logos, broken numbers, awkward first-load height, and desktop/mobile framing.",
    "",
    ...files.map((file) => `- ${path.basename(file)}`)
  ];
  const manifestPath = path.join(outputDir, "README.md");

  fs.writeFileSync(manifestPath, lines.join("\n") + "\n");
  return manifestPath;
}

async function runVisualReviewPacket(settings) {
  const options = settings || {};
  const browsers = renderSmoke.findBrowserCandidates(options);
  const errors = [];

  if (!browsers.length) {
    if (options.skipIfMissing) {
      console.log("visual review packet skipped: Chrome/Edge browser executable not found");
      return { ok: true, skipped: true };
    }

    throw new Error("Chrome/Edge browser executable not found. Set BROWSER_BIN or pass --browser.");
  }

  fs.mkdirSync(options.outputDir, { recursive: true });

  for (const browserPath of browsers) {
    let browser = null;
    let cdp = null;
    const files = [];

    try {
      browser = await launchBrowser(browserPath, options);
      cdp = await createPageCdp(browser, options);

      for (const item of visualReviewPlan(options.url)) {
        files.push(await captureScreenshot(cdp, item, options));
      }

      const manifestPath = writeManifest(options.outputDir, options.url, files);

      return {
        browser: browserPath,
        files,
        manifestPath,
        ok: true,
        outputDir: options.outputDir,
        skipped: false
      };
    } catch (error) {
      errors.push(`${browserPath}: ${error.message}`);
    } finally {
      if (cdp) {
        cdp.close();
      }
      stopBrowser(browser);
    }
  }

  return {
    errors,
    ok: false,
    skipped: false
  };
}

function parseArgs(args) {
  const settings = {
    browser: "",
    dryRun: false,
    outputDir: "",
    skipIfMissing: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    url: DEFAULT_URL
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--url") {
      settings.url = args[index + 1] || DEFAULT_URL;
      index += 1;
    } else if (arg === "--browser") {
      settings.browser = args[index + 1] || "";
      index += 1;
    } else if (arg === "--out") {
      settings.outputDir = path.resolve(args[index + 1] || "");
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

  if (!settings.outputDir) {
    settings.outputDir = defaultOutputDir();
  }

  return settings;
}

function usage() {
  return [
    "Usage:",
    '  node visual-review-packet.js [--url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"] [--out qa-artifacts/visual-review] [--browser path/to/chrome] [--timeout-ms 30000] [--skip-if-missing] [--dry-run]',
    "",
    "Captures mobile and desktop screenshots for the picker, cover card, engagement moments card, and final card into qa-artifacts for human visual launch review."
  ].join("\n");
}

async function main() {
  const settings = parseArgs(process.argv.slice(2));

  if (settings.help) {
    console.log(usage());
    return;
  }

  if (settings.dryRun) {
    console.log("Visual review packet plan");
    console.log(`Output folder: ${settings.outputDir}`);
    visualReviewPlan(settings.url).forEach((item) => {
      console.log(`- ${item.label}: ${item.viewport.width}x${item.viewport.height} ${item.url}`);
    });
    return;
  }

  console.log(`visual review packet capturing ${settings.url}`);
  const report = await runVisualReviewPacket(settings);

  if (!report.ok) {
    console.error("visual review packet failed:");
    (report.errors || []).forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  if (report.skipped) {
    console.log("visual review packet skipped");
    return;
  }

  console.log(`visual review packet written to ${report.outputDir}`);
  console.log(`manifest: ${report.manifestPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`visual review packet failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  CAPTURES,
  VIEWPORTS,
  browserArgs,
  finalCardIndex,
  parseArgs,
  runVisualReviewPacket,
  visualReviewPlan,
  withCaptureParams
};
