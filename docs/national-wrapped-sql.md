# National Wrapped SQL Handoff

This is the extraction shape needed for the national `scope=national` story.

If you are handing this to a schema-aware ChatGPT project, start with `docs/national-sql-handoff-prompt.md`; it asks that project to discover the correct warehouse tables and then output this JSON shape.

The widget expects one national JSON record in `sample-wrapped-2026.json`. The query below is written in PostgreSQL-style SQL because it can emit nested JSON arrays directly. If your warehouse is BigQuery or Snowflake, the CTEs and field names still apply; swap `jsonb_agg/jsonb_build_object` for the local JSON aggregate functions.

## Source Tables

The cleanest source is a denormalized teen-event attendance row with event metadata attached:

- `teen_event_rows`
  - `teen_id`
  - `event_id`
  - `event_date`
  - `attendance_status`
  - `chapter_id`, `chapter_slug`, `chapter_name`
  - `region_id`, `region_slug`, `region_name`
  - `school_id`, `school_name`
  - `program_type` or `event_type`
  - `is_shabbaton`, `is_immersive`, `is_learning_session`

To list every region, including international regions and quiet regions, also provide:

- `dim_region`
  - `region_id`
  - `region_slug`
  - `region_name`
  - `is_international`
  - `is_active`
- `dim_chapter`
  - `chapter_id`
  - `chapter_slug`
  - `chapter_name`
  - `region_id`
  - `is_active`

If you do not have `dim_region`, the region list can only include regions that appear in `teen_event_rows`.

## Query

Replace `warehouse.teen_event_rows`, `warehouse.dim_region`, and `warehouse.dim_chapter` with the real table names.

```sql
with params as (
  select
    date '2025-07-01' as start_date,
    date '2026-07-01' as end_date,
    date '2024-07-01' as prior_start_date,
    date '2025-07-01' as prior_end_date,
    date '2021-07-01' as growth_start_date,
    '2025-2026'::text as school_year
),
region_map as (
  select *
  from (values
    ('west-coast', 13, 42),
    ('southern', 62, 62),
    ('canada', 44, 18),
    ('ny-jsu', 83, 31),
    ('tri-state', 76, 35),
    ('atlantic-seaboard', 82, 46),
    ('midwest', 50, 39),
    ('nj-jsu', 80, 39),
    ('nj-ct-jsu', 80, 39),
    ('southwest', 28, 59),
    ('central-east', 64, 36),
    ('greater-boston', 87, 28),
    ('israel', 64, 74),
    ('international', 42, 86)
  ) as m(region_slug, map_x, map_y)
),
region_dim as (
  select
    raw.region_id,
    raw.region_slug,
    raw.region_name,
    raw.is_international,
    case
      when raw.region_slug in ('national', 'upstate-new-york', 'atlanta') then null
      when raw.region_slug in ('nj-jsu', 'nj-ct-jsu') then 'nj-ct-jsu'
      when raw.region_slug in ('chile', 'argentina', 'mexico', 'international') then 'international'
      when raw.is_international = true and raw.region_slug <> 'israel' then 'international'
      else raw.region_slug
    end as display_region_slug,
    case
      when raw.region_slug in ('national', 'upstate-new-york', 'atlanta') then null
      when raw.region_slug in ('nj-jsu', 'nj-ct-jsu') then 'NJ/CT JSU'
      when raw.region_slug in ('chile', 'argentina', 'mexico', 'international') then 'International'
      when raw.is_international = true and raw.region_slug <> 'israel' then 'International'
      else raw.region_name
    end as display_region_name,
    case
      when raw.region_slug = 'israel' then true
      when raw.region_slug in ('chile', 'argentina', 'mexico', 'international') then true
      when raw.is_international = true and raw.region_slug <> 'israel' then true
      else false
    end as display_is_international
  from (
    select
      r.region_id,
      coalesce(nullif(r.region_slug, ''), lower(regexp_replace(r.region_name, '[^a-zA-Z0-9]+', '-', 'g'))) as region_slug,
      r.region_name,
      coalesce(r.is_international, false) as is_international
    from warehouse.dim_region r
    where coalesce(r.is_active, true) = true
  ) raw
),
region_display_dim as (
  select
    display_region_slug as region_slug,
    min(display_region_name) as region_name,
    bool_or(display_is_international) as is_international
  from region_dim
  where display_region_slug is not null
  group by display_region_slug
),
chapter_dim as (
  select
    c.chapter_id,
    coalesce(nullif(c.chapter_slug, ''), lower(regexp_replace(c.chapter_name, '[^a-zA-Z0-9]+', '-', 'g'))) as chapter_slug,
    c.chapter_name,
    c.region_id
  from warehouse.dim_chapter c
  where coalesce(c.is_active, true) = true
),
attendance_base as (
  select
    ter.teen_id,
    ter.event_id,
    cast(ter.event_date as date) as event_date,
    coalesce(ter.chapter_id, cd.chapter_id) as chapter_id,
    coalesce(nullif(ter.chapter_slug, ''), cd.chapter_slug) as chapter_slug,
    coalesce(nullif(ter.chapter_name, ''), cd.chapter_name) as chapter_name,
    coalesce(ter.region_id, rd.region_id) as region_id,
    coalesce(nullif(ter.region_slug, ''), rd.region_slug) as region_slug,
    coalesce(nullif(ter.region_name, ''), rd.region_name) as region_name,
    nullif(ter.school_id, '') as school_id,
    nullif(ter.school_name, '') as school_name,
    coalesce(nullif(ter.program_type, ''), nullif(ter.event_type, ''), 'Other') as program_type,
    coalesce(ter.is_shabbaton, false) as is_shabbaton,
    coalesce(ter.is_immersive, false) as is_immersive,
    coalesce(ter.is_learning_session, false) as is_learning_session
  from warehouse.teen_event_rows ter
  left join chapter_dim cd on cd.chapter_id = ter.chapter_id
  left join region_dim rd on rd.region_id = coalesce(ter.region_id, cd.region_id)
  cross join params p
  where ter.teen_id is not null
    and ter.event_id is not null
    and cast(ter.event_date as date) >= p.growth_start_date
    and cast(ter.event_date as date) < p.end_date
    and cast(ter.event_date as date) <= current_date
    and lower(coalesce(ter.attendance_status, 'attended')) in ('attended', 'checked in', 'checked_in', 'present', 'showed')
),
dedup_attendance as (
  select distinct
    teen_id,
    event_id,
    event_date,
    chapter_id,
    chapter_slug,
    chapter_name,
    region_id,
    region_slug,
    region_name,
    school_id,
    school_name,
    program_type,
    is_shabbaton,
    is_immersive,
    is_learning_session
  from attendance_base
),
current_attendance as (
  select da.*
  from dedup_attendance da
  cross join params p
  where da.event_date >= p.start_date
    and da.event_date < p.end_date
),
prior_attendance as (
  select da.*
  from dedup_attendance da
  cross join params p
  where da.event_date >= p.prior_start_date
    and da.event_date < p.prior_end_date
),
teen_first_seen as (
  select
    teen_id,
    min(event_date) as first_seen_date
  from dedup_attendance
  group by teen_id
),
current_events as (
  select
    event_id,
    min(event_date) as event_date,
    min(region_id) as region_id,
    min(region_slug) as region_slug,
    min(region_name) as region_name,
    min(chapter_id) as chapter_id,
    min(chapter_slug) as chapter_slug,
    min(chapter_name) as chapter_name,
    min(program_type) as program_type,
    bool_or(is_shabbaton) as is_shabbaton,
    bool_or(is_immersive) as is_immersive,
    bool_or(is_learning_session) as is_learning_session
  from current_attendance
  group by event_id
),
national_rollup as (
  select
    count(distinct ca.teen_id) as national_teens_reached,
    count(distinct ca.event_id) as national_programs_hosted,
    count(*) as national_engagement_moments,
    count(distinct coalesce(ca.school_id, ca.school_name)) filter (where coalesce(ca.school_id, ca.school_name) is not null) as national_schools_represented,
    (select count(*) from region_display_dim) as national_regions_count,
    (select count(distinct chapter_id) from chapter_dim) as national_chapters_count,
    count(distinct ce.event_id) filter (where ce.is_learning_session or lower(ce.program_type) like '%learning%') as national_learning_sessions,
    count(distinct ce.event_id) filter (where ce.is_shabbaton or ce.is_immersive or lower(ce.program_type) like '%shabbaton%') as national_shabbatons,
    count(distinct ca.teen_id) filter (
      where tfs.first_seen_date >= (select start_date from params)
        and tfs.first_seen_date < (select end_date from params)
    ) as national_new_teens,
    count(distinct ca.teen_id) filter (where ce.is_shabbaton or ce.is_immersive) as national_immersive_teens,
    (select count(distinct chapter_id) from chapter_dim) as national_depth_chapters
  from current_attendance ca
  left join current_events ce on ce.event_id = ca.event_id
  left join teen_first_seen tfs on tfs.teen_id = ca.teen_id
),
growth as (
  select
    (select count(distinct teen_id) from current_attendance) as current_teens,
    (select count(distinct teen_id) from prior_attendance) as prior_teens
),
growth_label as (
  select
    case
      when prior_teens > 0
      then round((current_teens - prior_teens) * 100.0 / prior_teens)::text || '%'
      else null
    end as growth_rate_label
  from growth
),
growth_series as (
  select jsonb_agg(
    jsonb_build_object(
      'year', school_year,
      'value', teens
    )
    order by school_year_start
  ) as growth_series
  from (
    select
      make_date(
        case
          when extract(month from event_date) >= 7 then extract(year from event_date)::int
          else extract(year from event_date)::int - 1
        end,
        7,
        1
      ) as school_year_start,
      (
        case
          when extract(month from event_date) >= 7 then extract(year from event_date)::int
          else extract(year from event_date)::int - 1
        end
      )::text || '-' || (
        case
          when extract(month from event_date) >= 7 then extract(year from event_date)::int + 1
          else extract(year from event_date)::int
        end
      )::text as school_year,
      count(distinct teen_id) as teens
    from dedup_attendance
    group by 1, 2
  ) g
),
program_breakdown as (
  select jsonb_agg(
    jsonb_build_object(
      'label', program_type,
      'value', programs
    )
    order by programs desc, program_type
  ) as program_breakdown
  from (
    select
      program_type,
      count(distinct event_id) as programs
    from current_events
    group by program_type
  ) p
),
region_activity as (
  select
    rd.display_region_slug as region_slug,
    count(distinct ca.teen_id) as teens,
    count(distinct ca.event_id) as events,
    count(*) as engagement_moments,
    count(distinct coalesce(ca.school_id, ca.school_name)) filter (where coalesce(ca.school_id, ca.school_name) is not null) as schools
  from current_attendance ca
  join region_dim rd on rd.region_id = ca.region_id
  where rd.display_region_slug is not null
  group by rd.display_region_slug
),
region_chapters as (
  select
    rd.display_region_slug as region_slug,
    count(distinct cd.chapter_id) as chapters
  from chapter_dim cd
  join region_dim rd on rd.region_id = cd.region_id
  where rd.display_region_slug is not null
  group by rd.display_region_slug
),
region_breakdown as (
  select jsonb_agg(
    jsonb_build_object(
      'name', rd.region_name,
      'slug', rd.region_slug,
      'teens', coalesce(ra.teens, 0),
      'events', coalesce(ra.events, 0),
      'engagement_moments', coalesce(ra.engagement_moments, 0),
      'chapters', coalesce(rc.chapters, 0),
      'schools', coalesce(ra.schools, 0),
      'map_x', coalesce(rm.map_x, 50),
      'map_y', coalesce(rm.map_y, 50),
      'is_international', rd.is_international
    )
    order by coalesce(ra.teens, 0) desc, rd.region_name
  ) as region_breakdown
  from region_display_dim rd
  left join region_activity ra on ra.region_slug = rd.region_slug
  left join region_chapters rc on rc.region_slug = rd.region_slug
  left join region_map rm on rm.region_slug = rd.region_slug
),
final_record as (
  select jsonb_build_object(
    'school_year', p.school_year,
    'year_label', p.school_year,
    'scope_type', 'national',
    'scope_slug', 'national',
    'scope_name', 'JSU/NCSY',
    'brand_logo', 'ncsy',
    'national_teens_reached', nr.national_teens_reached,
    'national_programs_hosted', nr.national_programs_hosted,
    'national_engagement_moments', nr.national_engagement_moments,
    'national_schools_represented', nr.national_schools_represented,
    'national_regions_count', nr.national_regions_count,
    'national_chapters_count', nr.national_chapters_count,
    'national_learning_sessions', nr.national_learning_sessions,
    'national_shabbatons', nr.national_shabbatons,
    'national_new_teens', nr.national_new_teens,
    'first_time_teens', nr.national_new_teens,
    'national_immersive_teens', nr.national_immersive_teens,
    'national_depth_chapters', nr.national_depth_chapters,
    'growth_rate_label', gl.growth_rate_label,
    'growth_series', gs.growth_series,
    'program_breakdown', pb.program_breakdown,
    'region_breakdown', rb.region_breakdown,
    'impact_tags', jsonb_build_array('Belonging', 'Identity', 'Leadership', 'Friendship', 'Jewish life')
  ) as wrapped_record
  from params p
  cross join national_rollup nr
  cross join growth_label gl
  cross join growth_series gs
  cross join program_breakdown pb
  cross join region_breakdown rb
)
select wrapped_record
from final_record;
```

## Output Fields

The final `wrapped_record` maps directly to the national renderer:

- `scope_type`: must be `national`.
- `scope_slug`: normally `national`.
- `scope_name`: display title, currently `JSU/NCSY`.
- `national_teens_reached`
- `national_programs_hosted`
- `national_engagement_moments`
- `national_schools_represented`
- `national_regions_count`
- `national_chapters_count`
- `national_learning_sessions`
- `national_shabbatons`
- `national_new_teens`
- `first_time_teens`
- `national_immersive_teens`
- `national_depth_chapters`: optional field for the depth card; usually the same as `national_chapters_count`.
- `growth_rate_label`
- `growth_series`: array of `{ "year", "value" }` rows.
- `program_breakdown`: array of `{ "label", "value" }`.
- `region_breakdown`: array of `{ "name", "slug", "teens", "events", "engagement_moments", "chapters", "schools", "map_x", "map_y", "is_international" }`.
- `impact_tags`: array of short public tags.

The map coordinates are intentionally rough percentages for the story card. They are not meant to be geographic proof.
