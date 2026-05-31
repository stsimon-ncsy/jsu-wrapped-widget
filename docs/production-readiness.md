# JSU/NCSY Wrapped Production Readiness

This widget is static-hosting friendly: the public experience is driven by `jsu-wrapped.js`, `jsu-wrapped.css`, `sample-wrapped-2026.json`, and `wrapped-config-2026.json`.

## Pre-Publish Checks

Run these before copying files to WordPress or relying on GitHub Pages:

```powershell
node --check jsu-wrapped.js
node --check wrapped-builder.js
node qa-smoke.js
git diff --check
```

Then smoke these URLs:

```text
http://127.0.0.1:55707/?chapter=baltimore
http://127.0.0.1:55707/?chapter=baltimore&variant=donor-recap&card=2
http://127.0.0.1:55707/builder.html
```

## Variant Model

Variants are layered overlays. The renderer resolves them in this order:

```text
defaults -> defaults.variants[variant]
region -> region.variants[variant]
program/campaign -> program/campaign.variants[variant]
chapter -> chapter.variants[variant]
```

That keeps chapter, region, and future cross-region program versions on the same pattern.

Public URLs:

```text
/?chapter=baltimore
/?chapter=baltimore&variant=donor-recap
/?chapter=baltimore&program=shabbat&variant=recruitment
```

Future region or cross-region program stories should use explicit story scope URLs so the picker can keep using plain `?region=` as a filter:

```text
/?scope=region&region=atlantic-seaboard
/?scope=program&program=shabbat
/?scope=program&program=shabbat&variant=recruitment
```

Those URLs expect first-class records in the JSON with fields such as `scope_type`, `scope_slug`, and `scope_name`. Do not fake a region/program as a chapter record; use the scope fields and let the renderer normalize it as the story subject.

Hidden variants can be linked directly but will not appear in the picker:

```json
{
  "hidden_from_picker": true
}
```

## Data Consistency

Metric corrections belong in `record_overrides`. They are applied before cards are generated, so corrected stats flow into:

- generated card numbers
- generated headlines/subtext
- final card summary stats
- share/download SVG fallback
- analytics payloads

Use placeholders in edited copy and custom screens when a number or chapter field should stay dynamic:

```text
{events_hosted}
{unique_teens}
{engagement_moments}
{chapter_name}
```

The builder stores placeholder templates behind the scenes so corrected metrics do not drift from edited copy.

## Share/Download Fallback

The download button prefers `html2canvas` when available. If it is not available, the widget generates a static SVG poster locally in the browser.

`node qa-smoke.js` includes SVG fallback checks for:

- real chapter data
- long chapter/persona copy
- missing broken text such as `undefined`, `null`, or `NaN`
- variant-aware generated copy

## WordPress Inline Embed

`wordpress-inline-embed.html` contains the current inline CSS and JS. After changing `jsu-wrapped.css` or `jsu-wrapped.js`, sync that file before handing it to WordPress.

The page can keep JSON/config hosted on GitHub Pages while the embed runs on `ncsy.org`, as long as the GitHub Pages URLs remain public.
