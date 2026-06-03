# WordPress Wrapped Launch Packet

Use this packet for the public `https://ncsy.org/ncsy-wrapped/?chapter=baltimore` page.

Production hosting map:

- NCSY.org is the canonical public Wrapped page.
- GitHub Pages is the static asset/data host for widget files, JSON/config, share pages, and images unless those move to NCSY.org.
- Gravity Forms handles only the final CTA/contact capture.
- The public CTA form is not the staff-builder submission intake flow; builder submissions use a separate review form or email handoff.
- A failed live smoke after generating this packet means the public page still needs this packet applied, not that this packet is invalid.

## Copy-Ready WordPress HTML Block

Paste this into the page body where the Wrapped widget should appear.

```html
<link rel="stylesheet" href="https://stsimon-ncsy.github.io/jsu-wrapped-widget/jsu-wrapped.css?v=jsuw-prod-20260603a">
<div id="jsu-wrapped" data-year="2026" data-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-wrapped-2026.json?v=jsuw-prod-20260603a" data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260603a" data-teen-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-teen-wrapped-2026.json?v=jsuw-prod-20260603a" data-assets-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/" data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/" data-analytics="true" data-cta-label="Get involved next year" data-cta-target="#jsuw-wrapped-interest"></div>
<script src="https://stsimon-ncsy.github.io/jsu-wrapped-widget/jsu-wrapped.js?v=jsuw-prod-20260603a"></script>
```

Do not paste separate CSS/JS tags a second time if you use the block above.

## Page And Social Metadata

Set these values where the WordPress SEO/social plugin exposes them.
Yoast may render `og:type=article`, `og:site_name=NCSY`, and a Cloudinary-optimized copy of the campaign image; that is acceptable as long as the raw page has the correct Wrapped title, description, canonical/OG URL, and `wrapped-social-preview` image.

```text
Page/social title: JSU/NCSY Wrapped - Baltimore
og:type: website
og:site_name: JSU/NCSY Wrapped
og:title: JSU/NCSY Wrapped - Baltimore
twitter:title: JSU/NCSY Wrapped - Baltimore
description: See the JSU/NCSY Wrapped recap for Baltimore: events, teens, engagement moments, and community story.
og:description: See the JSU/NCSY Wrapped recap for Baltimore: events, teens, engagement moments, and community story.
twitter:description: See the JSU/NCSY Wrapped recap for Baltimore: events, teens, engagement moments, and community story.
canonical: https://ncsy.org/ncsy-wrapped/?chapter=baltimore
og:url: https://ncsy.org/ncsy-wrapped/?chapter=baltimore
twitter:url: https://ncsy.org/ncsy-wrapped/?chapter=baltimore
og:image: https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png
og:image:secure_url: https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png
twitter:image: https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png
twitter:card: summary_large_image
og:image:width: 1200
og:image:height: 630
og:image:alt: JSU/NCSY Wrapped social preview for Baltimore
twitter:image:alt: JSU/NCSY Wrapped social preview for Baltimore
```

## Embedded Gravity Forms CTA

If the final card opens an embedded form panel, the panel should be rendered by a Shortcode block, Gravity Forms block, or template-rendered shortcode wrapped by `#jsuw-wrapped-interest`.

Do not rely on a `[gravityform]` shortcode inside a Custom HTML block; many WordPress editors leave it unrendered.

Recommended hidden/context fields:

```text
wrapped_chapter
wrapped_chapter_slug
wrapped_region
wrapped_scope
wrapped_slug
wrapped_name
wrapped_variant
wrapped_year
wrapped_url
```

## Follow-Up Verification

After applying the packet, run:

```bash
node wordpress-smoke.js --url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
```

For the copy-ready packet generated from the current live page, run:

```bash
node wordpress-smoke.js --url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore" --fix-packet
```

A nonzero `--fix-packet` exit means the live page is still stale after the packet was generated. Apply the packet, then rerun the follow-up verification command above.

If the live check mentions inline CSS ordering, paste the full current `wordpress-inline-embed.html` block. Replacing only the `#jsu-wrapped` tag updates data/cache attributes, but it does not move stale inline CSS above the shell.
