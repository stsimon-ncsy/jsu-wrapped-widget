const DEFAULT_BASE_URL = "https://stsimon-ncsy.github.io/jsu-wrapped-widget/";
const DEFAULT_TIMEOUT_MS = 15000;
const TEEN_PRIVATE_FIELD_RE = /(^|_)(teen|student|crm|contact)?_?(id|email|phone|address|birth|dob|first_name|last_name|legal_name)($|_)/i;
const EMAIL_VALUE_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_VALUE_RE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/;

const ASSET_CHECKS = [
  {
    label: "entry page",
    path: "",
    validate(text, errors) {
      mustInclude(text, 'id="jsu-wrapped"', "entry page missing widget container", errors);
      mustInclude(text, 'data-share-base="./share/"', "entry page missing static share base", errors);
      mustInclude(text, "jsu-wrapped.js", "entry page missing widget script reference", errors);
    }
  },
  {
    label: "builder page",
    path: "builder.html",
    validate(text, errors) {
      mustInclude(text, '<meta name="robots" content="noindex,nofollow">', "builder page missing noindex guard", errors);
      mustInclude(text, 'id="wrapped-builder"', "builder page missing builder root", errors);
    }
  },
  {
    label: "CTA form prefill page",
    path: "cta-prefill-smoke.html",
    validate(text, errors) {
      mustInclude(text, '<meta name="robots" content="noindex,nofollow">', "CTA form prefill page missing noindex guard", errors);
      mustInclude(text, "CTA prefill smoke", "CTA form prefill page missing smoke title", errors);
      mustInclude(text, "Gravity Forms style fields", "CTA form prefill page missing Gravity Forms field text", errors);
    }
  },
  {
    label: "CTA link prefill page",
    path: "cta-link-smoke.html",
    validate(text, errors) {
      mustInclude(text, '<meta name="robots" content="noindex,nofollow">', "CTA link prefill page missing noindex guard", errors);
      mustInclude(text, "CTA link smoke", "CTA link prefill page missing smoke title", errors);
      mustInclude(text, "cta-link-target-smoke.html", "CTA link prefill page missing target form URL", errors);
    }
  },
  {
    label: "CTA link target page",
    path: "cta-link-target-smoke.html",
    validate(text, errors) {
      mustInclude(text, '<meta name="robots" content="noindex,nofollow">', "CTA link target page missing noindex guard", errors);
      mustInclude(text, "CTA link target smoke", "CTA link target page missing smoke title", errors);
      mustInclude(text, "Gravity Forms link params", "CTA link target page missing Gravity Forms link text", errors);
    }
  },
  {
    label: "widget stylesheet",
    path: "jsu-wrapped.css",
    validate(text, errors) {
      mustInclude(text, "#jsu-wrapped", "widget stylesheet missing scoped root selector", errors);
    }
  },
  {
    label: "widget script",
    path: "jsu-wrapped.js",
    validate(text, errors) {
      mustInclude(text, "JSUWrapped", "widget script missing public runtime export", errors);
    }
  },
  {
    label: "builder script",
    path: "wrapped-builder.js",
    validate(text, errors) {
      mustInclude(text, "Review form opened with chapter context. Submission JSON copied", "builder script missing clipboard-first review form handoff", errors);
      mustNotInclude(text, "MAX_REVIEW_FORM_URL_LENGTH", "builder script still uses review form URL length JSON prefill", errors);
      mustNotInclude(text, "REVIEW_FORM_SUBMISSION_PARAM", "builder script still has full submission JSON review form param", errors);
      mustNotInclude(text, "Submission JSON is prefilled in the review form", "builder script still claims JSON is prefilled in review form", errors);
    }
  },
  {
    label: "WordPress inline embed",
    path: "wordpress-inline-embed.html",
    validate(text, errors) {
      mustInclude(text, 'id="jsu-wrapped"', "WordPress inline embed missing widget container", errors);
      mustInclude(text, "<style>", "WordPress inline embed missing inline styles", errors);
      mustInclude(text, "(function (root, factory)", "WordPress inline embed missing inline renderer", errors);
      mustInclude(text, "https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-wrapped-2026.json", "WordPress inline embed missing remote chapter data URL", errors);
      mustNotInclude(text, 'src="./jsu-wrapped.js"', "WordPress inline embed still loads external widget script", errors);
      mustNotInclude(text, "src=\"https://stsimon-ncsy.github.io/jsu-wrapped-widget/jsu-wrapped.js", "WordPress inline embed still loads hosted widget script", errors);
    }
  },
  {
    label: "chapter data JSON",
    path: "sample-wrapped-2026.json",
    validate(text, errors) {
      const data = parseJson(text, "chapter data JSON", errors);

      if (!Array.isArray(data)) {
        errors.push("chapter data JSON is not an array");
        return;
      }

      if (!data.some((record) => record && record.chapter_slug === "baltimore")) {
        errors.push("chapter data JSON missing Baltimore sample record");
      }
    }
  },
  {
    label: "teen data JSON",
    path: "sample-teen-wrapped-2026.json",
    validate(text, errors) {
      const data = parseJson(text, "teen data JSON", errors);

      if (!Array.isArray(data)) {
        errors.push("teen data JSON is not an array");
        return;
      }

      if (!data.some((record) => record && record.teen_slug === "maya-test")) {
        errors.push("teen data JSON missing Maya test record");
      }

      data.forEach((record, index) => validateTeenProofOfConceptRecord(record, index, errors));
    }
  },
  {
    label: "config JSON",
    path: "wrapped-config-2026.json",
    validate(text, errors) {
      const config = parseJson(text, "config JSON", errors);

      if (!config || typeof config !== "object" || Array.isArray(config)) {
        errors.push("config JSON is not an object");
      }
    }
  },
  {
    label: "Baltimore share page",
    path: "share/baltimore/",
    validate(text, errors) {
      mustInclude(text, "JSU/NCSY Wrapped - Baltimore", "Baltimore share page missing title metadata", errors);
      mustInclude(text, 'property="og:image:alt" content="JSU/NCSY Wrapped social preview for Baltimore"', "Baltimore share page missing social image alt text", errors);
      mustInclude(text, 'http-equiv="refresh"', "Baltimore share page missing human redirect", errors);
      mustInclude(text, "?chapter=baltimore", "Baltimore share page missing chapter redirect", errors);
    }
  },
  {
    binary: true,
    label: "social preview image",
    path: "assets/wrapped-social-preview.png",
    validate(asset, errors) {
      validateContentType(asset.headers, "image/png", "social preview image", errors);
      validatePngDimensions(asset.buffer, 1200, 630, "social preview image", errors);
    }
  }
];

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  return value.endsWith("/") ? value : `${value}/`;
}

function assetUrl(baseUrl, assetPath) {
  return new URL(assetPath, normalizeBaseUrl(baseUrl)).toString();
}

function fetchPlan(baseUrl) {
  return ASSET_CHECKS.map((check) => ({
    label: check.label,
    path: check.path,
    url: assetUrl(baseUrl, check.path)
  }));
}

function mustInclude(text, expected, message, errors) {
  if (!String(text || "").includes(expected)) {
    errors.push(message);
  }
}

function mustNotInclude(text, unexpected, message, errors) {
  if (String(text || "").includes(unexpected)) {
    errors.push(message);
  }
}

function parseJson(text, label, errors) {
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${label} did not parse as JSON: ${error.message}`);
    return null;
  }
}

function validateTeenProofOfConceptRecord(record, index, errors) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    errors.push(`teen data JSON record ${index + 1} is not an object`);
    return;
  }

  Object.keys(record).forEach((key) => {
    const value = record[key];

    if (TEEN_PRIVATE_FIELD_RE.test(key)) {
      errors.push(`teen data JSON record ${index + 1} includes private field ${key}`);
      return;
    }

    if (typeof value === "string" && EMAIL_VALUE_RE.test(value)) {
      errors.push(`teen data JSON record ${index + 1} includes email-like value in ${key}`);
      return;
    }

    if (typeof value === "string" && PHONE_VALUE_RE.test(value)) {
      errors.push(`teen data JSON record ${index + 1} includes phone-like value in ${key}`);
    }
  });
}

function validatePngDimensions(buffer, expectedWidth, expectedHeight, label, errors) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  if (bytes.length < 24) {
    errors.push(`${label} is too small to be a valid PNG`);
    return;
  }

  if (!signature.every((value, index) => bytes[index] === value)) {
    errors.push(`${label} is not a PNG`);
    return;
  }

  if (bytes.toString("ascii", 12, 16) !== "IHDR") {
    errors.push(`${label} is missing a PNG IHDR chunk`);
    return;
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);

  if (width !== expectedWidth || height !== expectedHeight) {
    errors.push(`${label} dimensions are ${width}x${height}, expected ${expectedWidth}x${expectedHeight}`);
  }
}

function headerValue(headers, name) {
  const source = headers || {};
  const target = String(name || "").toLowerCase();
  const key = Object.keys(source).find((item) => item.toLowerCase() === target);

  return key ? String(source[key] || "") : "";
}

function validateContentType(headers, expectedType, label, errors) {
  const contentType = headerValue(headers, "content-type").toLowerCase();

  if (!contentType) {
    errors.push(`${label} is missing content type ${expectedType}`);
    return;
  }

  if (contentType.split(";")[0].trim() !== expectedType) {
    errors.push(`${label} content type is ${contentType}, expected ${expectedType}`);
  }
}

function validateHostedAssets(assets) {
  const errors = [];

  ASSET_CHECKS.forEach((check) => {
    const asset = assets[check.path];
    const status = asset && Number(asset.status);

    if (!asset) {
      errors.push(`${check.label} was not fetched`);
      return;
    }

    if (status < 200 || status >= 300) {
      errors.push(`${check.label} returned HTTP ${status || "unknown"}`);
      return;
    }

    check.validate(check.binary ? asset : String(asset.text || ""), errors);
  });

  return {
    errors,
    ok: errors.length === 0
  };
}

async function fetchWithTimeout(url, timeoutMs, options) {
  const settings = options || {};
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
      buffer: settings.binary ? Buffer.from(await response.arrayBuffer()) : null,
      text: settings.binary ? "" : await response.text()
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHostedAssets(baseUrl, options) {
  const settings = options || {};
  const timeoutMs = settings.timeoutMs || DEFAULT_TIMEOUT_MS;
  const assets = {};

  await Promise.all(ASSET_CHECKS.map(async (check) => {
    const url = assetUrl(baseUrl, check.path);

    try {
      assets[check.path] = await fetchWithTimeout(url, timeoutMs, { binary: check.binary });
    } catch (error) {
      assets[check.path] = {
        buffer: Buffer.alloc(0),
        headers: {},
        status: 0,
        text: "",
        error
      };
    }
  }));

  return assets;
}

function parseArgs(args) {
  const settings = {
    baseUrl: DEFAULT_BASE_URL,
    dryRun: false,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--base") {
      settings.baseUrl = args[index + 1] || "";
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

  settings.baseUrl = normalizeBaseUrl(settings.baseUrl);
  return settings;
}

function usage() {
  return [
    "Usage:",
    "  node hosted-smoke.js [--base https://stsimon-ncsy.github.io/jsu-wrapped-widget/] [--timeout-ms 15000] [--dry-run]",
    "",
    "Fetches the hosted GitHub Pages widget, JSON, and Baltimore share page to confirm deployment basics."
  ].join("\n");
}

async function main() {
  const settings = parseArgs(process.argv.slice(2));

  if (settings.help) {
    console.log(usage());
    return;
  }

  if (settings.dryRun) {
    console.log(`Hosted smoke plan for ${settings.baseUrl}`);
    fetchPlan(settings.baseUrl).forEach((item) => {
      console.log(`- ${item.label}: ${item.url}`);
    });
    return;
  }

  console.log(`Hosted smoke checking ${settings.baseUrl}`);
  const assets = await fetchHostedAssets(settings.baseUrl, settings);
  const report = validateHostedAssets(assets);

  if (!report.ok) {
    console.error("Hosted smoke failed:");
    report.errors.forEach((error) => {
      console.error(`- ${error}`);
    });
    process.exit(1);
  }

  console.log("hosted smoke ok");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`hosted smoke failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  assetUrl,
  fetchPlan,
  headerValue,
  normalizeBaseUrl,
  validateContentType,
  validatePngDimensions,
  validateHostedAssets
};
