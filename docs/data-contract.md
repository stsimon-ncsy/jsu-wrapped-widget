# JSU/NCSY Wrapped Data Contract

This contract is for whoever exports, reviews, or customizes the static JSON that powers Wrapped. The public widget has no backend, so the data files must be valid before they are published.

Run this before committing data or config changes:

```bash
node validate-wrapped-data.js
node check-production.js
```

## Files

- `sample-wrapped-2026.json`: public chapter, region, and program story records.
- `wrapped-config-2026.json`: copy, metric, brand, CTA, variant, and custom-screen overrides.
- `sample-teen-wrapped-2026.json`: teen proof-of-concept records only. Do not use real teen-level data until consent and privacy review are complete.

## Public Story Records

Each chapter record should include:

- `chapter_slug`: stable URL slug, for example `baltimore`.
- `chapter_name`: display name.
- `region_name`: display region.
- `year_label`: display year, for example `2025-2026`.

Useful metrics include:

- `events_hosted`
- `unique_teens`
- `engagement_moments`
- `new_teens`
- `repeat_attendee_rate_label`
- `largest_event_name`
- `largest_event_attendance`
- `schools_represented`
- `learning_sessions`
- `shabbatons`
- `region_unique_teens`
- `region_schools_represented`
- `national_engagement_moments`

Optional values can be omitted. The renderer skips cards that need missing values, such as the biggest-event card when `largest_event_name` or `largest_event_attendance` is not present.

Use `brand_logo` only when a story should force a logo. Accepted values are `jsu` and `ncsy`.

## Region And Program Stories

Standalone region or program Wrapped stories are first-class records in `sample-wrapped-2026.json`.

Use:

- `scope_type`: `chapter`, `region`, or `program`.
- `scope_slug`: stable slug for the region or program story.
- `scope_name`: display name for the region or program story.

Do not fake a region or program story as a chapter record. Chapter-level records should keep using `chapter_slug` and `chapter_name`.

## Config Overrides

`wrapped-config-2026.json` can define defaults, region defaults, program defaults, campaign defaults, chapter overrides, and variants.

Common section keys:

- `brand_logo`: `jsu` or `ncsy`.
- `palette`: `electric`, `purple-gold`, or `sunset`.
- `cta_label`: final-card button label.
- `cta_target` or `ctaTarget`: embedded form panel selector, such as `#jsuw-wrapped-interest`.
- `cta_href` or `ctaHref`: direct final-card destination URL. Use `https://`, `http://`, root-relative paths such as `/ncsy-wrapped/`, dot-relative paths, query strings, or fragments. Unsafe protocols such as `javascript:` and `data:` are rejected. When the CTA opens a URL instead of an embedded panel, the widget appends short Gravity Forms-friendly context params such as `wrapped_scope`, `wrapped_slug`, `wrapped_name`, `wrapped_chapter_slug`, `wrapped_chapter`, `wrapped_region`, `wrapped_variant`, `wrapped_year`, and `wrapped_url`. It does not put the full story JSON or metrics in the URL.
- `record_overrides`: corrected data values, such as a fixed `events_hosted` count.
- `card_overrides`: generated-card copy overrides keyed by card id.
- `custom_cards`: extra screens for local story needs.
- `hidden_cards`: generated cards to hide. Cover and final are protected and cannot be hidden.
- `variants`: named versions such as a donor recap.

Metric corrections belong in `record_overrides`, not hardcoded copy, because generated headlines, final-card copy, analytics context, and download images all read from the effective record.

## Card Overrides

Use generated card ids:

- `cover`
- `events`
- `reach`
- `moments`
- `new`
- `repeat`
- `biggest`
- `persona`
- `movement`
- `final`

Supported copy fields include `eyebrow`, `headline`, `subtext`, `badge`, `markerText`, and `persona`.

Copy can use placeholders such as `{chapter_name}`, `{events_hosted}`, `{unique_teens}`, `{engagement_moments}`, `{new_teens}`, and `{repeat_attendee_rate_label}`. Prefer placeholders when the copy repeats a metric so later stat corrections stay consistent.

## Custom Cards

Supported `custom_cards` types:

- `text`
- `metric`
- `media`
- aliases: `stat`, `number`, `photo`, `image`

Custom card `id` values are optional. When provided, they must be unique within the same config section and cannot reuse generated story card ids such as `cover`, `events`, `reach`, `moments`, `new`, `repeat`, `biggest`, `persona`, `movement`, or `final`.

Supported placements include:

- `after_cover`
- `after_events`
- `after_reach`
- `after_moments`
- `before_final`
- `end`

Media cards need an image URL through `image_url`, `imageUrl`, or `src`. Use `https://`, `http://`, root-relative paths, dot-relative paths, query strings, or fragments. Unsafe protocols such as `javascript:` and `data:` are rejected.

## Privacy And Placeholder Rules

Do not include teen IDs, student IDs, CRM IDs, names split into first/last/legal name fields, email fields, phone fields, addresses, birth dates, or obvious email or phone values in teen proof-of-concept data.

Do not publish placeholder public story text such as `test`, `sample`, `dummy`, `todo`, `tbd`, `null`, or `undefined`.

## Review Checklist

Before publishing data/config:

1. Run `node validate-wrapped-data.js`.
2. Run `node check-production.js`.
3. Open one default chapter, one chapter variant if present, the picker page, and the final download/share flow.
4. Confirm no visible `undefined`, `null`, broken numbers, or stale placeholders.
5. Confirm the intended JSU or NCSY logo appears.
