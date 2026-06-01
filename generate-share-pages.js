const fs = require("fs");
const path = require("path");
const api = require("./jsu-wrapped.js");

const DATA_PATH = "sample-wrapped-2026.json";
const OUTPUT_ROOT = "share";
const SITE_BASE = "https://stsimon-ncsy.github.io/jsu-wrapped-widget/";
const SOCIAL_IMAGE_URL = "https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png";
const GENERATED_MARKER = "jsu-wrapped-static-share-page";

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pathSlug(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/]+/g, "-");
}

function isChapterRecord(record) {
  return record && typeof record === "object" && !Array.isArray(record) && hasValue(record.chapter_slug) && hasValue(record.chapter_name) && (!hasValue(record.scope_type) || String(record.scope_type).trim().toLowerCase() === "chapter");
}

function getShareScope(record) {
  var scope = api.getStoryScope(record);

  if (!scope || ["chapter", "region", "program"].indexOf(scope.type) === -1 || !hasValue(scope.slug) || !hasValue(scope.name)) {
    return null;
  }

  return scope;
}

function isShareableStoryRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }

  return Boolean(getShareScope(record));
}

function sharePathSegments(record) {
  var scope = getShareScope(record);
  var slug = scope ? pathSlug(scope.slug) : "";

  if (!scope || !slug) {
    return [];
  }

  if (scope.type === "chapter") {
    return [slug];
  }

  return [scope.type, slug];
}

function sharePagePath(record) {
  return sharePathSegments(record).join("/") + "/";
}

function storyUrlFor(record) {
  var scope = getShareScope(record);
  var url = new URL(SITE_BASE);

  if (!scope) {
    return url.href;
  }

  if (scope.type === "chapter") {
    url.searchParams.set("chapter", scope.slug);
  } else {
    url.searchParams.set("scope", scope.type);
    url.searchParams.set(scope.type, scope.slug);
  }

  return url.href;
}

function descriptionFor(record) {
  var scope = getShareScope(record) || { name: record.chapter_name || "JSU", noun: "chapter" };
  var parts = [
    scope.name + " Wrapped",
    hasValue(record.year_label || record.school_year) ? "for " + (record.year_label || record.school_year) : "",
    hasValue(record.region_name) ? "- " + record.region_name : ""
  ].filter(Boolean);
  var stats = [
    hasValue(record.events_hosted) ? api.formatNumber(record.events_hosted) + " events" : "",
    hasValue(record.unique_teens) ? api.formatNumber(record.unique_teens) + " teens" : "",
    hasValue(record.engagement_moments) ? api.formatNumber(record.engagement_moments) + " engagement moments" : ""
  ].filter(Boolean);

  return parts.join(" ") + (stats.length ? ". " + stats.join(". ") + "." : ".");
}

function redirectScript(storyUrl) {
  return [
    "<script>",
    "(function () {",
    "  var target = new URL(" + JSON.stringify(storyUrl) + ");",
    "  var source = new URLSearchParams(window.location.search);",
    '  ["variant", "version", "audience", "program", "campaign", "autoplay", "duration"].forEach(function (key) {',
    "    var value = source.get(key);",
    "    if (value) {",
    "      target.searchParams.set(key, value);",
    "    }",
    "  });",
    "  window.location.replace(target.href);",
    "}());",
    "</script>"
  ].join("");
}

function sharePageHtml(record) {
  var scope = getShareScope(record);
  var title = "JSU/NCSY Wrapped - " + scope.name;
  var description = descriptionFor(record);
  var shareUrl = new URL("share/" + sharePagePath(record), SITE_BASE).href;
  var storyUrl = storyUrlFor(record);

  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1">',
    "    <title>" + escapeHtml(title) + "</title>",
    '    <meta name="description" content="' + escapeHtml(description) + '">',
    '    <meta name="generator" content="' + GENERATED_MARKER + '">',
    '    <meta property="og:type" content="website">',
    '    <meta property="og:title" content="' + escapeHtml(title) + '">',
    '    <meta property="og:description" content="' + escapeHtml(description) + '">',
    '    <meta property="og:url" content="' + escapeHtml(shareUrl) + '">',
    '    <meta property="og:image" content="' + escapeHtml(SOCIAL_IMAGE_URL) + '">',
    '    <meta property="og:image:secure_url" content="' + escapeHtml(SOCIAL_IMAGE_URL) + '">',
    '    <meta property="og:image:width" content="1200">',
    '    <meta property="og:image:height" content="630">',
    '    <meta name="twitter:card" content="summary_large_image">',
    '    <meta name="twitter:title" content="' + escapeHtml(title) + '">',
    '    <meta name="twitter:description" content="' + escapeHtml(description) + '">',
    '    <meta name="twitter:image" content="' + escapeHtml(SOCIAL_IMAGE_URL) + '">',
    '    <link rel="canonical" href="' + escapeHtml(storyUrl) + '">',
    '    <meta http-equiv="refresh" content="0; url=' + escapeHtml(storyUrl) + '">',
    "  </head>",
    "  <body>",
    '    <p><a href="' + escapeHtml(storyUrl) + '">Open ' + escapeHtml(scope.name) + " Wrapped</a></p>",
    "    " + redirectScript(storyUrl),
    "  </body>",
    "</html>",
    ""
  ].join("\n");
}

function isGeneratedShareIndex(filePath) {
  try {
    var content = fs.readFileSync(filePath, "utf8");

    return content.indexOf(GENERATED_MARKER) !== -1 || content.indexOf("JSU/NCSY Wrapped - ") !== -1;
  } catch (error) {
    return false;
  }
}

function isInside(parent, child) {
  var relative = path.relative(parent, child);

  return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function pruneEmptyParents(outputRoot, startDir) {
  var root = path.resolve(outputRoot);
  var current = path.resolve(startDir);

  while (isInside(root, current)) {
    try {
      if (fs.readdirSync(current).length) {
        return;
      }

      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch (error) {
      return;
    }
  }
}

function cleanupStaleSharePages(outputRoot, expectedDirs) {
  var root = path.resolve(outputRoot);

  if (!fs.existsSync(root)) {
    return 0;
  }

  var expected = expectedDirs.reduce(function (lookup, dir) {
    lookup[path.resolve(dir)] = true;
    return lookup;
  }, {});
  var removed = 0;

  function visit(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
      var fullPath = path.join(dir, entry.name);

      if (!entry.isDirectory()) {
        return;
      }

      var indexPath = path.join(fullPath, "index.html");

      if (fs.existsSync(indexPath) && isGeneratedShareIndex(indexPath) && !expected[path.resolve(fullPath)]) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        removed += 1;
        pruneEmptyParents(root, path.dirname(fullPath));
        return;
      }

      visit(fullPath);
    });
  }

  visit(root);
  return removed;
}

function generateSharePages(records, options) {
  var outputRoot = options && options.outputRoot || OUTPUT_ROOT;
  var stories = (records || []).filter(isShareableStoryRecord);
  var expectedDirs = stories.map((record) => path.join.apply(path, [outputRoot].concat(sharePathSegments(record))));

  fs.mkdirSync(outputRoot, { recursive: true });
  cleanupStaleSharePages(outputRoot, expectedDirs);

  stories.forEach((record, index) => {
    var dir = expectedDirs[index];

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), sharePageHtml(record));
  });

  return stories.length;
}

function main() {
  var records = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  var count = generateSharePages(records);

  console.log("generated " + count + " share pages");
}

if (require.main === module) {
  main();
}

module.exports = {
  descriptionFor,
  generateSharePages,
  isChapterRecord,
  isShareableStoryRecord,
  redirectScript,
  cleanupStaleSharePages,
  sharePagePath,
  sharePageHtml
};
