# Schema-Aware SQL Prompt For National Wrapped

Copy this prompt into the schema-aware ChatGPT project.

```text
You are schema-aware for our NCSY/JSU data warehouse. Please generate production-ready SQL that returns the exact JSON record needed for the National JSU/NCSY Wrapped story.

Goal:
Return one row with one JSON object column named wrapped_record. The JSON object must be safe for a public aggregate story. Do not include teen-level PII, names, emails, phone numbers, addresses, or individual teen IDs in the output.

Date window:
- Current school year: 2025-07-01 inclusive through 2026-07-01 exclusive.
- Exclude future events after CURRENT_DATE.
- Exclude canceled/deleted/test/no-show rows where the schema supports that.
- Prior school year for YoY growth: 2024-07-01 inclusive through 2025-07-01 exclusive.
- Growth series: include each available school year from 2021-07-01 onward, grouped July-to-June.

Find the best source tables/columns for:
- Teen-event attendance rows or check-ins, at one row per teen per event if possible.
- Event metadata: event_id, event date, title, chapter, region, program/event type, status/cancelled flag, learning flag/type, Shabbaton/immersive flag/type, destination or venue city if available.
- Teen profile only as needed for stable teen_id and school identity. Do not output profile fields.
- Chapter dimension: active chapter_id, chapter_slug/name, region_id.
- Region dimension: active region_id, region_slug/name, is_international. Include every active region, including international and low/zero activity regions.
- School identity: prefer school_id; fall back to normalized nonblank school_name only when no school_id exists.

Deduping:
- Deduplicate attendance to one teen_id/event_id attendance before counting.
- Distinct events should be counted once nationally and once per region.
- Engagement moments should count deduped teen-event attendances.
- New/first-time teens should be teens whose first-ever attended event date falls inside the current school year, using all available history if available.

Program category mapping:
Create a clean program_breakdown array grouped into public labels. Use actual local type values, but map them into a small readable set such as:
- Social + Jewish Culture
- Learning
- Shabbat / Immersive
- Leadership + Service
- Recruitment
- Educational
- Other
If exact mappings are ambiguous, include a short SQL comment listing the raw values and the mapping assumption.

The wrapped_record JSON must include:
- school_year: "2025-2026"
- year_label: "2025-2026"
- scope_type: "national"
- scope_slug: "national"
- scope_name: "JSU/NCSY"
- brand_logo: "ncsy"
- national_teens_reached: distinct teens attended in current year
- national_programs_hosted: distinct attended events in current year
- national_engagement_moments: deduped teen-event attendances in current year
- national_schools_represented: distinct schools represented in current year
- national_regions_count: active regions count, not only regions with attendance
- national_chapters_count: active chapters count, not only chapters with attendance
- national_learning_sessions: distinct learning events in current year
- national_shabbatons: distinct Shabbaton or immersive events in current year
- national_immersive_teens: distinct teens who attended at least one Shabbaton/immersive event in current year
- national_destinations: distinct destination_name or venue_city for Shabbaton/immersive events when available
- national_new_teens: first-time teens in current year
- first_time_teens: same value as national_new_teens
- growth_rate_label: rounded percent change in national_teens_reached vs prior year, formatted like "18%"; null if prior year denominator is zero/missing
- growth_series: JSON array of {"year":"2025-2026","value":33287} rows for each July-June school year from 2021-2022 through 2025-2026 or latest available
- program_breakdown: JSON array of {"label":"Learning","value":123} ordered by value desc
- region_breakdown: JSON array containing every active region with {"name","slug","teens","events","engagement_moments","chapters","schools","map_x","map_y","is_international"} ordered by teens desc then name
- impact_tags: ["Belonging","Identity","Leadership","Friendship","Jewish life"]

For map_x/map_y:
- If a region dimension already has map/display coordinates, use them.
- Otherwise use a CASE expression for known regions where possible and default to 50,50.
- Do not block the query if precise coordinates are unavailable.

Output requirements:
1. Give the SQL only first, in the warehouse dialect you infer from the schema.
2. After the SQL, add a short "Assumptions to verify" section listing any uncertain joins, event status filters, program mappings, school identity choices, and missing destination/coordinate fields.
3. If the schema is missing a required source, do not invent tables. Tell me exactly which table/columns are missing and provide the closest partial SQL with nulls only for unsupported optional fields.
```

The same output shape is documented in `docs/national-wrapped-sql.md`.
