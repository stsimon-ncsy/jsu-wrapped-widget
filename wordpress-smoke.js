const path = require("path");

const DEFAULT_URL = "https://ncsy.org/ncsy-wrapped/?chapter=baltimore";
const DEFAULT_TIMEOUT_MS = 15000;
const RELEASE_TOKEN = "jsuw-prod-20260603b";
const HOSTED_ASSET_BASE = "https://stsimon-ncsy.github.io/jsu-wrapped-widget/";
const CHAPTER_DATA_ATTR = 'data-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-wrapped-2026.json?v=' + RELEASE_TOKEN + '"';
const CONFIG_DATA_ATTR = 'data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=' + RELEASE_TOKEN + '"';
const SHARE_BASE_ATTR = 'data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"';
const TEEN_DATA_ATTR = 'data-teen-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-teen-wrapped-2026.json?v=' + RELEASE_TOKEN + '"';
const ASSETS_BASE_ATTR = 'data-assets-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/"';
const WIDGET_CSS_TAG = '<link rel="stylesheet" href="' + HOSTED_ASSET_BASE + 'jsu-wrapped.css?v=' + RELEASE_TOKEN + '">';
const WIDGET_JS_TAG = '<script src="' + HOSTED_ASSET_BASE + 'jsu-wrapped.js?v=' + RELEASE_TOKEN + '"></script>';
const SOCIAL_IMAGE_URL = HOSTED_ASSET_BASE + "assets/wrapped-social-preview.png";
const SOCIAL_IMAGE_WIDTH = "1200";
const SOCIAL_IMAGE_HEIGHT = "630";
const FULL_INLINE_EMBED_PATH = path.resolve(__dirname, "wordpress-inline-embed.html");

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

function attrValues(html, attrName) {
  const escaped = String(attrName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("\\b" + escaped + "\\s*=\\s*(['\"])(.*?)\\1", "ig");
  const values = [];
  let match;

  while ((match = pattern.exec(String(html || "")))) {
    values.push(match[2]);
  }

  return values;
}

function titleValue(html) {
  const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function metaContentValue(html, name) {
  const source = String(html || "");
  const escaped = String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp("<meta\\b(?=[^>]*(?:property|name)\\s*=\\s*(['\"])" + escaped + "\\1)[^>]*>", "i");
  const tagMatch = source.match(tagPattern);

  return tagMatch ? attrValue(tagMatch[0], "content").replace(/\s+/g, " ").trim() : "";
}

function linkHrefValue(html, relName) {
  const tags = String(html || "").match(/<link\b[^>]*>/gi) || [];
  const target = String(relName || "").trim().toLowerCase();
  const tag = tags.find((item) => attrValue(item, "rel").toLowerCase().split(/\s+/).includes(target));

  return tag ? attrValue(tag, "href").replace(/\s+/g, " ").trim() : "";
}

function hasExpectedWrappedTitle(value) {
  return /^JSU\/NCSY Wrapped\s+-\s+\S/.test(String(value || "").trim());
}

function hasExpectedSocialImage(value) {
  const normalized = String(value || "").trim().split("?")[0];

  return normalized === SOCIAL_IMAGE_URL || /(?:^|\/)wrapped-social-preview(?:\/wrapped-social-preview)?\.png$/i.test(normalized);
}

function embeddedCtaPanelHtml(html, selector) {
  const id = String(selector || "").charAt(0) === "#" ? String(selector || "").slice(1) : "";

  if (!id) {
    return "";
  }

  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html || "").match(new RegExp("<([a-z][\\w:-]*)\\b(?=[^>]*\\bid\\s*=\\s*['\"]" + escaped + "['\"])[^>]*>[\\s\\S]*?<\\/\\1>", "i"));

  return match ? match[0] : "";
}

function panelHasContextSignal(panelHtml, patterns) {
  const normalized = visibleText(panelHtml).toLowerCase() + " " + String(panelHtml || "").toLowerCase().replace(/[_-]+/g, " ");

  return patterns.some((pattern) => pattern.test(normalized));
}

function missingCtaContextFields(panelHtml) {
  const checks = [
    {
      label: "chapter name",
      suggestedName: "wrapped_chapter",
      patterns: [/\bwrapped\s+chapter\b/, /\bchapter\s+name\b/, /\bschool\s+or\s+chapter\b/]
    },
    {
      label: "chapter slug",
      suggestedName: "wrapped_chapter_slug",
      patterns: [/\bwrapped\s+chapter\s+slug\b/, /\bchapter\s+slug\b/]
    },
    {
      label: "region",
      suggestedName: "wrapped_region",
      patterns: [/\bwrapped\s+region\b/, /\bregion\b/]
    },
    {
      label: "scope type",
      suggestedName: "wrapped_scope",
      patterns: [/\bwrapped\s+scope\b/, /\bscope\s+type\b/, /\bstory\s+scope\b/]
    },
    {
      label: "scope slug",
      suggestedName: "wrapped_slug",
      patterns: [/\bwrapped\s+slug\b/, /\bscope\s+slug\b/, /\bstory\s+slug\b/]
    },
    {
      label: "scope name",
      suggestedName: "wrapped_name",
      patterns: [/\bwrapped\s+name\b/, /\bscope\s+name\b/, /\bstory\s+name\b/]
    },
    {
      label: "variant",
      suggestedName: "wrapped_variant",
      patterns: [/\bwrapped\s+variant\b/, /\bvariant\b/, /\bversion\b/]
    },
    {
      label: "year",
      suggestedName: "wrapped_year",
      patterns: [/\bwrapped\s+year\b/, /\byear\s+label\b/, /\bschool\s+year\b/]
    },
    {
      label: "Wrapped URL",
      suggestedName: "wrapped_url",
      patterns: [/\bwrapped\s+url\b/, /\bwrapped\s+link\b/, /\bwrapped\s+page\b/, /\bpage\s+url\b/, /\bpage\s+link\b/]
    }
  ];

  return checks.filter((check) => !panelHasContextSignal(panelHtml, check.patterns));
}

function hasUnrenderedGravityFormsShortcode(html) {
  return /\[gravityform\b[^\]]*\]/i.test(String(html || ""));
}

function validateCtaDestinationPage(page) {
  const errors = [];
  const fixes = [];
  const status = Number(page && page.status);
  const html = String(page && page.text || "");
  const text = visibleText(html);
  const contentType = headerValue(page && page.headers, "content-type").toLowerCase();
  const missingContextFields = missingCtaContextFields(html);

  if (status < 200 || status >= 300) {
    errors.push(`Gravity Forms destination returned HTTP ${status || "unknown"}`);
    return { errors, fixes, ok: false };
  }

  if (contentType && !contentType.includes("text/html")) {
    errors.push(`Gravity Forms destination content type is ${contentType}, expected text/html`);
  }

  if (!/(gform_|gform_wrapper|wrapped_chapter|wrapped_region|wrapped_url|wrapped_scope|wrapped_slug|wrapped_name)/i.test(html)) {
    errors.push("Gravity Forms destination should include a Gravity Forms form and wrapped_* context fields");
  }

  if (missingContextFields.length) {
    errors.push(`Gravity Forms destination is missing context fields for ${missingContextFields.map((field) => field.label).join(", ")}`);
    fixes.push(`Add hidden Gravity Forms fields named ${missingContextFields.map((field) => field.suggestedName).join(", ")} on the CTA destination form page.`);
  }

  if (/\b(undefined|null|NaN)\b/i.test(text)) {
    errors.push("Gravity Forms destination contains visible broken placeholder text");
  }

  return {
    errors,
    fixes,
    ok: errors.length === 0
  };
}

function titleSubjectFromValue(value) {
  const match = String(value || "").trim().match(/^(?:JSU\/NCSY|NCSY|JSU)\s+Wrapped\s+-\s+(.+)$/i);

  return match ? match[1].trim() : "";
}

function titleFromSlug(slug) {
  return String(slug || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();

      if (lower === "jsu" || lower === "ncsy") {
        return lower.toUpperCase();
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function titleSubjectFromUrl(url) {
  try {
    const parsed = new URL(String(url || ""), "https://example.test/");
    const value = parsed.searchParams.get("chapter") || parsed.searchParams.get("region") || parsed.searchParams.get("program") || parsed.searchParams.get("teen") || "";

    return titleFromSlug(value);
  } catch (error) {
    return "";
  }
}

function suggestedSocialTitle(page, html) {
  const title = titleValue(html);
  const ogTitle = metaContentValue(html, "og:title");
  const twitterTitle = metaContentValue(html, "twitter:title");
  const subject = titleSubjectFromValue(title) || titleSubjectFromValue(ogTitle) || titleSubjectFromValue(twitterTitle) || titleSubjectFromUrl(page && page.url);

  return subject ? `JSU/NCSY Wrapped - ${subject}` : "JSU/NCSY Wrapped - [Chapter or Scope Name]";
}

function suggestedSocialImageAlt(page, html) {
  const socialTitle = suggestedSocialTitle(page, html);
  const subject = titleSubjectFromValue(socialTitle);

  return subject ? `JSU/NCSY Wrapped social preview for ${subject}` : "JSU/NCSY Wrapped social preview";
}

function suggestedSocialDescription(page, html) {
  const socialTitle = suggestedSocialTitle(page, html);
  const subject = titleSubjectFromValue(socialTitle);
  const hasSpecificSubject = subject && !/^\[/.test(subject);

  return hasSpecificSubject
    ? `See the JSU/NCSY Wrapped recap for ${subject}: events, teens, engagement moments, and community story.`
    : "See the JSU/NCSY Wrapped recap: events, teens, engagement moments, and community story.";
}

function hasExpectedSocialDescription(value, expected, subject) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const normalized = text.toLowerCase();
  const expectedNormalized = String(expected || "").replace(/\s+/g, " ").trim().toLowerCase();
  const subjectText = String(subject || "").trim().toLowerCase();

  if (!text || /\b(privacy policy|cookie policy|behavioral standards)\b/i.test(text)) {
    return false;
  }

  if (expectedNormalized && normalized === expectedNormalized) {
    return true;
  }

  if (!/jsu\/ncsy wrapped/i.test(text)) {
    return false;
  }

  return !subjectText || /^\[/.test(subjectText) || normalized.includes(subjectText);
}

function normalizedUrl(value, base) {
  try {
    const parsed = new URL(String(value || ""), String(base || DEFAULT_URL));
    parsed.hash = "";

    return parsed.href;
  } catch (error) {
    return "";
  }
}

function normalizedSocialUrl(value, base) {
  try {
    const parsed = new URL(String(value || ""), String(base || DEFAULT_URL));
    parsed.hash = "";

    Array.from(parsed.searchParams.keys()).forEach((key) => {
      if (/^(qa|deploy|retry|card|autoplay|duration|cache|cb|v|ver|_|preview|nocache)$/i.test(key) || /^utm_/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    });

    return parsed.href;
  } catch (error) {
    return "";
  }
}

function suggestedSocialUrl(page) {
  return normalizedSocialUrl(page && page.url || DEFAULT_URL, DEFAULT_URL) || DEFAULT_URL;
}

function matchesSocialUrl(value, expected) {
  if (!String(value || "").trim()) {
    return false;
  }

  return normalizedSocialUrl(value, expected) === normalizedSocialUrl(expected, DEFAULT_URL);
}

function hasReleaseToken(url) {
  const text = String(url || "");
  return text.includes("?v=" + RELEASE_TOKEN) || text.includes("&v=" + RELEASE_TOKEN) || text.includes("&amp;v=" + RELEASE_TOKEN);
}

function isSafeCtaHref(value) {
  const text = String(value || "").trim();

  return !text || /^(https?:\/\/|\/(?!\/)|\.\/|\.\.\/|\?|#)/i.test(text);
}

function decodedText(value) {
  const text = String(value || "").replace(/\+/g, " ");

  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
}

function isCtaPayloadParam(name) {
  return /^(wrapped_(submission|config|data|json|metrics|record|records)|builder_(submission|payload)|story_(json|data)|config_json|json|payload|metrics)$/i.test(String(name || ""));
}

function looksLikeJsonPayload(value) {
  const raw = String(value || "");
  const text = decodedText(raw).trim();

  return /%7b|%5b|%22(?:cards|metrics|record_overrides|custom_cards|chapters)%22/i.test(raw) || /^[\[{]/.test(text) || text.length > 320 && /["']?[a-z0-9_ -]+["']?\s*:/.test(text);
}

function hasCtaUrlPayload(value) {
  if (!value) {
    return false;
  }

  const text = String(value).trim();

  if (text.length > 1800 || /%7b|%5b/i.test(text)) {
    return true;
  }

  try {
    const parsed = new URL(text, DEFAULT_URL);
    let foundPayload = false;

    parsed.searchParams.forEach((paramValue, paramName) => {
      if (isCtaPayloadParam(paramName) || looksLikeJsonPayload(paramValue)) {
        foundPayload = true;
      }
    });

    return foundPayload;
  } catch (error) {
    return /[?&](wrapped_(submission|config|data|json|metrics|record|records)|builder_(submission|payload)|story_(json|data)|config_json|json|payload|metrics)=/i.test(text);
  }
}

function resolveCtaDestinationUrl(value, baseUrl) {
  const text = String(value || "").trim();

  if (!text || !isSafeCtaHref(text) || hasCtaUrlPayload(text)) {
    return "";
  }

  try {
    return new URL(text, String(baseUrl || DEFAULT_URL)).href;
  } catch (error) {
    return "";
  }
}

function hostedAssetUrls(html, fileName, attrName) {
  const escapedFile = String(fileName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("(^|/)" + escapedFile + "(?:[?#].*)?$", "i");

  return attrValues(html, attrName).filter((value) => pattern.test(String(value || "")));
}

function tagIndexWithId(html, id) {
  const source = String(html || "");
  const escaped = String(id || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp("<[a-z][\\w:-]*\\b(?=[^>]*\\bid\\s*=\\s*['\"]" + escaped + "['\"])[^>]*>", "i"));

  return match && typeof match.index === "number" ? match.index : -1;
}

function inlineWidgetStyleIndex(html) {
  const source = String(html || "");
  const pattern = /<style\b[^>]*>[\s\S]*?<\/style>/ig;
  let match;

  while ((match = pattern.exec(source))) {
    if (/#jsu-wrapped/i.test(match[0]) && /\.jsuw-shell/i.test(match[0])) {
      return match.index;
    }
  }

  return -1;
}

function inlineWidgetStyleText(html) {
  const source = String(html || "");
  const pattern = /<style\b[^>]*>([\s\S]*?)<\/style>/ig;
  let match;

  while ((match = pattern.exec(source))) {
    if (/#jsu-wrapped/i.test(match[1]) && /\.jsuw-shell/i.test(match[1])) {
      return match[1];
    }
  }

  return "";
}

function osanoScriptIndex(html) {
  const match = String(html || "").match(/<script\b[^>]*\bsrc\s*=\s*['"][^'"]*cmp\.osano\.com[^'"]*['"][^>]*>/i);

  return match && typeof match.index === "number" ? match.index : -1;
}

function hasHostAnalyticsLoader(html) {
  return /\bGTM-[A-Z0-9]+\b/i.test(String(html || "")) || /googletagmanager\.com\/(?:gtm|gtag)\.js|google-analytics\.com/i.test(String(html || ""));
}

function hasStaticLoadingShell(html) {
  const widgetStart = tagIndexWithId(html, "jsu-wrapped");

  if (widgetStart === -1) {
    return false;
  }

  const afterWidget = String(html || "").slice(widgetStart, widgetStart + 2200);

  return /jsuw-shell\s+jsuw-shell--loading|jsuw-shell--loading\s+jsuw-shell/i.test(afterWidget) && /\brole\s*=\s*['"]status['"]/i.test(afterWidget);
}

function hasInlineWidgetStyles(html) {
  return inlineWidgetStyleIndex(html) !== -1;
}

function hasInlineWidgetScript(html) {
  return /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?(?:\(function\s*\(root,\s*factory\)|root\.JSUWrapped|JSUWrapped)[\s\S]*?<\/script>/i.test(String(html || ""));
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function suggestedWidgetTag(html, options) {
  const settings = options || {};
  const ctaLabel = attrValue(html, "data-cta-label") || "Get involved next year";
  const ctaTarget = attrValue(html, "data-cta-target") || "#jsuw-wrapped-interest";
  const ctaHref = settings.ctaHref || attrValue(html, "data-cta-href");
  const safeCtaHref = isSafeCtaHref(ctaHref) && !hasCtaUrlPayload(ctaHref) ? ctaHref : "";
  const year = attrValue(html, "data-year") || "2026";
  const ctaAttribute = safeCtaHref
    ? `data-cta-href="${escapeAttr(safeCtaHref)}"`
    : `data-cta-target="${escapeAttr(ctaTarget)}"`;

  return [
    '<div id="jsu-wrapped"',
    `data-year="${escapeAttr(year)}"`,
    CHAPTER_DATA_ATTR,
    CONFIG_DATA_ATTR,
    TEEN_DATA_ATTR,
    ASSETS_BASE_ATTR,
    SHARE_BASE_ATTR,
    'data-analytics="true"',
    `data-cta-label="${escapeAttr(ctaLabel)}"`,
    `${ctaAttribute}></div>`
  ].join(" ");
}

function addWidgetTagFix(html, fixes, options) {
  const replacement = suggestedWidgetTag(html, options);

  if (!fixes.some((fix) => fix.includes("Replace the #jsu-wrapped opening tag with:"))) {
    fixes.unshift(`Replace the #jsu-wrapped opening tag with: ${replacement}`);
  }
}

function addUniqueFix(fixes, fix) {
  if (!fixes.includes(fix)) {
    fixes.push(fix);
  }
}

function mustInclude(text, expected, message, errors) {
  if (!String(text || "").includes(expected)) {
    errors.push(message);
  }
}

function validateWordPressPage(page, options) {
  const settings = options || {};
  const errors = [];
  const fixes = [];
  const status = Number(page && page.status);
  const html = String(page && page.text || "");
  const text = visibleText(html);
  const dataSource = attrValue(html, "data-source");
  const configSource = attrValue(html, "data-config-source");
  const teenSource = attrValue(html, "data-teen-source");
  const ctaTarget = attrValue(html, "data-cta-target");
  const ctaHref = attrValue(html, "data-cta-href");
  const contentType = headerValue(page && page.headers, "content-type").toLowerCase();
  const pageTitle = titleValue(html);
  const ogType = metaContentValue(html, "og:type");
  const ogSiteName = metaContentValue(html, "og:site_name");
  const ogTitle = metaContentValue(html, "og:title");
  const twitterTitle = metaContentValue(html, "twitter:title");
  const metaDescription = metaContentValue(html, "description");
  const ogDescription = metaContentValue(html, "og:description");
  const twitterDescription = metaContentValue(html, "twitter:description");
  const canonicalUrl = linkHrefValue(html, "canonical");
  const ogUrl = metaContentValue(html, "og:url");
  const twitterUrl = metaContentValue(html, "twitter:url");
  const ogImage = metaContentValue(html, "og:image");
  const ogImageSecure = metaContentValue(html, "og:image:secure_url");
  const twitterImage = metaContentValue(html, "twitter:image");
  const twitterCard = metaContentValue(html, "twitter:card");
  const ogImageWidth = metaContentValue(html, "og:image:width");
  const ogImageHeight = metaContentValue(html, "og:image:height");
  const ogImageAlt = metaContentValue(html, "og:image:alt");
  const twitterImageAlt = metaContentValue(html, "twitter:image:alt");
  const socialTitle = suggestedSocialTitle(page, html);
  const socialDescription = suggestedSocialDescription(page, html);
  const socialUrl = suggestedSocialUrl(page);
  const socialImageAlt = suggestedSocialImageAlt(page, html);
  const socialSubject = titleSubjectFromValue(socialTitle);

  if (status < 200 || status >= 300) {
    errors.push(`WordPress page returned HTTP ${status || "unknown"}`);
    return { errors, fixes, ok: false };
  }

  if (contentType && !contentType.includes("text/html")) {
    errors.push(`WordPress page content type is ${contentType}, expected text/html`);
  }

  if (!hasId(html, "jsu-wrapped")) {
    errors.push("WordPress page missing widget container #jsu-wrapped");
  }

  const stylesheetUrls = hostedAssetUrls(html, "jsu-wrapped.css", "href");
  const scriptUrls = hostedAssetUrls(html, "jsu-wrapped.js", "src");
  const inlineStyleIndex = inlineWidgetStyleIndex(html);
  const inlineStyleText = inlineWidgetStyleText(html);
  const shellIndex = tagIndexWithId(html, "jsu-wrapped-wordpress-shell");
  const osanoIndex = osanoScriptIndex(html);
  const inlineShell = hasInlineWidgetStyles(html) || hasInlineWidgetScript(html) || shellIndex !== -1;

  if (!hasInlineWidgetStyles(html) && !stylesheetUrls.length) {
    errors.push("WordPress page missing widget stylesheet");
    fixes.push(`Add the hosted widget stylesheet: ${WIDGET_CSS_TAG}`);
  } else if (stylesheetUrls.some((url) => !hasReleaseToken(url))) {
    errors.push("WordPress page widget stylesheet is missing the shared cache token");
    fixes.push(`Use the current hosted widget stylesheet: ${WIDGET_CSS_TAG}`);
  }

  if (inlineStyleIndex !== -1 && shellIndex !== -1 && inlineStyleIndex > shellIndex) {
    errors.push("WordPress inline CSS loads after shell markup, which can cause a short first paint");
    addUniqueFix(fixes, "Move the inline <style> block above #jsu-wrapped-wordpress-shell and before the Osano script, or paste the current wordpress-inline-embed.html block.");
  }

  if (inlineStyleIndex !== -1 && osanoIndex !== -1 && inlineStyleIndex > osanoIndex) {
    errors.push("WordPress inline CSS loads after Osano, which can delay fullscreen first paint");
    addUniqueFix(fixes, "Move the inline <style> block above #jsu-wrapped-wordpress-shell and before the Osano script, or paste the current wordpress-inline-embed.html block.");
  }

  if (inlineStyleText && (!/height:\s*calc\(100dvh - 16px\);/.test(inlineStyleText) || !/right:\s*58px;/.test(inlineStyleText))) {
    errors.push("WordPress inline CSS is missing the current mobile fullscreen and floating-widget clearance rules");
    addUniqueFix(fixes, "Paste the current wordpress-inline-embed.html block so the mobile story uses dynamic viewport height and clears floating privacy/accessibility widgets.");
  }

  if (inlineShell && !hasHostAnalyticsLoader(html)) {
    errors.push("WordPress no-header shell is missing host GTM/Google analytics loader");
    addUniqueFix(fixes, "Include the existing NCSY GTM container GTM-MLW344 in the no-header/no-footer page shell, or paste the current wordpress-inline-embed.html block.");
  }

  if (inlineShell && !hasStaticLoadingShell(html)) {
    errors.push("WordPress inline page is missing the static loading shell for fullscreen first paint");
    addUniqueFix(fixes, "Paste the current wordpress-inline-embed.html block so #jsu-wrapped includes the static jsuw-shell--loading placeholder before JavaScript runs.");
  }

  if (!hasInlineWidgetScript(html) && !scriptUrls.length) {
    errors.push("WordPress page missing widget script");
    fixes.push(`Add the hosted widget script: ${WIDGET_JS_TAG}`);
  } else if (scriptUrls.some((url) => !hasReleaseToken(url))) {
    errors.push("WordPress page widget script is missing the shared cache token");
    fixes.push(`Use the current hosted widget script: ${WIDGET_JS_TAG}`);
  }

  if (!dataSource) {
    errors.push("WordPress page missing widget data-source");
    fixes.push(`Add ${CHAPTER_DATA_ATTR} to the #jsu-wrapped container.`);
    addWidgetTagFix(html, fixes, settings);
  } else if (!/sample-wrapped-2026\.json/.test(dataSource)) {
    errors.push("WordPress page data-source should point at the chapter JSON");
    fixes.push(`Set the #jsu-wrapped chapter data attribute to ${CHAPTER_DATA_ATTR}.`);
    addWidgetTagFix(html, fixes, settings);
  } else if (!hasReleaseToken(dataSource)) {
    errors.push("WordPress page data-source is missing the shared cache token");
    fixes.push(`Set the #jsu-wrapped chapter data attribute to ${CHAPTER_DATA_ATTR}.`);
    addWidgetTagFix(html, fixes, settings);
  }

  if (!configSource) {
    errors.push("WordPress page missing widget data-config-source");
    fixes.push(`Add ${CONFIG_DATA_ATTR} to the #jsu-wrapped container.`);
    addWidgetTagFix(html, fixes, settings);
  } else if (!/wrapped-config-2026\.json/.test(configSource)) {
    errors.push("WordPress page data-config-source should point at the config JSON");
    fixes.push(`Set the #jsu-wrapped config attribute to ${CONFIG_DATA_ATTR}.`);
    addWidgetTagFix(html, fixes, settings);
  } else if (!hasReleaseToken(configSource)) {
    errors.push("WordPress page data-config-source is missing the shared cache token");
    fixes.push(`Set the #jsu-wrapped config attribute to ${CONFIG_DATA_ATTR}.`);
    addWidgetTagFix(html, fixes, settings);
  }

  if (teenSource && /sample-teen-wrapped-2026\.json/.test(teenSource) && !hasReleaseToken(teenSource)) {
    errors.push("WordPress page data-teen-source is missing the shared cache token");
    fixes.push(`Set ${TEEN_DATA_ATTR} on the #jsu-wrapped container.`);
    addWidgetTagFix(html, fixes, settings);
  }

  if (!/data-share-base\s*=/.test(html) || !/\/share\//.test(html)) {
    errors.push("WordPress page missing generated share-page base");
    fixes.push(`Add ${SHARE_BASE_ATTR} to the #jsu-wrapped container.`);
    addWidgetTagFix(html, fixes, settings);
  }

  if (!ctaTarget && !ctaHref) {
    errors.push("WordPress page missing final-card CTA target or href");
  }

  if (ctaHref && !isSafeCtaHref(ctaHref)) {
    errors.push("WordPress page data-cta-href must be a safe URL");
    fixes.push('Set data-cta-href to a safe https://, root-relative, dot-relative, query-string, or fragment URL, or use data-cta-target="#jsuw-wrapped-interest".');
  } else if (ctaHref && hasCtaUrlPayload(ctaHref)) {
    errors.push("WordPress page data-cta-href should use only short wrapped_* context params");
    fixes.push('Set data-cta-href to the clean Gravity Forms page URL only; the widget appends short wrapped_* context params automatically. Do not include JSON, builder payloads, or wrapped_submission in the URL.');
  }

  if (ctaTarget) {
    if (ctaTarget.charAt(0) !== "#") {
      errors.push("WordPress page CTA target should be an id selector");
    } else if (!hasId(html, ctaTarget.slice(1))) {
      errors.push(`WordPress page CTA target ${ctaTarget} is missing its panel`);
    }

    if (!/(gform_|gform_wrapper|wrapped_chapter|wrapped_region|wrapped_url|wrapped_scope|wrapped_slug|wrapped_name)/i.test(html)) {
      errors.push("WordPress page CTA target panel should include Gravity Forms/context fields");
    }

    const panelHtml = embeddedCtaPanelHtml(html, ctaTarget);
    const missingContextFields = missingCtaContextFields(panelHtml);

    if (hasUnrenderedGravityFormsShortcode(panelHtml)) {
      errors.push("WordPress page CTA target contains an unrendered Gravity Forms shortcode");
      fixes.push(`Move the Gravity Form into a Shortcode block, Gravity Forms block, or template-rendered shortcode wrapped by ${ctaTarget}; Custom HTML blocks often leave [gravityform] shortcodes unrendered.`);
    }

    if (missingContextFields.length) {
      errors.push(`WordPress page CTA form is missing context fields for ${missingContextFields.map((field) => field.label).join(", ")}`);
      fixes.push(`Add hidden Gravity Forms fields named ${missingContextFields.map((field) => field.suggestedName).join(", ")} so the widget can prefill story context.`);
    }
  }

  if (!hasExpectedWrappedTitle(pageTitle)) {
    errors.push("WordPress page title should use JSU/NCSY Wrapped - [Chapter or Scope Name]");
    fixes.push(`Set the page title to "${socialTitle}".`);
  }

  if (!/og:title|twitter:title/i.test(html)) {
    errors.push("WordPress page missing social title metadata");
    fixes.push(`Add og:title or twitter:title metadata using "${socialTitle}".`);
  } else if (!hasExpectedWrappedTitle(ogTitle) && !hasExpectedWrappedTitle(twitterTitle)) {
    errors.push("WordPress page social title metadata should use JSU/NCSY Wrapped - [Chapter or Scope Name]");
    fixes.push(`Set og:title and twitter:title to "${socialTitle}".`);
  }

  if (!hasExpectedWrappedTitle(ogTitle)) {
    errors.push("WordPress page og:title should use JSU/NCSY Wrapped - [Chapter or Scope Name]");
    fixes.push(`Set og:title to "${socialTitle}".`);
  }

  if (twitterTitle && !hasExpectedWrappedTitle(twitterTitle)) {
    errors.push("WordPress page twitter:title should use JSU/NCSY Wrapped - [Chapter or Scope Name]");
    fixes.push(`Set twitter:title to "${socialTitle}".`);
  }

  if (!["article", "website"].includes(String(ogType || "").trim().toLowerCase())) {
    errors.push("WordPress page og:type should be website or article");
    fixes.push("Set og:type to website or article.");
  }

  if (!["JSU/NCSY Wrapped", "NCSY", "JSU"].includes(String(ogSiteName || "").trim())) {
    errors.push("WordPress page social site name metadata should identify NCSY, JSU, or JSU/NCSY Wrapped");
    fixes.push("Set og:site_name to NCSY, JSU, or JSU/NCSY Wrapped.");
  }

  if (!hasExpectedSocialDescription(metaDescription, socialDescription, socialSubject)) {
    errors.push("WordPress page meta description should use chapter-specific JSU/NCSY Wrapped copy");
    fixes.push(`Set the meta description to "${socialDescription}".`);
  }

  if (!/og:description|twitter:description/i.test(html)) {
    errors.push("WordPress page missing social description metadata");
    fixes.push(`Add og:description and twitter:description metadata using "${socialDescription}".`);
  } else if (!hasExpectedSocialDescription(ogDescription, socialDescription, socialSubject) && !hasExpectedSocialDescription(twitterDescription, socialDescription, socialSubject)) {
    errors.push("WordPress page social description metadata should use chapter-specific JSU/NCSY Wrapped copy");
    fixes.push(`Set og:description and twitter:description to "${socialDescription}".`);
  }

  if (!canonicalUrl) {
    errors.push("WordPress page missing canonical URL metadata");
    fixes.push(`Set the canonical URL to ${socialUrl}.`);
  } else if (!matchesSocialUrl(canonicalUrl, socialUrl)) {
    errors.push("WordPress page canonical URL should use the chapter URL");
    fixes.push(`Set the canonical URL to ${socialUrl}.`);
  }

  if (!/og:url|twitter:url/i.test(html)) {
    errors.push("WordPress page missing social URL metadata");
    fixes.push(`Set og:url and twitter:url to ${socialUrl}.`);
  } else if (!matchesSocialUrl(ogUrl, socialUrl) && !matchesSocialUrl(twitterUrl, socialUrl)) {
    errors.push("WordPress page social URL metadata should use the chapter URL");
    fixes.push(`Set og:url and twitter:url to ${socialUrl}.`);
  }

  if (!matchesSocialUrl(ogUrl, socialUrl)) {
    errors.push("WordPress page og:url should use the chapter URL");
    fixes.push(`Set og:url to ${socialUrl}.`);
  }

  if (twitterUrl && !matchesSocialUrl(twitterUrl, socialUrl)) {
    errors.push("WordPress page twitter:url should use the chapter URL");
    fixes.push(`Set twitter:url to ${socialUrl}.`);
  }

  if (!/og:image|twitter:image/i.test(html)) {
    errors.push("WordPress page missing social image metadata");
    fixes.push(`Set og:image and twitter:image to ${SOCIAL_IMAGE_URL}.`);
  } else if (!hasExpectedSocialImage(ogImage) && !hasExpectedSocialImage(twitterImage)) {
    errors.push("WordPress page social image metadata should use the JSU/NCSY Wrapped campaign image");
    fixes.push(`Set og:image and twitter:image to ${SOCIAL_IMAGE_URL}.`);
  }

  if (!hasExpectedSocialImage(ogImage)) {
    errors.push("WordPress page og:image should use the JSU/NCSY Wrapped campaign image");
    fixes.push(`Set og:image to ${SOCIAL_IMAGE_URL}.`);
  }

  if (twitterImage && !hasExpectedSocialImage(twitterImage)) {
    errors.push("WordPress page twitter:image should use the JSU/NCSY Wrapped campaign image");
    fixes.push(`Set twitter:image to ${SOCIAL_IMAGE_URL}.`);
  }

  if (ogImageSecure && !hasExpectedSocialImage(ogImageSecure)) {
    errors.push("WordPress page secure image metadata should use the JSU/NCSY Wrapped campaign image");
    fixes.push(`Set og:image:secure_url to ${SOCIAL_IMAGE_URL}.`);
  }

  if (twitterCard && String(twitterCard || "").trim().toLowerCase() !== "summary_large_image") {
    errors.push("WordPress page twitter:card should be summary_large_image");
    fixes.push("Set twitter:card to summary_large_image.");
  }

  if ((ogImageWidth || ogImageHeight) && (String(ogImageWidth || "").trim() !== SOCIAL_IMAGE_WIDTH || String(ogImageHeight || "").trim() !== SOCIAL_IMAGE_HEIGHT)) {
    errors.push(`WordPress page social image dimensions should be ${SOCIAL_IMAGE_WIDTH}x${SOCIAL_IMAGE_HEIGHT}`);
    fixes.push(`Set og:image:width to ${SOCIAL_IMAGE_WIDTH} and og:image:height to ${SOCIAL_IMAGE_HEIGHT}.`);
  }

  if (ogImageAlt && String(ogImageAlt || "").trim() !== socialImageAlt) {
    errors.push("WordPress page social image alt metadata should describe the Wrapped preview");
    fixes.push(`Set og:image:alt to "${socialImageAlt}".`);
  }

  if (twitterImageAlt && String(twitterImageAlt || "").trim() !== socialImageAlt) {
    errors.push("WordPress page Twitter image alt metadata should describe the Wrapped preview");
    fixes.push(`Set twitter:image:alt to "${socialImageAlt}".`);
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
    fixes,
    ok: errors.length === 0
  };
}

function formatFixPacket(page, report, options) {
  const settings = options || {};
  const html = String(page && page.text || "");
  const url = String(page && page.url || DEFAULT_URL);
  const validationReport = report || validateWordPressPage(page, settings);
  const socialTitle = suggestedSocialTitle(page, html);
  const socialDescription = suggestedSocialDescription(page, html);
  const socialUrl = suggestedSocialUrl(page);
  const socialImageAlt = suggestedSocialImageAlt(page, html);
  const ctaTarget = attrValue(html, "data-cta-target");
  const directCtaHref = settings.ctaHref && isSafeCtaHref(settings.ctaHref) && !hasCtaUrlPayload(settings.ctaHref) ? settings.ctaHref : "";
  const suggestedTag = suggestedWidgetTag(html, settings);
  const copyReadyHtmlBlock = [WIDGET_CSS_TAG, suggestedTag, WIDGET_JS_TAG].join("\n");
  const needsFullInlineBlock = validationReport.errors.some((error) => /inline CSS|static loading shell|floating-widget clearance|fullscreen first paint/i.test(error));
  const recommendedContextFields = "wrapped_chapter, wrapped_chapter_slug, wrapped_region, wrapped_scope, wrapped_slug, wrapped_name, wrapped_variant, wrapped_year, wrapped_url";
  const missingContextFields = ctaTarget ? missingCtaContextFields(embeddedCtaPanelHtml(html, ctaTarget)) : [];
  const followUpCommand = directCtaHref
    ? `node wordpress-smoke.js --url "${url}" --cta-href "${directCtaHref}" --check-cta-destination`
    : `node wordpress-smoke.js --url "${url}"`;
  const embeddedContextFieldLine = missingContextFields.length
    ? `Add fields named: ${missingContextFields.map((field) => field.suggestedName).join(", ")}`
    : `Confirm fields named: ${recommendedContextFields}`;
  const contextFieldLines = directCtaHref ? [
    "",
    `Direct Gravity Forms CTA URL: ${directCtaHref}`,
    "Add these hidden/context fields on the destination form page:",
    recommendedContextFields
  ] : ctaTarget ? [
    "",
    "Embedded Gravity Forms CTA setup:",
    "Do not rely on a [gravityform] shortcode inside a Custom HTML block; many WordPress editors leave it unrendered.",
    "Use a Shortcode block, Gravity Forms block, or template-rendered shortcode wrapped by #jsuw-wrapped-interest.",
    "",
    "Gravity Forms hidden/context fields:",
    embeddedContextFieldLine,
    `Recommended full set: ${recommendedContextFields}`
  ] : [];

  return [
    "WordPress Wrapped launch packet",
    "",
    "Production hosting map:",
    "- NCSY.org is the canonical public Wrapped page.",
    "- GitHub Pages is the static asset/data host for widget files, JSON/config, share pages, and images unless those move to NCSY.org.",
    "- Gravity Forms handles only the final CTA/contact capture.",
    "- This CTA form is not the staff-builder submission intake flow; builder submissions use a separate review form or email handoff.",
    "- A nonzero exit in fix-packet mode means the live page is still stale after the packet was generated. Apply the packet, then rerun the follow-up verification command.",
    "",
    `URL: ${url}`,
    "",
    "Recommended update for this report:",
    needsFullInlineBlock
      ? `Paste the full self-contained inline block from ${FULL_INLINE_EMBED_PATH} into the Brizy HTML block.`
      : "Use the hosted-mode block below if this WordPress page is meant to load CSS/JS from GitHub Pages.",
    needsFullInlineBlock
      ? "Do not use the hosted-mode snippet as the fix for this current stale-inline failure; it will not replace stale inline CSS already stored in Brizy."
      : "If this is a self-contained Brizy inline page instead, paste the full current wordpress-inline-embed.html block.",
    "",
    "Live update choices:",
    "If the live page has inline CSS ordering errors, paste the full current wordpress-inline-embed.html block.",
    "Replacing only the #jsu-wrapped tag updates data/cache attributes but does not move stale inline CSS.",
    "Use the hosted block below only when the WordPress block is meant to load CSS/JS from GitHub Pages instead of the full self-contained inline file.",
    "",
    "Hosted-mode copy-ready HTML block:",
    copyReadyHtmlBlock,
    "",
    "Replace #jsu-wrapped with:",
    suggestedTag,
    "",
    "Hosted CSS/JS assets:",
    WIDGET_CSS_TAG,
    WIDGET_JS_TAG,
    "Do not paste these a second time if you use the copy-ready WordPress HTML block above. Skip hosted assets entirely only if you paste the full self-contained wordpress-inline-embed.html block.",
    "",
    `Page/social title: ${socialTitle}`,
    "",
    "Set these metadata fields if your SEO/social plugin exposes them:",
    "og:type: website",
    "og:site_name: JSU/NCSY Wrapped",
    `og:title: ${socialTitle}`,
    `twitter:title: ${socialTitle}`,
    `description: ${socialDescription}`,
    `og:description: ${socialDescription}`,
    `twitter:description: ${socialDescription}`,
    `canonical: ${socialUrl}`,
    `og:url: ${socialUrl}`,
    `twitter:url: ${socialUrl}`,
    `og:image: ${SOCIAL_IMAGE_URL}`,
    `og:image:secure_url: ${SOCIAL_IMAGE_URL}`,
    `twitter:image: ${SOCIAL_IMAGE_URL}`,
    "twitter:card: summary_large_image",
    `og:image:width: ${SOCIAL_IMAGE_WIDTH}`,
    `og:image:height: ${SOCIAL_IMAGE_HEIGHT}`,
    `og:image:alt: ${socialImageAlt}`,
    `twitter:image:alt: ${socialImageAlt}`,
    ...contextFieldLines,
    "",
    "Follow-up verification:",
    followUpCommand,
    "",
    validationReport.ok ? "Current live smoke: ok" : "Current live smoke still reports:",
    validationReport.ok ? "" : validationReport.errors.map((error) => `- ${error}`).join("\n")
  ].filter((line) => line !== "").join("\n");
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
    checkCtaDestination: false,
    ctaHref: "",
    dryRun: false,
    fixPacket: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    url: DEFAULT_URL
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--url") {
      settings.url = args[index + 1] || DEFAULT_URL;
      index += 1;
    } else if (arg === "--cta-href" || arg === "--form-url") {
      settings.ctaHref = args[index + 1] || "";
      index += 1;
    } else if (arg === "--timeout-ms") {
      settings.timeoutMs = Number(args[index + 1]) || DEFAULT_TIMEOUT_MS;
      index += 1;
    } else if (arg === "--check-cta-destination") {
      settings.checkCtaDestination = true;
    } else if (arg === "--dry-run") {
      settings.dryRun = true;
    } else if (arg === "--fix-packet") {
      settings.fixPacket = true;
    } else if (arg === "--help" || arg === "-h") {
      settings.help = true;
    }
  }

  return settings;
}

function usage() {
  return [
    "Usage:",
    "  node wordpress-smoke.js [--url https://ncsy.org/ncsy-wrapped/?chapter=baltimore] [--cta-href https://ncsy.org/wrapped-interest/] [--check-cta-destination] [--timeout-ms 15000] [--dry-run] [--fix-packet]",
    "",
    "Fetches a live WordPress Wrapped page and checks the widget shell, hosted data/config references, share base, CTA form target, privacy/cookie affordance, social titles, social descriptions, canonical/Open Graph URLs, and campaign image metadata.",
    "",
    "Use --fix-packet to print one compact copy-ready WordPress update packet when the page is still stale.",
    "Use --cta-href when the final CTA should link to a separate Gravity Forms page instead of opening an embedded same-page panel.",
    "Use --check-cta-destination after that form page is published to verify its Gravity Forms hidden/context fields."
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
    if (settings.checkCtaDestination) {
      const destinationUrl = resolveCtaDestinationUrl(settings.ctaHref, settings.url);
      console.log(destinationUrl
        ? `WordPress smoke would also check CTA destination ${destinationUrl}`
        : "WordPress smoke would also check the CTA destination from data-cta-href when available.");
    }
    return;
  }

  console.log(`WordPress smoke checking ${settings.url}`);
  const page = await fetchWithTimeout(settings.url, settings.timeoutMs);
  const report = validateWordPressPage(page, settings);

  if (settings.checkCtaDestination) {
    const ctaHref = settings.ctaHref || attrValue(page.text, "data-cta-href");
    const destinationUrl = resolveCtaDestinationUrl(ctaHref, page.url);

    if (!destinationUrl) {
      report.errors.push("WordPress CTA destination check requested but no safe direct CTA href was available");
      report.fixes.push('Set data-cta-href to the clean Gravity Forms page URL, or pass --cta-href "https://ncsy.org/wrapped-interest/".');
    } else {
      console.log(`WordPress smoke checking CTA destination ${destinationUrl}`);
      const destinationPage = await fetchWithTimeout(destinationUrl, settings.timeoutMs);
      const destinationReport = validateCtaDestinationPage(destinationPage);

      report.errors.push(...destinationReport.errors);
      report.fixes.push(...destinationReport.fixes);
      report.ok = report.errors.length === 0;
    }
  }

  if (settings.fixPacket) {
    console.log(formatFixPacket(page, report, settings));
    if (settings.fixPacket && !report.ok) {
      process.exitCode = 1;
      return;
    }
  }

  if (!report.ok) {
    console.error("WordPress smoke failed:");
    report.errors.forEach((error) => {
      console.error(`- ${error}`);
    });
    if (report.fixes.length) {
      console.error("Suggested fixes:");
      report.fixes.forEach((fix) => {
        console.error(`- ${fix}`);
      });
    }
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
  attrValues,
  embeddedCtaPanelHtml,
  formatFixPacket,
  hasInlineWidgetScript,
  hasInlineWidgetStyles,
  metaContentValue,
  missingCtaContextFields,
  suggestedSocialTitle,
  suggestedWidgetTag,
  hostedAssetUrls,
  hasId,
  headerValue,
  hasExpectedSocialImage,
  isSafeCtaHref,
  linkHrefValue,
  matchesSocialUrl,
  resolveCtaDestinationUrl,
  suggestedSocialDescription,
  suggestedSocialImageAlt,
  suggestedSocialUrl,
  titleFromSlug,
  titleSubjectFromValue,
  titleValue,
  validateCtaDestinationPage,
  validateWordPressPage,
  visibleText
};
