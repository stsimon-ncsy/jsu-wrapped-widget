# JSU Wrapped Analytics / GTM Setup

The widget emits privacy-safe `dataLayer` events. It does not load Google Tag
Manager or GA4 itself, so the host site should install GTM or a Google tag in
the surrounding theme.

GA4 property / measurement ID:

```text
G-Y3LLF5KQ23
```

## Widget Events

The widget pushes these events:

```js
window.dataLayer.push({
  event: "jsu_wrapped_card_view",
  wrapped_mode: "chapter",
  scope_type: "chapter",
  scope_slug: "baltimore",
  scope_name: "Baltimore",
  wrapped_year: "2026",
  chapter_slug: "baltimore",
  chapter_name: "Baltimore",
  region_name: "Atlantic Seaboard",
  variant_slug: "donor-recap",
  variant_label: "Donor recap",
  card_index: 3,
  card_total: 10,
  card_theme: "reach",
  card_type: "stat",
  autoplay_enabled: "false"
});
```

Event names:

- `jsu_wrapped_story_view`
- `jsu_wrapped_card_view`
- `jsu_wrapped_card_engagement`
- `jsu_wrapped_story_complete`
- `jsu_wrapped_share_click`
- `jsu_wrapped_download_click`
- `jsu_wrapped_cta_click`
- `jsu_wrapped_sound_toggle`
- `jsu_wrapped_autoplay_toggle`

Duration fields are sent on engagement/completion events:

- `card_duration_ms`
- `story_elapsed_ms`
- `completion_duration_ms`

Teen-mode events intentionally do not include teen name, teen slug, teen ID,
student name, email, phone, or other teen-identifying fields. The static data
validator rejects teen ID/contact fields and obvious email or phone values
before the package is published, and the runtime strips those keys from
teen-mode event extras before pushing to `dataLayer`.

## GTM Configuration

1. Install the GTM container on the host site.
2. Create a Google tag for `G-Y3LLF5KQ23`.
3. Create one Custom Event trigger:

```text
Trigger type: Custom Event
Event name: ^jsu_wrapped_
Use regex matching: true
This trigger fires on: All Custom Events
```

4. Create Data Layer Variables:

```text
wrapped_mode
scope_type
scope_slug
scope_name
wrapped_year
school_year
year_label
chapter_slug
chapter_id
chapter_name
region_name
variant_slug
variant_label
brand_logo
card_index
card_total
card_theme
card_type
is_final_card
autoplay_enabled
navigation_method
initial_card_index
card_duration_ms
story_elapsed_ms
completion_duration_ms
share_method
download_format
cta_label
cta_target
cta_href
sound_enabled
```

5. Create one GA4 Event tag:

```text
Tag type: Google Analytics: GA4 Event
Measurement ID / Google tag: G-Y3LLF5KQ23
Event name: {{Event}}
Trigger: the ^jsu_wrapped_ Custom Event trigger
```

Add the Data Layer Variables above as event parameters with the same parameter
names.

## GA4 Custom Definitions

Register these as event-scoped custom dimensions:

```text
wrapped_mode
scope_type
scope_slug
scope_name
wrapped_year
school_year
year_label
chapter_slug
chapter_name
region_name
variant_slug
variant_label
brand_logo
card_theme
card_type
is_final_card
autoplay_enabled
navigation_method
share_method
download_format
cta_label
cta_target
sound_enabled
```

Register these as custom metrics:

```text
card_index
card_total
initial_card_index
card_duration_ms
story_elapsed_ms
completion_duration_ms
```

Use GTM Preview and GA4 DebugView to confirm that `jsu_wrapped_story_view`,
`jsu_wrapped_card_view`, and `jsu_wrapped_card_engagement` are firing before
publishing the GTM container.
