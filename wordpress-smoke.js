const DEFAULT_URL = "https://ncsy.org/ncsy-wrapped/?chapter=baltimore";
const DEFAULT_TIMEOUT_MS = 15000;

function headerValue(headers, name) {
  const source = headers || {};
  const target = String(name || "").toLowerCase();
  const key = Object.keys(source).find((item) => item.toLowerCase() === target);

  return key ? String(source[key] || "") : "";
}

function visibleText(html) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasId(html, id) {
  const escaped = String(id || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\bid\\s*=\\s*['\"]" + escaped + "['\"]", "i").test(String(html || ""));
}

function attrValue(html, attrName) {
  const escaped = String(attrName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html || "").match(new RegExp("\\b" + escaped + "\\s*=\\s*(['\"])(.*?)\\1", "i"));

  return match ? match[2] : "";
}

function mustInclude(text, expected, message, errors) {
  if (!String(text || "").includes(expected)) {
    errors.push(message);
  }
}

function validateWordPressPage(page, options) {
  const settings = options || {};
  const errors = [];
  const status = Number(page && page.status);
  const html = String(page && page.text || "");
  const text = visibleText(html);
  const ctaTarget = attrValue(html, "data-cta-target");
  const ctaHref = attrValue(html, "data-cta-href");
  const contentType = headerValue(page && page.headers, "content-type").toLowerCase();

  if (status < 200 || status >= 300) {
    errors.push(`WordPress page returned HTTP ${status || "unknown"}`);
    return { errors, ok: false };
  }

  if (contentType && !contentType.includes("text/html")) {
    errors.push(`WordPress page content type is ${contentType}, expected text/html`);
  }

  if (!hasId(html, "jsu-wrapped")) {
    errors.push("WordPress page missing widget container #jsu-wrapped");
  }

  if (!/data-source\s*=/.test(html)) {
    errors.push("WordPress page missing widget data-source");
  } else if (!/sample-wrapped-2026\.json/.test(html)) {
    errors.push("WordPress page data-source should point at the chapter JSON");
  }

  if (!/data-config-source\s*=/.test(html)) {
    errors.push("WordPress page missing widget data-config-source");
  } else if (!/wrapped-config-2026\.json/.test(html)) {
    errors.push("WordPress page data-config-source should point at the config JSON");
  }

  if (!/data-share-base\s*=/.test(html) || !/\/share\//.test(html)) {
    errors.push("WordPress page missing generated share-page base");
  }

  if (!ctaTarget && !ctaHref) {
    errors.push("WordPress page missing final-card CTA target or href");
  }

  if (ctaTarget) {
    if (ctaTarget.charAt(0) !== "#") {
      errors.push("WordPress page CTA target should be an id selector");
    } else if (!hasId(html, ctaTarget.slice(1))) {
      errors.push(`WordPress page CTA target ${ctaTarget} is missing its panel`);
    }

    if (!/(gform_|gform_wrapper|wrapped_chapter|wrapped_region|wrapped_url)/i.test(html)) {
      errors.push("WordPress page CTA target panel should include Gravity Forms/context fields");
    }
  }

  if (!/JSU\/NCSY Wrapped/i.test(html)) {
    errors.push("WordPress page missing JSU/NCSY Wrapped title or social metadata");
  }

  if (!/og:title|twitter:title/i.test(html)) {
    errors.push("WordPress page missing social title metadata");
  }

  if (!/privacy/i.test(text) || !/(cookie|osano)/i.test(html)) {
    errors.push("WordPress page missing privacy/cookie affordance");
  }

  if (/\b(undefined|null|NaN)\b/i.test(text)) {
    errors.push("WordPress page contains visible broken placeholder text");
  }

  if (settings.requireChapterParam !== false && page && page.url && !/[?&](chapter|scope|mode)=/.test(String(page.url))) {
    errors.push("WordPress smoke URL should include a chapter, scope, or mode parameter");
  }

  return {
    errors,
    ok: errors.length === 0
  };
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });

    return {
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
      text: await response.text(),
      url
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(args) {
  const settings = {
    dryRun: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    url: DEFAULT_URL
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--url") {
      settings.url = args[index + 1] || DEFAULT_URL;
      index += 1;
    } else if (arg === "--timeout-ms") {
      settings.timeoutMs = Number(args[index + 1]) || DEFAULT_TIMEOUT_MS;
      index += 1;
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
    "  node wordpress-smoke.js [--url https://ncsy.org/ncsy-wrapped/?chapter=baltimore] [--timeout-ms 15000] [--dry-run]",
    "",
    "Fetches a live WordPress Wrapped page and checks the widget shell, hosted data/config references, share base, CTA form target, privacy/cookie affordance, and social title basics."
  ].join("\n");
}

async function main() {
  const settings = parseArgs(process.argv.slice(2));

  if (settings.help) {
    console.log(usage());
    return;
  }

  if (settings.dryRun) {
    console.log(`WordPress smoke would check ${settings.url}`);
    return;
  }

  console.log(`WordPress smoke checking ${settings.url}`);
  const page = await fetchWithTimeout(settings.url, settings.timeoutMs);
  const report = validateWordPressPage(page);

  if (!report.ok) {
    console.error("WordPress smoke failed:");
    report.errors.forEach((error) => {
      console.error(`- ${error}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log("wordpress smoke ok");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`wordpress smoke failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  attrValue,
  hasId,
  headerValue,
  validateWordPressPage,
  visibleText
};
