(function (root, factory) {
  var api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root && root.document) {
    root.JSUWrapped = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var DEFAULT_DATA_PATH = "/wp-content/uploads/wrapped/wrapped-{year}.json";
  var DEFAULT_TEEN_DATA_PATH = "/wp-content/uploads/wrapped/teen-wrapped-{year}.json";
  var WIDGET_ID = "jsu-wrapped";
  var SCRIPT_SRC = root && root.document && root.document.currentScript ? root.document.currentScript.src : "";
  var DEFAULT_AUTOPLAY_DELAY = 5200;

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function asText(value, fallback) {
    if (hasValue(value)) {
      return String(value);
    }

    return fallback || "";
  }

  function formatNumber(value) {
    if (!hasValue(value)) {
      return "";
    }

    var numeric = Number(value);

    if (isFinite(numeric)) {
      return new Intl.NumberFormat("en-US").format(numeric);
    }

    return String(value);
  }

  function numberValue(value, fallback) {
    if (!hasValue(value)) {
      return fallback || 0;
    }

    var numeric = Number(String(value).replace(/,/g, "").replace(/%$/, ""));

    return isFinite(numeric) ? numeric : fallback || 0;
  }

  function chapterStoryTitle(value) {
    var name = asText(value, "Your JSU chapter").trim();

    if (/\s+JSU$/i.test(name)) {
      return name.replace(/\s+JSU$/i, "\nJSU");
    }

    return name;
  }

  function getStatAnimationConfig(value) {
    if (!hasValue(value)) {
      return null;
    }

    var text = String(value).trim();
    var suffixMatch = text.match(/([^\d\s,.-]+)$/);
    var numericText = text.replace(/,/g, "").replace(/[^\d.-]/g, "");
    var target = Number(numericText);

    if (!isFinite(target)) {
      return null;
    }

    var decimalIndex = numericText.indexOf(".");

    return {
      target: target,
      suffix: suffixMatch ? suffixMatch[1] : "",
      decimals: decimalIndex === -1 ? 0 : numericText.length - decimalIndex - 1
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function slugify(value) {
    return String(value || "jsu-wrapped")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "jsu-wrapped";
  }

  function getChapterSlug(url) {
    var href = url || (root && root.location && root.location.href) || "";

    try {
      return new URL(href).searchParams.get("chapter");
    } catch (error) {
      if (href.charAt(0) === "?") {
        return new URLSearchParams(href).get("chapter");
      }

      return null;
    }
  }

  function getDataUrl(container) {
    var dataset = (container && container.dataset) || {};
    var year = asText(dataset.year, String(new Date().getFullYear()));

    if (hasValue(dataset.source)) {
      return dataset.source;
    }

    return DEFAULT_DATA_PATH.replace("{year}", encodeURIComponent(year));
  }

  function getTeenDataUrl(container) {
    var dataset = (container && container.dataset) || {};
    var year = asText(dataset.year, String(new Date().getFullYear()));

    if (hasValue(dataset.teenSource)) {
      return dataset.teenSource;
    }

    return DEFAULT_TEEN_DATA_PATH.replace("{year}", encodeURIComponent(year));
  }

  function parseBooleanFlag(value) {
    if (!hasValue(value)) {
      return null;
    }

    var normalized = String(value).trim().toLowerCase();

    if (["1", "true", "yes", "on"].indexOf(normalized) !== -1) {
      return true;
    }

    if (["0", "false", "no", "off"].indexOf(normalized) !== -1) {
      return false;
    }

    return null;
  }

  function getSearchValue(url, names) {
    var href = url || (root && root.location && root.location.href) || "";

    try {
      var params = new URL(href).searchParams;

      for (var index = 0; index < names.length; index += 1) {
        if (params.has(names[index])) {
          return params.get(names[index]);
        }
      }
    } catch (error) {
      if (href.charAt(0) === "?") {
        var searchParams = new URLSearchParams(href);

        for (var offset = 0; offset < names.length; offset += 1) {
          if (searchParams.has(names[offset])) {
            return searchParams.get(names[offset]);
          }
        }
      }
    }

    return null;
  }

  function getRegionParam(url) {
    return getSearchValue(url, ["region"]);
  }

  function getTeenSlug(url) {
    return getSearchValue(url, ["teen", "student"]);
  }

  function getExperienceMode(url, options) {
    var settings = options || {};
    var requested = asText(settings.mode || getSearchValue(url || settings.url, ["mode", "view"]), "").toLowerCase();

    if (requested === "teen" || requested === "student") {
      return "teen";
    }

    if (hasValue(settings.teen) || hasValue(getTeenSlug(url || settings.url))) {
      return "teen";
    }

    return "chapter";
  }

  function getAutoplayPreference(container, options) {
    var settings = options || {};
    var dataset = (container && container.dataset) || {};

    if (settings.autoplay !== undefined) {
      return parseBooleanFlag(settings.autoplay) === true;
    }

    var urlFlag = parseBooleanFlag(getSearchValue(settings.url, ["autoplay", "autoadvance", "auto"]));

    if (urlFlag !== null) {
      return urlFlag;
    }

    var dataFlag = parseBooleanFlag(dataset.autoadvance || dataset.autoplay);

    return dataFlag === true;
  }

  function getAutoplayDelay(container, options) {
    var settings = options || {};
    var dataset = (container && container.dataset) || {};
    var requested = settings.autoplayDelay || getSearchValue(settings.url, ["duration", "autoplayDelay", "autoadvanceDelay"]) || dataset.autoplayDelay || dataset.autoadvanceDelay;
    var delay = Number(requested);

    if (!isFinite(delay) || delay <= 0) {
      return DEFAULT_AUTOPLAY_DELAY;
    }

    if (delay < 1500) {
      return 1500;
    }

    if (delay > 30000) {
      return 30000;
    }

    return Math.round(delay);
  }

  function getScriptBaseUrl() {
    if (!hasValue(SCRIPT_SRC)) {
      return "";
    }

    return SCRIPT_SRC.slice(0, SCRIPT_SRC.lastIndexOf("/") + 1);
  }

  function getAssetBase(container, options) {
    var dataset = (container && container.dataset) || {};
    var explicit = options && options.assetBase || dataset.assetsBase;

    if (hasValue(explicit)) {
      return asText(explicit);
    }

    return getScriptBaseUrl() + "assets/";
  }

  function getBrandChoice(record) {
    var fields = [
      "brand_logo",
      "logo",
      "logo_type",
      "logo_key",
      "logo_flag",
      "org_logo",
      "organization"
    ];
    var value = "";

    for (var index = 0; index < fields.length; index += 1) {
      if (record && hasValue(record[fields[index]])) {
        value = String(record[fields[index]]).trim().toLowerCase();
        break;
      }
    }

    if (
      record && (
        record.use_ncsy_logo === true ||
        String(record.use_ncsy_logo).toLowerCase() === "true" ||
        record.show_ncsy_logo === true ||
        String(record.show_ncsy_logo).toLowerCase() === "true"
      )
    ) {
      return "ncsy";
    }

    if (value.indexOf("ncsy") !== -1) {
      return "ncsy";
    }

    return "jsu";
  }

  function getLogoAsset(brand, assetBase) {
    var base = hasValue(assetBase) ? asText(assetBase) : "";

    if (base && base.charAt(base.length - 1) !== "/") {
      base += "/";
    }

    return base + (brand === "ncsy" ? "ncsy-logo.png" : "jsu-logo.png");
  }

  function getInitialCardIndex(url, total) {
    var href = url || (root && root.location && root.location.href) || "";
    var count = Number(total) || 0;
    var value = null;

    try {
      value = new URL(href).searchParams.get("card");
    } catch (error) {
      if (href.charAt(0) === "?") {
        value = new URLSearchParams(href).get("card");
      }
    }

    var requested = Number(value);

    if (!isFinite(requested) || requested < 1 || requested > count) {
      return 0;
    }

    return Math.floor(requested) - 1;
  }

  function compactPayload(payload) {
    var output = {};

    Object.keys(payload || {}).forEach(function (key) {
      var value = payload[key];

      if (value === null || value === undefined || value === "") {
        return;
      }

      output[key] = value;
    });

    return output;
  }

  function nowMs() {
    if (root.performance && typeof root.performance.now === "function") {
      return root.performance.now();
    }

    return Date.now();
  }

  function getAnalyticsPreference(container, options) {
    var settings = options || {};
    var dataset = (container && container.dataset) || {};

    if (settings.analytics !== undefined) {
      return parseBooleanFlag(settings.analytics) !== false;
    }

    var urlFlag = parseBooleanFlag(getSearchValue(settings.url, ["analytics", "tracking"]));

    if (urlFlag !== null) {
      return urlFlag;
    }

    var dataFlag = parseBooleanFlag(dataset.analytics);

    if (dataFlag !== null) {
      return dataFlag;
    }

    return true;
  }

  function getAnalyticsYear(container, options, record) {
    var settings = options || {};
    var dataset = (container && container.dataset) || {};

    return asText(settings.analyticsYear || dataset.year || record && (record.year_label || record.school_year), "");
  }

  function createAnalyticsPayload(state, eventName, extra) {
    var record = state && state.record || {};
    var cards = state && state.cards || [];
    var index = state && isFinite(Number(state.index)) ? Number(state.index) : 0;
    var card = cards[index] || {};
    var mode = asText(state && state.experienceMode, "chapter");
    var base = {
      event: eventName,
      wrapped_mode: mode,
      wrapped_year: asText(state && state.analyticsYear || record.year_label || record.school_year, ""),
      school_year: asText(record.school_year, ""),
      year_label: asText(record.year_label, ""),
      chapter_slug: asText(record.chapter_slug, ""),
      chapter_id: hasValue(record.chapter_id) ? record.chapter_id : "",
      chapter_name: asText(record.chapter_name, ""),
      region_name: asText(record.region_name, ""),
      brand_logo: getBrandChoice(record),
      card_index: index + 1,
      card_total: cards.length,
      card_theme: asText(card.theme, ""),
      card_type: asText(card.type, ""),
      is_final_card: cards.length && index === cards.length - 1 ? "true" : "false",
      autoplay_enabled: state && state.autoplayEnabled ? "true" : "false"
    };

    return compactPayload(Object.assign(base, extra || {}));
  }

  function pushAnalyticsPayload(payload) {
    if (!payload || !payload.event) {
      return payload || null;
    }

    try {
      root.dataLayer = root.dataLayer || [];

      if (typeof root.dataLayer.push === "function") {
        root.dataLayer.push(payload);
      }

      if (typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") {
        root.dispatchEvent(new root.CustomEvent("jsuw:analytics", { detail: payload }));
      }
    } catch (error) {
      return payload;
    }

    return payload;
  }

  function trackAnalyticsEvent(state, eventName, extra) {
    if (!state || state.analyticsEnabled === false) {
      return null;
    }

    return pushAnalyticsPayload(createAnalyticsPayload(state, eventName, extra));
  }

  function trackCardEngagement(state, navigationMethod, timestamp) {
    if (!state || state.cardStartedAt === null || state.cardStartedAt === undefined) {
      return null;
    }

    var now = timestamp !== undefined ? Number(timestamp) : nowMs();
    var cardStartedAt = Number(state.cardStartedAt);
    var storyStartedAt = state.storyStartedAt === null || state.storyStartedAt === undefined ? cardStartedAt : Number(state.storyStartedAt);
    var payload = trackAnalyticsEvent(state, "jsu_wrapped_card_engagement", {
      navigation_method: asText(navigationMethod, "unknown"),
      card_duration_ms: Math.max(0, Math.round(now - cardStartedAt)),
      story_elapsed_ms: Math.max(0, Math.round(now - storyStartedAt))
    });

    state.cardStartedAt = null;
    return payload;
  }

  function trackStoryComplete(state, navigationMethod, timestamp) {
    if (!state || state.storyCompletedAt !== null && state.storyCompletedAt !== undefined) {
      return null;
    }

    var now = timestamp !== undefined ? Number(timestamp) : nowMs();
    var storyStartedAt = state.storyStartedAt === null || state.storyStartedAt === undefined ? now : Number(state.storyStartedAt);

    state.storyCompletedAt = now;
    return trackAnalyticsEvent(state, "jsu_wrapped_story_complete", {
      navigation_method: asText(navigationMethod, "unknown"),
      completion_duration_ms: Math.max(0, Math.round(now - storyStartedAt))
    });
  }

  function trackCardView(state, navigationMethod, timestamp) {
    var now = timestamp !== undefined ? Number(timestamp) : nowMs();

    if (!state) {
      return null;
    }

    if (state.storyStartedAt === null || state.storyStartedAt === undefined) {
      state.storyStartedAt = now;
    }

    state.cardStartedAt = now;
    var payload = trackAnalyticsEvent(state, "jsu_wrapped_card_view", {
      navigation_method: asText(navigationMethod, "unknown")
    });

    if (state.cards && state.index === state.cards.length - 1) {
      trackStoryComplete(state, navigationMethod, now);
    }

    return payload;
  }

  function trackStoryView(state, navigationMethod) {
    var now = nowMs();

    if (!state) {
      return null;
    }

    state.storyStartedAt = now;
    state.storyCompletedAt = null;
    trackAnalyticsEvent(state, "jsu_wrapped_story_view", {
      navigation_method: asText(navigationMethod, "initial"),
      initial_card_index: (Number(state.index) || 0) + 1
    });
    return trackCardView(state, navigationMethod || "initial", now);
  }

  function createPageMetadata(state) {
    var record = state && state.record || {};
    var brandLabel = getBrandChoice(record) === "ncsy" ? "NCSY Wrapped" : "JSU Wrapped";
    var chapterName = asText(record.chapter_name, brandLabel);
    var yearLabel = asText(record.year_label || record.school_year, "");
    var regionName = asText(record.region_name, "");
    var descriptionParts = [
      chapterName + " Wrapped",
      yearLabel ? "for " + yearLabel : "",
      regionName ? "- " + regionName : ""
    ].filter(Boolean);

    return {
      title: brandLabel + " - " + chapterName,
      description: descriptionParts.join(" ")
    };
  }

  function setDocumentMeta(doc, attributeName, attributeValue, content) {
    if (!doc || !doc.head || !hasValue(content)) {
      return;
    }

    var selector = 'meta[' + attributeName + '="' + attributeValue + '"]';
    var element = doc.querySelector(selector);

    if (!element) {
      element = doc.createElement("meta");
      element.setAttribute(attributeName, attributeValue);
      doc.head.appendChild(element);
    }

    element.setAttribute("content", content);
  }

  function applyPageMetadata(state) {
    var metadata = createPageMetadata(state);
    var doc = root.document;

    if (!doc) {
      return metadata;
    }

    if (hasValue(metadata.title)) {
      doc.title = metadata.title;
      setDocumentMeta(doc, "property", "og:title", metadata.title);
      setDocumentMeta(doc, "name", "twitter:title", metadata.title);
    }

    if (hasValue(metadata.description)) {
      setDocumentMeta(doc, "name", "description", metadata.description);
      setDocumentMeta(doc, "property", "og:description", metadata.description);
      setDocumentMeta(doc, "name", "twitter:description", metadata.description);
    }

    setDocumentMeta(doc, "property", "og:type", "website");

    if (root.location && hasValue(root.location.href)) {
      setDocumentMeta(doc, "property", "og:url", root.location.href);
    }

    return metadata;
  }

  function findChapter(records, chapterSlug) {
    if (!Array.isArray(records) || !hasValue(chapterSlug)) {
      return null;
    }

    var requested = String(chapterSlug).trim().toLowerCase();

    for (var index = 0; index < records.length; index += 1) {
      var record = records[index];

      if (String(record && record.chapter_slug || "").trim().toLowerCase() === requested) {
        return record;
      }
    }

    return null;
  }

  function findTeen(records, teenSlug) {
    if (!Array.isArray(records)) {
      return null;
    }

    if (!hasValue(teenSlug)) {
      return records[0] || null;
    }

    var requested = String(teenSlug).trim().toLowerCase();

    for (var index = 0; index < records.length; index += 1) {
      var record = records[index];
      var slug = String(record && (record.teen_slug || record.student_slug || record.slug) || "").trim().toLowerCase();

      if (slug === requested) {
        return record;
      }
    }

    return null;
  }

  function chapterLabel(record) {
    return asText(record && record.chapter_name, asText(record && record.chapter_slug, "JSU chapter"));
  }

  function chapterFootprintLabel(record, chapterName) {
    var schoolName = asText(record && record.school_name, "");
    var schoolCount = numberValue(record && record.schools_represented, 0);
    var representedMatch = schoolName.match(/(\d[\d,]*)\s+schools?\s+represented/i);

    if (schoolCount > 1) {
      return "Across " + formatNumber(schoolCount) + " schools";
    }

    if (representedMatch) {
      return "Across " + formatNumber(representedMatch[1]) + " schools";
    }

    if (hasValue(schoolName)) {
      return "New to " + schoolName;
    }

    return "New to " + asText(chapterName, "JSU");
  }

  function buildChapterUrl(record, url) {
    var slug = record && record.chapter_slug;
    var href = url || (root && root.location && root.location.href) || "";
    var base = root && root.location && root.location.href || "https://example.org/";

    if (!hasValue(slug)) {
      return href || "#";
    }

    try {
      var parsed = new root.URL(href || base, base);
      parsed.searchParams.set("chapter", String(slug).trim());
      parsed.searchParams.delete("card");
      return parsed.href;
    } catch (error) {
      var bare = String(href || "").split("#")[0].split("?")[0] || "";
      return bare + "?chapter=" + encodeURIComponent(String(slug).trim());
    }
  }

  function buildRegionUrl(regionName, url) {
    var href = url || (root && root.location && root.location.href) || "";
    var base = root && root.location && root.location.href || "https://example.org/";

    try {
      var parsed = new root.URL(href || base, base);
      parsed.searchParams.set("region", slugify(regionName));
      parsed.searchParams.delete("chapter");
      parsed.searchParams.delete("card");
      return parsed.href;
    } catch (error) {
      var bare = String(href || "").split("#")[0].split("?")[0] || "";
      return bare + "?region=" + encodeURIComponent(slugify(regionName));
    }
  }

  function buildTeenUrl(record, url) {
    var slug = record && (record.teen_slug || record.student_slug || record.slug) || "maya-test";
    var href = url || (root && root.location && root.location.href) || "";
    var base = root && root.location && root.location.href || "https://example.org/";

    try {
      var parsed = new root.URL(href || base, base);
      parsed.searchParams.set("mode", "teen");
      parsed.searchParams.set("teen", String(slug).trim());
      parsed.searchParams.delete("chapter");
      parsed.searchParams.delete("region");
      parsed.searchParams.delete("card");
      return parsed.href;
    } catch (error) {
      var bare = String(href || "").split("#")[0].split("?")[0] || "";
      return bare + "?mode=teen&teen=" + encodeURIComponent(String(slug).trim());
    }
  }

  function renderChapterPickerMarkup(context) {
    var settings = context || {};
    var records = Array.isArray(settings.records) ? settings.records.filter(function (record) {
      return record && hasValue(record.chapter_slug);
    }).slice() : [];
    var assetBase = settings.assetBase || "";
    var url = settings.url || (root && root.location && root.location.href) || "";
    var firstRecord = records[0] || {};
    var year = asText(settings.year || firstRecord.year_label || firstRecord.school_year, "this year");
    var requestedRegion = asText(settings.region || getRegionParam(url), "");

    records.sort(function (a, b) {
      return chapterLabel(a).localeCompare(chapterLabel(b));
    });

    function renderPickerItem(record) {
      var brand = getBrandChoice(record);
      var logoUrl = getLogoAsset(brand, assetBase);
      var region = asText(record.region_name, "JSU");
      var school = asText(record.school_name, "");
      var stats = [
        hasValue(record.events_hosted) ? formatNumber(record.events_hosted) + " events" : "",
        hasValue(record.unique_teens) ? formatNumber(record.unique_teens) + " teens" : "",
        hasValue(record.engagement_moments) ? formatNumber(record.engagement_moments) + " moments" : ""
      ].filter(Boolean).join(" | ");

      return [
        '<a class="jsuw-picker-item jsuw-picker-brand--' + escapeHtml(brand) + '" href="' + escapeHtml(buildChapterUrl(record, url)) + '">',
        '<span class="jsuw-picker-logo"><img src="' + escapeHtml(logoUrl) + '" alt=""></span>',
        '<span class="jsuw-picker-copy">',
        '<strong>' + escapeHtml(chapterLabel(record)) + "</strong>",
        '<em>' + escapeHtml([school, region].filter(Boolean).join(" | ")) + "</em>",
        stats ? '<span>' + escapeHtml(stats) + "</span>" : "",
        "</span>",
        '<span class="jsuw-picker-arrow" aria-hidden="true">Next</span>',
        "</a>"
      ].join("");
    }

    var regionMap = {};

    records.forEach(function (record) {
      var regionName = asText(record.region_name, "Other chapters");

      if (!regionMap[regionName]) {
        regionMap[regionName] = [];
      }

      regionMap[regionName].push(record);
    });

    var regions = Object.keys(regionMap).sort().map(function (regionName) {
      return {
        name: regionName,
        slug: slugify(regionName),
        chapters: regionMap[regionName]
      };
    });
    var requestedSlug = slugify(requestedRegion);
    var activeRegion = regions.filter(function (region) {
      return region.slug === requestedSlug || region.name.toLowerCase() === requestedRegion.toLowerCase();
    })[0] || regions[0] || null;
    var regionSelector = regions.map(function (region) {
      var isActive = activeRegion && region.slug === activeRegion.slug;
      var countLabel = region.chapters.length === 1 ? "1" : String(region.chapters.length);

      return [
        '<a class="jsuw-region-pill' + (isActive ? " jsuw-region-pill--active" : "") + '" href="' + escapeHtml(buildRegionUrl(region.name, url)) + '"' + (isActive ? ' aria-current="true"' : "") + ">",
        '<span>' + escapeHtml(region.name) + "</span>",
        '<em>' + escapeHtml(countLabel) + "</em>",
        "</a>"
      ].join("");
    }).join("");
    var chapterHtml = "";

    if (activeRegion) {
      var chapters = activeRegion.chapters;
      var countLabel = chapters.length === 1 ? "1 chapter" : chapters.length + " chapters";

      chapterHtml = [
        '<section class="jsuw-picker-region">',
        '<h2><span>' + escapeHtml(activeRegion.name) + '</span><em>' + escapeHtml(countLabel) + "</em></h2>",
        '<div class="jsuw-picker-region-list">',
        chapters.map(renderPickerItem).join(""),
        "</div>",
        "</section>"
      ].join("");
    }

    if (!chapterHtml) {
      chapterHtml = '<div class="jsuw-picker-empty">No chapter records are available yet.</div>';
    }

    var teenTestLink = buildTeenUrl({ teen_slug: "maya-test" }, url);

    return [
      '<div class="jsuw-shell jsuw-shell--picker">',
      '<section class="jsuw-picker" aria-labelledby="jsuw-picker-title">',
      '<div class="jsuw-picker-topline">JSU Wrapped | ' + escapeHtml(year) + "</div>",
      '<h1 class="jsuw-picker-title" id="jsuw-picker-title">Choose your chapter</h1>',
      '<p class="jsuw-picker-subtext">Choose a region, then pick a chapter to open its Wrapped story.</p>',
      regionSelector ? '<nav class="jsuw-region-selector" aria-label="Choose a region">' + regionSelector + "</nav>" : "",
      '<div class="jsuw-picker-list">',
      chapterHtml,
      "</div>",
      '<a class="jsuw-teen-test-link" href="' + escapeHtml(teenTestLink) + '"><strong>Teen test version</strong><span>Proof of concept using sample Maya data</span></a>',
      "</section>",
      "</div>"
    ].join("");
  }

  function renderChapterPicker(container, context) {
    container.innerHTML = renderChapterPickerMarkup(context);
  }

  function createCards(record, options) {
    var chapterName = asText(record.chapter_name, "Your JSU chapter");
    var yearLabel = asText(record.year_label || record.school_year, "This year");
    var regionName = asText(record.region_name, "JSU");
    var brandChoice = getBrandChoice(record);
    var brandLabel = brandChoice === "ncsy" ? "NCSY Wrapped" : "JSU Wrapped";
    var assetBase = options && options.assetBase || "";
    var logoUrl = getLogoAsset(brandChoice, assetBase);
    var cards = [
      {
        type: "cover",
        eyebrow: brandLabel,
        headline: chapterName + ", your year is wrapped",
        displayHeadline: chapterName + ", your year is wrapped",
        displayEyebrow: brandLabel,
        markerText: "and this is our year.",
        regionName: regionName,
        yearLabel: yearLabel,
        subtext: yearLabel + " - " + regionName,
        badge: asText(record.school_name, "Chapter recap"),
        theme: "cover"
      }
    ];

    if (hasValue(record.events_hosted)) {
      cards.push({
        type: "stat",
        eyebrow: "Events hosted",
        headline: "You hosted " + formatNumber(record.events_hosted) + " events this year",
        displayHeadline: "You hosted " + formatNumber(record.events_hosted) + " events this year",
        displayEyebrow: "Events hosted",
        stat: formatNumber(record.events_hosted),
        rawValue: numberValue(record.events_hosted),
        statLabel: "events",
        subtext: "From lunch clubs to BBQs, " + chapterName + " kept showing up.",
        theme: "events"
      });
    }

    if (hasValue(record.unique_teens)) {
      cards.push({
        type: "stat",
        eyebrow: "Teen reach",
        headline: formatNumber(record.unique_teens) + " teens were part of the story",
        displayHeadline: formatNumber(record.unique_teens) + " teens were part of the story",
        displayEyebrow: "Teen reach",
        stat: formatNumber(record.unique_teens),
        rawValue: numberValue(record.unique_teens),
        newCount: numberValue(record.new_teens),
        statLabel: "teens",
        subtext: "That's " + formatNumber(record.unique_teens) + " students who had a JSU touchpoint this year.",
        theme: "reach"
      });
    }

    if (hasValue(record.engagement_moments)) {
      cards.push({
        type: "stat",
        eyebrow: "Engagement moments",
        headline: formatNumber(record.engagement_moments) + " moments of connection",
        displayHeadline: formatNumber(record.engagement_moments) + " moments of connection",
        displayEyebrow: "Engagement moments",
        stat: formatNumber(record.engagement_moments),
        rawValue: numberValue(record.engagement_moments),
        statLabel: "moments",
        subtext: "Every sign-in, every lunch table, every conversation - it added up.",
        theme: "moments"
      });
    }

    if (hasValue(record.new_teens)) {
      cards.push({
        type: "stat",
        eyebrow: "New faces",
        headline: formatNumber(record.new_teens) + " new teens joined this year",
        displayHeadline: formatNumber(record.new_teens) + " new teens joined this year",
        displayEyebrow: "New teens",
        stat: formatNumber(record.new_teens),
        rawValue: numberValue(record.new_teens),
        schoolName: asText(record.school_name, "Northwood JSU"),
        newTeenContext: chapterFootprintLabel(record, chapterName),
        statLabel: "new teens",
        subtext: chapterName + " kept opening the door.",
        theme: "new"
      });
    }

    if (hasValue(record.repeat_attendee_rate_label)) {
      cards.push({
        type: "stat",
        eyebrow: "Repeat engagement",
        headline: asText(record.repeat_attendee_rate_label) + " came back again",
        displayHeadline: asText(record.repeat_attendee_rate_label) + " came back again",
        displayEyebrow: "Repeat engagement",
        stat: asText(record.repeat_attendee_rate_label),
        rawValue: numberValue(record.repeat_attendee_rate_label),
        repeatCount: Math.round(numberValue(record.unique_teens) * numberValue(record.repeat_attendee_rate_label) / 100),
        statLabel: "returned",
        subtext: "The best clubs do more than attract teens. They bring them back.",
        theme: "repeat"
      });
    }

    if (hasValue(record.largest_event_name) && hasValue(record.largest_event_attendance)) {
      cards.push({
        type: "stat",
        eyebrow: "Biggest event",
        headline: "Biggest moment: " + asText(record.largest_event_name),
        displayHeadline: "Biggest moment: " + asText(record.largest_event_name),
        displayEyebrow: "Biggest event",
        eventName: asText(record.largest_event_name),
        stat: formatNumber(record.largest_event_attendance),
        rawValue: numberValue(record.largest_event_attendance),
        month: asText(record.most_active_month, "This year"),
        schoolsRepresented: numberValue(record.schools_represented),
        statLabel: "teens",
        subtext: formatNumber(record.largest_event_attendance) + " teens in the room. Big energy.",
        theme: "biggest"
      });
    }

    if (hasValue(record.chapter_persona) || hasValue(record.chapter_line)) {
      cards.push({
        type: "persona",
        eyebrow: "Chapter type",
        headline: "Your chapter type: " + asText(record.chapter_persona, "The Momentum Maker"),
        displayHeadline: "Your chapter type: " + asText(record.chapter_persona, "The Momentum Maker"),
        displayEyebrow: "Chapter persona",
        persona: asText(record.chapter_persona, "The Momentum Maker"),
        chapterName: chapterName,
        tags: [
          hasValue(record.top_program_type) ? asText(record.top_program_type) : "",
          hasValue(record.most_active_month) ? asText(record.most_active_month) + " energy" : "",
          hasValue(record.learning_sessions) ? formatNumber(record.learning_sessions) + " learning sessions" : "",
          hasValue(record.shabbatons) ? formatNumber(record.shabbatons) + " shabbatons" : ""
        ].filter(Boolean),
        subtext: asText(record.chapter_line, chapterName + " made the year feel personal."),
        badge: asText(record.top_program_type || record.most_active_month, "Signature energy"),
        theme: "persona"
      });
    }

    var movementStats = [];

    if (hasValue(record.region_unique_teens)) {
      movementStats.push({
        value: formatNumber(record.region_unique_teens),
        label: "teens reached in the region"
      });
    }

    if (hasValue(record.region_schools_represented)) {
      movementStats.push({
        value: formatNumber(record.region_schools_represented),
        label: "schools represented"
      });
    }

    if (hasValue(record.national_engagement_moments)) {
      movementStats.push({
        value: formatNumber(record.national_engagement_moments) + "+",
        label: "national engagement moments"
      });
    }

    if (movementStats.length > 0) {
      cards.push({
        type: "movement",
        eyebrow: "Bigger movement",
        headline: "You were part of something bigger",
        displayHeadline: "You were part of something bigger",
        displayEyebrow: "Bigger movement",
        chapterName: chapterName,
        stats: movementStats,
        subtext: "One chapter. One region. One national movement.",
        theme: "movement"
      });
    }

    cards.push({
      type: "final",
      eyebrow: "Ready to share",
      headline: chapterName + " Wrapped",
      displayHeadline: chapterStoryTitle(chapterName) + "\nWrapped",
      chapterName: chapterName,
      schoolName: asText(record.school_name, "JSU"),
      yearLabel: yearLabel,
      summaryStats: [
        hasValue(record.events_hosted) ? { value: formatNumber(record.events_hosted), label: "programs together" } : null,
        hasValue(record.unique_teens) ? { value: formatNumber(record.unique_teens), label: "of us, one chapter" } : null,
        hasValue(record.engagement_moments) ? { value: formatNumber(record.engagement_moments), label: "moments stacked up" } : null,
        hasValue(record.new_teens) ? { value: formatNumber(record.new_teens), label: "new faces joined us" } : null,
        hasValue(record.repeat_attendee_rate_label) ? { value: asText(record.repeat_attendee_rate_label), label: "kept coming back" } : null
      ].filter(Boolean),
      persona: asText(record.chapter_persona, "JSU energy"),
      subtext: [
        hasValue(record.events_hosted) ? formatNumber(record.events_hosted) + " events" : "",
        hasValue(record.unique_teens) ? formatNumber(record.unique_teens) + " teens" : "",
        hasValue(record.engagement_moments) ? formatNumber(record.engagement_moments) + " engagement moments" : "",
        hasValue(record.chapter_persona) ? asText(record.chapter_persona) + " energy" : "JSU energy"
      ].filter(Boolean).join(". ") + ".",
      badge: yearLabel,
      theme: "final"
    });

    cards.forEach(function (card) {
      card.brandChoice = brandChoice;
      card.logoUrl = logoUrl;
    });

    return cards;
  }

  function createTeenCards(record, options) {
    var teenName = asText(record.teen_name || record.student_name || record.first_name, "Maya");
    var chapterName = asText(record.chapter_name, "Northwood JSU");
    var yearLabel = asText(record.year_label || record.school_year, "2025-2026");
    var regionName = asText(record.region_name, "Atlantic Seaboard");
    var schoolName = asText(record.school_name, "Northwood High School");
    var brandChoice = getBrandChoice(record);
    var assetBase = options && options.assetBase || "";
    var logoUrl = getLogoAsset(brandChoice, assetBase);
    var cards = [
      {
        type: "teen",
        theme: "teen-cover",
        eyebrow: "Proof of concept",
        headline: teenName + ", your JSU year is wrapped",
        displayHeadline: teenName + ",\nyour JSU\nyear is\nwrapped.",
        teenName: teenName,
        chapterName: chapterName,
        schoolName: schoolName,
        regionName: regionName,
        yearLabel: yearLabel,
        subtext: chapterName + " - " + regionName
      },
      {
        type: "teen",
        theme: "teen-attendance",
        eyebrow: "Chapter 01 - Attendance",
        headline: "You showed up " + formatNumber(record.events_attended) + " times",
        displayHeadline: "You showed\nup this many\ntimes.",
        stat: formatNumber(record.events_attended),
        rawValue: numberValue(record.events_attended),
        statLabel: "events",
        subtext: asText(record.attendance_line, "From lunch clubs to BBQs, you made JSU part of your year.")
      },
      {
        type: "teen",
        theme: "teen-ticket",
        eyebrow: "Chapter 02 - Origin",
        headline: "It started with " + asText(record.first_event_name, "Fall Kickoff Lunch"),
        eventName: asText(record.first_event_name, "Fall Kickoff Lunch"),
        eventDate: asText(record.first_event_date_label, "Sep 18, 2025"),
        eventLocation: asText(record.first_event_location || record.school_name, schoolName),
        subtext: asText(record.first_event_line, "Your first JSU moment of the year. Then the momentum kept going.")
      },
      {
        type: "teen",
        theme: "teen-streak",
        eyebrow: "Chapter 03 - Streak",
        headline: "Your longest streak hit " + formatNumber(record.longest_streak),
        displayHeadline: "Your longest\nstreak hit",
        stat: formatNumber(record.longest_streak),
        rawValue: numberValue(record.longest_streak),
        statLabel: "events in a row",
        subtext: asText(record.streak_line, "That's not just attendance. That's momentum.")
      },
      {
        type: "teen",
        theme: "teen-vibe",
        eyebrow: "Chapter 04 - Vibe",
        headline: "Your top vibe was " + asText(record.top_vibe, "Social + Jewish Culture"),
        vibe: asText(record.top_vibe, "Social + Jewish Culture"),
        subtext: asText(record.vibe_line, "You kept showing up where friends, food, and Jewish life came together.")
      },
      {
        type: "teen",
        theme: "teen-connector",
        eyebrow: "Chapter 05 - Persona",
        headline: "You're " + asText(record.persona, "The Connector"),
        persona: asText(record.persona, "The Connector"),
        friendsBrought: formatNumber(record.friends_brought),
        schoolsInRoom: formatNumber(record.schools_in_room),
        subtext: asText(record.persona_line, "You helped turn events into community.")
      },
      {
        type: "teen",
        theme: "teen-depth",
        eyebrow: "Chapter 06 - Depth",
        headline: "You made room for deeper moments too",
        shabbatons: formatNumber(record.shabbatons),
        learningSessions: formatNumber(record.learning_sessions),
        leadershipMoments: formatNumber(record.leadership_moments),
        subtext: asText(record.depth_line, "Shabbatons, learning, and leadership moments gave the year more depth.")
      },
      {
        type: "teen",
        theme: "teen-chapter",
        eyebrow: "Chapter 07 - Your club",
        headline: chapterName + " had a big year",
        chapterName: chapterName,
        summaryStats: [
          hasValue(record.chapter_events_hosted) ? { value: formatNumber(record.chapter_events_hosted), label: "events hosted" } : null,
          hasValue(record.chapter_unique_teens) ? { value: formatNumber(record.chapter_unique_teens), label: "unique teens" } : null,
          hasValue(record.chapter_engagement_moments) ? { value: formatNumber(record.chapter_engagement_moments), label: "engagement moments" } : null,
          hasValue(record.chapter_new_teens) ? { value: formatNumber(record.chapter_new_teens), label: "new this year" } : null
        ].filter(Boolean),
        subtext: asText(record.chapter_line, chapterName + " turned events into belonging.")
      },
      {
        type: "teen",
        theme: "teen-movement",
        eyebrow: "Chapter 08 - Zoom out",
        headline: "You were part of something much bigger",
        stats: [
          hasValue(record.region_unique_teens) ? { value: formatNumber(record.region_unique_teens), label: "teens in the region" } : null,
          hasValue(record.region_schools_represented) ? { value: formatNumber(record.region_schools_represented), label: "schools represented" } : null,
          hasValue(record.national_engagement_moments) ? { value: formatNumber(record.national_engagement_moments) + "+", label: "national moments" } : null
        ].filter(Boolean),
        subtext: asText(record.movement_line, "One club. One region. One national movement.")
      },
      {
        type: "teen",
        theme: "teen-share",
        eyebrow: "Share card",
        headline: teenName + "'s JSU Wrapped",
        displayHeadline: teenName + "'s\nJSU\nWrapped",
        teenName: teenName,
        chapterName: chapterName,
        yearLabel: yearLabel,
        persona: asText(record.persona, "The Connector"),
        subtext: [
          hasValue(record.events_attended) ? formatNumber(record.events_attended) + " events" : "",
          hasValue(record.longest_streak) ? formatNumber(record.longest_streak) + " event streak" : "",
          hasValue(record.friends_brought) ? formatNumber(record.friends_brought) + " friends brought" : "",
          asText(record.persona, "The Connector") + " energy"
        ].filter(Boolean).join(". ") + ".",
        summaryStats: [
          hasValue(record.events_attended) ? { value: formatNumber(record.events_attended), label: "events showed up to" } : null,
          hasValue(record.longest_streak) ? { value: formatNumber(record.longest_streak), label: "event streak" } : null,
          hasValue(record.friends_brought) ? { value: formatNumber(record.friends_brought), label: "friends brought" } : null,
          hasValue(record.schools_in_room) ? { value: formatNumber(record.schools_in_room), label: "schools in your room" } : null
        ].filter(Boolean)
      }
    ];

    cards.forEach(function (card) {
      card.brandChoice = brandChoice;
      card.logoUrl = logoUrl;
    });

    return cards;
  }

  function renderProgress(currentIndex, total) {
    var html = "";

    for (var index = 0; index < total; index += 1) {
      var state = index < currentIndex ? "complete" : index === currentIndex ? "active" : "idle";
      html += '<span class="jsuw-progress-segment jsuw-progress-segment--' + state + '"><span></span></span>';
    }

    return html;
  }

  function renderStickerCloud(card) {
    var confettiThemes = {
      cover: 30,
      moments: 20,
      biggest: 24,
      final: 22
    };

    var html = [
      '<div class="jsuw-stickers" aria-hidden="true">',
      '<span class="jsuw-doodle jsuw-doodle--one"></span>',
      '<span class="jsuw-doodle jsuw-doodle--two"></span>',
      '<span class="jsuw-spark jsuw-spark--one"></span>',
      '<span class="jsuw-spark jsuw-spark--two"></span>'
    ];

    for (var index = 0; index < (confettiThemes[card.theme] || 0); index += 1) {
      var burst = index < 10;
      var x = burst ? "50%" : 5 + ((index * 11) % 86) + "%";
      var dx = burst ? ((index * 47) % 260) - 130 + "px" : ((index % 7) - 3) * 22 + "px";
      var dy = burst ? ((index * 31) % 210) - 118 + "px" : 620 + ((index * 19) % 160) + "px";
      var rotate = (index * 73) % 420 + "deg";
      var delay = burst ? 90 + index * 32 + "ms" : index * -310 + "ms";
      var duration = burst ? 980 + (index % 4) * 120 + "ms" : 4200 + (index % 6) * 420 + "ms";
      var scale = (0.66 + (index % 5) * 0.14).toFixed(2);
      var startY = burst ? "48%" : "-28px";

      html.push(
        '<span class="jsuw-confetti-piece jsuw-confetti-piece--' + (burst ? "burst" : "drift") +
        '" style="--i:' + index + ";--x:" + x + ";--start-y:" + startY + ";--dx:" + dx + ";--dy:" + dy +
        ";--rot:" + rotate + ";--delay:" + delay + ";--dur:" + duration + ";--scale:" + scale + '"></span>'
      );
    }

    html.push("</div>");
    return html.join("");
  }

  function renderBrandLockup(card) {
    var brand = card && card.brandChoice === "ncsy" ? "ncsy" : "jsu";
    var logoUrl = card && card.logoUrl ? card.logoUrl : getLogoAsset(brand, "");
    var label = brand === "ncsy" ? "NCSY Wrapped" : "JSU Wrapped";

    return [
      '<div class="jsuw-brand-lockup jsuw-brand-lockup--' + escapeHtml(brand) + '" aria-label="' + escapeHtml(label) + '">',
      '<span class="jsuw-brand-logo jsuw-brand-logo--' + escapeHtml(brand) + '"><img src="' + escapeHtml(logoUrl) + '" alt=""></span>',
      '<span class="jsuw-brand-copy"><strong>' + escapeHtml(brand === "ncsy" ? "NCSY" : "JSU") + '</strong><em>Wrapped</em></span>',
      "</div>"
    ].join("");
  }

  function renderStatPattern(card) {
    var count = card.theme === "events" ? 38 : card.theme === "moments" ? 36 : 42;
    var html = '<div class="jsuw-stat-pattern jsuw-stat-pattern--' + escapeHtml(card.theme) + '" aria-hidden="true">';

    for (var index = 0; index < count; index += 1) {
      var x = ((index * 2.9) % 96).toFixed(2) + "%";
      var y = (12 + ((index * 7) % 68)).toFixed(2) + "%";
      var height = 24 + ((index * 11) % 68) + "px";
      var size = 20 + ((index * 13) % 30) + "px";
      var delay = index * 14 + "ms";
      var waveDelay = index * 46 + "ms";
      var bubbleDelay = index * 72 + "ms";

      html += '<span style="--i:' + index + ";--x:" + x + ";--y:" + y + ";--h:" + height + ";--s:" + size + ";--delay:" + delay + ";--wave-delay:" + waveDelay + ";--bubble-delay:" + bubbleDelay + '"></span>';
    }

    html += "</div>";
    return html;
  }

  function renderStatNumber(card, statClass) {
    var animation = getStatAnimationConfig(card.stat);
    var attributes = "";
    var classes = statClass;

    if (classes.indexOf("jsuw-stat-number--nowrap") === -1) {
      classes += " jsuw-stat-number--nowrap";
    }

    if (animation) {
      attributes = [
        ' data-jsuw-countup="true"',
        ' data-jsuw-stat-target="' + escapeHtml(animation.target) + '"',
        ' data-jsuw-stat-suffix="' + escapeHtml(animation.suffix) + '"',
        ' data-jsuw-stat-decimals="' + escapeHtml(animation.decimals) + '"'
      ].join("");
    }

    return '<div class="' + classes + '" aria-label="' + escapeHtml(card.stat) + '"' + attributes + ">" + escapeHtml(card.stat) + "</div>";
  }

  function htmlWithBreaks(value) {
    return escapeHtml(value).replace(/\n/g, "<br>");
  }

  function getHeadlineClass(card) {
    var text = String(card.displayHeadline || card.headline || "");
    var headlineClass = "jsuw-headline";

    if (text.length > 52) {
      headlineClass += " jsuw-headline--dense";
    } else if (text.length > 36) {
      headlineClass += " jsuw-headline--compact";
    }

    return headlineClass;
  }

  function renderTopMatter(card) {
    return [
      '<div class="jsuw-eyebrow">' + escapeHtml(card.displayEyebrow || card.eyebrow || "JSU Wrapped") + "</div>",
      '<h2 class="' + getHeadlineClass(card) + '">' + htmlWithBreaks(card.displayHeadline || card.headline) + "</h2>"
    ].join("");
  }

  function renderIndexedSpans(className, count, maxCount, extraClassFn) {
    var total = Math.max(0, Math.min(numberValue(count), maxCount || numberValue(count)));
    var html = '<div class="' + className + '" aria-hidden="true">';

    for (var index = 0; index < total; index += 1) {
      var extra = typeof extraClassFn === "function" ? extraClassFn(index, total) : "";
      var height = 10 + ((index * 7) % 36) + "px";
      html += '<span class="' + extra + '" style="--i:' + index + ';--delay:' + (index * 12) + 'ms;--h:' + height + '"></span>';
    }

    html += "</div>";
    return html;
  }

  function renderReferenceShell(card, body) {
    return [
      '<div class="jsuw-card-main jsuw-reference-main jsuw-reference-' + escapeHtml(card.theme) + '">',
      body,
      "</div>"
    ].join("");
  }

  function renderCoverBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-pennant">' + escapeHtml(card.badge || "JSU chapter") + "</div>",
      '<div class="jsuw-cover-title">',
      '<div class="jsuw-eyebrow">' + escapeHtml(card.displayEyebrow || card.eyebrow) + "</div>",
      '<h2 class="' + getHeadlineClass(card) + '">' + htmlWithBreaks(card.displayHeadline || card.headline) + "</h2>",
      "</div>",
      '<div class="jsuw-cover-footer">',
      '<div class="jsuw-marker-line">' + escapeHtml(card.markerText || "and this is our year.") + "</div>",
      '<p class="jsuw-subtext">' + escapeHtml((card.regionName || "JSU") + " - " + (card.yearLabel || "This year")) + "</p>",
      "</div>"
    ].join(""));
  }

  function renderEventsBody(card) {
    var statClass = "jsuw-reference-stat jsuw-reference-stat--events";
    var statLength = String(card.stat || "").replace(/[^\d]/g, "").length;

    if (statLength > 3) {
      statClass += " jsuw-reference-stat--events-dense";
    } else if (statLength > 2) {
      statClass += " jsuw-reference-stat--events-compact";
    }

    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<div class="jsuw-big-number-wrap jsuw-big-number-wrap--events">',
      renderStatNumber(card, statClass),
      "</div>",
      renderIndexedSpans("jsuw-event-grid", card.rawValue || card.stat, 80),
      '<p class="jsuw-subtext">' + escapeHtml(card.subtext) + "</p>"
    ].join(""));
  }

  function renderReachBody(card) {
    var rawCount = Math.max(0, card.rawValue || numberValue(card.stat));
    var newCount = Math.max(0, Math.min(card.newCount || 0, rawCount));
    var repeatCutoff = Math.max(0, rawCount - newCount);
    var visibleTotal = Math.max(0, Math.min(rawCount, 210));
    var visibleNewCount = rawCount > 0 ? Math.round(newCount / rawCount * visibleTotal) : 0;

    if (newCount > 0 && visibleNewCount === 0) {
      visibleNewCount = 1;
    }

    visibleNewCount = Math.max(0, Math.min(visibleNewCount, visibleTotal));
    var visibleRepeatCutoff = Math.max(0, visibleTotal - visibleNewCount);

    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      renderIndexedSpans("jsuw-dot-field", visibleTotal, visibleTotal, function (index) {
        return index >= visibleRepeatCutoff ? "jsuw-dot--new" : "jsuw-dot--returning";
      }),
      '<div class="jsuw-dot-legend">',
      '<span><i class="jsuw-dot-key jsuw-dot-key--returning"></i>' + escapeHtml(formatNumber(repeatCutoff)) + " returning connections</span>",
      '<span><i class="jsuw-dot-key jsuw-dot-key--new"></i>' + escapeHtml(formatNumber(newCount)) + " first-timers</span>",
      "</div>",
      '<p class="jsuw-subtext">' + escapeHtml(card.subtext) + "</p>"
    ].join(""));
  }

  function renderMomentsBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<div class="jsuw-moment-center">',
      renderStatNumber(card, "jsuw-reference-stat jsuw-reference-stat--moments"),
      '<div class="jsuw-marker-chip">moments together</div>',
      "</div>",
      renderIndexedSpans("jsuw-waveform", 64, 64),
      '<p class="jsuw-subtext jsuw-subtext--center">' + escapeHtml(card.subtext) + "</p>"
    ].join(""));
  }

  function renderNewBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<div class="jsuw-new-pass">',
      '<div class="jsuw-pass-kicker">' + escapeHtml(card.newTeenContext || ("New to " + (card.schoolName || "JSU"))) + "</div>",
      renderStatNumber(card, "jsuw-reference-stat jsuw-reference-stat--new"),
      '<div class="jsuw-marker-line">walked in for the first time</div>',
      "</div>",
      renderIndexedSpans("jsuw-new-grid", card.rawValue || card.stat, 100),
      '<p class="jsuw-subtext">' + escapeHtml(card.subtext) + "</p>"
    ].join(""));
  }

  function renderRepeatBody(card) {
    var percent = Math.max(0, Math.min(numberValue(card.stat), 100));
    var circumference = 565.49;
    var dash = (circumference * percent / 100).toFixed(2);

    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<div class="jsuw-donut">',
      '<svg viewBox="0 0 240 240" aria-hidden="true">',
      '<circle class="jsuw-donut-track" cx="120" cy="120" r="90"></circle>',
      '<circle class="jsuw-donut-fill" cx="120" cy="120" r="90" style="--dash:' + dash + ';--gap:' + (circumference - dash).toFixed(2) + '"></circle>',
      "</svg>",
      '<div class="jsuw-donut-center">',
      renderStatNumber(card, "jsuw-donut-number"),
      '<span>came back for more</span>',
      "</div>",
      "</div>",
      '<div class="jsuw-mini-stat-row">',
      '<div><strong>' + escapeHtml(formatNumber(card.repeatCount || 0)) + "</strong><span>came twice or more</span></div>",
      '<div><strong>' + escapeHtml(card.stat) + "</strong><span>return rate</span></div>",
      "</div>",
      '<p class="jsuw-subtext jsuw-subtext--center">' + escapeHtml(card.subtext) + "</p>"
    ].join(""));
  }

  function renderBiggestBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<div class="jsuw-ticket">',
      '<div class="jsuw-ticket-row"><span>The big one</span><strong>' + escapeHtml(card.month || "JSU") + "</strong></div>",
      '<div class="jsuw-ticket-title">' + htmlWithBreaks(String(card.eventName || "Biggest event").replace(/\s+/, "\n")) + "</div>",
      '<div class="jsuw-ticket-divider"></div>',
      '<div class="jsuw-ticket-stats">',
      '<div><span>Showed up</span>' + renderStatNumber(card, "jsuw-ticket-number") + "</div>",
      '<div><span>Schools</span><strong>' + escapeHtml(formatNumber(card.schoolsRepresented || 0)) + "</strong></div>",
      "</div>",
      "</div>",
      '<p class="jsuw-subtext jsuw-subtext--center">' + escapeHtml(card.subtext) + "</p>"
    ].join(""));
  }

  function renderPersonaBody(card) {
    var tags = card.tags && card.tags.length ? card.tags.slice(0, 4) : [card.badge || "JSU energy"];
    var tagHtml = tags.map(function (tag, index) {
      return '<span style="--i:' + index + '">' + escapeHtml(tag) + "</span>";
    }).join("");

    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<div class="jsuw-persona-card">',
      '<div class="jsuw-smile-face" aria-hidden="true"><span></span></div>',
      '<div class="jsuw-pass-kicker">Builds community</div>',
      '<div class="jsuw-persona-title">' + escapeHtml(card.persona || "The Momentum Maker") + "</div>",
      '<p>' + escapeHtml(card.subtext || "") + "</p>",
      "</div>",
      '<div class="jsuw-tag-cloud">' + tagHtml + "</div>"
    ].join(""));
  }

  function renderMovementBody(card) {
    var statHtml = (card.stats || []).map(function (stat, index) {
      return '<li style="--i:' + index + '"><strong>' + escapeHtml(stat.value) + "</strong><span>" + escapeHtml(stat.label) + "</span></li>";
    }).join("");

    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<div class="jsuw-orbit" aria-hidden="true">',
      '<span class="jsuw-orbit-ring jsuw-orbit-ring--outer"></span>',
      '<span class="jsuw-orbit-ring jsuw-orbit-ring--inner"></span>',
      '<span class="jsuw-orbit-core">' + escapeHtml(card.chapterName || "JSU") + "</span>",
      "</div>",
      '<ul class="jsuw-movement-list jsuw-movement-list--reference">' + statHtml + "</ul>",
      '<p class="jsuw-subtext jsuw-subtext--center">' + escapeHtml(card.subtext) + "</p>"
    ].join(""));
  }

  function renderFinalBody(card) {
    var stats = (card.summaryStats || []).map(function (stat, index) {
      return '<div style="--i:' + index + '"><span>' + escapeHtml(stat.label) + "</span><strong>" + escapeHtml(stat.value) + "</strong></div>";
    }).join("");

    return renderReferenceShell(card, [
      '<div class="jsuw-share-poster">',
      renderBrandLockup(card),
      '<h2 class="' + getHeadlineClass(card) + '">' + htmlWithBreaks(card.displayHeadline || card.headline) + "</h2>",
      '<p class="jsuw-share-copy">' + escapeHtml(card.subtext || "") + "</p>",
      '<div class="jsuw-share-stats">' + stats + "</div>",
      '<div class="jsuw-share-energy">' + escapeHtml(card.persona || "JSU energy") + "</div>",
      '<div class="jsuw-share-school">' + escapeHtml((card.schoolName || "JSU") + " - " + (card.yearLabel || "This year")) + "</div>",
      "</div>",
      '<div class="jsuw-final-actions">',
      '<button class="jsuw-action-button jsuw-action-button--primary" type="button" data-jsuw-action="share">Share this recap</button>',
      '<button class="jsuw-action-button" type="button" data-jsuw-action="download">Download image</button>',
      '<p class="jsuw-action-status" data-jsuw-status aria-live="polite"></p>',
      "</div>"
    ].join(""));
  }

  function renderTeenTop(card) {
    return [
      '<div class="jsuw-teen-proof">Teen test version</div>',
      '<div class="jsuw-eyebrow">' + escapeHtml(card.eyebrow || "Teen Wrapped") + "</div>"
    ].join("");
  }

  function renderTeenCoverBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-cover-scene">',
      renderTeenTop(card),
      '<h2 class="jsuw-teen-title jsuw-teen-title--cover">' + htmlWithBreaks(card.displayHeadline || card.headline) + "</h2>",
      '<div class="jsuw-teen-marker">' + escapeHtml(card.chapterName || "JSU") + "</div>",
      '<p>' + escapeHtml(card.subtext || "") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderTeenAttendanceBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-attendance-scene">',
      renderTeenTop(card),
      '<h2 class="jsuw-teen-title">' + htmlWithBreaks(card.displayHeadline || card.headline) + "</h2>",
      '<div class="jsuw-teen-big-number">' + renderStatNumber(card, "jsuw-reference-stat jsuw-reference-stat--teen") + "</div>",
      '<div class="jsuw-teen-bars" aria-hidden="true">' + Array.from({ length: Math.max(0, Math.min(card.rawValue || 0, 18)) }).map(function (_, index) {
        return '<span style="--i:' + index + '"></span>';
      }).join("") + "</div>",
      '<p class="jsuw-teen-copy">' + escapeHtml(card.subtext || "") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderTeenTicketBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-ticket-scene">',
      renderTeenTop(card),
      '<h2 class="jsuw-teen-title">It started<br>with...</h2>',
      '<div class="jsuw-teen-ticket">',
      '<span>Admit one</span>',
      '<strong>' + escapeHtml(card.eventName || "JSU Kickoff") + "</strong>",
      '<dl><div><dt>Date</dt><dd>' + escapeHtml(card.eventDate || "This year") + "</dd></div>",
      '<div><dt>Place</dt><dd>' + escapeHtml(card.eventLocation || "JSU") + "</dd></div></dl>",
      "</div>",
      '<div class="jsuw-teen-stamp">First moment</div>',
      '<p class="jsuw-teen-copy">' + escapeHtml(card.subtext || "") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderTeenStreakBody(card) {
    var count = Math.max(0, Math.min(numberValue(card.stat), 8));

    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-streak-scene">',
      renderTeenTop(card),
      '<h2 class="jsuw-teen-title">' + htmlWithBreaks(card.displayHeadline || card.headline) + "</h2>",
      '<div class="jsuw-teen-flame" aria-hidden="true"><span></span></div>',
      '<div class="jsuw-teen-streak-number">' + renderStatNumber(card, "jsuw-reference-stat jsuw-reference-stat--teen") + "</div>",
      '<div class="jsuw-teen-check-row">' + Array.from({ length: count }).map(function () { return "<span>OK</span>"; }).join("") + "</div>",
      '<p class="jsuw-teen-copy">' + escapeHtml(card.subtext || "") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderTeenVibeBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-vibe-scene">',
      renderTeenTop(card),
      '<h2 class="jsuw-teen-title">Your top<br>vibe was...</h2>',
      '<div class="jsuw-teen-sticker-card"><em>#1 program type</em><strong>' + escapeHtml(card.vibe || "Social + Jewish Culture") + "</strong></div>",
      '<div class="jsuw-teen-icon-row"><span>Bagels</span><span>Friends</span><span>Culture</span></div>',
      '<p class="jsuw-teen-copy">' + escapeHtml(card.subtext || "") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderTeenConnectorBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-connector-scene">',
      renderTeenTop(card),
      '<h2 class="jsuw-teen-title">You\'re<br><span>' + escapeHtml(card.persona || "The Connector") + ".</span></h2>",
      '<div class="jsuw-teen-network" aria-hidden="true"><span class="jsuw-teen-node jsuw-teen-node--center">you</span><span></span><span></span><span></span><span></span><span></span></div>',
      '<div class="jsuw-teen-mini-stats"><div><strong>' + escapeHtml(card.friendsBrought || "0") + "</strong><span>friends brought</span></div><div><strong>" + escapeHtml(card.schoolsInRoom || "0") + "</strong><span>schools in your room</span></div></div>",
      '<p class="jsuw-teen-copy">' + escapeHtml(card.subtext || "") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderTeenDepthBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-depth-scene">',
      renderTeenTop(card),
      '<h2 class="jsuw-teen-title">You made room<br>for deeper<br>moments too.</h2>',
      '<div class="jsuw-teen-split-stats">',
      '<div><span>Shabbatons</span><strong>' + escapeHtml(card.shabbatons || "0") + "</strong><em>weekends away</em></div>",
      '<div><span>Learning</span><strong>' + escapeHtml(card.learningSessions || "0") + "</strong><em>sessions deep</em></div>",
      "</div>",
      '<p class="jsuw-teen-copy">' + escapeHtml(card.leadershipMoments || "0") + " leadership moments too. " + escapeHtml(card.subtext || "") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderTeenChapterBody(card) {
    var stats = (card.summaryStats || []).map(function (stat, index) {
      return '<div style="--i:' + index + '"><strong>' + escapeHtml(stat.value) + "</strong><span>" + escapeHtml(stat.label) + "</span></div>";
    }).join("");

    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-chapter-scene">',
      renderTeenTop(card),
      '<h2 class="jsuw-teen-title">' + escapeHtml(card.chapterName || "Your chapter") + '<br>had a <span>big</span><br>year.</h2>',
      '<div class="jsuw-teen-stat-grid">' + stats + "</div>",
      '<p class="jsuw-teen-copy">' + escapeHtml(card.subtext || "") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderTeenMovementBody(card) {
    var stats = (card.stats || []).map(function (stat) {
      return '<li><strong>' + escapeHtml(stat.value) + "</strong><span>" + escapeHtml(stat.label) + "</span></li>";
    }).join("");

    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-movement-scene">',
      renderTeenTop(card),
      '<h2 class="jsuw-teen-title">You were part of<br>something <span>much bigger.</span></h2>',
      '<div class="jsuw-teen-orbit" aria-hidden="true"><span>you</span></div>',
      '<ul class="jsuw-teen-movement-stats">' + stats + "</ul>",
      '<p class="jsuw-teen-copy">' + escapeHtml(card.subtext || "") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderTeenShareBody(card) {
    var stats = (card.summaryStats || []).map(function (stat) {
      return '<div><span>' + escapeHtml(stat.label) + "</span><strong>" + escapeHtml(stat.value) + "</strong></div>";
    }).join("");

    return renderReferenceShell(card, [
      '<div class="jsuw-teen-scene jsuw-teen-share-scene">',
      '<div class="jsuw-teen-share-poster">',
      renderBrandLockup(card),
      '<div class="jsuw-teen-proof">Teen test version</div>',
      '<h2>' + htmlWithBreaks(card.displayHeadline || card.headline) + "</h2>",
      '<p>' + escapeHtml(card.subtext || "") + "</p>",
      '<div class="jsuw-teen-share-stats">' + stats + "</div>",
      '<div class="jsuw-teen-share-persona">' + escapeHtml(card.persona || "The Connector") + "</div>",
      '<footer>' + escapeHtml((card.teenName || "Maya") + " - " + (card.chapterName || "JSU") + " - " + (card.yearLabel || "This year")) + "</footer>",
      "</div>",
      '<div class="jsuw-final-actions">',
      '<button class="jsuw-action-button jsuw-action-button--primary" type="button" data-jsuw-action="share">Share</button>',
      '<button class="jsuw-action-button" type="button" data-jsuw-action="download">Download</button>',
      '<p class="jsuw-action-status" data-jsuw-status aria-live="polite"></p>',
      "</div>",
      "</div>"
    ].join(""));
  }

  function renderTeenBody(card) {
    if (card.theme === "teen-cover") {
      return renderTeenCoverBody(card);
    }

    if (card.theme === "teen-attendance") {
      return renderTeenAttendanceBody(card);
    }

    if (card.theme === "teen-ticket") {
      return renderTeenTicketBody(card);
    }

    if (card.theme === "teen-streak") {
      return renderTeenStreakBody(card);
    }

    if (card.theme === "teen-vibe") {
      return renderTeenVibeBody(card);
    }

    if (card.theme === "teen-connector") {
      return renderTeenConnectorBody(card);
    }

    if (card.theme === "teen-depth") {
      return renderTeenDepthBody(card);
    }

    if (card.theme === "teen-chapter") {
      return renderTeenChapterBody(card);
    }

    if (card.theme === "teen-movement") {
      return renderTeenMovementBody(card);
    }

    if (card.theme === "teen-share") {
      return renderTeenShareBody(card);
    }

    return "";
  }

  function renderCardBody(card) {
    if (String(card.theme || "").indexOf("teen-") === 0) {
      return renderTeenBody(card);
    }

    if (card.theme === "cover") {
      return renderCoverBody(card);
    }

    if (card.theme === "events") {
      return renderEventsBody(card);
    }

    if (card.theme === "reach") {
      return renderReachBody(card);
    }

    if (card.theme === "moments") {
      return renderMomentsBody(card);
    }

    if (card.theme === "new") {
      return renderNewBody(card);
    }

    if (card.theme === "repeat") {
      return renderRepeatBody(card);
    }

    if (card.theme === "biggest") {
      return renderBiggestBody(card);
    }

    if (card.theme === "persona") {
      return renderPersonaBody(card);
    }

    if (card.theme === "movement") {
      return renderMovementBody(card);
    }

    if (card.theme === "final") {
      return renderFinalBody(card);
    }

    var headlineClass = "jsuw-headline";
    var statClass = "jsuw-stat-number";

    if (card.headline.length > 58) {
      headlineClass += " jsuw-headline--dense";
    } else if (card.headline.length > 40) {
      headlineClass += " jsuw-headline--compact";
    }

    if (hasValue(card.stat) && String(card.stat).length > 6) {
      statClass += " jsuw-stat-number--compact";
    }

    var html = [
      '<div class="jsuw-card-main">',
      renderBrandLockup(card),
      '<div class="jsuw-eyebrow">' + escapeHtml(card.eyebrow || "JSU Wrapped") + "</div>",
      '<h2 class="' + headlineClass + '">' + escapeHtml(card.headline) + "</h2>"
    ];

    if (card.type === "stat") {
      html.push(
        '<div class="jsuw-stat-lockup" aria-hidden="true">',
        renderStatPattern(card),
        renderStatNumber(card, statClass),
        '<div class="jsuw-stat-label">' + escapeHtml(card.statLabel || "") + "</div>",
        "</div>"
      );
    }

    if (card.type === "movement") {
      html.push('<ul class="jsuw-movement-list">');
      card.stats.forEach(function (stat) {
        html.push(
          '<li><strong>' + escapeHtml(stat.value) + "</strong><span>" + escapeHtml(stat.label) + "</span></li>"
        );
      });
      html.push("</ul>");
    }

    if (hasValue(card.subtext)) {
      html.push('<p class="jsuw-subtext">' + escapeHtml(card.subtext) + "</p>");
    }

    if (hasValue(card.badge)) {
      html.push('<div class="jsuw-badge">' + escapeHtml(card.badge) + "</div>");
    }

    if (card.type === "final") {
      html.push(
        '<div class="jsuw-final-actions">',
        '<button class="jsuw-action-button jsuw-action-button--primary" type="button" data-jsuw-action="share">Share this recap</button>',
        '<button class="jsuw-action-button" type="button" data-jsuw-action="download">Download image</button>',
        '<p class="jsuw-action-status" data-jsuw-status aria-live="polite"></p>',
        "</div>"
      );
    }

    html.push("</div>");

    return html.join("");
  }

  function renderError(container, headline, message) {
    container.innerHTML = [
      '<div class="jsuw-shell jsuw-shell--error">',
      '<section class="jsuw-error" role="status">',
      '<div class="jsuw-eyebrow">JSU Wrapped</div>',
      '<h2 class="jsuw-headline">' + escapeHtml(headline) + "</h2>",
      '<p class="jsuw-subtext">' + escapeHtml(message) + "</p>",
      "</section>",
      "</div>"
    ].join("");
  }

  function setStatus(container, message) {
    var status = container.querySelector("[data-jsuw-status]");

    if (status) {
      status.textContent = message;
    }
  }

  function renderSoundToggle(state) {
    var label = state && state.soundEnabled ? "Sound on" : "Sound off";

    return '<button class="jsuw-sound-toggle" type="button" data-jsuw-action="sound" aria-pressed="' + (state && state.soundEnabled ? "true" : "false") + '">' + label + "</button>";
  }

  function renderAutoplayToggle(state) {
    var enabled = Boolean(state && state.autoplayEnabled);
    var label = enabled ? "Auto on" : "Auto off";

    return '<button class="jsuw-autoplay-toggle" type="button" data-jsuw-action="autoplay" aria-pressed="' + (enabled ? "true" : "false") + '">' + label + "</button>";
  }

  function renderStoryMarkup(state) {
    var card = state.cards[state.index];
    var total = state.cards.length;
    var cardNumber = state.index + 1;
    var nextLabel = state.index === total - 1 ? "Replay" : "Next";
    var autoplayActive = Boolean(state.autoplayEnabled && state.index < total - 1);
    var storyClass = "jsuw-story jsuw-story-theme-" + escapeHtml(card.theme) + (autoplayActive ? " jsuw-story--autoplay" : "");
    var storyStyle = '--jsuw-progress-duration:' + escapeHtml(state.autoplayDelay || DEFAULT_AUTOPLAY_DELAY) + "ms";

    return [
      '<div class="jsuw-shell">',
      '<section class="' + storyClass + '" style="' + storyStyle + '" tabindex="0" role="group" aria-roledescription="story" aria-label="JSU Wrapped card ' + cardNumber + " of " + total + '">',
      '<div class="jsuw-progress" aria-hidden="true">' + renderProgress(state.index, total) + "</div>",
      '<div class="jsuw-story-header">' + renderBrandLockup(card) + '<span class="jsuw-card-count" aria-hidden="true">' + String(cardNumber).padStart(2, "0") + " / " + String(total).padStart(2, "0") + '</span><span class="jsuw-story-tools">' + renderAutoplayToggle(state) + renderSoundToggle(state) + "</span></div>",
      '<p class="jsuw-sr-only">Card ' + cardNumber + " of " + total + "</p>",
      '<article class="jsuw-card jsuw-type-' + escapeHtml(card.type) + " jsuw-theme-" + escapeHtml(card.theme) + '" data-jsuw-card>',
      renderStickerCloud(card),
      renderCardBody(card),
      "</article>",
      '<div class="jsuw-tap-zones" aria-hidden="true"><span></span><span></span><span></span></div>',
      '<div class="jsuw-controls">',
      '<button class="jsuw-nav-button" type="button" data-jsuw-action="prev" ' + (state.index === 0 ? "disabled" : "") + '>Back</button>',
      '<button class="jsuw-nav-button jsuw-nav-button--next" type="button" data-jsuw-action="next">' + nextLabel + "</button>",
      "</div>",
      "</section>",
      "</div>"
    ].join("");
  }

  function renderStory(container, state) {
    container.innerHTML = renderStoryMarkup(state);
  }

  function focusStory(container) {
    var story = container.querySelector(".jsuw-story");

    if (!story) {
      return;
    }

    try {
      story.focus({ preventScroll: true });
    } catch (error) {
      story.focus();
    }
  }

  function prefersReducedMotion() {
    return Boolean(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function ensureSoundEngine(state) {
    var AudioContext = root.AudioContext || root.webkitAudioContext;

    if (!AudioContext) {
      return null;
    }

    if (!state.soundEngine) {
      state.soundEngine = new AudioContext();
    }

    if (state.soundEngine.state === "suspended" && typeof state.soundEngine.resume === "function") {
      state.soundEngine.resume();
    }

    return state.soundEngine;
  }

  function playTone(state, frequency, duration, type, volume, delay) {
    if (!state || !state.soundEnabled || prefersReducedMotion()) {
      return;
    }

    var context = ensureSoundEngine(state);

    if (!context) {
      return;
    }

    var start = context.currentTime + (delay || 0);
    var oscillator = context.createOscillator();
    var gain = context.createGain();

    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume || 0.05, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function getSoundProfileForCard(card) {
    var theme = card && card.theme || "default";
    var profiles = {
      cover: [
        { frequency: 330, duration: 0.08, type: "triangle", volume: 0.03, delay: 0 },
        { frequency: 494, duration: 0.11, type: "sine", volume: 0.026, delay: 0.07 },
        { frequency: 659.25, duration: 0.16, type: "sine", volume: 0.024, delay: 0.16 }
      ],
      events: [
        { frequency: 196, duration: 0.07, type: "square", volume: 0.018, delay: 0 },
        { frequency: 247, duration: 0.08, type: "triangle", volume: 0.025, delay: 0.06 },
        { frequency: 330, duration: 0.12, type: "sine", volume: 0.026, delay: 0.13 }
      ],
      reach: [
        { frequency: 294, duration: 0.06, type: "triangle", volume: 0.024, delay: 0 },
        { frequency: 370, duration: 0.08, type: "triangle", volume: 0.024, delay: 0.06 },
        { frequency: 494, duration: 0.12, type: "sine", volume: 0.025, delay: 0.14 }
      ],
      moments: [
        { frequency: 220, duration: 0.05, type: "square", volume: 0.016, delay: 0 },
        { frequency: 330, duration: 0.05, type: "square", volume: 0.016, delay: 0.05 },
        { frequency: 440, duration: 0.08, type: "triangle", volume: 0.022, delay: 0.1 },
        { frequency: 660, duration: 0.13, type: "sine", volume: 0.021, delay: 0.17 }
      ],
      new: [
        { frequency: 392, duration: 0.08, type: "triangle", volume: 0.026, delay: 0 },
        { frequency: 523.25, duration: 0.1, type: "sine", volume: 0.024, delay: 0.08 },
        { frequency: 784, duration: 0.14, type: "sine", volume: 0.022, delay: 0.17 }
      ],
      repeat: [
        { frequency: 262, duration: 0.08, type: "triangle", volume: 0.024, delay: 0 },
        { frequency: 392, duration: 0.1, type: "triangle", volume: 0.023, delay: 0.08 },
        { frequency: 524, duration: 0.16, type: "sine", volume: 0.021, delay: 0.16 }
      ],
      biggest: [
        { frequency: 196, duration: 0.08, type: "square", volume: 0.017, delay: 0 },
        { frequency: 392, duration: 0.09, type: "triangle", volume: 0.026, delay: 0.08 },
        { frequency: 784, duration: 0.18, type: "sine", volume: 0.024, delay: 0.17 }
      ],
      persona: [
        { frequency: 330, duration: 0.08, type: "triangle", volume: 0.024, delay: 0 },
        { frequency: 415, duration: 0.08, type: "triangle", volume: 0.024, delay: 0.08 },
        { frequency: 554, duration: 0.1, type: "sine", volume: 0.022, delay: 0.16 },
        { frequency: 660, duration: 0.16, type: "sine", volume: 0.02, delay: 0.26 }
      ],
      movement: [
        { frequency: 247, duration: 0.08, type: "triangle", volume: 0.023, delay: 0 },
        { frequency: 370, duration: 0.08, type: "triangle", volume: 0.023, delay: 0.08 },
        { frequency: 494, duration: 0.1, type: "sine", volume: 0.022, delay: 0.16 },
        { frequency: 740, duration: 0.17, type: "sine", volume: 0.02, delay: 0.27 }
      ],
      final: [
        { frequency: 262, duration: 0.08, type: "triangle", volume: 0.024, delay: 0 },
        { frequency: 330, duration: 0.08, type: "triangle", volume: 0.024, delay: 0.08 },
        { frequency: 392, duration: 0.08, type: "triangle", volume: 0.024, delay: 0.16 },
        { frequency: 523.25, duration: 0.14, type: "sine", volume: 0.024, delay: 0.25 },
        { frequency: 659.25, duration: 0.2, type: "sine", volume: 0.021, delay: 0.38 }
      ],
      default: [
        { frequency: 392, duration: 0.13, type: "triangle", volume: 0.035, delay: 0 },
        { frequency: 523.25, duration: 0.16, type: "sine", volume: 0.03, delay: 0.08 }
      ]
    };

    return (profiles[theme] || profiles.default).map(function (note) {
      return {
        frequency: note.frequency,
        duration: note.duration,
        type: note.type,
        volume: note.volume,
        delay: note.delay
      };
    });
  }

  function playSoundProfile(state, profile) {
    profile.forEach(function (note) {
      playTone(state, note.frequency, note.duration, note.type, note.volume, note.delay);
    });
  }

  function playCardSound(state) {
    var card = state && state.cards ? state.cards[state.index] : null;

    playSoundProfile(state, getSoundProfileForCard(card));
  }

  function playCountSound(state, progress, target) {
    var base = target > 999 ? 220 : 330;
    var frequency = base + Math.round(progress * 520);

    playTone(state, frequency, 0.045, "square", 0.018, 0);
  }

  function formatAnimatedStat(value, decimals, suffix) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value) + suffix;
  }

  function animateCountUp(element, state) {
    var target = Number(element.getAttribute("data-jsuw-stat-target"));
    var suffix = element.getAttribute("data-jsuw-stat-suffix") || "";
    var decimals = Number(element.getAttribute("data-jsuw-stat-decimals") || 0);

    if (!isFinite(target)) {
      return;
    }

    if (prefersReducedMotion() || typeof root.requestAnimationFrame !== "function") {
      element.textContent = formatAnimatedStat(target, decimals, suffix);
      return;
    }

    var start = root.performance && typeof root.performance.now === "function" ? root.performance.now() : Date.now();
    var duration = target > 999 ? 1180 : 880;
    var nextSoundAt = 0.08;

    element.textContent = formatAnimatedStat(0, decimals, suffix);

    root.requestAnimationFrame(function step(now) {
      var elapsed = Math.max(0, now - start);
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = target * eased;

      element.textContent = formatAnimatedStat(progress === 1 ? target : current, decimals, suffix);

      if (state && state.soundEnabled && progress >= nextSoundAt) {
        playCountSound(state, progress, target);
        nextSoundAt += 0.12;
      }

      if (progress < 1) {
        root.requestAnimationFrame(step);
      }
    });
  }

  function activateStory(container, state) {
    var story = container.querySelector(".jsuw-story");
    var countUps = container.querySelectorAll("[data-jsuw-countup]");

    if (story && typeof root.requestAnimationFrame === "function") {
      root.requestAnimationFrame(function () {
        story.classList.add("jsuw-story--entered");
      });
    } else if (story) {
      story.classList.add("jsuw-story--entered");
    }

    playCardSound(state);
    Array.prototype.forEach.call(countUps, function (element) {
      animateCountUp(element, state);
    });

    scheduleAutoplay(container, state);
  }

  function clearAutoplayTimer(state) {
    if (state && state.autoplayTimer) {
      root.clearTimeout(state.autoplayTimer);
      state.autoplayTimer = null;
    }
  }

  function scheduleAutoplay(container, state) {
    clearAutoplayTimer(state);

    if (!state || !state.autoplayEnabled || prefersReducedMotion()) {
      return;
    }

    if (state.index >= state.cards.length - 1) {
      return;
    }

    state.autoplayTimer = root.setTimeout(function () {
      state.autoplayTimer = null;
      next(container, state, { autoplay: true });
    }, state.autoplayDelay || DEFAULT_AUTOPLAY_DELAY);
  }

  function goTo(container, state, nextIndex, options) {
    var total = state.cards.length;
    var method = options && options.autoplay ? "autoplay" : options && options.method || "manual";

    clearAutoplayTimer(state);

    if (nextIndex < 0) {
      nextIndex = 0;
    }

    if (nextIndex >= total) {
      nextIndex = 0;
    }

    if (nextIndex === state.index) {
      scheduleAutoplay(container, state);
      return;
    }

    trackCardEngagement(state, method);
    state.index = nextIndex;
    renderStory(container, state);
    activateStory(container, state);
    trackCardView(state, method);

    if (options && options.focusStory) {
      focusStory(container);
    }
  }

  function previous(container, state, options) {
    options = options || {};
    options.method = options.method || "previous";
    goTo(container, state, state.index - 1, options);
  }

  function next(container, state, options) {
    options = options || {};
    options.method = options.method || (options.autoplay ? "autoplay" : "next");
    goTo(container, state, state.index + 1, options);
  }

  function getPointerSide(event, element) {
    var rect = element.getBoundingClientRect();
    var x = event.clientX - rect.left;

    return x < rect.width / 2 ? "left" : "right";
  }

  function isInteractiveTarget(target) {
    return Boolean(target && typeof target.closest === "function" && target.closest("button, a, input, textarea, select, [role='button']"));
  }

  function getKeyNavigationAction(event) {
    if (!event) {
      return null;
    }

    if (event.key === " " && isInteractiveTarget(event.target)) {
      return null;
    }

    if (event.key === "ArrowRight" || event.key === " ") {
      return "next";
    }

    if (event.key === "ArrowLeft") {
      return "prev";
    }

    return null;
  }

  function toggleSound(container, state) {
    state.soundEnabled = !state.soundEnabled;

    if (state.soundEnabled) {
      ensureSoundEngine(state);
      playTone(state, 523.25, 0.14, "triangle", 0.045, 0);
      playTone(state, 659.25, 0.16, "sine", 0.035, 0.08);
    }

    var button = container.querySelector('[data-jsuw-action="sound"]');

    if (button) {
      button.textContent = state.soundEnabled ? "Sound on" : "Sound off";
      button.setAttribute("aria-pressed", state.soundEnabled ? "true" : "false");
    }

    trackAnalyticsEvent(state, "jsu_wrapped_sound_toggle", {
      sound_enabled: state.soundEnabled ? "true" : "false"
    });
  }

  function toggleAutoplay(container, state, options) {
    clearAutoplayTimer(state);
    state.autoplayEnabled = !state.autoplayEnabled;
    renderStory(container, state);
    activateStory(container, state);

    if (options && options.focusStory) {
      focusStory(container);
    }

    trackAnalyticsEvent(state, "jsu_wrapped_autoplay_toggle", {
      autoplay_enabled: state.autoplayEnabled ? "true" : "false"
    });
  }

  function installInteraction(container, state) {
    function runAction(action, options) {
      if (action === "prev") {
        previous(container, state, options);
      } else if (action === "next") {
        next(container, state, options);
      } else if (action === "share") {
        shareRecap(container, state);
      } else if (action === "download") {
        downloadRecap(container, state);
      } else if (action === "sound") {
        toggleSound(container, state);
      } else if (action === "autoplay") {
        toggleAutoplay(container, state, options);
      }
    }

    function handleClick(event) {
      if (!event.target || typeof event.target.closest !== "function") {
        return;
      }

      var actionTarget = event.target.closest("[data-jsuw-action]");

      if (actionTarget) {
        var action = actionTarget.getAttribute("data-jsuw-action");
        runAction(action);

        return;
      }

      var story = event.target.closest(".jsuw-story");

      if (!story || isInteractiveTarget(event.target)) {
        return;
      }

      if (getPointerSide(event, story) === "left") {
        previous(container, state);
      } else {
        next(container, state);
      }
    }

    function handleKeydown(event) {
      if (event.key === " " && isInteractiveTarget(event.target)) {
        var actionTarget = event.target.closest("[data-jsuw-action]");

        if (actionTarget && !actionTarget.disabled) {
          event.preventDefault();
          runAction(actionTarget.getAttribute("data-jsuw-action"), { focusStory: true });
        }

        return;
      }

      var action = getKeyNavigationAction(event);

      if (action === "next") {
        event.preventDefault();
        next(container, state, { focusStory: true });
      } else if (action === "prev") {
        event.preventDefault();
        previous(container, state, { focusStory: true });
      }
    }

    container.addEventListener("click", handleClick);
    container.addEventListener("keydown", handleKeydown);

    function handlePageHide() {
      trackCardEngagement(state, "pagehide");
    }

    if (root.addEventListener) {
      root.addEventListener("pagehide", handlePageHide);
    }

    return function cleanupInteraction() {
      trackCardEngagement(state, "cleanup");
      clearAutoplayTimer(state);
      container.removeEventListener("click", handleClick);
      container.removeEventListener("keydown", handleKeydown);

      if (root.removeEventListener) {
        root.removeEventListener("pagehide", handlePageHide);
      }
    };
  }

  function shareText(state) {
    var record = state.record;

    if (state && state.experienceMode === "teen") {
      var teenName = asText(record.teen_name || record.student_name, "Maya");

      return [
        teenName + "'s JSU Wrapped:",
        hasValue(record.events_attended) ? formatNumber(record.events_attended) + " events" : "",
        hasValue(record.longest_streak) ? formatNumber(record.longest_streak) + " event streak" : "",
        hasValue(record.friends_brought) ? formatNumber(record.friends_brought) + " friends brought" : "",
        hasValue(record.persona) ? asText(record.persona) + " energy" : ""
      ].filter(Boolean).join(" - ");
    }

    var chapterName = asText(record.chapter_name, "Our JSU chapter");

    return [
      chapterName + " Wrapped:",
      hasValue(record.events_hosted) ? formatNumber(record.events_hosted) + " events" : "",
      hasValue(record.unique_teens) ? formatNumber(record.unique_teens) + " teens" : "",
      hasValue(record.engagement_moments) ? formatNumber(record.engagement_moments) + " engagement moments" : "",
      hasValue(record.chapter_persona) ? asText(record.chapter_persona) + " energy" : ""
    ].filter(Boolean).join(" - ");
  }

  async function shareRecap(container, state) {
    var metadata = createPageMetadata(state);
    var data = {
      title: metadata.title,
      text: shareText(state),
      url: root.location ? root.location.href : ""
    };

    trackAnalyticsEvent(state, "jsu_wrapped_share_click", {
      share_method: root.navigator && typeof root.navigator.share === "function" ? "native" : "fallback"
    });

    try {
      if (root.navigator && typeof root.navigator.share === "function") {
        await root.navigator.share(data);
        setStatus(container, "Shared.");
        return;
      }

      if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === "function") {
        await root.navigator.clipboard.writeText([data.text, data.url].filter(Boolean).join("\n"));
        setStatus(container, "Recap copied.");
        return;
      }

      setStatus(container, "Copy this page link to share your recap.");
    } catch (error) {
      setStatus(container, "Share was canceled.");
    }
  }

  function downloadBlob(container, blob, filename) {
    var url = root.URL.createObjectURL(blob);
    var link = root.document.createElement("a");

    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    container.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(function () {
      root.URL.revokeObjectURL(url);
    }, 1000);
  }

  function svgLine(text, x, y, size, weight, fill) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + weight + '" fill="' + fill + '" font-family="Arial, Helvetica, sans-serif">' + escapeXml(text) + "</text>";
  }

  function splitSvgLines(value, maxChars, maxLines) {
    var words = String(value || "").replace(/\s+/g, " ").trim().split(" ");
    var lines = [];
    var current = "";

    words.forEach(function (word) {
      var next = current ? current + " " + word : word;

      if (current && next.length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    });

    if (current) {
      lines.push(current);
    }

    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\s+$/, "") + "...";
    }

    return lines.length ? lines : [""];
  }

  function svgTextLines(lines, x, y, size, weight, fill, lineHeight, className) {
    return lines.map(function (line, index) {
      return '<text class="' + escapeXml(className || "") + '" x="' + x + '" y="' + (y + index * lineHeight) + '" font-size="' + size + '" font-weight="' + weight + '" fill="' + fill + '" font-family="Arial, Helvetica, sans-serif">' + escapeXml(line) + "</text>";
    }).join("");
  }

  function getFinalCard(state) {
    var cards = state && state.cards || [];

    for (var index = 0; index < cards.length; index += 1) {
      if (cards[index] && cards[index].theme === "final") {
        return cards[index];
      }
    }

    return cards[cards.length - 1] || {};
  }

  function createFallbackConfetti() {
    var colors = ["#fff7a9", "#00d9ff", "#ff4f9a", "#7cff6b", "#ffb000", "#ffffff"];
    var pieces = [];

    for (var index = 0; index < 54; index += 1) {
      var x = 34 + ((index * 89) % 1012);
      var y = 56 + ((index * 137) % 1700);
      var rotate = (index * 29) % 180;
      var fill = colors[index % colors.length];

      if (index % 5 === 0) {
        pieces.push('<circle cx="' + x + '" cy="' + y + '" r="' + (7 + index % 9) + '" fill="' + fill + '" opacity="0.88"/>');
      } else {
        pieces.push('<rect x="' + x + '" y="' + y + '" width="' + (16 + index % 13) + '" height="' + (7 + index % 8) + '" rx="4" fill="' + fill + '" opacity="0.9" transform="rotate(' + rotate + " " + x + " " + y + ')"/>');
      }
    }

    return '<g class="confetti" aria-hidden="true">' + pieces.join("") + "</g>";
  }

  function fallbackLogoMarkup(brand, logoDataUrl) {
    var brandText = brand === "ncsy" ? "NCSY" : "JSU";

    if (hasValue(logoDataUrl)) {
      return [
        '<rect x="78" y="92" width="168" height="168" rx="34" fill="#071464" stroke="#ffffff" stroke-width="5" opacity="0.98"/>',
        '<image href="' + escapeXml(logoDataUrl) + '" x="100" y="114" width="124" height="124" preserveAspectRatio="xMidYMid meet"/>'
      ].join("");
    }

    return [
      '<rect x="78" y="92" width="168" height="168" rx="34" fill="#071464" stroke="#ffffff" stroke-width="5" opacity="0.98"/>',
      svgLine(brandText, 112, 192, brand === "ncsy" ? 40 : 56, 900, "#ffffff")
    ].join("");
  }

  function fallbackStatRows(stats) {
    return (stats || []).slice(0, 5).map(function (stat, index) {
      var y = 1010 + index * 128;

      return [
        '<g transform="translate(92 ' + y + ')">',
        '<rect width="896" height="96" rx="28" fill="#ffffff" opacity="' + (index % 2 ? "0.16" : "0.22") + '"/>',
        '<text x="34" y="64" font-size="54" font-weight="900" fill="#ffffff" font-family="Arial, Helvetica, sans-serif">' + escapeXml(stat.value) + "</text>",
        '<text x="310" y="60" font-size="32" font-weight="800" fill="#fff4b7" font-family="Arial, Helvetica, sans-serif">' + escapeXml(stat.label) + "</text>",
        "</g>"
      ].join("");
    }).join("");
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve) {
      if (!root.FileReader) {
        resolve("");
        return;
      }

      var reader = new root.FileReader();

      reader.onloadend = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        resolve("");
      };
      reader.readAsDataURL(blob);
    });
  }

  async function fetchImageDataUrl(url) {
    if (!hasValue(url) || !root.fetch) {
      return "";
    }

    try {
      var response = await root.fetch(url, { credentials: "same-origin" });

      if (!response.ok) {
        return "";
      }

      return await blobToDataUrl(await response.blob());
    } catch (error) {
      return "";
    }
  }

  function createFallbackSvg(state, logoDataUrl) {
    var record = state.record || {};
    var card = getFinalCard(state);
    var isTeen = state && state.experienceMode === "teen";
    var teenName = asText(record.teen_name || record.student_name || record.first_name, "Maya");
    var chapterName = isTeen ? teenName + "'s JSU" : asText(record.chapter_name, "JSU Wrapped");
    var persona = isTeen ? asText(card.persona || record.persona, "JSU energy") : asText(card.persona || record.chapter_persona, "JSU energy");
    var year = asText(card.yearLabel || record.year_label || record.school_year, "This year");
    var brand = card.brandChoice === "ncsy" || getBrandChoice(record) === "ncsy" ? "ncsy" : "jsu";
    var headlineLines = splitSvgLines(chapterName, 16, 3).concat(["Wrapped"]);
    var summaryLines = splitSvgLines(card.subtext || [
      hasValue(record.events_hosted || record.events_attended) ? formatNumber(record.events_hosted || record.events_attended) + " events" : "",
      hasValue(record.unique_teens || record.longest_streak) ? formatNumber(record.unique_teens || record.longest_streak) + (isTeen ? " event streak" : " teens") : "",
      hasValue(record.engagement_moments || record.friends_brought) ? formatNumber(record.engagement_moments || record.friends_brought) + (isTeen ? " friends brought" : " moments") : "",
      persona + " energy"
    ].filter(Boolean).join(". ") + ".", 28, 3);
    var stats = card.summaryStats || [
      hasValue(record.events_hosted || record.events_attended) ? { value: formatNumber(record.events_hosted || record.events_attended), label: isTeen ? "events showed up to" : "programs together" } : null,
      hasValue(record.unique_teens || record.longest_streak) ? { value: formatNumber(record.unique_teens || record.longest_streak), label: isTeen ? "event streak" : "of us, one chapter" } : null,
      hasValue(record.engagement_moments || record.friends_brought) ? { value: formatNumber(record.engagement_moments || record.friends_brought), label: isTeen ? "friends brought" : "moments stacked up" } : null
    ].filter(Boolean);

    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">',
      "<title>" + escapeXml(chapterName + " Wrapped - " + persona) + "</title>",
      "<defs>",
      '<linearGradient id="posterBg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#1019aa"/><stop offset="0.38" stop-color="#6928ff"/><stop offset="0.7" stop-color="#ff3b91"/><stop offset="1" stop-color="#ffc400"/></linearGradient>',
      '<radialGradient id="posterGlow" cx="50%" cy="34%" r="65%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/><stop offset="0.52" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>',
      '<filter id="posterShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="#18002e" flood-opacity="0.35"/></filter>',
      '<style>.poster-headline{letter-spacing:-1px}.confetti{mix-blend-mode:screen}</style>',
      "</defs>",
      '<rect width="1080" height="1920" rx="92" fill="url(#posterBg)"/>',
      '<rect width="1080" height="1920" rx="92" fill="url(#posterGlow)"/>',
      '<path d="M-120 420 C180 210 320 680 650 390 C850 216 1020 254 1200 90" fill="none" stroke="#ffffff" stroke-width="26" opacity="0.15"/>',
      '<path d="M-80 1510 C270 1330 438 1745 778 1430 C936 1284 1020 1302 1188 1190" fill="none" stroke="#00d9ff" stroke-width="30" opacity="0.18"/>',
      createFallbackConfetti(),
      '<rect x="52" y="60" width="976" height="1800" rx="76" fill="#16032f" opacity="0.74" stroke="#ffffff" stroke-width="8" filter="url(#posterShadow)"/>',
      '<circle cx="914" cy="220" r="122" fill="#fff4b7" opacity="0.22"/>',
      '<circle cx="166" cy="1574" r="164" fill="#00d9ff" opacity="0.19"/>',
      fallbackLogoMarkup(brand, logoDataUrl),
      svgLine(brand === "ncsy" ? "NCSY Wrapped" : "JSU Wrapped", 274, 160, 48, 900, "#ffffff"),
      svgLine(year, 276, 220, 34, 800, "#fff4b7"),
      svgTextLines(headlineLines, 92, 430, 96, 900, "#ffffff", 104, "poster-headline"),
      '<rect x="92" y="770" width="640" height="82" rx="41" fill="#fff4b7" opacity="0.96"/>',
      svgLine(persona + " energy", 126, 826, 40, 900, "#16032f"),
      svgTextLines(summaryLines, 92, 930, 43, 800, "#ffffff", 58, "poster-copy"),
      fallbackStatRows(stats),
      '<rect x="92" y="1718" width="896" height="72" rx="36" fill="#ffffff" opacity="0.16"/>',
      svgLine(asText(record.region_name, "One movement") + " - One chapter. One movement.", 126, 1766, 31, 800, "#ffffff"),
      "</svg>"
    ].join("");
  }

  async function downloadRecap(container, state) {
    var filename = state && state.experienceMode === "teen" ? slugify(state.record.teen_slug || state.record.student_slug || state.record.teen_name || "teen-test") + "-teen-wrapped.svg" : slugify(state.record.chapter_slug || state.record.chapter_name) + "-wrapped.svg";
    var card = container.querySelector("[data-jsuw-card]");
    var finalCard = getFinalCard(state);

    trackAnalyticsEvent(state, "jsu_wrapped_download_click", {
      download_format: root.html2canvas && card ? "png" : "svg"
    });

    async function downloadSvgFallback() {
      var logoDataUrl = await fetchImageDataUrl(finalCard.logoUrl);
      var svg = createFallbackSvg(state, logoDataUrl);
      downloadBlob(container, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
      setStatus(container, "Image downloaded.");
    }

    try {
      if (root.html2canvas && card) {
        var canvas = await root.html2canvas(card, {
          backgroundColor: null,
          scale: 2,
          useCORS: true
        });

        if (typeof canvas.toBlob !== "function") {
          await downloadSvgFallback();
          return;
        }

        canvas.toBlob(function (blob) {
          if (blob) {
            downloadBlob(container, blob, filename.replace(/\.svg$/, ".png"));
            setStatus(container, "Image downloaded.");
          } else {
            downloadSvgFallback().catch(function () {
              setStatus(container, "Take a screenshot to save this recap.");
            });
          }
        }, "image/png");
        return;
      }

      await downloadSvgFallback();
    } catch (error) {
      try {
        await downloadSvgFallback();
      } catch (fallbackError) {
        setStatus(container, "Take a screenshot to save this recap.");
      }
    }
  }

  async function fetchRecords(url) {
    var response = await root.fetch(url, { credentials: "same-origin" });

    if (!response.ok) {
      throw new Error("Could not load " + url);
    }

    return response.json();
  }

  async function init(container, options) {
    var target = container || (root.document && root.document.getElementById(WIDGET_ID));
    var settings = options || {};

    if (!target) {
      return null;
    }

    if (target.__jsuWrappedCleanup) {
      target.__jsuWrappedCleanup();
      target.__jsuWrappedCleanup = null;
    }

    target.innerHTML = '<div class="jsuw-shell"><section class="jsuw-loading" role="status">Loading JSU Wrapped...</section></div>';

    try {
      var assetBase = getAssetBase(target, settings);
      var experienceMode = getExperienceMode(settings.url, settings);

      if (experienceMode === "teen") {
        var teenDataUrl = settings.teenDataUrl || getTeenDataUrl(target);
        var teenRecords = settings.teenRecords || await fetchRecords(teenDataUrl);
        var teenSlug = settings.teen || getTeenSlug(settings.url);
        var teen = findTeen(teenRecords, teenSlug);

        if (!teen) {
          renderError(
            target,
            "We could not find that teen test record.",
            "This proof-of-concept uses sample data only. Try the teen test link from the main page."
          );
          return null;
        }

        var teenState = {
          cards: createTeenCards(teen, { assetBase: assetBase }),
          record: teen,
          experienceMode: "teen",
          analyticsEnabled: getAnalyticsPreference(target, settings),
          analyticsYear: getAnalyticsYear(target, settings, teen),
          autoplayEnabled: getAutoplayPreference(target, settings),
          autoplayDelay: getAutoplayDelay(target, settings),
          autoplayTimer: null,
          storyStartedAt: null,
          cardStartedAt: null,
          storyCompletedAt: null,
          soundEnabled: false,
          soundEngine: null
        };
        teenState.index = settings.initialIndex !== undefined ? settings.initialIndex : getInitialCardIndex(settings.url, teenState.cards.length);

        target.__jsuWrappedCleanup = installInteraction(target, teenState);
        applyPageMetadata(teenState);
        renderStory(target, teenState);
        activateStory(target, teenState);
        trackStoryView(teenState, "initial");
        return teenState;
      }

      var dataUrl = settings.dataUrl || getDataUrl(target);
      var records = settings.records || await fetchRecords(dataUrl);
      var chapterSlug = settings.chapter || getChapterSlug(settings.url);

      if (!hasValue(chapterSlug)) {
        renderChapterPicker(target, {
          records: records,
          year: target.dataset && target.dataset.year,
          region: settings.region || getRegionParam(settings.url),
          url: settings.url,
          assetBase: assetBase
        });
        return {
          picker: true,
          records: records
        };
      }

      var chapter = findChapter(records, chapterSlug);

      if (!chapter) {
        renderError(
          target,
          "We could not find that chapter.",
          "Check the chapter link or ask your JSU or NCSY team for the right Wrapped URL."
        );
        return null;
      }

      var state = {
        cards: createCards(chapter, { assetBase: assetBase }),
        record: chapter,
        experienceMode: "chapter",
        analyticsEnabled: getAnalyticsPreference(target, settings),
        analyticsYear: getAnalyticsYear(target, settings, chapter),
        autoplayEnabled: getAutoplayPreference(target, settings),
        autoplayDelay: getAutoplayDelay(target, settings),
        autoplayTimer: null,
        storyStartedAt: null,
        cardStartedAt: null,
        storyCompletedAt: null,
        soundEnabled: false,
        soundEngine: null
      };
      state.index = settings.initialIndex !== undefined ? settings.initialIndex : getInitialCardIndex(settings.url, state.cards.length);

      target.__jsuWrappedCleanup = installInteraction(target, state);
      applyPageMetadata(state);
      renderStory(target, state);
      activateStory(target, state);
      trackStoryView(state, "initial");
      return state;
    } catch (error) {
      renderError(
        target,
        "We could not load the Wrapped data.",
        "Try refreshing the page. If you opened this file directly, use a small local web server so the JSON file can be fetched."
      );
      return null;
    }
  }

  function autoInit() {
    var doc = root.document;

    if (!doc) {
      return;
    }

    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", function () {
        init();
      }, { once: true });
    } else {
      init();
    }
  }

  autoInit();

  return {
    createCards: createCards,
    findChapter: findChapter,
    formatNumber: formatNumber,
    getStatAnimationConfig: getStatAnimationConfig,
    getKeyNavigationAction: getKeyNavigationAction,
    getChapterSlug: getChapterSlug,
    getRegionParam: getRegionParam,
    getTeenSlug: getTeenSlug,
    getExperienceMode: getExperienceMode,
    getDataUrl: getDataUrl,
    getTeenDataUrl: getTeenDataUrl,
    getBrandChoice: getBrandChoice,
    getSoundProfileForCard: getSoundProfileForCard,
    getAutoplayPreference: getAutoplayPreference,
    getAutoplayDelay: getAutoplayDelay,
    getInitialCardIndex: getInitialCardIndex,
    getAnalyticsPreference: getAnalyticsPreference,
    createAnalyticsPayload: createAnalyticsPayload,
    createPageMetadata: createPageMetadata,
    applyPageMetadata: applyPageMetadata,
    trackAnalyticsEvent: trackAnalyticsEvent,
    trackCardEngagement: trackCardEngagement,
    trackCardView: trackCardView,
    trackStoryView: trackStoryView,
    buildChapterUrl: buildChapterUrl,
    buildRegionUrl: buildRegionUrl,
    buildTeenUrl: buildTeenUrl,
    createFallbackSvg: createFallbackSvg,
    createTeenCards: createTeenCards,
    findTeen: findTeen,
    init: init,
    renderCardBody: renderCardBody,
    renderChapterPickerMarkup: renderChapterPickerMarkup,
    renderStoryMarkup: renderStoryMarkup
  };
});
