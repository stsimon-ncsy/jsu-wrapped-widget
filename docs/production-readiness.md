# JSU/NCSY Wrapped Production Readiness

This widget is static-hosting friendly: the public experience is driven by `jsu-wrapped.js`, `jsu-wrapped.css`, `sample-wrapped-2026.json`, and `wrapped-config-2026.json`.

## Pre-Publish Checks

Run these before copying files to WordPress or relying on GitHub Pages:

```powershell
node check-production.js
```

GitHub Actions runs the same `node check-production.js` workflow on every push and pull request. The script syncs the WordPress inline embed, runs syntax checks, validates JSON/config before generating static share pages, runs the smoke suite, checks generated-file drift, and fails on whitespace errors. CI sets `JSUW_SKIP_OPTIONAL_RENDER_SMOKE=1` for that broad check, then resolves the Ubuntu runner's system Chrome or Chromium executable and runs a non-skipping headless render smoke so blank story or builder DOM fails the build even if a local machine skipped browser rendering. Because CI and local publishing use the same script plus that enforced render check, update `check-production.js` and `.github/workflows/qa.yml` whenever the pre-publish gate changes.

After pushing, run `node hosted-smoke.js` to fetch the live GitHub Pages entry page, builder noindex guard, CTA form prefill noindex guard, CTA link prefill noindex guard, analytics smoke noindex guard, widget JS/CSS, builder script, WordPress inline embed, chapter/config JSON, teen proof-of-concept JSON, Baltimore static share page metadata, and the social preview image as a 1200x630 `image/png` response. For the default GitHub Pages host, the smoke also sends an `https://ncsy.org` origin and confirms the JSON assets include `Access-Control-Allow-Origin`, so a WordPress-hosted public page can fetch GitHub-hosted data/config in the browser. This command is intentionally separate from `node check-production.js` because it needs network access and can fail while Pages is still deploying. Use `node hosted-smoke.js --base https://example.org/wrapped/ --require-cors --origin https://ncsy.org` for another cross-origin static asset host, or `node hosted-smoke.js --base https://example.org/wrapped/ --skip-cors` for a same-origin WordPress-hosted copy.

For a local browser render check, run `node render-smoke.js --skip-if-missing`. It serves the static files locally, launches an installed Chrome or Edge in headless mode when available, and verifies the picker, Baltimore story, CTA form prefill, CTA link prefill, analytics dataLayer, and builder render real DOM in mobile and desktop viewports. It also exercises a noindex CTA form prefill smoke page so the final-card CTA has to open a Gravity-Forms-style panel and populate chapter context, a noindex CTA link prefill smoke page so the final-card CTA has to navigate to a Gravity-Forms-style target URL with short `wrapped_*` params, and a noindex analytics smoke page so the browser runtime has to push `jsu_wrapped_story_view`, `jsu_wrapped_card_view`, and `jsu_wrapped_card_engagement` with chapter/scope context. `node check-production.js` runs the same command with `--skip-if-missing`, preserving the no-dependency workflow on machines without a browser.

The check runs `git diff --exit-code wordpress-inline-embed.html` immediately after `node sync-wordpress-inline.js`, so stale generated WordPress handoff code cannot slip into the repo unnoticed. Static social share pages are regenerated with `node generate-share-pages.js` and checked with both `git diff --exit-code share` and `git status --porcelain -- share`. The generator also removes stale generated share-page directories when a story is removed from the JSON, so old chapter, region, or program share previews do not stay live by accident.

The data validator checks the static JSON/config package for duplicate story and teen slugs, missing required display fields, invalid numeric metrics, invalid logo or palette choices, unsafe CTA or media image URLs, placeholder public story text such as test/sample/dummy values, unknown config keys, unsupported card override or custom-card keys, duplicate or generated custom-card ids, media custom cards without image URLs, record override fields that do not exist in the story data, and config entries that no longer match a chapter, region, program, or campaign in the data. Teen proof-of-concept records are also blocked from using obvious ID/contact fields such as teen IDs, student IDs, email fields, phone fields, names split into first/last/legal names, addresses, or date-of-birth fields. The data and config field contract lives in `docs/data-contract.md`.

The public renderer also applies the same static URL guard before rendering custom media images or navigating final-card CTA links. That runtime guard is a last-resort defense for embeds that accidentally point at an unreviewed config file; it does not replace `node validate-wrapped-data.js` or the builder warnings.

Hosted preview pages, the CTA prefill smoke page, the CTA link smoke page, the analytics smoke page, the WordPress inline embed, the builder JSON fetches, and the pasteable README snippet use a shared static asset cache token, currently `jsuw-prod-20260601h`, on JS/CSS/JSON references. When hosted assets or GitHub Pages JSON/config should force-refresh for staff or public reviewers, run `node bump-cache-token.js jsuw-prod-YYYYMMDDx`, then run `node check-production.js`. The helper updates `index.html`, `embed-example.html`, `builder.html`, `cta-prefill-smoke.html`, `cta-link-smoke.html`, `analytics-smoke.html`, `wrapped-builder.js`, `wordpress-inline-embed.html`, `README.md`, `docs/production-readiness.md`, and `qa-smoke.js`.

Staff rollout guidance lives in `docs/staff-playbook.md`. Use it for launch sequencing, audience variants, CTA strategy, Gravity Form follow-up, and measurement after the technical checks pass.

Final public-launch go/no-go guidance lives in `docs/launch-checklist.md`. Use it after the technical checks pass and before sending chapter links beyond pilot reviewers.

Maintainer setup for pilot staff submission intake lives in `docs/staff-submission-intake.md`. Use it when creating a dedicated Gravity Forms intake, generating staff builder links, exporting returned JSON, and merging reviewed submissions back into `wrapped-config-2026.json`.

Staff builder submissions should be reviewed in batches with `node review-builder-submissions.js staff-submissions wrapped-config-2026.json` when multiple files come back from a pilot group. That command validates every JSON packet in the ignored local submissions folder without writing config, then prints submitter details, preview URLs, change summaries, a ready-to-run **Dry run:** command for each valid item, and a valid/invalid count. Files can be direct builder submission JSON, Gravity Forms entry JSON with the builder packet stored in `wrapped_submission`, or a single exported JSON array of entries. Merge only a reviewed file: run the printed dry-run command first, then remove `--dry-run` from that same command after review. If the reviewed item is an array label such as `export.json[2]`, the printed command includes `--entry 2`. The dry run validates the packet and prints the submitter, reviewer note, preview URL, and change summary without writing. The builder and merge helper require submitter name/email so pilot packets always have a follow-up contact. The helper only accepts builder-generated scope or variant merge paths, then validates the merged config against the current story and teen JSON before writing, so malformed staff patches are rejected before they can enter the deployable config. For pilot intake, the builder supports pre-addressed email links with `review_email` and optional review-form links with `review_url`; use the collapsed **Reviewer setup** panel and **Copy staff link** button to generate those URLs without hand-editing query strings. The form flow copies the same submission JSON and appends only lightweight URL context for routing. It does not put the full JSON packet into the URL; staff should paste the copied JSON into the `wrapped_submission` textarea when the field is empty. Review form URLs use the same static URL safety guard as CTA and media URLs, so unsafe schemes are ignored.

builder.html is an internal staff tool. It is hosted publicly only because GitHub Pages serves static files, so it must keep a `noindex,nofollow` robots tag and should not be used as the public campaign URL.

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

That keeps chapter, region, and cross-region program versions on the same pattern. The builder's **Edit scope** control can write a chapter-specific config, a region default, or a program default keyed from the selected preview chapter's `program_slug`, `program_name`, `campaign_slug`, `campaign_name`, or `top_program_type`.

Keep this distinction intact: region/program defaults are config overlays for chapter stories, while region/program Wrapped stories are first-class JSON records with their own `scope_type`. If staff need to self-serve standalone region or cross-region program stories in the builder, add a story-subject selector for scoped records instead of overloading `chapter_slug`.

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

Those URLs expect first-class story records in the JSON with fields such as `scope_type`, `scope_slug`, and `scope_name`. Do not fake a region/program as a chapter record; use the scope fields and let the renderer normalize it as the story subject.

When region or program story records exist, the no-parameter landing page surfaces them in a separate **Bigger stories** section. They do not enter the chapter list, and plain `?region=` remains a chapter-picker filter.

Example region story record:

```json
{
  "scope_type": "region",
  "scope_slug": "atlantic-seaboard",
  "scope_name": "Atlantic Seaboard",
  "region_name": "Atlantic Seaboard",
  "year_label": "2025-2026",
  "events_hosted": 1112,
  "unique_teens": 3364,
  "engagement_moments": 158717
}
```

Example program story record:

```json
{
  "scope_type": "program",
  "scope_slug": "shabbat",
  "scope_name": "Shabbat Across JSU",
  "program_slug": "shabbat",
  "program_name": "Shabbat Across JSU",
  "year_label": "2025-2026",
  "events_hosted": 88,
  "unique_teens": 760
}
```

Hidden variants can be linked directly but will not appear in the picker:

```json
{
  "hidden_from_picker": true
}
```

Generated screens can be hidden at a config scope, but the cover and final share/CTA screens are protected. Rewrite those screens with `card_overrides` when needed instead of hiding them.

The builder marks the cover and final share screens as required and strips those protected ids from exported `hidden_cards` values. This keeps staff-created configs aligned with the runtime and validator.

## Data Consistency

Metric and persona corrections belong in `record_overrides`. They are applied before cards are generated, so corrected stats and story labels flow into:

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

## CSS Isolation

`jsu-wrapped.css` is the deployable widget stylesheet and must stay scoped under `#jsu-wrapped`. Do not add global selectors such as `body`, `html`, `button`, `h1`, or generic utility classes to that file.

Allowed global CSS constructs are limited to animation/support wrappers such as `@keyframes`, `@media`, and `@supports`; selectors inside media/support blocks still need to start with `#jsu-wrapped`.

`wordpress-inline-embed.html` also contains a page wrapper and Osano helper styles for the no-header/no-footer WordPress page. Those belong to the WordPress handoff file only; keep the reusable hosted stylesheet isolated to `#jsu-wrapped`.

## Mobile Fullscreen Contract

On mobile, the widget should feel like a story surface rather than a small embedded card. Keep `#jsu-wrapped` full-width and horizontally clipped inside its own scoped container, then let `.jsuw-shell` and `.jsuw-story` fill the available mobile viewport under the small-screen media queries. The production smoke test checks for the scoped overflow guard, full-width mobile shell, `100svh` story sizing, and the mobile aspect-ratio override.

Narrow phone layouts also need the story chrome to compress instead of clipping. At widths around 390-430px, hide the redundant numeric card count, keep the sound/autoplay controls inside the header track, and reduce the fixed Next-button minimum so the bottom controls remain fully visible.

## Big Stat Glyph Safety

The event, moment, new-teen, and custom metric cards use oversized animated numbers. Keep their shared `.jsuw-reference-stat` line-height loose enough that digits such as 3, 8, and 9 do not look cut off while the count-up animation is running or after it settles. The production smoke test enforces a minimum line-height for that shared stat rule because cramped glyph boxes were a visible polish issue on mobile.

## Share/Download Fallback

The download button prefers `html2canvas` when available. If it is not available, the widget generates a static SVG poster locally in the browser.

The smoke suite also checks the fallback SVG's vertical geometry for the public sample chapters and a long-copy stress case. Keep the persona pill, summary copy, stat rows, CTA, and footer in separate vertical zones so the downloaded SVG does not look more crowded than the live final card.

The runtime page metadata uses the combined social title format:

```text
JSU/NCSY Wrapped - [Chapter or Scope Name]
```

That title is applied to `document.title`, `og:title`, and `twitter:title`. The in-story logo and card branding can still use JSU or NCSY based on the record/config logo setting.

Because many social scrapers do not execute JavaScript, share links can use generated static pages under:

```text
/share/[chapter-slug]/
/share/region/[region-slug]/
/share/program/[program-slug]/
```

The hosted entry pages and generated share pages include crawler-readable Open Graph/Twitter tags, site name, image dimensions, and social image alt text. Generated share pages immediately redirect human visitors back to the interactive `?chapter=`, `?scope=region&region=`, or `?scope=program&program=` story. The JavaScript redirect preserves supported query params such as `variant`, `program`, `campaign`, `autoplay`, and `duration`, so donor/custom share links still land on the intended experience. Use `data-share-base="./share/"` for same-site hosting, or point WordPress embeds at the GitHub Pages share folder:

```html
data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"
```

The share generator sanitizes filesystem path segments before writing pages, so a malformed slug cannot write outside the configured `share/` output root. The runtime share button uses the same path-segment rule when it points users at static share pages, so scoped records with spaces or punctuation still share the generated crawler URL. Keep that guard in place even though the production check validates data before share generation.

`node qa-smoke.js` includes SVG fallback checks for:

- real chapter data
- long chapter/persona copy
- missing broken text such as `undefined`, `null`, or `NaN`
- variant-aware generated copy
- brand/logo rendering when a logo data URL is available
- final-card CTA rendering when the story has a CTA

## WordPress Inline Embed

`wordpress-inline-embed.html` contains the current inline CSS and JS. After changing `jsu-wrapped.css` or `jsu-wrapped.js`, run:

```powershell
node sync-wordpress-inline.js
```

The smoke test compares the inline CSS/renderer against `jsu-wrapped.css` and `jsu-wrapped.js`, which prevents stale WordPress handoff code from drifting behind the hosted version.

NCSY.org should own the public page and Gravity Forms shell. GitHub Pages can remain the static asset and JSON host for `jsu-wrapped.js`, `jsu-wrapped.css`, `sample-wrapped-2026.json`, `wrapped-config-2026.json`, share pages, and social images as long as those URLs remain public. That split keeps forms, Osano, GTM, privacy links, and social metadata on the NCSY domain while avoiding WordPress upload restrictions for large JSON files.

The public WordPress page should use the hosted GitHub Pages asset URLs in the widget attributes:

```html
<div
  id="jsu-wrapped"
  data-year="2026"
  data-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-wrapped-2026.json?v=jsuw-prod-20260601h"
  data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260601h"
  data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"
  data-cta-label="Get involved next year"
  data-cta-target="#jsuw-wrapped-interest"></div>
```

Render the Gravity Form in a nearby WordPress shortcode/block or template field, then wrap or target it with `#jsuw-wrapped-interest`. Some WordPress custom HTML blocks do not execute shortcodes, so use a Shortcode block, Gravity Forms block, template field, or server-rendered shortcode when needed. The widget can then reveal the panel and fill matching fields when the final-card CTA is clicked.

For Gravity Forms, add hidden fields whose labels or input names clearly include the context they should receive, such as `chapter name`, `region`, `scope type`, `scope slug`, `scope name`, `program`, `variant`, `year label`, and `wrapped url`. The widget fills matching empty fields when the CTA opens the form.

Do not pass the full story JSON, config JSON, metrics object, or builder submission packet in a query string. Final-card CTA links and builder review links should pass only short context parameters such as `wrapped_scope`, `wrapped_slug`, `wrapped_name`, `wrapped_chapter_slug`, `wrapped_chapter`, `wrapped_region`, `wrapped_variant`, `wrapped_year`, and `wrapped_url`. Large packets belong in hosted JSON files, a copied textarea value such as `wrapped_submission`, or a file upload/review workflow.

Teen mode is still a proof of concept. Runtime metadata labels it as a test version and sets `robots` to `noindex,nofollow`; do not remove that guard until real teen-level data, consent, and privacy review are complete. The data validator intentionally rejects teen record ID/contact fields and obvious email or phone values so accidental real identifying data does not enter the static package silently.
