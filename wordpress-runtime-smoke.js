const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const renderSmoke = require("./render-smoke.js");

const DEFAULT_URL = "https://ncsy.org/ncsy-wrapped/?chapter=baltimore";
const DEFAULT_TIMEOUT_MS = 30000;
const CDP_COMMAND_TIMEOUT_MS = 10000;
const DEFAULT_VIEWPORT = { height: 844, width: 390 };
const REQUIRED_ANALYTICS_EVENTS = [
  "jsu_wrapped_story_view",
  "jsu_wrapped_card_view",
  "jsu_wrapped_card_engagement",
  "jsu_wrapped_share_click",
  "jsu_wrapped_download_click",
  "jsu_wrapped_cta_click"
];
const REQUIRED_CTA_VALUES = [
  "wrapped_chapter",
  "wrapped_chapter_slug",
  "wrapped_region",
  "wrapped_scope",
  "wrapped_slug",
  "wrapped_name",
  "wrapped_year",
  "wrapped_url"
];
const OPTIONAL_CTA_FIELDS = ["wrapped_variant"];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function profileRoot() {
  const dir = path.join(process.cwd(), "qa-artifacts");
  fs.mkdirSync(dir, { recursive: true });
  return fs.mkdtempSync(path.join(dir, "wordpress-runtime-smoke-profile-"));
}

function removeProfile(profile) {
  try {
    fs.rmSync(profile, { force: true, recursive: true });
  } catch (error) {
    // A timed-out browser can hold a profile lock briefly on Windows.
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
      // Chrome may need a moment to publish the DevTools endpoint.
    }

    await delay(150);
  }

  throw new Error("Chrome DevTools endpoint did not start");
}

function browserArgs(settings) {
  const viewport = settings.viewport || DEFAULT_VIEWPORT;

  return [
    "--headless",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    `--remote-debugging-port=${settings.port}`,
    `--user-data-dir=${settings.profile}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank"
  ];
}

async function launchBrowser(settings) {
  const port = await openPort();
  const profile = profileRoot();
  const args = browserArgs(Object.assign({}, settings, { port, profile }));
  const child = childProcess.spawn(settings.browser, args, {
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
    // Already gone.
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
    const listeners = [];
    let nextId = 1;

    const client = {
      close() {
        socket.close();
      },
      onEvent(handler) {
        listeners.push(handler);
      },
      send(method, params) {
        const id = nextId;
        nextId += 1;

        return new Promise((sendResolve, sendReject) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            sendReject(new Error(`CDP command timed out: ${method}`));
          }, CDP_COMMAND_TIMEOUT_MS);

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
        return;
      }

      listeners.forEach((handler) => handler(message));
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
    const value = await evaluate(cdp, expression);

    if (value) {
      return value;
    }

    await delay(200);
  }

  throw new Error(`${label} did not become ready`);
}

function withRuntimeProbe(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("analytics", "1");
  parsed.searchParams.set("qa", parsed.searchParams.get("qa") || "wordpress-runtime-smoke");
  return parsed.toString();
}

function runtimeSnapshotScript() {
  return `(() => {
    const root = document.querySelector('#jsu-wrapped');
    const story = root && root.querySelector('.jsuw-story');
    const shell = root && root.querySelector('.jsuw-shell');
    const rootRect = root ? root.getBoundingClientRect() : { height: 0, width: 0 };
    const storyRect = story ? story.getBoundingClientRect() : { height: 0, width: 0 };
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc ? doc.scrollWidth : 0, body ? body.scrollWidth : 0);
    const text = root ? root.innerText || '' : '';
    const events = (window.dataLayer || [])
      .filter((item) => item && item.event && String(item.event).indexOf('jsu_wrapped') === 0)
      .map((item) => ({
        action: item.action || '',
        card_id: item.card_id || '',
        chapter_slug: item.chapter_slug || '',
        event: item.event || '',
        navigation_method: item.navigation_method || '',
        scope_type: item.scope_type || '',
        variant_slug: item.variant_slug || ''
      }));

    return {
      analyticsEvents: events,
      layout: {
        hasBrokenText: /\\b(undefined|null|NaN)\\b/i.test(text),
        horizontalOverflow: scrollWidth > window.innerWidth + 2,
        rootHeight: rootRect.height,
        shellClass: shell ? shell.className : '',
        storyHeight: storyRect.height,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      }
    };
  })()`;
}

function diagnosticSnapshotScript() {
  return `(() => {
    const root = document.querySelector('#jsu-wrapped');
    const shell = root && root.querySelector('.jsuw-shell');
    const loading = root && root.querySelector('.jsuw-loading');
    const error = root && root.querySelector('.jsuw-error, .jsuw-error-card');
    return {
      bodyText: (document.body && document.body.innerText || '').slice(0, 500),
      hasRoot: !!root,
      href: location.href,
      loadingText: loading ? loading.textContent : '',
      rootText: (root && root.innerText || '').slice(0, 500),
      scriptCount: document.scripts ? document.scripts.length : 0,
      shellClass: shell ? shell.className : '',
      title: document.title,
      errorText: error ? error.textContent : ''
    };
  })()`;
}

function exerciseFinalActionsScript() {
  return `(() => {
    const maxSteps = 24;
    const results = {
      ctaClicked: false,
      downloadClicked: false,
      shareClicked: false
    };

    if (!window.__jsuwRuntimeSmokeDownloadGuard) {
      window.__jsuwRuntimeSmokeDownloadGuard = true;
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          return undefined;
        }
        return originalClick.call(this);
      };
    }

    function clickNext() {
      const next = document.querySelector('[data-jsuw-action="next"]');
      if (next) {
        next.click();
        return true;
      }
      return false;
    }

    function finalActionsReady() {
      return document.querySelector('[data-jsuw-action="share"]') &&
        document.querySelector('[data-jsuw-action="download"]') &&
        document.querySelector('[data-jsuw-action="cta"]');
    }

    function clickAction(action) {
      const button = document.querySelector('[data-jsuw-action="' + action + '"]');
      if (!button) {
        return false;
      }
      button.click();
      return true;
    }

    return new Promise((resolve) => {
      let step = 0;
      const timer = setInterval(() => {
        if (finalActionsReady()) {
          clearInterval(timer);
          results.shareClicked = clickAction('share');
          setTimeout(() => {
            results.downloadClicked = clickAction('download');
            setTimeout(() => {
              results.ctaClicked = clickAction('cta');
              setTimeout(() => resolve(results), 750);
            }, 250);
          }, 250);
          return;
        }

        step += 1;
        if (step > maxSteps || !clickNext()) {
          clearInterval(timer);
          resolve(results);
        }
      }, 140);
    });
  })()`;
}

function ctaSnapshotScript() {
  const allNames = REQUIRED_CTA_VALUES.concat(OPTIONAL_CTA_FIELDS);

  return `(() => {
    const panel = document.querySelector('#jsuw-wrapped-interest');
    const names = ${JSON.stringify(allNames)};
    const values = {};
    const fieldNames = [];

    if (panel) {
      Array.from(panel.querySelectorAll('input, textarea, select')).forEach((field) => {
        if (field.name) {
          fieldNames.push(field.name);
        }
      });

      names.forEach((name) => {
        const field = panel.querySelector('[name="' + name + '"], [data-jsuw-prefill="' + name + '"], [data-jsuw-prefill-field="' + name + '"]');
        values[name] = field ? field.value || '' : '';
      });
    }

    return {
      open: !!(panel && !panel.hidden && panel.getAttribute('aria-hidden') !== 'true' && panel.classList.contains('jsuw-form-panel--open')),
      fieldNames,
      values
    };
  })()`;
}

async function collectRuntimeResult(cdp, url, settings) {
  const runtimeUrl = withRuntimeProbe(url);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 2,
    height: settings.viewport.height,
    mobile: true,
    width: settings.viewport.width
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.send("Page.navigate", { url: runtimeUrl });
  try {
    await waitFor(cdp, `location.href !== 'about:blank' && location.href.indexOf(${JSON.stringify(new URL(runtimeUrl).origin)}) === 0`, settings.timeoutMs, "target navigation");
  } catch (error) {
    let diagnostics = {};

    try {
      diagnostics = await evaluate(cdp, diagnosticSnapshotScript());
    } catch (diagnosticError) {
      diagnostics = { diagnosticError: diagnosticError.message };
    }

    throw new Error(`${error.message}; diagnostics=${JSON.stringify(diagnostics)}`);
  }
  await waitFor(cdp, "document.readyState === 'interactive' || document.readyState === 'complete'", settings.timeoutMs, "document load");
  try {
    await waitFor(cdp, "!!document.querySelector('#jsu-wrapped .jsuw-story') && !document.querySelector('#jsu-wrapped .jsuw-loading')", settings.timeoutMs, "Wrapped story");
  } catch (error) {
    let diagnostics = {};

    try {
      diagnostics = await evaluate(cdp, diagnosticSnapshotScript());
    } catch (diagnosticError) {
      diagnostics = { diagnosticError: diagnosticError.message };
    }

    throw new Error(`${error.message}; diagnostics=${JSON.stringify(diagnostics)}`);
  }

  const snapshot = await evaluate(cdp, runtimeSnapshotScript());
  const actionResults = await evaluate(cdp, exerciseFinalActionsScript());
  const cta = actionResults && actionResults.ctaClicked ? await evaluate(cdp, ctaSnapshotScript()) : { open: false, values: {} };
  const afterCta = await evaluate(cdp, runtimeSnapshotScript());

  return Object.assign({}, afterCta, {
    actionResults,
    cta,
    layout: Object.assign({}, snapshot.layout, afterCta.layout)
  });
}

function hasAnalyticsContext(event) {
  return Boolean(event && event.chapter_slug && event.scope_type);
}

function validateRuntimeResult(result) {
  const errors = [];
  const report = result || {};
  const actionResults = report.actionResults || {};
  const layout = report.layout || {};
  const cta = report.cta || {};
  const ctaValues = cta.values || {};
  const events = report.analyticsEvents || [];
  const eventNames = new Set(events.map((event) => event && event.event).filter(Boolean));
  const minStoryHeight = Math.min(Number(layout.viewportHeight) * 0.9, Number(layout.viewportHeight) - 24);

  if (!layout.viewportHeight || !layout.rootHeight || layout.rootHeight < minStoryHeight) {
    errors.push(`mobile story height is too short: ${Math.round(layout.rootHeight || 0)}px for ${Math.round(layout.viewportHeight || 0)}px viewport`);
  }

  if (layout.horizontalOverflow) {
    errors.push("mobile runtime has horizontal overflow");
  }

  if (layout.hasBrokenText) {
    errors.push("mobile runtime contains undefined/null/NaN broken text");
  }

  REQUIRED_ANALYTICS_EVENTS.forEach((name) => {
    if (!eventNames.has(name)) {
      errors.push(`missing analytics event ${name}`);
    }
  });

  REQUIRED_ANALYTICS_EVENTS.forEach((name) => {
    const event = events.find((item) => item.event === name);

    if (event && !hasAnalyticsContext(event)) {
      errors.push(`analytics event ${name} is missing chapter/scope context`);
    }
  });

  if (!cta.open) {
    errors.push("CTA form did not open");
  }

  if (!actionResults.shareClicked) {
    errors.push("Share button was not exercised on the final card");
  }

  if (!actionResults.downloadClicked) {
    errors.push("Download button was not exercised on the final card");
  }

  if (!actionResults.ctaClicked) {
    errors.push("CTA button was not exercised on the final card");
  }

  REQUIRED_CTA_VALUES.forEach((name) => {
    if (!ctaValues[name]) {
      errors.push(`CTA form missing populated ${name}`);
    }
  });

  if (Array.isArray(cta.fieldNames) && cta.fieldNames.length) {
    OPTIONAL_CTA_FIELDS.forEach((name) => {
      if (!cta.fieldNames.includes(name)) {
        errors.push(`CTA form missing optional context field ${name}`);
      }
    });
  }

  return {
    errors,
    ok: errors.length === 0
  };
}

async function runRuntimeSmoke(settings) {
  const options = Object.assign({
    browser: "",
    skipIfMissing: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    url: DEFAULT_URL,
    viewport: DEFAULT_VIEWPORT
  }, settings || {});
  const browsers = renderSmoke.findBrowserCandidates(options);
  const launchErrors = [];

  if (!browsers.length) {
    if (options.skipIfMissing) {
      console.log("wordpress runtime smoke skipped: Chrome/Edge browser executable not found");
      return { ok: true, skipped: true };
    }

    throw new Error("Chrome/Edge browser executable not found. Set BROWSER_BIN or pass --browser.");
  }

  for (const browserPath of browsers) {
    let browser = null;
    let cdp = null;

    try {
      browser = await launchBrowser(Object.assign({}, options, { browser: browserPath }));
      cdp = await createPageCdp(browser, options);
      const result = await collectRuntimeResult(cdp, options.url, options);
      const report = validateRuntimeResult(result);

      if (report.ok) {
        return {
          browser: browserPath,
          ok: true,
          result,
          skipped: false
        };
      }

      return {
        browser: browserPath,
        errors: report.errors,
        ok: false,
        result,
        skipped: false
      };
    } catch (error) {
      if (browser || cdp) {
        return {
          browser: browserPath,
          errors: [`${browserPath}: ${error.message}`],
          ok: false,
          skipped: false
        };
      }

      launchErrors.push(`${browserPath}: ${error.message}`);
    } finally {
      if (cdp) {
        cdp.close();
      }
      stopBrowser(browser);
    }
  }

  if (options.skipIfMissing) {
    console.log("wordpress runtime smoke skipped: no installed Chrome/Edge candidate completed a live render");
    launchErrors.forEach((error) => console.log(`- ${error}`));
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
    skipIfMissing: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    url: DEFAULT_URL,
    viewport: DEFAULT_VIEWPORT
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--url") {
      settings.url = args[index + 1] || DEFAULT_URL;
      index += 1;
    } else if (arg === "--browser") {
      settings.browser = args[index + 1] || "";
      index += 1;
    } else if (arg === "--timeout-ms") {
      settings.timeoutMs = Number(args[index + 1]) || DEFAULT_TIMEOUT_MS;
      index += 1;
    } else if (arg === "--viewport") {
      const parts = String(args[index + 1] || "").toLowerCase().split("x");
      settings.viewport = {
        height: Number(parts[1]) || DEFAULT_VIEWPORT.height,
        width: Number(parts[0]) || DEFAULT_VIEWPORT.width
      };
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
    '  node wordpress-runtime-smoke.js --url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore" [--browser path/to/chrome] [--viewport 390x844] [--timeout-ms 30000] [--skip-if-missing] [--dry-run]',
    "",
    "Launches Chrome/Edge against the live WordPress page and checks mobile runtime height, analytics dataLayer events, and embedded CTA form prefill."
  ].join("\n");
}

async function main() {
  const settings = parseArgs(process.argv.slice(2));

  if (settings.help) {
    console.log(usage());
    return;
  }

  if (settings.dryRun) {
    console.log("WordPress runtime smoke plan:");
    console.log(`- mobile runtime: ${withRuntimeProbe(settings.url)} @ ${settings.viewport.width}x${settings.viewport.height}`);
    console.log("- checks: mobile height/no overflow, JSU/NCSY analytics dataLayer context, final-card share/download/CTA actions, embedded Gravity Forms CTA open/prefill");
    return;
  }

  console.log(`wordpress runtime smoke checking ${settings.url}`);
  const report = await runRuntimeSmoke(settings);

  if (!report.ok) {
    console.error("wordpress runtime smoke failed:");
    (report.errors || []).forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(report.skipped ? "wordpress runtime smoke skipped" : "wordpress runtime smoke ok");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`wordpress runtime smoke failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  collectRuntimeResult,
  parseArgs,
  runRuntimeSmoke,
  validateRuntimeResult,
  withRuntimeProbe
};
