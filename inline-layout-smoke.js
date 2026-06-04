const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const renderSmoke = require("./render-smoke.js");

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_VIEWPORTS = [
  { height: 844, name: "mobile", width: 390 },
  { height: 900, name: "desktop", width: 1280 },
  { height: 932, name: "wide-mobile", width: 430 }
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function localizeInlineEmbed(body) {
  return String(body)
    .replace(/data-source="https:\/\/stsimon-ncsy\.github\.io\/jsu-wrapped-widget\/sample-wrapped-2026\.json\?v=[^"]+"/, 'data-source="/sample-wrapped-2026.json"')
    .replace(/data-config-source="https:\/\/stsimon-ncsy\.github\.io\/jsu-wrapped-widget\/wrapped-config-2026\.json\?v=[^"]+"/, 'data-config-source="/wrapped-config-2026.json"')
    .replace(/data-teen-source="https:\/\/stsimon-ncsy\.github\.io\/jsu-wrapped-widget\/sample-teen-wrapped-2026\.json\?v=[^"]+"/, 'data-teen-source="/sample-teen-wrapped-2026.json"')
    .replace(/data-assets-base="https:\/\/stsimon-ncsy\.github\.io\/jsu-wrapped-widget\/assets\/"/, 'data-assets-base="/assets/"')
    .replace(/data-share-base="https:\/\/stsimon-ncsy\.github\.io\/jsu-wrapped-widget\/share\/"/, 'data-share-base="/share/"');
}

function createStaticServer(root) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === "/" ? "wordpress-inline-embed.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(root, relativePath);

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, body) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "Content-Type": contentType(filePath) });
      response.end(path.basename(filePath) === "wordpress-inline-embed.html" ? localizeInlineEmbed(body) : body);
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
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
  return fs.mkdtempSync(path.join(dir, "inline-layout-profile-"));
}

function removeProfile(profile) {
  try {
    fs.rmSync(profile, { force: true, recursive: true });
  } catch (error) {
    // Chrome can hold profile files briefly on Windows.
  }
}

function requestJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
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
    const server = http.createServer();

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
      // Chrome may need a moment to publish the endpoint.
    }

    await delay(150);
  }

  throw new Error("Chrome DevTools endpoint did not start");
}

async function launchBrowser(browserPath, settings) {
  const port = await openPort();
  const profile = profileRoot();
  const child = childProcess.spawn(browserPath, [
    "--headless",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank"
  ], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });

  try {
    const version = await waitForDevTools(port, Math.min(settings.timeoutMs, 10000));

    return { child, port, profile, version };
  } catch (error) {
    child.kill("SIGKILL");
    removeProfile(profile);
    throw error;
  }
}

function stopBrowser(browser) {
  if (!browser) return;

  try {
    browser.child.kill("SIGKILL");
  } catch (error) {
    // Already stopped.
  }

  removeProfile(browser.profile);
}

function connectCdp(webSocketUrl) {
  if (typeof WebSocket === "undefined") {
    throw new Error("Node global WebSocket is not available. Use Node 22+.");
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

          pending.set(id, { reject: sendReject, resolve: sendResolve, timer });
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
  });
}

async function createPage(cdp) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const start = Date.now();
  let page = null;

  while (!page && Date.now() - start < DEFAULT_TIMEOUT_MS) {
    const targets = await requestJson(`http://127.0.0.1:${cdp.port}/json/list`, DEFAULT_TIMEOUT_MS);
    page = targets.find((item) => item.id === target.targetId);

    if (!page) {
      await delay(150);
    }
  }

  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error("Chrome page target was not available");
  }

  const pageCdp = await connectCdp(page.webSocketDebuggerUrl);
  pageCdp.targetId = target.targetId;
  return pageCdp;
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

async function waitForExpression(cdp, expression, timeoutMs, label) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const value = await evaluate(cdp, expression);

    if (value) {
      return;
    }

    await delay(150);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

function diagnosticSnapshotScript() {
  return `(() => {
    const root = document.querySelector('#jsu-wrapped');
    const loading = root && root.querySelector('.jsuw-loading');
    const error = root && root.querySelector('.jsuw-error, .jsuw-error-card');

    return {
      bodyText: (document.body && document.body.innerText || '').slice(0, 500),
      hasRoot: !!root,
      href: location.href,
      loadingText: loading ? loading.textContent : '',
      rootText: (root && root.innerText || '').slice(0, 500),
      shellClass: root && root.querySelector('.jsuw-shell') ? root.querySelector('.jsuw-shell').className : '',
      errorText: error ? error.textContent : ''
    };
  })()`;
}

async function measureLayout(cdp, url, viewport, timeoutMs) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: viewport.height,
    mobile: false,
    width: viewport.width
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url });
  await waitForExpression(cdp, "document.readyState === 'interactive' || document.readyState === 'complete'", timeoutMs, "document load");
  try {
    await waitForExpression(cdp, "!!document.querySelector('#jsu-wrapped .jsuw-story') && !document.querySelector('#jsu-wrapped .jsuw-loading')", timeoutMs, "inline story");
  } catch (error) {
    let diagnostics = {};

    try {
      diagnostics = await evaluate(cdp, diagnosticSnapshotScript());
    } catch (diagnosticError) {
      diagnostics = { diagnosticError: diagnosticError.message };
    }

    throw new Error(`${error.message}; diagnostics=${JSON.stringify(diagnostics)}`);
  }
  await delay(800);

  return evaluate(cdp, `(() => {
      const shell = document.getElementById("jsu-wrapped-wordpress-shell");
      const stage = document.querySelector("#jsu-wrapped-wordpress-shell .jsuw-page-stage");
      const story = document.querySelector("#jsu-wrapped .jsuw-story, #jsu-wrapped .jsuw-shell--loading .jsuw-loading");
      const legal = document.querySelector("#jsu-wrapped-wordpress-shell .jsuw-legal");
      const doc = document.documentElement;
      const body = document.body;
      const rect = (node) => {
        if (!node) return null;
        const value = node.getBoundingClientRect();
        return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width };
      };
      const shellStyle = shell ? getComputedStyle(shell) : null;
      const maxScrollWidth = Math.max(doc ? doc.scrollWidth : 0, body ? body.scrollWidth : 0, shell ? shell.scrollWidth : 0);
      const maxScrollHeight = Math.max(doc ? doc.scrollHeight : 0, body ? body.scrollHeight : 0);
      const shellRect = rect(shell);
      const storyRect = rect(story);
      const legalRect = rect(legal);
      return {
        bodyOverflowY: body ? getComputedStyle(body).overflowY : "",
        documentVerticalOverflow: maxScrollHeight > window.innerHeight + 2,
        horizontalOverflow: maxScrollWidth > window.innerWidth + 2,
        legalRect,
        maxScrollHeight,
        maxScrollWidth,
        shellClientHeight: shell ? shell.clientHeight : 0,
        shellClientWidth: shell ? shell.clientWidth : 0,
        shellOverflowY: shellStyle ? shellStyle.overflowY : "",
        shellPosition: shellStyle ? shellStyle.position : "",
        shellRect,
        shellScrollHeight: shell ? shell.scrollHeight : 0,
        shellScrollWidth: shell ? shell.scrollWidth : 0,
        stageRect: rect(stage),
        storyRect,
        storyTouchesLegal: !!(storyRect && legalRect && storyRect.bottom > legalRect.top - 2),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      };
    })()`);
}

function validateMeasurement(label, measurement) {
  const errors = [];

  if (measurement.horizontalOverflow) {
    errors.push(`${label} has horizontal overflow (${measurement.maxScrollWidth}px > ${measurement.viewportWidth}px)`);
  }

  if (measurement.shellPosition === "fixed") {
    errors.push(`${label} shell is fixed-position and can block the surrounding WordPress page from scrolling`);
  }

  if (measurement.storyTouchesLegal) {
    errors.push(`${label} story overlaps the legal footer reserve`);
  }

  if (!measurement.storyRect || measurement.storyRect.height < Math.min(520, measurement.viewportHeight * 0.72)) {
    errors.push(`${label} story frame is too short (${measurement.storyRect && Math.round(measurement.storyRect.height)}px)`);
  }

  return errors;
}

async function runInlineLayoutSmoke(settings) {
  const root = process.cwd();
  const server = createStaticServer(root);
  const port = await listen(server);
  const browserPath = settings.browser || renderSmoke.findBrowserExecutable(settings);

  if (!browserPath) {
    if (settings.skipIfMissing) {
      console.log("inline layout smoke skipped: Chrome/Edge browser executable not found");
      await closeServer(server);
      return { ok: true, skipped: true };
    }

    throw new Error("Chrome/Edge browser executable not found. Set --browser or BROWSER_BIN.");
  }

  let browser = null;
  let rootCdp = null;
  const errors = [];

  try {
    browser = await launchBrowser(browserPath, settings);
    rootCdp = await connectCdp(browser.version.webSocketDebuggerUrl);
    rootCdp.port = browser.port;

    for (const viewport of settings.viewports) {
      const pageCdp = await createPage(rootCdp);
      const url = `http://127.0.0.1:${port}/wordpress-inline-embed.html?chapter=baltimore&qa=inline-layout-smoke`;

      try {
        const measurement = await measureLayout(pageCdp, url, viewport, settings.timeoutMs);
        errors.push(...validateMeasurement(viewport.name, measurement));
        const storyHeight = measurement.storyRect ? `${Math.round(measurement.storyRect.height)}px` : "missing";
        console.log(`${viewport.name}: story ${storyHeight}, shell ${measurement.shellClientWidth}x${measurement.shellClientHeight}, overflowY=${measurement.shellOverflowY}`);
      } finally {
        pageCdp.close();
        if (pageCdp.targetId) {
          await rootCdp.send("Target.closeTarget", { targetId: pageCdp.targetId });
        }
      }
    }
  } finally {
    if (rootCdp) rootCdp.close();
    stopBrowser(browser);
    await closeServer(server);
  }

  return { errors, ok: errors.length === 0, skipped: false };
}

function parseArgs(args) {
  const settings = {
    browser: process.env.BROWSER_BIN || "",
    skipIfMissing: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    viewports: DEFAULT_VIEWPORTS
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--browser") {
      settings.browser = args[index + 1] || "";
      index += 1;
    } else if (arg === "--skip-if-missing") {
      settings.skipIfMissing = true;
    } else if (arg === "--timeout-ms") {
      settings.timeoutMs = Number(args[index + 1]) || DEFAULT_TIMEOUT_MS;
      index += 1;
    } else if (arg === "--help") {
      settings.help = true;
    }
  }

  return settings;
}

function usage() {
  return [
    "Usage:",
    "  node inline-layout-smoke.js [--browser path/to/chrome] [--timeout-ms 30000] [--skip-if-missing]",
    "",
    "Serves wordpress-inline-embed.html locally and checks the story-state WordPress shell for overflow, footer overlap, and viewport fit."
  ].join("\n");
}

async function main() {
  const settings = parseArgs(process.argv.slice(2));

  if (settings.help) {
    console.log(usage());
    return;
  }

  console.log("inline layout smoke checking wordpress-inline-embed.html");
  const report = await runInlineLayoutSmoke(settings);

  if (!report.ok) {
    console.error("inline layout smoke failed:");
    report.errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log(report.skipped ? "inline layout smoke skipped" : "inline layout smoke ok");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`inline layout smoke failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  runInlineLayoutSmoke,
  validateMeasurement
};
