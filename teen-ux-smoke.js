const renderSmoke = require("./render-smoke.js");
const visualReview = require("./visual-review-packet.js");

const DEFAULT_TIMEOUT_MS = 30000;
const VIEWPORTS = [
  { height: 844, name: "mobile", width: 390 },
  { height: 900, name: "desktop", width: 1280 }
];
const BAD_COPY_RE = /your school|teen test|proof of concept|maya-test|jewniors|schools in your room|admit one/i;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setViewport(cdp, viewport) {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: viewport.height,
    mobile: viewport.name === "mobile",
    width: viewport.width
  });
}

async function openPage(cdp, url, viewport, readyExpression, timeoutMs) {
  await setViewport(cdp, viewport);
  await cdp.send("Page.navigate", { url });
  await visualReview.waitFor(cdp, "document.readyState === 'interactive' || document.readyState === 'complete'", timeoutMs, "document load");
  await visualReview.waitFor(cdp, readyExpression, timeoutMs, url);
  await delay(700);
}

function maxDelta(values) {
  return Math.max(...values) - Math.min(...values);
}

function addError(errors, message) {
  errors.push(message);
}

async function checkTeenPicker(cdp, baseUrl, viewport, errors, timeoutMs) {
  await openPage(cdp, `${baseUrl}?show_teens=1&qa=teen-ux-smoke`, viewport, "document.querySelectorAll('#jsu-wrapped .jsuw-teen-picker-link').length >= 30", timeoutMs);

  const report = await visualReview.evaluate(cdp, `(() => {
    const links = Array.from(document.querySelectorAll("#jsu-wrapped .jsuw-teen-picker-link"));
    const heights = links.map((link) => Math.round(link.getBoundingClientRect().height));
    const arrows = links.map((link) => (link.querySelector(".jsuw-picker-arrow") || {}).textContent || "");
    const bodyText = document.body.innerText || "";

    return {
      arrows,
      bodyText,
      count: links.length,
      heights,
      maxDelta: heights.length ? Math.max(...heights) - Math.min(...heights) : 0,
      title: (document.querySelector(".jsuw-picker-teen-stories h2") || {}).textContent || ""
    };
  })()`);

  if (report.count < 30) {
    addError(errors, `${viewport.name} teen picker rendered ${report.count} teen links`);
  }

  if (report.maxDelta > 6) {
    addError(errors, `${viewport.name} teen picker card heights vary by ${report.maxDelta}px: ${report.heights.join(", ")}`);
  }

  if (BAD_COPY_RE.test(report.bodyText)) {
    addError(errors, `${viewport.name} teen picker contains placeholder/test copy`);
  }

  if (!/Find a Teen Wrapped story/i.test(report.title)) {
    addError(errors, `${viewport.name} teen picker heading is not teen-facing: ${report.title}`);
  }

  if (report.arrows.some((arrow) => arrow.trim() !== "View")) {
    addError(errors, `${viewport.name} teen picker action labels are not consistently View`);
  }
}

async function checkTeenStory(cdp, baseUrl, viewport, errors, timeoutMs) {
  const cards = [1, 4, 6, 9];

  for (const card of cards) {
    await openPage(cdp, `${baseUrl}?mode=teen&teen=west-coast-junior-01&card=${card}&qa=teen-ux-smoke`, viewport, "!!document.querySelector('#jsu-wrapped .jsuw-story') && !document.querySelector('#jsu-wrapped .jsuw-loading')", timeoutMs);

    const report = await visualReview.evaluate(cdp, `(() => {
      const story = document.querySelector("#jsu-wrapped .jsuw-story");
      const active = document.querySelector("#jsu-wrapped .jsuw-card.is-active") || story;
      const storyBox = story ? story.getBoundingClientRect() : { width: 0, height: 0 };
      const bodyText = active ? active.innerText || "" : "";

      return {
        bodyText,
        storyHeight: Math.round(storyBox.height),
        storyWidth: Math.round(storyBox.width),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      };
    })()`);

    if (BAD_COPY_RE.test(report.bodyText)) {
      addError(errors, `${viewport.name} teen story card ${card} contains placeholder/test copy`);
    }

    if (!report.storyWidth || !report.storyHeight) {
      addError(errors, `${viewport.name} teen story card ${card} did not render a visible story`);
    }
  }
}

async function checkBuilder(cdp, baseUrl, errors, timeoutMs) {
  const viewport = { height: 900, name: "desktop", width: 1280 };

  await openPage(cdp, `${baseUrl}builder.html?qa=teen-ux-smoke`, viewport, "!!document.querySelector('[data-builder-teen-field]')", timeoutMs);
  const chapterReport = await visualReview.evaluate(cdp, `(() => {
    const field = document.querySelector("[data-builder-teen-field]");

    return {
      hidden: !!(field && field.hidden)
    };
  })()`);

  if (!chapterReport.hidden) {
    addError(errors, "builder shows teen dropdown outside teen mode");
  }

  await openPage(cdp, `${baseUrl}builder.html?mode=teen&teen=west-coast-junior-01&qa=teen-ux-smoke`, viewport, "!!document.querySelector('[data-builder-teen-card=\"teen-cover\"]') && !!document.querySelector('[data-builder-teen-metric-field]')", timeoutMs);
  const teenReport = await visualReview.evaluate(cdp, `(() => {
    const field = document.querySelector("[data-builder-teen-field]");
    const region = document.querySelector("[data-builder-region]");
    const chapter = document.querySelector("[data-builder-chapter]");
    const teen = document.querySelector("[data-builder-teen]");

    return {
      chapterDisabled: !!(chapter && chapter.disabled),
      metricCount: document.querySelectorAll("[data-builder-teen-metric-field]").length,
      regionDisabled: !!(region && region.disabled),
      teenHidden: !!(field && field.hidden),
      teenOptions: teen ? teen.options.length : 0,
      textFieldCount: document.querySelectorAll("[data-builder-teen-text-field]").length
    };
  })()`);

  if (teenReport.teenHidden) {
    addError(errors, "builder hides teen dropdown in teen mode");
  }

  if (teenReport.regionDisabled || teenReport.chapterDisabled) {
    addError(errors, "builder disables region/chapter filters in teen mode");
  }

  if (teenReport.teenOptions < 1) {
    addError(errors, "builder teen mode has no teen options");
  }

  if (teenReport.metricCount < 1 || teenReport.textFieldCount < 1) {
    addError(errors, "builder teen mode is missing teen stat/text controls");
  }
}

async function runTeenUxSmoke(settings) {
  const options = settings || {};
  const browsers = renderSmoke.findBrowserCandidates(options);

  if (!browsers.length) {
    if (options.skipIfMissing) {
      console.log("teen UX smoke skipped: Chrome/Edge browser executable not found");
      return { ok: true, skipped: true };
    }

    throw new Error("Chrome/Edge browser executable not found. Set BROWSER_BIN or pass --browser.");
  }

  const server = renderSmoke.createStaticServer(process.cwd());
  const port = await renderSmoke.listen(server, 0);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const browserErrors = [];

  try {
    for (const browserPath of browsers) {
      let browser = null;
      let cdp = null;
      const errors = [];

      try {
        browser = await visualReview.launchBrowser(browserPath, options);
        cdp = await visualReview.createPageCdp(browser, options);

        for (const viewport of VIEWPORTS) {
          await checkTeenPicker(cdp, baseUrl, viewport, errors, options.timeoutMs);
          await checkTeenStory(cdp, baseUrl, viewport, errors, options.timeoutMs);
        }

        await checkBuilder(cdp, baseUrl, errors, options.timeoutMs);

        return {
          browser: browserPath,
          errors,
          ok: errors.length === 0,
          skipped: false
        };
      } catch (error) {
        browserErrors.push(`${browserPath}: ${error.message}`);
      } finally {
        if (cdp) {
          cdp.close();
        }
        visualReview.stopBrowser(browser);
      }
    }
  } finally {
    await renderSmoke.closeServer(server);
  }

  return {
    errors: browserErrors,
    ok: false,
    skipped: false
  };
}

function parseArgs(args) {
  const settings = {
    browser: "",
    skipIfMissing: false,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--browser") {
      settings.browser = args[index + 1] || "";
      index += 1;
    } else if (arg === "--timeout-ms") {
      settings.timeoutMs = Number(args[index + 1]) || DEFAULT_TIMEOUT_MS;
      index += 1;
    } else if (arg === "--skip-if-missing") {
      settings.skipIfMissing = true;
    } else if (arg === "--help" || arg === "-h") {
      settings.help = true;
    }
  }

  return settings;
}

function usage() {
  return [
    "Usage:",
    "  node teen-ux-smoke.js [--skip-if-missing] [--browser path/to/chrome] [--timeout-ms 30000]",
    "",
    "Serves the static widget locally and uses Chrome/Edge CDP to measure the rendered teen picker, teen story cards, and builder teen controls."
  ].join("\n");
}

async function main() {
  const settings = parseArgs(process.argv.slice(2));

  if (settings.help) {
    console.log(usage());
    return;
  }

  console.log("teen UX smoke checking rendered teen picker, story, and builder");
  const report = await runTeenUxSmoke(settings);

  if (!report.ok) {
    console.error("teen UX smoke failed:");
    (report.errors || []).forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log(report.skipped ? "teen UX smoke skipped" : "teen UX smoke ok");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`teen UX smoke failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  runTeenUxSmoke
};
