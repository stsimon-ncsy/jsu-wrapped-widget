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
  var DEFAULT_CONFIG_PATH = "/wp-content/uploads/wrapped/wrapped-config-{year}.json";
  var WIDGET_ID = "jsu-wrapped";
  var SCRIPT_ELEMENT = root && root.document && root.document.currentScript ? root.document.currentScript : null;
  var SCRIPT_SRC = SCRIPT_ELEMENT ? SCRIPT_ELEMENT.src : "";
  var DEFAULT_AUTOPLAY_DELAY = 5200;
  var SOCIAL_IMAGE_URL = "https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png";
  var customSelectCounter = 0;

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function isSafeStaticUrl(value) {
    var text;
    var parsed;

    if (!hasValue(value)) {
      return true;
    }

    text = String(value).trim();

    if (/[\u0000-\u001F\u007F\s]/.test(text)) {
      return false;
    }

    if (/^https?:\/\//i.test(text)) {
      try {
        parsed = new URL(text);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch (error) {
        return false;
      }
    }

    if (text.indexOf("//") === 0 || /^[a-z][a-z0-9+.-]*:/i.test(text)) {
      return false;
    }

    return text.indexOf("/") === 0 || text.indexOf("./") === 0 || text.indexOf("../") === 0 || text.indexOf("#") === 0 || text.indexOf("?") === 0;
  }

  function decodedText(value) {
    var text = String(value || "").replace(/\+/g, " ");

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
    var raw = String(value || "");
    var text = decodedText(raw).trim();

    return /%7b|%5b|%22(?:cards|metrics|record_overrides|custom_cards|chapters)%22/i.test(raw) || /^[\[{]/.test(text) || text.length > 320 && /["']?[a-z0-9_ -]+["']?\s*:/.test(text);
  }

  function hasCtaUrlPayload(value) {
    var text;
    var parsed;

    if (!hasValue(value)) {
      return false;
    }

    text = String(value).trim();

    if (text.length > 1800 || /%7b|%5b/i.test(text)) {
      return true;
    }

    try {
      parsed = new URL(text, "https://jsu-wrapped.local/");

      var foundPayload = false;

      parsed.searchParams.forEach(function (paramValue, paramName) {
        if (isCtaPayloadParam(paramName) || looksLikeJsonPayload(paramValue)) {
          foundPayload = true;
        }
      });

      return foundPayload;
    } catch (error) {
      return /[?&](wrapped_(submission|config|data|json|metrics|record|records)|builder_(submission|payload)|story_(json|data)|config_json|json|payload|metrics)=/i.test(text);
    }
  }

  function isUsableCtaHref(value) {
    return isSafeStaticUrl(value) && !hasCtaUrlPayload(value);
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

  function sharePathSlug(value) {
    var slug = String(value || "")
      .trim()
      .replace(/[\\/]+/g, "-")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^\.+/, "")
      .replace(/\.+$/, "")
      .replace(/^-+|-+$/g, "");

    return slug || "story";
  }

  function configSlug(value) {
    if (!hasValue(value)) {
      return "";
    }

    return slugify(value);
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

  function getConfigUrl(container) {
    var dataset = (container && container.dataset) || {};
    var year = asText(dataset.year, String(new Date().getFullYear()));
    var explicit = dataset.configSource || dataset.configUrl || dataset.config;

    if (hasValue(explicit)) {
      if (String(explicit).trim().toLowerCase() === "auto") {
        return DEFAULT_CONFIG_PATH.replace("{year}", encodeURIComponent(year));
      }

      return String(explicit).replace("{year}", encodeURIComponent(year));
    }

    return "";
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

  function getVariantSlug(url) {
    return getSearchValue(url, ["variant", "version", "audience"]);
  }

  function getProgramSlug(url) {
    return getSearchValue(url, ["program", "campaign"]);
  }

  function getScopeParam(url) {
    return getSearchValue(url, ["scope", "level", "entity"]);
  }

  function normalizeScopeType(value) {
    var normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

    if (normalized === "chapter" || normalized === "chapters") {
      return "chapter";
    }

    if (normalized === "region" || normalized === "regional" || normalized === "regions") {
      return "region";
    }

    if (normalized === "program" || normalized === "programs" || normalized === "campaign" || normalized === "campaigns") {
      return "program";
    }

    return "";
  }

  function getStoryRequest(url, options) {
    var settings = options || {};
    var href = url || settings.url;
    var chapterSlug = settings.chapter || settings.chapterSlug || getChapterSlug(href);
    var requestedScope = normalizeScopeType(settings.scope || settings.scopeType || getScopeParam(href));
    var regionSlug = settings.region || settings.regionSlug || getRegionParam(href);
    var programSlug = settings.program || settings.programSlug || settings.campaign || getProgramSlug(href);

    if (hasValue(chapterSlug)) {
      return {
        type: "chapter",
        slug: String(chapterSlug).trim()
      };
    }

    if (requestedScope === "region" && hasValue(regionSlug)) {
      return {
        type: "region",
        slug: String(regionSlug).trim()
      };
    }

    if (requestedScope === "program" && hasValue(programSlug)) {
      return {
        type: "program",
        slug: String(programSlug).trim()
      };
    }

    return null;
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

  function getCtaOptions(container, options) {
    var settings = options || {};
    var dataset = (container && container.dataset) || {};

    return {
      label: asText(settings.ctaLabel || dataset.ctaLabel, ""),
      target: asText(settings.ctaTarget || dataset.ctaTarget, ""),
      href: asText(settings.ctaHref || dataset.ctaHref, "")
    };
  }

  function getShareBase(container, options) {
    var settings = options || {};
    var dataset = (container && container.dataset) || {};

    return asText(settings.shareBase || settings.shareBaseUrl || settings.staticShareBase || dataset.shareBase || dataset.shareBaseUrl || dataset.staticShareBase, "");
  }

  function createFormPrefillContext(record, url) {
    var scope = getStoryScope(record);
    var href = asText(url || root && root.location && root.location.href, "");

    return {
      chapter_slug: asText(record && record.chapter_slug, ""),
      chapter_name: asText(record && record.chapter_name, ""),
      region_name: asText(record && record.region_name, ""),
      scope_type: asText(scope.type, ""),
      scope_slug: asText(scope.slug, ""),
      scope_name: asText(scope.name, ""),
      program_slug: asText(record && (record.program_slug || record.campaign_slug), ""),
      program_name: asText(record && (record.program_name || record.campaign_name), ""),
      campaign_slug: asText(record && record.campaign_slug, ""),
      campaign_name: asText(record && record.campaign_name, ""),
      variant_slug: asText(getVariantSlug(href), ""),
      school_name: asText(record && record.school_name, ""),
      school_year: asText(record && record.school_year, ""),
      year_label: asText(record && record.year_label, ""),
      wrapped_url: href
    };
  }

  function createCtaPrefillParams(record, url) {
    var context = createFormPrefillContext(record, url);

    return compactPayload({
      wrapped_source: "jsu_wrapped",
      wrapped_scope: context.scope_type,
      wrapped_slug: context.scope_slug,
      wrapped_name: context.scope_name,
      wrapped_chapter_slug: context.chapter_slug,
      wrapped_chapter: context.chapter_name,
      wrapped_region: context.region_name,
      wrapped_variant: context.variant_slug,
      wrapped_year: context.year_label || context.school_year,
      wrapped_program_slug: context.program_slug,
      wrapped_program: context.program_name,
      wrapped_campaign_slug: context.campaign_slug,
      wrapped_campaign: context.campaign_name,
      wrapped_url: context.wrapped_url
    });
  }

  function createCtaPrefillUrl(href, record, currentUrl) {
    var rawHref = asText(href, "").trim();
    var wrappedUrl = asText(currentUrl || root && root.location && root.location.href, "");
    var baseUrl = wrappedUrl || "https://jsu-wrapped.local/";
    var parsed = null;

    if (!isUsableCtaHref(rawHref)) {
      return "";
    }

    if (rawHref.charAt(0) === "#") {
      return rawHref;
    }

    try {
      parsed = new URL(rawHref, baseUrl);
    } catch (error) {
      return rawHref;
    }

    var params = createCtaPrefillParams(record, wrappedUrl);

    Object.keys(params).forEach(function (key) {
      parsed.searchParams.set(key, params[key]);
    });

    if (/^https?:\/\//i.test(rawHref)) {
      return parsed.toString();
    }

    if (rawHref.charAt(0) === "?") {
      return parsed.search + parsed.hash;
    }

    return parsed.pathname + parsed.search + parsed.hash;
  }

  function selectorEscape(value) {
    if (root.CSS && typeof root.CSS.escape === "function") {
      return root.CSS.escape(value);
    }

    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function prefillKeyFromSignal(signal) {
    var normalized = String(signal || "").toLowerCase().replace(/[_-]+/g, " ");

    if (!normalized) {
      return "";
    }

    if (/\bchapter\s*slug\b/.test(normalized) || /\bchapter\b/.test(normalized) && /\bslug\b/.test(normalized)) {
      return "chapter_slug";
    }

    if (/\bregion\b/.test(normalized)) {
      return "region_name";
    }

    if (/\bscope\s*type\b/.test(normalized) || /\bstory\s*type\b/.test(normalized) || /\bwrapped\s*type\b/.test(normalized)) {
      return "scope_type";
    }

    if (/\bscope\s*slug\b/.test(normalized) || /\bstory\s*slug\b/.test(normalized)) {
      return "scope_slug";
    }

    if (/\bscope\s*name\b/.test(normalized) || /\bstory\s*name\b/.test(normalized)) {
      return "scope_name";
    }

    if (/\bvariant\b/.test(normalized) || /\bversion\b/.test(normalized) || /\baudience\b/.test(normalized)) {
      return "variant_slug";
    }

    if (/\bprogram\s*slug\b/.test(normalized) || /\bcampaign\s*slug\b/.test(normalized)) {
      return "program_slug";
    }

    if (/\bprogram\b/.test(normalized) || /\bcampaign\b/.test(normalized)) {
      return "program_name";
    }

    if (/\bwrapped\b/.test(normalized) && /\b(url|link|page)\b/.test(normalized) || /\bpage\s*(url|link)\b/.test(normalized)) {
      return "wrapped_url";
    }

    if (/\bschool\s*year\b/.test(normalized)) {
      return "school_year";
    }

    if (/\byear\s*label\b/.test(normalized)) {
      return "year_label";
    }

    if (/\bschool\s*name\b/.test(normalized)) {
      return "school_name";
    }

    if (/\bschool\s*\/\s*chapter\b/.test(normalized) || /\bschool\s+or\s+chapter\b/.test(normalized) || /\bchapter\s*name\b/.test(normalized) || /\bchapter\b/.test(normalized)) {
      return "chapter_name";
    }

    return "";
  }

  function fieldSignal(panel, field) {
    var parts = [
      field.getAttribute("data-jsuw-prefill"),
      field.getAttribute("data-jsuw-prefill-field"),
      field.getAttribute("name"),
      field.getAttribute("id"),
      field.getAttribute("class"),
      field.getAttribute("placeholder"),
      field.getAttribute("aria-label")
    ];

    if (field.id && panel && typeof panel.querySelectorAll === "function") {
      Array.prototype.forEach.call(panel.querySelectorAll('label[for="' + selectorEscape(field.id) + '"]'), function (label) {
        parts.push(label.textContent);
      });
    }

    if (field.labels) {
      Array.prototype.forEach.call(field.labels, function (label) {
        parts.push(label.textContent);
      });
    }

    if (typeof field.closest === "function") {
      var wrapper = field.closest(".gfield, .ginput_container, li, p, div");

      if (wrapper) {
        parts.push(wrapper.textContent);
        parts.push(wrapper.getAttribute("class"));
      }
    }

    return parts.filter(Boolean).join(" ");
  }

  function setFieldValue(field, value, force) {
    if (!field || !hasValue(value)) {
      return false;
    }

    if (!force && hasValue(field.value)) {
      return false;
    }

    field.value = value;

    if (field.tagName && field.tagName.toLowerCase() === "input") {
      field.setAttribute("value", value);
    }

    try {
      field.dispatchEvent(new root.Event("input", { bubbles: true }));
      field.dispatchEvent(new root.Event("change", { bubbles: true }));
    } catch (error) {
      return true;
    }

    return true;
  }

  function prefillFormPanel(panel, state) {
    if (!panel || !state) {
      return 0;
    }

    var context = createFormPrefillContext(state.record, root && root.location && root.location.href);
    var fields = panel.querySelectorAll("input, select, textarea");
    var filled = 0;

    panel.setAttribute("data-jsuw-chapter-slug", context.chapter_slug);
    panel.setAttribute("data-jsuw-chapter-name", context.chapter_name);
    panel.setAttribute("data-jsuw-region-name", context.region_name);
    panel.setAttribute("data-jsuw-scope-type", context.scope_type);
    panel.setAttribute("data-jsuw-scope-slug", context.scope_slug);
    panel.setAttribute("data-jsuw-scope-name", context.scope_name);
    panel.setAttribute("data-jsuw-variant-slug", context.variant_slug);

    Array.prototype.forEach.call(fields, function (field) {
      var explicit = field.getAttribute("data-jsuw-prefill") || field.getAttribute("data-jsuw-prefill-field") || "";
      var key = prefillKeyFromSignal(explicit) || prefillKeyFromSignal(fieldSignal(panel, field));
      var value = context[key];

      if (setFieldValue(field, value, field.type === "hidden" || hasValue(explicit))) {
        filled += 1;
      }
    });

    syncEnhancedSelects(panel);

    return filled;
  }

  function customSelectId() {
    customSelectCounter += 1;
    return "jsuw-select-" + customSelectCounter;
  }

  function selectLabel(select) {
    var label = select && select.getAttribute && select.getAttribute("aria-label");

    if (hasValue(label)) {
      return label;
    }

    if (select && select.labels && select.labels.length) {
      label = Array.prototype.map.call(select.labels, function (item) {
        return item.textContent;
      }).filter(Boolean).join(" ");

      if (hasValue(label)) {
        return label;
      }
    }

    if (select && select.id && root.document && typeof root.document.querySelector === "function") {
      try {
        label = root.document.querySelector('label[for="' + selectorEscape(select.id) + '"]');
      } catch (error) {
        label = null;
      }

      if (label && hasValue(label.textContent)) {
        return label.textContent;
      }
    }

    if (select && typeof select.closest === "function") {
      var wrapper = select.closest(".gfield");
      var fieldLabel = wrapper && wrapper.querySelector ? wrapper.querySelector(".gfield_label, .gform-field-label, legend") : null;

      if (fieldLabel && hasValue(fieldLabel.textContent)) {
        return fieldLabel.textContent;
      }
    }

    return "Choose an option";
  }

  function optionLabel(option) {
    return hasValue(option && option.textContent) ? option.textContent.trim() : String(option && option.value || "");
  }

  function setSelectValue(select, value) {
    if (!select) {
      return;
    }

    select.value = value;

    try {
      select.dispatchEvent(new root.Event("input", { bubbles: true }));
      select.dispatchEvent(new root.Event("change", { bubbles: true }));
    } catch (error) {}
  }

  function closeCustomSelect(shell) {
    if (!shell) {
      return;
    }

    shell.removeAttribute("data-jsuw-select-open");

    var button = shell.querySelector && shell.querySelector(".jsuw-select-button");

    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  }

  function closeOtherCustomSelects(doc, currentShell) {
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return;
    }

    Array.prototype.forEach.call(doc.querySelectorAll("#jsu-wrapped-wordpress-shell .jsuw-select-shell[data-jsuw-select-open='true']"), function (shell) {
      if (shell !== currentShell) {
        closeCustomSelect(shell);
      }
    });
  }

  function syncEnhancedSelect(shell) {
    if (!shell || !shell.querySelector) {
      return;
    }

    var select = shell.querySelector("select[data-jsuw-select-enhanced]");
    var text = shell.querySelector(".jsuw-select-button-text");
    var selectedOption = select && select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    var selectedValue = select ? select.value : "";

    if (text) {
      text.textContent = optionLabel(selectedOption);
    }

    Array.prototype.forEach.call(shell.querySelectorAll(".jsuw-select-option"), function (button) {
      var isSelected = button.getAttribute("data-jsuw-select-value") === selectedValue;

      button.classList.toggle("jsuw-select-option--selected", isSelected);
      button.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
  }

  function syncEnhancedSelects(panel) {
    if (!panel || typeof panel.querySelectorAll !== "function") {
      return;
    }

    Array.prototype.forEach.call(panel.querySelectorAll(".jsuw-select-shell"), syncEnhancedSelect);
  }

  function focusCustomSelectOption(shell, direction) {
    if (!shell || !shell.querySelectorAll) {
      return;
    }

    var options = Array.prototype.filter.call(shell.querySelectorAll(".jsuw-select-option"), function (item) {
      return !item.disabled;
    });
    var selected = shell.querySelector(".jsuw-select-option--selected:not(:disabled)");
    var target = selected || options[0];

    if (direction === "last") {
      target = options[options.length - 1] || target;
    }

    if (target && typeof target.focus === "function") {
      target.focus();
    }
  }

  function openCustomSelect(shell) {
    if (!shell || !root.document) {
      return;
    }

    closeOtherCustomSelects(root.document, shell);
    shell.setAttribute("data-jsuw-select-open", "true");

    var button = shell.querySelector && shell.querySelector(".jsuw-select-button");

    if (button) {
      button.setAttribute("aria-expanded", "true");
    }

    syncEnhancedSelect(shell);
  }

  function installCustomSelectDocumentHandlers(doc) {
    if (!doc || doc.__jsuwSelectHandlersInstalled) {
      return;
    }

    doc.__jsuwSelectHandlersInstalled = true;

    doc.addEventListener("click", function (event) {
      var target = event && event.target;

      if (target && typeof target.closest === "function" && target.closest("#jsu-wrapped-wordpress-shell .jsuw-select-shell")) {
        return;
      }

      closeOtherCustomSelects(doc, null);
    });

    doc.addEventListener("keydown", function (event) {
      if (event && event.key === "Escape") {
        closeOtherCustomSelects(doc, null);
      }
    });
  }

  function enhanceFormSelects(panel) {
    if (!panel || !root.document || typeof panel.querySelectorAll !== "function") {
      return 0;
    }

    var enhanced = 0;

    installCustomSelectDocumentHandlers(root.document);

    Array.prototype.forEach.call(panel.querySelectorAll("select:not([multiple])"), function (select) {
      var className = select.getAttribute("class") || "";

      if (
        select.hasAttribute("data-jsuw-select-enhanced") ||
        select.size > 1 ||
        /select2-hidden-accessible|chosen-select/i.test(className) ||
        typeof select.closest === "function" && select.closest(".jsuw-select-shell")
      ) {
        return;
      }

      var parent = select.parentNode;

      if (!parent) {
        return;
      }

      var shell = root.document.createElement("div");
      var button = root.document.createElement("button");
      var buttonText = root.document.createElement("span");
      var menu = root.document.createElement("div");
      var menuId = customSelectId();

      shell.className = "jsuw-select-shell";
      parent.insertBefore(shell, select);
      shell.appendChild(select);

      select.setAttribute("data-jsuw-select-enhanced", "true");
      select.classList.add("jsuw-native-select-hidden");
      select.setAttribute("tabindex", "-1");
      select.setAttribute("aria-hidden", "true");

      button.type = "button";
      button.className = "jsuw-select-button";
      button.setAttribute("aria-haspopup", "listbox");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", menuId);
      button.setAttribute("aria-label", selectLabel(select));

      buttonText.className = "jsuw-select-button-text";
      button.appendChild(buttonText);

      menu.className = "jsuw-select-menu";
      menu.id = menuId;
      menu.setAttribute("role", "listbox");
      menu.setAttribute("aria-label", selectLabel(select));

      Array.prototype.forEach.call(select.options, function (option) {
        var optionButton = root.document.createElement("button");

        optionButton.type = "button";
        optionButton.className = "jsuw-select-option";
        optionButton.textContent = optionLabel(option);
        optionButton.setAttribute("role", "option");
        optionButton.setAttribute("data-jsuw-select-value", option.value);

        if (option.disabled) {
          optionButton.disabled = true;
        }

        optionButton.addEventListener("click", function () {
          if (option.disabled) {
            return;
          }

          setSelectValue(select, option.value);
          syncEnhancedSelect(shell);
          closeCustomSelect(shell);
          button.focus();
        });

        optionButton.addEventListener("keydown", function (event) {
          var options = Array.prototype.filter.call(shell.querySelectorAll(".jsuw-select-option"), function (item) {
            return !item.disabled;
          });
          var index = options.indexOf(optionButton);
          var target = null;

          if (event.key === "ArrowDown") {
            target = options[Math.min(index + 1, options.length - 1)];
          } else if (event.key === "ArrowUp") {
            target = options[Math.max(index - 1, 0)];
          } else if (event.key === "Home") {
            target = options[0];
          } else if (event.key === "End") {
            target = options[options.length - 1];
          } else if (event.key === "Escape") {
            closeCustomSelect(shell);
            button.focus();
            event.preventDefault();
            return;
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            optionButton.click();
            return;
          }

          if (target) {
            event.preventDefault();
            target.focus();
          }
        });

        menu.appendChild(optionButton);
      });

      button.addEventListener("click", function () {
        if (shell.hasAttribute("data-jsuw-select-open")) {
          closeCustomSelect(shell);
        } else {
          openCustomSelect(shell);
        }
      });

      button.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          openCustomSelect(shell);
          focusCustomSelectOption(shell, event.key === "ArrowUp" ? "last" : "first");
        }
      });

      select.addEventListener("change", function () {
        syncEnhancedSelect(shell);
      });

      shell.appendChild(button);
      shell.appendChild(menu);
      syncEnhancedSelect(shell);
      enhanced += 1;
    });

    return enhanced;
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

  function normalizeAnalyticsKey(key) {
    return String(key || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function isTeenAnalyticsIdentifierKey(key) {
    var normalized = normalizeAnalyticsKey(key);
    var blocked = {
      teen_slug: true,
      teen_name: true,
      teen_id: true,
      student_slug: true,
      student_name: true,
      student_id: true,
      participant_id: true,
      person_id: true,
      contact_id: true,
      first_name: true,
      last_name: true,
      full_name: true,
      legal_name: true,
      email: true,
      phone: true,
      mobile: true,
      cell: true,
      address: true,
      birthdate: true,
      birthday: true,
      date_of_birth: true,
      dob: true
    };

    if (blocked[normalized]) {
      return true;
    }

    return /(^|_)(email|phone|mobile|cell|address|birthdate|birthday|dob)($|_)/.test(normalized);
  }

  function safeAnalyticsExtra(mode, extra) {
    var output = {};

    Object.keys(extra || {}).forEach(function (key) {
      if (mode === "teen" && isTeenAnalyticsIdentifierKey(key)) {
        return;
      }

      output[key] = extra[key];
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
    var storyConfig = state && state.storyConfig || {};
    var scope = getStoryScope(record);
    var base = {
      event: eventName,
      wrapped_mode: mode,
      scope_type: scope.type,
      scope_slug: asText(scope.slug, ""),
      scope_name: asText(scope.name, ""),
      wrapped_year: asText(state && state.analyticsYear || record.year_label || record.school_year, ""),
      school_year: asText(record.school_year, ""),
      year_label: asText(record.year_label, ""),
      chapter_slug: asText(record.chapter_slug, ""),
      chapter_id: hasValue(record.chapter_id) ? record.chapter_id : "",
      chapter_name: asText(record.chapter_name, ""),
      region_name: asText(record.region_name, ""),
      variant_slug: asText(storyConfig.active_variant || state && state.variantSlug, ""),
      variant_label: asText(storyConfig.active_variant_label, ""),
      brand_logo: getBrandChoice(record),
      card_index: index + 1,
      card_total: cards.length,
      card_theme: asText(card.theme, ""),
      card_type: asText(card.type, ""),
      is_final_card: cards.length && index === cards.length - 1 ? "true" : "false",
      autoplay_enabled: state && state.autoplayEnabled ? "true" : "false"
    };

    return compactPayload(Object.assign(base, safeAnalyticsExtra(mode, extra || {})));
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
    var brandLabel = "JSU/NCSY Wrapped";
    var mode = asText(state && state.experienceMode, "chapter");

    if (mode === "teen") {
      return {
        title: brandLabel + " - Teen Test Version",
        description: "JSU/NCSY Wrapped teen mode is a proof of concept using sample test data only.",
        image: SOCIAL_IMAGE_URL,
        robots: "noindex,nofollow"
      };
    }

    var scope = getStoryScope(record);
    var chapterName = asText(scope.name, brandLabel);
    var yearLabel = asText(record.year_label || record.school_year, "");
    var regionName = asText(record.region_name, "");
    var descriptionParts = [
      chapterName + " Wrapped",
      yearLabel ? "for " + yearLabel : "",
      regionName ? "- " + regionName : ""
    ].filter(Boolean);

    return {
      title: brandLabel + " - " + chapterName,
      description: descriptionParts.join(" "),
      image: SOCIAL_IMAGE_URL
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

    if (hasValue(metadata.robots)) {
      setDocumentMeta(doc, "name", "robots", metadata.robots);
    }

    setDocumentMeta(doc, "property", "og:type", "website");
    setDocumentMeta(doc, "name", "twitter:card", "summary_large_image");

    if (hasValue(metadata.image)) {
      setDocumentMeta(doc, "property", "og:image", metadata.image);
      setDocumentMeta(doc, "property", "og:image:secure_url", metadata.image);
      setDocumentMeta(doc, "property", "og:image:width", "1200");
      setDocumentMeta(doc, "property", "og:image:height", "630");
      setDocumentMeta(doc, "name", "twitter:image", metadata.image);
    }

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

  function getStoryScope(record) {
    var source = record || {};
    var type = normalizeScopeType(source.scope_type || source.scopeType || source.story_scope || source.storyScope || source.wrapped_scope || source.entity_type);

    if (!type) {
      var hasChapterIdentity = hasValue(source.chapter_slug) || hasValue(source.chapter_name);

      if (!hasChapterIdentity && (hasValue(source.program_slug) || hasValue(source.program_name))) {
        type = "program";
      } else if (!hasChapterIdentity && (hasValue(source.region_slug) || hasValue(source.region_name))) {
        type = "region";
      } else {
        type = "chapter";
      }
    }

    var name = "";
    var slug = "";

    if (type === "region") {
      name = asText(source.scope_name || source.region_name || source.chapter_name, "JSU region");
      slug = asText(source.scope_slug || source.region_slug || slugify(source.region_name || source.scope_name), "");
    } else if (type === "program") {
      name = asText(source.scope_name || source.program_name || source.campaign_name || source.chapter_name || source.top_program_type, "JSU program");
      slug = asText(source.scope_slug || source.program_slug || source.campaign_slug || slugify(source.program_name || source.scope_name || source.top_program_type), "");
    } else {
      name = asText(source.chapter_name || source.scope_name, asText(source.chapter_slug, "Your JSU chapter"));
      slug = asText(source.chapter_slug || source.scope_slug, "");
    }

    return {
      type: type,
      slug: slug,
      name: name,
      noun: type === "region" ? "region" : type === "program" ? "program" : "chapter"
    };
  }

  function recordMatchesStoryRequest(record, request) {
    var scope = getStoryScope(record);
    var requestedType = normalizeScopeType(request && (request.type || request.scopeType || request.scope_type));
    var requestedSlug = configSlug(request && (request.slug || request.scopeSlug || request.scope_slug));

    if (!record || !requestedType || !requestedSlug || scope.type !== requestedType) {
      return false;
    }

    var candidateValues = requestedType === "region" ? [
      scope.slug,
      record.scope_slug,
      record.region_slug,
      record.region_name,
      record.scope_name
    ] : requestedType === "program" ? [
      scope.slug,
      record.scope_slug,
      record.program_slug,
      record.campaign_slug,
      record.program_name,
      record.campaign_name,
      record.top_program_type,
      record.scope_name
    ] : [
      scope.slug,
      record.chapter_slug,
      record.chapter_name,
      record.scope_slug,
      record.scope_name
    ];

    return candidateValues.some(function (value) {
      return hasValue(value) && configSlug(value) === requestedSlug;
    });
  }

  function findStoryRecord(records, request) {
    if (!Array.isArray(records) || !request) {
      return null;
    }

    var type = normalizeScopeType(request.type || request.scopeType || request.scope_type);
    var slug = request.slug || request.scopeSlug || request.scope_slug;

    if (type === "chapter") {
      return findChapter(records, slug);
    }

    for (var index = 0; index < records.length; index += 1) {
      if (recordMatchesStoryRequest(records[index], request)) {
        return records[index];
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

  function buildChapterUrl(record, url, variant) {
    var slug = record && record.chapter_slug;
    var href = url || (root && root.location && root.location.href) || "";
    var base = root && root.location && root.location.href || "https://example.org/";
    var hasVariantArgument = arguments.length >= 3;

    if (!hasValue(slug)) {
      return href || "#";
    }

    try {
      var parsed = new root.URL(href || base, base);
      parsed.searchParams.set("chapter", String(slug).trim());

      if (hasVariantArgument) {
        if (hasValue(variant)) {
          parsed.searchParams.set("variant", String(variant).trim());
        } else {
          parsed.searchParams.delete("variant");
        }
      }

      parsed.searchParams.delete("card");
      return parsed.href;
    } catch (error) {
      var bare = String(href || "").split("#")[0].split("?")[0] || "";
      var query = "?chapter=" + encodeURIComponent(String(slug).trim());

      if (hasVariantArgument && hasValue(variant)) {
        query += "&variant=" + encodeURIComponent(String(variant).trim());
      }

      return bare + query;
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

  function buildScopedStoryUrl(record, url, variant) {
    var scope = getStoryScope(record);
    var href = url || (root && root.location && root.location.href) || "";
    var base = root && root.location && root.location.href || "https://example.org/";
    var hasVariantArgument = arguments.length >= 3;

    if (scope.type === "chapter") {
      return buildChapterUrl(record, url, variant);
    }

    if (!hasValue(scope.slug) || ["region", "program"].indexOf(scope.type) === -1) {
      return href || "#";
    }

    try {
      var parsed = new root.URL(href || base, base);
      parsed.searchParams.set("scope", scope.type);
      parsed.searchParams.delete("chapter");
      parsed.searchParams.delete("card");
      parsed.searchParams.delete("region");
      parsed.searchParams.delete("program");
      parsed.searchParams.delete("campaign");

      if (scope.type === "region") {
        parsed.searchParams.set("region", String(scope.slug).trim());
      } else {
        parsed.searchParams.set("program", String(scope.slug).trim());
      }

      if (hasVariantArgument) {
        if (hasValue(variant)) {
          parsed.searchParams.set("variant", String(variant).trim());
        } else {
          parsed.searchParams.delete("variant");
        }
      }

      return parsed.href;
    } catch (error) {
      var bare = String(href || "").split("#")[0].split("?")[0] || "";
      var query = "?scope=" + encodeURIComponent(scope.type) + (scope.type === "region" ? "&region=" : "&program=") + encodeURIComponent(String(scope.slug).trim());

      if (hasVariantArgument && hasValue(variant)) {
        query += "&variant=" + encodeURIComponent(String(variant).trim());
      }

      return bare + query;
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
    var allRecords = Array.isArray(settings.records) ? settings.records.slice() : [];
    var records = allRecords.filter(function (record) {
      return record && hasValue(record.chapter_slug) && getStoryScope(record).type === "chapter";
    });
    var scopedRecords = allRecords.filter(function (record) {
      var scope = getStoryScope(record);

      return record && scope.type !== "chapter" && hasValue(scope.slug);
    });
    var assetBase = settings.assetBase || "";
    var config = settings.config || {};
    var url = settings.url || (root && root.location && root.location.href) || "";
    var program = settings.program || getProgramSlug(url);
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
      var variants = collectVariantEntries(config, record, { program: program });
      var variantLinks = variants.length ? [
        '<div class="jsuw-picker-variants" aria-label="' + escapeHtml(chapterLabel(record)) + ' versions">',
        '<a href="' + escapeHtml(buildChapterUrl(record, url, "")) + '">Default</a>',
        variants.map(function (variant) {
          return '<a href="' + escapeHtml(buildChapterUrl(record, url, variant.slug)) + '">' + escapeHtml(variant.label) + "</a>";
        }).join(""),
        "</div>"
      ].join("") : "";

      return [
        '<article class="jsuw-picker-entry">',
        '<a class="jsuw-picker-item jsuw-picker-brand--' + escapeHtml(brand) + '" href="' + escapeHtml(buildChapterUrl(record, url, "")) + '">',
        '<span class="jsuw-picker-logo"><img src="' + escapeHtml(logoUrl) + '" alt=""></span>',
        '<span class="jsuw-picker-copy">',
        '<strong>' + escapeHtml(chapterLabel(record)) + "</strong>",
        '<em>' + escapeHtml([school, region].filter(Boolean).join(" | ")) + "</em>",
        stats ? '<span>' + escapeHtml(stats) + "</span>" : "",
        "</span>",
        '<span class="jsuw-picker-arrow" aria-hidden="true">Next</span>',
        "</a>",
        variantLinks,
        "</article>"
      ].join("");
    }

    function scopedStatLine(record) {
      return [
        hasValue(record.events_hosted) ? formatNumber(record.events_hosted) + " programs" : "",
        hasValue(record.unique_teens) ? formatNumber(record.unique_teens) + " teens" : "",
        hasValue(record.engagement_moments) ? formatNumber(record.engagement_moments) + " moments" : "",
        hasValue(record.region_unique_teens) ? formatNumber(record.region_unique_teens) + " region teens" : "",
        hasValue(record.national_engagement_moments) ? formatNumber(record.national_engagement_moments) + " national moments" : ""
      ].filter(Boolean).slice(0, 3).join(" | ");
    }

    function renderScopedStoryItem(record) {
      var scope = getStoryScope(record);
      var brand = getBrandChoice(record);
      var logoUrl = getLogoAsset(brand, assetBase);
      var stats = scopedStatLine(record);
      var label = scope.type === "region" ? "Region story" : "Program story";
      var variants = collectVariantEntries(config, record, { program: scope.type === "program" ? scope.slug : program });
      var variantLinks = variants.length ? [
        '<div class="jsuw-picker-variants" aria-label="' + escapeHtml(scope.name) + ' versions">',
        '<a href="' + escapeHtml(buildScopedStoryUrl(record, url, "")) + '">Default</a>',
        variants.map(function (variant) {
          return '<a href="' + escapeHtml(buildScopedStoryUrl(record, url, variant.slug)) + '">' + escapeHtml(variant.label) + "</a>";
        }).join(""),
        "</div>"
      ].join("") : "";

      return [
        '<article class="jsuw-picker-entry jsuw-picker-entry--scope">',
        '<a class="jsuw-picker-scope-card jsuw-picker-brand--' + escapeHtml(brand) + '" href="' + escapeHtml(buildScopedStoryUrl(record, url, "")) + '">',
        '<span class="jsuw-picker-logo"><img src="' + escapeHtml(logoUrl) + '" alt=""></span>',
        '<span class="jsuw-picker-copy">',
        '<em>' + escapeHtml(label) + "</em>",
        '<strong>' + escapeHtml(scope.name) + "</strong>",
        stats ? '<span>' + escapeHtml(stats) + "</span>" : "",
        "</span>",
        '<span class="jsuw-picker-arrow" aria-hidden="true">Open</span>',
        "</a>",
        variantLinks,
        "</article>"
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

    scopedRecords.sort(function (a, b) {
      var scopeA = getStoryScope(a);
      var scopeB = getStoryScope(b);
      var typeCompare = scopeA.type.localeCompare(scopeB.type);

      return typeCompare || scopeA.name.localeCompare(scopeB.name);
    });

    var scopedStoriesHtml = scopedRecords.length ? [
      '<section class="jsuw-picker-scope-stories" aria-label="Region and program Wrapped stories">',
      '<h2>Bigger stories</h2>',
      '<div class="jsuw-picker-scope-list">',
      scopedRecords.map(renderScopedStoryItem).join(""),
      "</div>",
      "</section>"
    ].join("") : "";

    var teenTestLink = buildTeenUrl({ teen_slug: "maya-test" }, url);

    return [
      '<div class="jsuw-shell jsuw-shell--picker">',
      '<section class="jsuw-picker" aria-labelledby="jsuw-picker-title">',
      '<div class="jsuw-picker-topline">JSU Wrapped | ' + escapeHtml(year) + "</div>",
      '<h1 class="jsuw-picker-title" id="jsuw-picker-title">Choose your chapter</h1>',
      '<p class="jsuw-picker-subtext">Choose a region, then pick a chapter to open its Wrapped story.</p>',
      regionSelector ? '<nav class="jsuw-region-selector" aria-label="Choose a region">' + regionSelector + "</nav>" : "",
      scopedStoriesHtml,
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

  function cloneConfigValue(value) {
    if (Array.isArray(value)) {
      return value.map(cloneConfigValue);
    }

    if (value && typeof value === "object") {
      var output = {};

      Object.keys(value).forEach(function (key) {
        output[key] = cloneConfigValue(value[key]);
      });

      return output;
    }

    return value;
  }

  function uniqueList(values) {
    var seen = {};

    return (values || []).filter(function (value) {
      var normalized = normalizeCardId(value);

      if (!normalized || seen[normalized]) {
        return false;
      }

      seen[normalized] = true;
      return true;
    });
  }

  function mergeCardOverrides(target, source) {
    var output = target || {};

    Object.keys(source || {}).forEach(function (cardId) {
      var normalized = normalizeCardId(cardId);

      if (!normalized) {
        return;
      }

      output[normalized] = Object.assign({}, output[normalized] || {}, cloneConfigValue(source[cardId]));
    });

    return output;
  }

  function mergeStoryConfigSection(target, source) {
    var output = target || {};

    if (!source || typeof source !== "object") {
      return output;
    }

    Object.keys(source).forEach(function (key) {
      var value = source[key];

      if (key === "variants" || key === "label" || key === "name" || key === "title" || key === "description" || key === "hidden_from_picker" || key === "hiddenFromPicker") {
        return;
      }

      if (key === "hidden_cards") {
        output.hidden_cards = uniqueList([].concat(output.hidden_cards || [], value || []));
        return;
      }

      if (key === "custom_cards") {
        output.custom_cards = [].concat(output.custom_cards || [], cloneConfigValue(value || []));
        return;
      }

      if (key === "card_overrides") {
        output.card_overrides = mergeCardOverrides(output.card_overrides || {}, value || {});
        return;
      }

      if (key === "record_overrides") {
        output.record_overrides = Object.assign({}, output.record_overrides || {}, cloneConfigValue(value || {}));
        return;
      }

      output[key] = cloneConfigValue(value);
    });

    return output;
  }

  function configEntryMatches(entry, keys) {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    var normalizedKeys = (keys || []).map(function (key) {
      return configSlug(key);
    }).filter(Boolean);

    return [
      entry.slug,
      entry.scope_slug,
      entry.scope_name,
      entry.region_slug,
      entry.region_name,
      entry.program_slug,
      entry.program_name,
      entry.campaign_slug,
      entry.campaign_name,
      entry.chapter_slug,
      entry.chapter_name,
      entry.id
    ].some(function (value) {
      return hasValue(value) && normalizedKeys.indexOf(configSlug(value)) !== -1;
    });
  }

  function findConfigEntry(collection, keys) {
    if (!collection) {
      return null;
    }

    var normalizedKeys = (keys || []).map(function (key) {
      return configSlug(key);
    }).filter(Boolean);

    if (!normalizedKeys.length) {
      return null;
    }

    if (Array.isArray(collection)) {
      for (var index = 0; index < collection.length; index += 1) {
        if (configEntryMatches(collection[index], normalizedKeys)) {
          return collection[index];
        }
      }

      return null;
    }

    for (var offset = 0; offset < normalizedKeys.length; offset += 1) {
      if (collection[normalizedKeys[offset]]) {
        return collection[normalizedKeys[offset]];
      }
    }

    var collectionKeys = Object.keys(collection);

    for (var keyIndex = 0; keyIndex < collectionKeys.length; keyIndex += 1) {
      if (normalizedKeys.indexOf(configSlug(collectionKeys[keyIndex])) !== -1) {
        return collection[collectionKeys[keyIndex]];
      }
    }

    return null;
  }

  function isVariantHidden(entry, treatHiddenAsUnavailable) {
    var value = entry && (entry.hidden_from_picker !== undefined ? entry.hidden_from_picker : entry.hiddenFromPicker);
    var parsed = parseBooleanFlag(value);

    if (parsed !== null) {
      return parsed;
    }

    return treatHiddenAsUnavailable && value === true;
  }

  function variantLabel(entry, slug) {
    return asText(entry && (entry.label || entry.name || entry.title), slugify(slug).replace(/-/g, " ").replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    }));
  }

  function mergeVariantSection(target, source, variantSlug) {
    var output = mergeStoryConfigSection(target || {}, source);
    var normalized = configSlug(variantSlug);
    var variantEntry = normalized ? findConfigEntry(source && source.variants, [normalized, variantSlug]) : null;

    if (variantEntry) {
      output.active_variant = normalized;
      output.active_variant_label = variantLabel(variantEntry, normalized);
      mergeStoryConfigSection(output, variantEntry);
    }

    return output;
  }

  function collectVariantEntries(config, record, options) {
    var source = config && typeof config === "object" ? config : {};
    var settings = options || {};
    var programSlug = settings.program || settings.programSlug || settings.campaign || record && (record.program_slug || record.program_name || record.program_type || record.top_program_type);
    var regionEntry = findConfigEntry(source.regions, [record && record.region_slug, record && record.region_name]);
    var programEntry = findConfigEntry(source.programs || source.campaigns, [programSlug]);
    var chapterEntry = findConfigEntry(source.chapters, [record && record.chapter_slug, record && record.chapter_name]);
    var entries = {};

    function addVariants(section) {
      var variants = section && section.variants;

      if (!variants) {
        return;
      }

      if (Array.isArray(variants)) {
        variants.forEach(function (entry) {
          var slug = configSlug(entry && (entry.slug || entry.id || entry.label || entry.name || entry.title));

          if (slug && !isVariantHidden(entry, false)) {
            entries[slug] = {
              slug: slug,
              label: variantLabel(entry, slug)
            };
          }
        });

        return;
      }

      Object.keys(variants).forEach(function (key) {
        var entry = variants[key];
        var slug = configSlug(entry && (entry.slug || entry.id) || key);

        if (slug && !isVariantHidden(entry, false)) {
          entries[slug] = {
            slug: slug,
            label: variantLabel(entry, slug)
          };
        }
      });
    }

    [source.defaults, regionEntry, programEntry, chapterEntry].forEach(addVariants);

    return Object.keys(entries).sort(function (a, b) {
      return entries[a].label.localeCompare(entries[b].label);
    }).map(function (slug) {
      return entries[slug];
    });
  }

  function resolveStoryConfig(config, record, options) {
    var output = {};
    var source = config && typeof config === "object" ? config : {};
    var settings = options || {};
    var variantSlug = settings.variant || settings.variantSlug || settings.version || "";
    var programSlug = settings.program || settings.programSlug || settings.campaign || record && (record.program_slug || record.program_name || record.program_type || record.top_program_type);
    var regionEntry = findConfigEntry(source.regions, [record && record.region_slug, record && record.region_name]);
    var programEntry = findConfigEntry(source.programs || source.campaigns, [programSlug]);
    var chapterEntry = findConfigEntry(source.chapters, [record && record.chapter_slug, record && record.chapter_name]);

    mergeVariantSection(output, source.defaults, variantSlug);
    mergeVariantSection(output, regionEntry, variantSlug);
    mergeVariantSection(output, programEntry, variantSlug);
    mergeVariantSection(output, chapterEntry, variantSlug);

    return output;
  }

  function createEffectiveRecord(record, storyConfig) {
    var output = Object.assign({}, record || {});
    var overrides = storyConfig && storyConfig.record_overrides;

    output.__jsuw_original_record = record || {};

    if (overrides && typeof overrides === "object") {
      Object.assign(output, overrides);
    }

    if (hasValue(storyConfig && storyConfig.brand_logo)) {
      output.brand_logo = storyConfig.brand_logo;
    }

    if (hasValue(storyConfig && storyConfig.chapter_persona)) {
      output.chapter_persona = storyConfig.chapter_persona;
    }

    if (hasValue(storyConfig && storyConfig.chapter_line)) {
      output.chapter_line = storyConfig.chapter_line;
    }

    return output;
  }

  function metricTokenValue(record, key) {
    var textFields = {
      largest_event_name: true,
      repeat_attendee_rate_label: true,
      scope_name: true,
      scope_slug: true,
      scope_type: true,
      chapter_name: true,
      program_name: true,
      program_slug: true,
      region_name: true,
      region_slug: true,
      school_name: true,
      year_label: true,
      school_year: true,
      chapter_persona: true
    };
    var value = record && record[key];

    if (!hasValue(value)) {
      return "";
    }

    return textFields[key] ? asText(value) : formatNumber(value);
  }

  function metricTokenMap(record) {
    return {
      events_hosted: metricTokenValue(record, "events_hosted"),
      events: metricTokenValue(record, "events_hosted"),
      unique_teens: metricTokenValue(record, "unique_teens"),
      teens: metricTokenValue(record, "unique_teens"),
      engagement_moments: metricTokenValue(record, "engagement_moments"),
      moments: metricTokenValue(record, "engagement_moments"),
      new_teens: metricTokenValue(record, "new_teens"),
      repeat_attendee_rate_label: metricTokenValue(record, "repeat_attendee_rate_label"),
      repeat_rate: metricTokenValue(record, "repeat_attendee_rate_label"),
      largest_event_name: metricTokenValue(record, "largest_event_name"),
      largest_event_attendance: metricTokenValue(record, "largest_event_attendance"),
      schools_represented: metricTokenValue(record, "schools_represented"),
      learning_sessions: metricTokenValue(record, "learning_sessions"),
      shabbatons: metricTokenValue(record, "shabbatons"),
      region_unique_teens: metricTokenValue(record, "region_unique_teens"),
      region_schools_represented: metricTokenValue(record, "region_schools_represented"),
      national_engagement_moments: metricTokenValue(record, "national_engagement_moments"),
      chapter_name: metricTokenValue(record, "chapter_name"),
      region_name: metricTokenValue(record, "region_name"),
      school_name: metricTokenValue(record, "school_name"),
      year_label: metricTokenValue(record, "year_label"),
      school_year: metricTokenValue(record, "school_year"),
      chapter_persona: metricTokenValue(record, "chapter_persona")
    };
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function replaceChangedMetricValues(text, record) {
    var original = record && record.__jsuw_original_record || {};
    var fields = [
      "events_hosted",
      "unique_teens",
      "engagement_moments",
      "new_teens",
      "repeat_attendee_rate_label",
      "largest_event_attendance",
      "largest_event_name",
      "schools_represented",
      "learning_sessions",
      "shabbatons",
      "region_unique_teens",
      "region_schools_represented",
      "national_engagement_moments"
    ];
    var replacements = [];

    fields.forEach(function (field) {
      var fromValues = [
        metricTokenValue(original, field),
        hasValue(original[field]) ? asText(original[field]) : ""
      ].filter(function (value, index, list) {
        return hasValue(value) && list.indexOf(value) === index;
      });
      var toValue = metricTokenValue(record, field);

      fromValues.forEach(function (fromValue) {
        if (hasValue(toValue) && fromValue !== toValue) {
          replacements.push({ from: fromValue, to: toValue });
        }
      });
    });

    replacements.sort(function (a, b) {
      return b.from.length - a.from.length;
    });

    return replacements.reduce(function (output, replacement) {
      if (!shouldUseLegacyMetricReplacement(replacement.from)) {
        return output;
      }

      return replaceMetricText(output, replacement.from, replacement.to);
    }, String(text));
  }

  function shouldUseLegacyMetricReplacement(value) {
    var text = String(value || "").trim();

    if (text.length < 2) {
      return false;
    }

    if (/^-?\d$/.test(text)) {
      return false;
    }

    return true;
  }

  function replaceMetricText(text, fromValue, toValue) {
    var escaped = escapeRegExp(fromValue);

    if (/^[\d,.\-%]+$/.test(String(fromValue))) {
      return String(text).replace(new RegExp("(^|[^0-9])(" + escaped + ")(?![0-9])", "g"), function (match, prefix) {
        return prefix + toValue;
      });
    }

    return String(text).replace(new RegExp(escaped, "g"), toValue);
  }

  function renderOverrideTemplate(value, record) {
    var tokens = metricTokenMap(record || {});
    var rendered = String(value).replace(/\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}/g, function (match, key) {
      return hasValue(tokens[key]) ? tokens[key] : match;
    });

    return replaceChangedMetricValues(rendered, record);
  }

  function getEffectiveCtaOptions(base, storyConfig) {
    var config = storyConfig || {};
    var rawHref = config.cta_href || config.ctaHref || base && base.href;

    return {
      label: asText(config.cta_label || config.ctaLabel || base && base.label, ""),
      target: asText(config.cta_target || config.ctaTarget || base && base.target, ""),
      href: isUsableCtaHref(rawHref) ? asText(rawHref, "") : ""
    };
  }

  function normalizeCardId(value) {
    var id = slugify(value);
    var aliases = {
      event: "events",
      "events-hosted": "events",
      teens: "reach",
      "teen-reach": "reach",
      "unique-teens": "reach",
      engagement: "moments",
      "engagement-moments": "moments",
      "new-teens": "new",
      "new-faces": "new",
      "repeat-engagement": "repeat",
      "repeat-attendee-rate": "repeat",
      "biggest-event": "biggest",
      "chapter-persona": "persona",
      "bigger-movement": "movement",
      share: "final",
      "final-share": "final"
    };

    return aliases[id] || id;
  }

  function applyCardOverride(card, override, record) {
    var allowed = [
      "eyebrow",
      "displayEyebrow",
      "headline",
      "displayHeadline",
      "subtext",
      "badge",
      "markerText",
      "persona",
      "chapterName",
      "schoolName",
      "yearLabel"
    ];

    allowed.forEach(function (key) {
      if (hasValue(override && override[key])) {
        card[key] = renderOverrideTemplate(override[key], record);
      }
    });

    return card;
  }

  function customCardTheme(type) {
    var normalized = String(type || "text").toLowerCase();

    if (normalized === "metric" || normalized === "stat" || normalized === "number") {
      return "custom-metric";
    }

    if (normalized === "media" || normalized === "photo" || normalized === "image") {
      return "custom-media";
    }

    return "custom-text";
  }

  function createCustomCard(configCard, record, storyConfig, options) {
    var type = String(configCard && configCard.type || "text").toLowerCase();
    var theme = customCardTheme(type);
    var brandChoice = getBrandChoice(record);
    var assetBase = options && options.assetBase || "";
    var storyScope = getStoryScope(record);
    var chapterName = asText(storyScope.name, "Your JSU chapter");
    var value = hasValue(configCard.value) ? renderOverrideTemplate(configCard.value, record) : "";
    var rawImageUrl = configCard.image_url || configCard.imageUrl || configCard.src;

    return {
      id: normalizeCardId(configCard.id || "custom-" + slugify(configCard.headline || type)),
      type: "custom",
      customType: theme.replace("custom-", ""),
      theme: theme,
      palette: asText(storyConfig && (storyConfig.palette || storyConfig.accent_palette), ""),
      eyebrow: hasValue(configCard.eyebrow) ? renderOverrideTemplate(configCard.eyebrow, record) : "Custom screen",
      displayEyebrow: hasValue(configCard.displayEyebrow || configCard.eyebrow) ? renderOverrideTemplate(configCard.displayEyebrow || configCard.eyebrow, record) : "Custom screen",
      headline: hasValue(configCard.headline) ? renderOverrideTemplate(configCard.headline, record) : chapterName + " had a moment worth sharing",
      displayHeadline: hasValue(configCard.displayHeadline || configCard.headline) ? renderOverrideTemplate(configCard.displayHeadline || configCard.headline, record) : chapterName + " had a moment worth sharing",
      stat: value,
      rawValue: numberValue(value),
      statLabel: asText(configCard.label || configCard.statLabel, ""),
      subtext: hasValue(configCard.subtext || configCard.copy) ? renderOverrideTemplate(configCard.subtext || configCard.copy, record) : "",
      badge: hasValue(configCard.badge) ? renderOverrideTemplate(configCard.badge, record) : "",
      imageUrl: isSafeStaticUrl(rawImageUrl) ? asText(rawImageUrl, "") : "",
      imageAlt: asText(configCard.image_alt || configCard.imageAlt || configCard.alt, ""),
      caption: hasValue(configCard.caption) ? renderOverrideTemplate(configCard.caption, record) : "",
      brandChoice: brandChoice,
      logoUrl: getLogoAsset(brandChoice, assetBase)
    };
  }

  function placementIndex(cards, placement) {
    var normalized = String(placement || "before_final").toLowerCase().replace(/[\s-]+/g, "_");

    if (normalized === "start" || normalized === "after_cover") {
      return Math.min(cards.length, 1);
    }

    if (normalized === "before_final") {
      for (var finalIndex = cards.length - 1; finalIndex >= 0; finalIndex -= 1) {
        if (cards[finalIndex].id === "final" || cards[finalIndex].theme === "final") {
          return finalIndex;
        }
      }
    }

    if (normalized === "end" || normalized === "after_final") {
      return cards.length;
    }

    var afterMatch = normalized.match(/^after_(.+)$/);
    var beforeMatch = normalized.match(/^before_(.+)$/);
    var targetId = normalizeCardId(afterMatch && afterMatch[1] || beforeMatch && beforeMatch[1] || normalized);

    for (var index = 0; index < cards.length; index += 1) {
      if (normalizeCardId(cards[index].id || cards[index].theme) === targetId) {
        return afterMatch ? index + 1 : index;
      }
    }

    return cards.length;
  }

  function uniqueCustomCardId(candidate, existingCards, fallback) {
    var existing = {};
    var base = normalizeCardId(candidate || fallback || "custom-screen");
    var next = base;
    var counter = 2;

    (existingCards || []).forEach(function (card) {
      existing[normalizeCardId(card && (card.id || card.theme))] = true;
    });

    if (existing[base] && base.indexOf("custom-") !== 0) {
      base = "custom-" + base;
      next = base;
    }

    while (existing[next]) {
      next = base + "-" + counter;
      counter += 1;
    }

    return next;
  }

  function applyStoryConfig(cards, record, storyConfig, options) {
    var config = storyConfig || {};
    var hidden = uniqueList(config.hidden_cards || []);
    var overrides = config.card_overrides || {};
    var palette = asText(config.palette || config.accent_palette, "");
    var filtered = (cards || []).filter(function (card) {
      var id = normalizeCardId(card.id || card.theme);

      if (id === "cover" || id === "final") {
        return true;
      }

      return hidden.indexOf(id) === -1;
    }).map(function (card) {
      var id = normalizeCardId(card.id || card.theme);
      var next = Object.assign({}, card);

      if (palette) {
        next.palette = palette;
      }

      if (overrides[id]) {
        applyCardOverride(next, overrides[id], record);
      }

      return next;
    });

    (config.custom_cards || []).forEach(function (configCard) {
      if (!configCard || configCard.hidden === true || String(configCard.hidden).toLowerCase() === "true") {
        return;
      }

      var customCard = createCustomCard(configCard, record, config, options);
      customCard.id = uniqueCustomCardId(customCard.id, filtered, "custom-" + slugify(customCard.headline || customCard.customType));
      var index = placementIndex(filtered, configCard.placement || configCard.after || configCard.before);
      filtered.splice(index, 0, customCard);
    });

    return filtered;
  }

  function createCards(record, options) {
    var storyScope = getStoryScope(record);
    var chapterName = asText(storyScope.name, "Your JSU chapter");
    var storyNoun = storyScope.noun;
    var yearLabel = asText(record.year_label || record.school_year, "This year");
    var regionName = asText(record.region_name, "JSU");
    var brandChoice = getBrandChoice(record);
    var brandLabel = brandChoice === "ncsy" ? "NCSY Wrapped" : "JSU Wrapped";
    var assetBase = options && options.assetBase || "";
    var logoUrl = getLogoAsset(brandChoice, assetBase);
    var cta = {
      label: asText(options && options.ctaLabel, ""),
      target: asText(options && options.ctaTarget, ""),
      href: asText(options && options.ctaHref, "")
    };
    var cards = [
      {
        id: "cover",
        type: "cover",
        eyebrow: brandLabel,
        headline: chapterName + ", your year is wrapped",
        displayHeadline: chapterName + ", your year is wrapped",
        displayEyebrow: brandLabel,
        markerText: "and this is our year.",
        regionName: regionName,
        yearLabel: yearLabel,
        subtext: yearLabel + " - " + regionName,
        badge: asText(record.school_name, storyNoun.charAt(0).toUpperCase() + storyNoun.slice(1) + " recap"),
        theme: "cover"
      }
    ];

    if (hasValue(record.events_hosted)) {
      cards.push({
        id: "events",
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
        id: "reach",
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
        id: "moments",
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
        id: "new",
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
        id: "repeat",
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
        id: "biggest",
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
        id: "persona",
        type: "persona",
        eyebrow: storyNoun.charAt(0).toUpperCase() + storyNoun.slice(1) + " type",
        headline: "Your " + storyNoun + " type: " + asText(record.chapter_persona, "The Momentum Maker"),
        displayHeadline: "Your " + storyNoun + " type: " + asText(record.chapter_persona, "The Momentum Maker"),
        displayEyebrow: storyNoun.charAt(0).toUpperCase() + storyNoun.slice(1) + " persona",
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
        id: "movement",
        type: "movement",
        eyebrow: "Bigger movement",
        headline: "You were part of something bigger",
        displayHeadline: "You were part of something bigger",
        displayEyebrow: "Bigger movement",
        chapterName: chapterName,
        stats: movementStats,
        subtext: storyScope.type === "chapter" ? "One chapter. One region. One national movement." : "One " + storyNoun + ". One national movement.",
        theme: "movement"
      });
    }

    cards.push({
      id: "final",
      type: "final",
      eyebrow: "Ready to share",
      headline: chapterName + " Wrapped",
      displayHeadline: chapterStoryTitle(chapterName) + "\nWrapped",
      chapterName: chapterName,
      schoolName: asText(record.school_name, "JSU"),
      yearLabel: yearLabel,
      summaryStats: [
        hasValue(record.events_hosted) ? { value: formatNumber(record.events_hosted), label: "programs together" } : null,
        hasValue(record.unique_teens) ? { value: formatNumber(record.unique_teens), label: "of us, one " + storyNoun } : null,
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
      theme: "final",
      cta: hasValue(cta.label) && (hasValue(cta.target) || hasValue(cta.href)) ? cta : null
    });

    cards.forEach(function (card) {
      card.brandChoice = brandChoice;
      card.logoUrl = logoUrl;
    });

    return applyStoryConfig(cards, record, options && options.storyConfig, options);
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

  function renderCustomTextBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<div class="jsuw-custom-note">',
      hasValue(card.badge) ? '<span>' + escapeHtml(card.badge) + "</span>" : "",
      '<p>' + escapeHtml(card.subtext || "A custom chapter moment worth sharing.") + "</p>",
      "</div>"
    ].join(""));
  }

  function renderCustomMetricBody(card) {
    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<div class="jsuw-custom-stat">',
      hasValue(card.stat) ? renderStatNumber(card, "jsuw-reference-stat jsuw-reference-stat--custom") : "",
      hasValue(card.statLabel) ? '<span>' + escapeHtml(card.statLabel) + "</span>" : "",
      "</div>",
      hasValue(card.subtext) ? '<p class="jsuw-subtext jsuw-subtext--center">' + escapeHtml(card.subtext) + "</p>" : ""
    ].join(""));
  }

  function renderCustomMediaBody(card) {
    var media = hasValue(card.imageUrl)
      ? '<img src="' + escapeHtml(card.imageUrl) + '" alt="' + escapeHtml(card.imageAlt || card.caption || "") + '">'
      : '<div class="jsuw-custom-media-placeholder">Add an image URL in the builder</div>';

    return renderReferenceShell(card, [
      '<div class="jsuw-reference-top">',
      renderTopMatter(card),
      "</div>",
      '<figure class="jsuw-custom-media-frame">',
      media,
      hasValue(card.caption || card.subtext) ? '<figcaption>' + escapeHtml(card.caption || card.subtext) + "</figcaption>" : "",
      "</figure>"
    ].join(""));
  }

  function renderFinalBody(card) {
    var stats = (card.summaryStats || []).map(function (stat, index) {
      return '<div style="--i:' + index + '"><span>' + escapeHtml(stat.label) + "</span><strong>" + escapeHtml(stat.value) + "</strong></div>";
    }).join("");
    var hasCta = card.cta && hasValue(card.cta.label) && (hasValue(card.cta.target) || hasValue(card.cta.href));
    var actionButtons = [
      hasCta ? '<button class="jsuw-action-button jsuw-action-button--primary jsuw-action-button--cta" type="button" data-jsuw-action="cta" data-jsuw-cta-label="' + escapeHtml(card.cta.label) + '" data-jsuw-cta-target="' + escapeHtml(card.cta.target || "") + '" data-jsuw-cta-href="' + escapeHtml(card.cta.href || "") + '">' + escapeHtml(card.cta.label) + "</button>" : "",
      '<button class="jsuw-action-button' + (hasCta ? "" : " jsuw-action-button--primary") + '" type="button" data-jsuw-action="share">Share this recap</button>',
      '<button class="jsuw-action-button" type="button" data-jsuw-action="download">Download image</button>'
    ].filter(Boolean).join("");

    return renderReferenceShell(card, [
      '<div class="jsuw-share-poster' + (hasCta ? " jsuw-share-poster--with-cta" : "") + '">',
      renderBrandLockup(card),
      '<h2 class="' + getHeadlineClass(card) + '">' + htmlWithBreaks(card.displayHeadline || card.headline) + "</h2>",
      '<p class="jsuw-share-copy">' + escapeHtml(card.subtext || "") + "</p>",
      '<div class="jsuw-share-stats">' + stats + "</div>",
      '<div class="jsuw-share-energy">' + escapeHtml(card.persona || "JSU energy") + "</div>",
      '<div class="jsuw-share-school">' + escapeHtml((card.schoolName || "JSU") + " - " + (card.yearLabel || "This year")) + "</div>",
      "</div>",
      '<div class="jsuw-final-actions' + (hasCta ? " jsuw-final-actions--with-cta" : "") + '">',
      actionButtons,
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

    if (card.theme === "custom-text") {
      return renderCustomTextBody(card);
    }

    if (card.theme === "custom-metric") {
      return renderCustomMetricBody(card);
    }

    if (card.theme === "custom-media") {
      return renderCustomMediaBody(card);
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
    var paletteClass = hasValue(card.palette) ? " jsuw-palette-" + escapeHtml(slugify(card.palette)) : "";
    var storyClass = "jsuw-story jsuw-story-theme-" + escapeHtml(card.theme) + paletteClass + (autoplayActive ? " jsuw-story--autoplay" : "");
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

  function revealCtaTarget(container, state, trigger) {
    var card = state && state.cards ? state.cards[state.index] : {};
    var cta = card && card.cta || {};
    var label = asText(trigger && trigger.getAttribute("data-jsuw-cta-label") || cta.label, "Wrapped interest");
    var targetSelector = asText(trigger && trigger.getAttribute("data-jsuw-cta-target") || cta.target, "");
    var href = asText(trigger && trigger.getAttribute("data-jsuw-cta-href") || cta.href, "");
    var safeHref = isUsableCtaHref(href) ? href : "";
    var prefilledHref = safeHref ? createCtaPrefillUrl(safeHref, state.record, root && root.location && root.location.href) : "";
    var panel = null;

    trackAnalyticsEvent(state, "jsu_wrapped_cta_click", {
      cta_label: label,
      cta_target: targetSelector,
      cta_href: prefilledHref || safeHref
    });

    if (hasValue(targetSelector) && root.document && typeof root.document.querySelector === "function") {
      try {
        panel = root.document.querySelector(targetSelector);
      } catch (error) {
        panel = null;
      }
    }

    if (panel) {
      panel.hidden = false;
      panel.removeAttribute("hidden");
      panel.classList.add("jsuw-form-panel--open");
      panel.setAttribute("aria-hidden", "false");

      if (typeof panel.closest === "function") {
        var wordpressShell = panel.closest("#jsu-wrapped-wordpress-shell");

        if (wordpressShell) {
          wordpressShell.classList.add("jsuw-form-active");
        }
      }

      prefillFormPanel(panel, state);
      enhanceFormSelects(panel);

      if (root.setTimeout) {
        root.setTimeout(function () {
          prefillFormPanel(panel, state);
          enhanceFormSelects(panel);
          syncEnhancedSelects(panel);
        }, 350);
      }

      setStatus(container, "Interest form opened below.");

      try {
        panel.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      } catch (error) {
        panel.scrollIntoView();
      }

      var focusTarget = panel.querySelector(".jsuw-select-button, input, textarea, button, a[href], [tabindex]:not([tabindex='-1']), select:not(.jsuw-native-select-hidden)");

      if (focusTarget && typeof focusTarget.focus === "function") {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (focusError) {
          focusTarget.focus();
        }
      }

      return;
    }

    if (hasValue(prefilledHref || safeHref) && root.location) {
      root.location.href = prefilledHref || safeHref;
      return;
    }

    if (hasValue(href)) {
      setStatus(container, "CTA link is not available.");
      return;
    }

    setStatus(container, "Use the interest form below to connect with JSU/NCSY.");
  }

  function installInteraction(container, state) {
    function runAction(action, options, trigger) {
      if (action === "prev") {
        previous(container, state, options);
      } else if (action === "next") {
        next(container, state, options);
      } else if (action === "cta") {
        revealCtaTarget(container, state, trigger);
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
        runAction(action, {}, actionTarget);

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
          runAction(actionTarget.getAttribute("data-jsuw-action"), { focusStory: true }, actionTarget);
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

    var scope = getStoryScope(record);
    var chapterName = asText(scope.name, "Our JSU chapter");

    return [
      chapterName + " Wrapped:",
      hasValue(record.events_hosted) ? formatNumber(record.events_hosted) + " events" : "",
      hasValue(record.unique_teens) ? formatNumber(record.unique_teens) + " teens" : "",
      hasValue(record.engagement_moments) ? formatNumber(record.engagement_moments) + " engagement moments" : "",
      hasValue(record.chapter_persona) ? asText(record.chapter_persona) + " energy" : ""
    ].filter(Boolean).join(" - ");
  }

  function createShareUrl(state, currentUrl) {
    var fallback = asText(currentUrl || root.location && root.location.href, "");
    var record = state && state.record || {};
    var scope = getStoryScope(record);
    var shareBase = asText(state && state.shareBase, "");

    if (!shareBase || state && state.experienceMode === "teen" || ["chapter", "region", "program"].indexOf(scope.type) === -1 || !hasValue(scope.slug)) {
      return fallback;
    }

    try {
      var base = new URL(shareBase, fallback || root.location && root.location.href || "https://example.org/");
      var baseHref = base.href.charAt(base.href.length - 1) === "/" ? base.href : base.href + "/";
      var scopeSlug = encodeURIComponent(sharePathSlug(scope.slug));
      var scopePath = scope.type === "chapter" ? scopeSlug + "/" : scope.type + "/" + scopeSlug + "/";
      var shareUrl = new URL(scopePath, baseHref);
      var variant = asText(state && (state.variantSlug || state.storyConfig && state.storyConfig.active_variant), "");

      if (hasValue(variant)) {
        shareUrl.searchParams.set("variant", variant);
      }

      try {
        var sourceParams = new URL(fallback || root.location && root.location.href || "https://example.org/").searchParams;

        ["program", "campaign", "autoplay", "duration"].forEach(function (key) {
          if ((key === "program" || key === "campaign") && scope.type === "program") {
            return;
          }

          var value = sourceParams.get(key);

          if (hasValue(value)) {
            shareUrl.searchParams.set(key, value);
          }
        });
      } catch (sourceError) {
        if (scope.type !== "program" && hasValue(state && state.programSlug)) {
          shareUrl.searchParams.set("program", String(state.programSlug).trim());
        }
      }

      if (scope.type !== "program" && !shareUrl.searchParams.has("program") && !shareUrl.searchParams.has("campaign") && hasValue(state && state.programSlug)) {
        shareUrl.searchParams.set("program", String(state.programSlug).trim());
      }

      return shareUrl.href;
    } catch (error) {
      return fallback;
    }
  }

  async function shareRecap(container, state) {
    var metadata = createPageMetadata(state);
    var data = {
      title: metadata.title,
      text: shareText(state),
      url: createShareUrl(state)
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

  function estimateSvgTextWidth(text, size) {
    return String(text || "").length * size * 0.58;
  }

  function fitSvgFontSize(text, maxWidth, maxSize, minSize) {
    var size = maxSize;

    while (size > minSize && estimateSvgTextWidth(text, size) > maxWidth) {
      size -= 2;
    }

    return Math.max(minSize, size);
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

  function splitSvgLinesByWidth(value, maxWidth, size, maxLines) {
    var words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    var lines = [];
    var current = "";

    words.forEach(function (word) {
      var next = current ? current + " " + word : word;

      if (current && estimateSvgTextWidth(next, size) > maxWidth) {
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

  function svgFittedLine(text, x, y, maxWidth, maxSize, minSize, weight, fill, className) {
    var size = fitSvgFontSize(text, maxWidth, maxSize, minSize);

    return '<text class="' + escapeXml(className || "") + '" x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + weight + '" fill="' + fill + '" font-family="Arial, Helvetica, sans-serif">' + escapeXml(text) + "</text>";
  }

  function svgTextLines(lines, x, y, size, weight, fill, lineHeight, className, maxWidth, minSize) {
    return lines.map(function (line, index) {
      if (maxWidth) {
        return svgFittedLine(line, x, y + index * lineHeight, maxWidth, size, minSize || Math.max(18, size - 16), weight, fill, className);
      }

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
        '<rect class="poster-logo-frame" x="78" y="92" width="168" height="168" rx="34" fill="#071464" stroke="#ffffff" stroke-width="5" opacity="0.98"/>',
        '<image class="poster-logo-image" href="' + escapeXml(logoDataUrl) + '" x="100" y="114" width="124" height="124" preserveAspectRatio="xMidYMid meet"/>'
      ].join("");
    }

    return [
      '<rect class="poster-logo-frame" x="78" y="92" width="168" height="168" rx="34" fill="#071464" stroke="#ffffff" stroke-width="5" opacity="0.98"/>',
      '<text class="poster-logo-text" x="112" y="192" font-size="' + (brand === "ncsy" ? 40 : 56) + '" font-weight="900" fill="#ffffff" font-family="Arial, Helvetica, sans-serif">' + escapeXml(brandText) + "</text>"
    ].join("");
  }

  function fallbackSummaryText(record, card, persona, isTeen) {
    if (isTeen) {
      var teenSummary = [
        hasValue(record.events_attended) ? formatNumber(record.events_attended) + " events" : "",
        hasValue(record.longest_streak) ? formatNumber(record.longest_streak) + " event streak" : "",
        hasValue(record.friends_brought) ? formatNumber(record.friends_brought) + " friends brought" : ""
      ].filter(Boolean).join(". ");

      return card.subtext || (teenSummary ? teenSummary + "." : persona + " energy.");
    }

    var chapterSummary = [
      hasValue(record.events_hosted) ? formatNumber(record.events_hosted) + " events" : "",
      hasValue(record.unique_teens) ? formatNumber(record.unique_teens) + " teens" : "",
      hasValue(record.engagement_moments) ? formatNumber(record.engagement_moments) + " engagement moments" : ""
    ].filter(Boolean).join(". ");

    return chapterSummary ? chapterSummary + "." : card.subtext || persona + " energy.";
  }

  function fallbackStatRows(stats, startY, rowGap) {
    return (stats || []).slice(0, 5).map(function (stat, index) {
      var y = startY + index * (rowGap || 108);
      var valueSize = String(stat.value || "").length > 6 ? 46 : 52;
      var labelLines = splitSvgLinesByWidth(stat.label, 540, 30, 2);
      var labelY = labelLines.length > 1 ? 43 : 57;
      var labelLineHeight = labelLines.length > 1 ? 32 : 0;

      return [
        '<g transform="translate(92 ' + y + ')">',
        '<rect width="896" height="88" rx="26" fill="#ffffff" opacity="' + (index % 2 ? "0.16" : "0.22") + '"/>',
        svgFittedLine(stat.value, 34, 59, 230, valueSize, 34, 900, "#ffffff", "poster-stat-value"),
        svgTextLines(labelLines, 310, labelY, 30, 800, "#fff4b7", labelLineHeight, "poster-stat-label", 540, 22),
        "</g>"
      ].join("");
    }).join("");
  }

  function fallbackCtaMarkup(label, y) {
    var ctaLabel = asText(label, "").trim();

    if (!ctaLabel) {
      return "";
    }

    return [
      '<g class="poster-cta" transform="translate(92 ' + y + ')">',
      '<rect width="896" height="74" rx="37" fill="#fff4b7" opacity="0.98"/>',
      svgFittedLine(ctaLabel, 126, 49, 644, 32, 24, 900, "#16032f", "poster-cta-label"),
      svgFittedLine("Tap the link to connect", 710, 49, 232, 24, 18, 800, "#16032f", "poster-cta-action"),
      "</g>"
    ].join("");
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
    var scope = getStoryScope(record);
    var storyNoun = scope.noun;
    var teenName = asText(record.teen_name || record.student_name || record.first_name, "Maya");
    var chapterName = isTeen ? teenName + "'s JSU" : asText(scope.name, "JSU Wrapped");
    var persona = isTeen ? asText(card.persona || record.persona, "JSU energy") : asText(card.persona || record.chapter_persona, "JSU energy");
    var year = asText(card.yearLabel || record.year_label || record.school_year, "This year");
    var brand = card.brandChoice === "ncsy" || getBrandChoice(record) === "ncsy" ? "ncsy" : "jsu";
    var headlineLines = splitSvgLinesByWidth(chapterName, 880, 88, 2).concat(["Wrapped"]);
    var headlineSize = headlineLines.length > 2 ? 82 : 96;
    var headlineLineHeight = headlineLines.length > 2 ? 90 : 104;
    var headlineY = 410;
    var personaText = persona + " energy";
    var personaLines = splitSvgLinesByWidth(personaText, 820, 40, 2);
    var personaFontSize = personaLines.length > 1 ? 32 : fitSvgFontSize(personaText, 820, 40, 28);
    var personaLineHeight = personaLines.length > 1 ? 36 : 0;
    var personaPillHeight = personaLines.length > 1 ? 122 : 82;
    var personaY = Math.max(706, headlineY + headlineLines.length * headlineLineHeight + 42);
    var summaryY = personaY + personaPillHeight + 62;
    var summaryLineHeight = 48;
    var summaryLines = splitSvgLinesByWidth(fallbackSummaryText(record, card, persona, isTeen), 872, 40, 3);
    var ctaLabel = card.cta && hasValue(card.cta.label) ? card.cta.label : "";
    var hasCta = hasValue(ctaLabel);
    var ctaY = 1660;
    var footerY = hasCta ? 1774 : 1718;
    var footerTextY = hasCta ? 1822 : 1766;
    var stats = card.summaryStats || [
      hasValue(record.events_hosted || record.events_attended) ? { value: formatNumber(record.events_hosted || record.events_attended), label: isTeen ? "events showed up to" : "programs together" } : null,
      hasValue(record.unique_teens || record.longest_streak) ? { value: formatNumber(record.unique_teens || record.longest_streak), label: isTeen ? "event streak" : "of us, one " + storyNoun } : null,
      hasValue(record.engagement_moments || record.friends_brought) ? { value: formatNumber(record.engagement_moments || record.friends_brought), label: isTeen ? "friends brought" : "moments stacked up" } : null
    ].filter(Boolean);
    var statCount = Math.min(5, stats.length || 3);
    var rowGap = statCount > 4 ? 98 : 108;
    var statsStartY = Math.max(1054, summaryY + summaryLines.length * summaryLineHeight + 46);
    var statsBottomLimit = (hasCta ? ctaY - 24 : 1688) - ((statCount - 1) * rowGap + 88);
    statsStartY = Math.min(statsStartY, statsBottomLimit);

    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">',
      "<title>" + escapeXml(chapterName + " Wrapped - " + persona) + "</title>",
      "<defs>",
      '<linearGradient id="posterBg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#1019aa"/><stop offset="0.38" stop-color="#6928ff"/><stop offset="0.7" stop-color="#ff3b91"/><stop offset="1" stop-color="#ffc400"/></linearGradient>',
      '<radialGradient id="posterGlow" cx="50%" cy="34%" r="65%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/><stop offset="0.52" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>',
      '<filter id="posterShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="#18002e" flood-opacity="0.35"/></filter>',
      '<style>.poster-headline{letter-spacing:0}.confetti{mix-blend-mode:screen}</style>',
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
      svgTextLines(headlineLines, 92, headlineY, headlineSize, 900, "#ffffff", headlineLineHeight, "poster-headline", 896, 60),
      '<rect x="92" y="' + personaY + '" width="896" height="' + personaPillHeight + '" rx="41" fill="#fff4b7" opacity="0.96"/>',
      svgTextLines(personaLines, 126, personaY + (personaLines.length > 1 ? 45 : 56), personaFontSize, 900, "#16032f", personaLineHeight, "poster-persona", 820, 24),
      svgTextLines(summaryLines, 92, summaryY, 40, 800, "#ffffff", summaryLineHeight, "poster-copy", 896, 28),
      fallbackStatRows(stats, statsStartY, rowGap),
      fallbackCtaMarkup(ctaLabel, ctaY),
      '<rect x="92" y="' + footerY + '" width="896" height="72" rx="36" fill="#ffffff" opacity="0.16"/>',
      svgFittedLine(asText(record.region_name, "One movement") + " - One " + storyNoun + ". One movement.", 126, footerTextY, 828, 31, 22, 800, "#ffffff", "poster-footer"),
      "</svg>"
    ].join("");
  }

  async function downloadRecap(container, state) {
    var scope = state && state.record ? getStoryScope(state.record) : null;
    var filename = state && state.experienceMode === "teen" ? slugify(state.record.teen_slug || state.record.student_slug || state.record.teen_name || "teen-test") + "-teen-wrapped.svg" : slugify(scope && (scope.slug || scope.name) || state.record.chapter_slug || state.record.chapter_name) + "-wrapped.svg";
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

  async function fetchConfig(url) {
    if (!hasValue(url)) {
      return {};
    }

    try {
      return await fetchRecords(url);
    } catch (error) {
      return {};
    }
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

    target.innerHTML = '<div class="jsuw-shell jsuw-shell--loading"><section class="jsuw-loading" role="status">Loading JSU Wrapped...</section></div>';

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
          shareBase: getShareBase(target, settings),
          soundEnabled: false,
          soundEngine: null
        };
        teenState.index = settings.initialIndex !== undefined ? settings.initialIndex : getInitialCardIndex(settings.url, teenState.cards.length);

        target.__jsuWrappedCleanup = installInteraction(target, teenState);
        if (settings.metadata !== false && settings.updateMetadata !== false) {
          applyPageMetadata(teenState);
        }
        renderStory(target, teenState);
        activateStory(target, teenState);
        trackStoryView(teenState, "initial");
        return teenState;
      }

      var dataUrl = settings.dataUrl || getDataUrl(target);
      var records = settings.records || await fetchRecords(dataUrl);
      var configUrl = settings.configUrl !== undefined ? settings.configUrl : getConfigUrl(target);
      var wrappedConfig = settings.config !== undefined ? settings.config : await fetchConfig(configUrl);
      var storyRequest = getStoryRequest(settings.url, settings);
      var variantSlug = settings.variant || getVariantSlug(settings.url);
      var programSlug = settings.program || getProgramSlug(settings.url);
      var ctaOptions = getCtaOptions(target, settings);

      if (!storyRequest) {
        renderChapterPicker(target, {
          records: records,
          year: target.dataset && target.dataset.year,
          region: settings.region || getRegionParam(settings.url),
          program: programSlug,
          config: wrappedConfig,
          url: settings.url,
          assetBase: assetBase
        });
        return {
          picker: true,
          records: records,
          config: wrappedConfig
        };
      }

      var storyRecord = findStoryRecord(records, storyRequest);

      if (!storyRecord) {
        renderError(
          target,
          "We could not find that " + storyRequest.type + ".",
          "Check the Wrapped link or ask your JSU or NCSY team for the right URL."
        );
        return null;
      }

      var storyScope = getStoryScope(storyRecord);
      var storyConfig = resolveStoryConfig(wrappedConfig, storyRecord, {
        variant: variantSlug,
        program: programSlug
      });
      var effectiveRecord = createEffectiveRecord(storyRecord, storyConfig);
      var effectiveCtaOptions = getEffectiveCtaOptions(ctaOptions, storyConfig);

      var state = {
        cards: createCards(effectiveRecord, {
          assetBase: assetBase,
          ctaLabel: effectiveCtaOptions.label,
          ctaTarget: effectiveCtaOptions.target,
          ctaHref: effectiveCtaOptions.href,
          storyConfig: storyConfig
        }),
        record: effectiveRecord,
        config: wrappedConfig,
        storyConfig: storyConfig,
        variantSlug: variantSlug,
        programSlug: programSlug,
        experienceMode: storyScope.type,
        analyticsEnabled: getAnalyticsPreference(target, settings),
        analyticsYear: getAnalyticsYear(target, settings, effectiveRecord),
        autoplayEnabled: getAutoplayPreference(target, settings),
        autoplayDelay: getAutoplayDelay(target, settings),
        autoplayTimer: null,
        storyStartedAt: null,
        cardStartedAt: null,
        storyCompletedAt: null,
        shareBase: getShareBase(target, settings),
        soundEnabled: false,
        soundEngine: null
      };
      state.index = settings.initialIndex !== undefined ? settings.initialIndex : getInitialCardIndex(settings.url, state.cards.length);

      target.__jsuWrappedCleanup = installInteraction(target, state);
      if (settings.metadata !== false && settings.updateMetadata !== false) {
        applyPageMetadata(state);
      }
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

    if (SCRIPT_ELEMENT && parseBooleanFlag(SCRIPT_ELEMENT.getAttribute("data-manual") || SCRIPT_ELEMENT.getAttribute("data-no-auto-init")) === true) {
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
    findStoryRecord: findStoryRecord,
    formatNumber: formatNumber,
    getStatAnimationConfig: getStatAnimationConfig,
    getKeyNavigationAction: getKeyNavigationAction,
    getChapterSlug: getChapterSlug,
    getRegionParam: getRegionParam,
    getScopeParam: getScopeParam,
    getStoryRequest: getStoryRequest,
    getStoryScope: getStoryScope,
    getTeenSlug: getTeenSlug,
    getExperienceMode: getExperienceMode,
    getDataUrl: getDataUrl,
    getTeenDataUrl: getTeenDataUrl,
    getConfigUrl: getConfigUrl,
    getBrandChoice: getBrandChoice,
    isSafeStaticUrl: isSafeStaticUrl,
    getSoundProfileForCard: getSoundProfileForCard,
    getAutoplayPreference: getAutoplayPreference,
    getAutoplayDelay: getAutoplayDelay,
    getInitialCardIndex: getInitialCardIndex,
    getAnalyticsPreference: getAnalyticsPreference,
    createAnalyticsPayload: createAnalyticsPayload,
    createPageMetadata: createPageMetadata,
    createShareUrl: createShareUrl,
    applyPageMetadata: applyPageMetadata,
    trackAnalyticsEvent: trackAnalyticsEvent,
    trackCardEngagement: trackCardEngagement,
    trackCardView: trackCardView,
    trackStoryView: trackStoryView,
    buildChapterUrl: buildChapterUrl,
    buildScopedStoryUrl: buildScopedStoryUrl,
    buildRegionUrl: buildRegionUrl,
    buildTeenUrl: buildTeenUrl,
    createFormPrefillContext: createFormPrefillContext,
    createCtaPrefillUrl: createCtaPrefillUrl,
    enhanceFormSelects: enhanceFormSelects,
    createFallbackSvg: createFallbackSvg,
    getVariantSlug: getVariantSlug,
    getProgramSlug: getProgramSlug,
    collectVariantEntries: collectVariantEntries,
    resolveStoryConfig: resolveStoryConfig,
    createEffectiveRecord: createEffectiveRecord,
    applyStoryConfig: applyStoryConfig,
    createTeenCards: createTeenCards,
    findTeen: findTeen,
    init: init,
    renderCardBody: renderCardBody,
    renderChapterPickerMarkup: renderChapterPickerMarkup,
    renderStoryMarkup: renderStoryMarkup
  };
});
