# National Wrapped Validation SQL

Use this after replacing `warehouse.teen_event_rows`, `warehouse.dim_region`, `warehouse.dim_chapter`, and optional `warehouse.dim_jsu_club_site` with real table names. The query is PostgreSQL-style; for Snowflake or BigQuery, keep the CTE logic and swap date/JSON/filter syntax as needed.

```sql
with params as (
  select
    date '2025-07-01' as start_date,
    date '2026-07-01' as end_date,
    date '2024-07-01' as prior_start_date,
    date '2025-07-01' as prior_end_date,
    date '2021-07-01' as history_start_date
),
region_dim as (
  select
    r.region_id,
    coalesce(nullif(r.region_slug, ''), lower(regexp_replace(r.region_name, '[^a-zA-Z0-9]+', '-', 'g'))) as region_slug,
    r.region_name,
    coalesce(r.is_international, false) as is_international,
    case
      when lower(coalesce(r.region_slug, r.region_name)) in ('national', 'upstate-new-york', 'atlanta') then null
      when lower(coalesce(r.region_slug, r.region_name)) in ('nj-jsu', 'nj-ct-jsu') then 'NJ/CT JSU'
      when coalesce(r.is_international, false) = true and lower(coalesce(r.region_slug, r.region_name)) <> 'israel' then 'International'
      else r.region_name
    end as display_region_name
  from warehouse.dim_region r
  where coalesce(r.is_active, true) = true
),
chapter_dim as (
  select
    c.chapter_id,
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
    coalesce(ter.region_id, cd.region_id) as region_id,
    nullif(ter.school_id, '') as school_id,
    nullif(trim(ter.school_name), '') as school_name,
    coalesce(nullif(ter.program_type, ''), nullif(ter.event_type, ''), 'Other') as raw_program_type,
    coalesce(ter.is_shabbaton, false) as is_shabbaton,
    coalesce(ter.is_immersive, false) as is_immersive,
    coalesce(ter.is_learning_session, false) as is_learning_session
  from warehouse.teen_event_rows ter
  left join chapter_dim cd on cd.chapter_id = ter.chapter_id
  cross join params p
  where ter.teen_id is not null
    and ter.event_id is not null
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
    region_id,
    school_id,
    school_name,
    raw_program_type,
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
  select teen_id, min(event_date) as first_seen_date
  from dedup_attendance
  group by teen_id
),
current_events as (
  select
    event_id,
    min(event_date) as event_date,
    min(region_id) as region_id,
    min(raw_program_type) as raw_program_type,
    bool_or(is_shabbaton) as is_shabbaton,
    bool_or(is_immersive) as is_immersive,
    bool_or(is_learning_session) as is_learning_session
  from current_attendance
  group by event_id
),
categorized_events as (
  select
    ce.*,
    case
      when ce.is_learning_session
        or lower(ce.raw_program_type) in ('learning', 'educational', 'education')
        or lower(ce.raw_program_type) like '%learning%'
        or lower(ce.raw_program_type) like '%educat%'
      then 'Learning + Educational'
      when ce.is_shabbaton
        or ce.is_immersive
        or lower(ce.raw_program_type) like '%shabb%'
        or lower(ce.raw_program_type) like '%retreat%'
        or lower(ce.raw_program_type) like '%convention%'
        or lower(ce.raw_program_type) like '%immersive%'
      then 'Shabbat / Immersive'
      when lower(ce.raw_program_type) like '%club%'
        or lower(ce.raw_program_type) like '%jsu%'
      then 'JSU Clubs'
      when lower(ce.raw_program_type) like '%recruit%'
        or lower(ce.raw_program_type) like '%outreach%'
        or lower(ce.raw_program_type) like '%community%'
      then 'Community Building'
      when lower(ce.raw_program_type) like '%leadership%'
        or lower(ce.raw_program_type) like '%service%'
      then 'Leadership + Service'
      else 'Other'
    end as public_program_label
  from current_events ce
),
active_jsu_club_sites as (
  select count(distinct club_site_id) as active_jsu_club_sites
  from warehouse.dim_jsu_club_site
  where coalesce(is_active, true) = true
),
headline_metrics as (
  select
    count(distinct ca.teen_id) as national_teens_reached,
    count(distinct ca.event_id) as national_programs_hosted,
    count(*) as national_engagement_moments,
    count(distinct coalesce(ca.school_id, lower(ca.school_name))) filter (where coalesce(ca.school_id, ca.school_name) is not null) as national_schools_represented,
    count(distinct ca.teen_id) filter (
      where tfs.first_seen_date >= (select start_date from params)
        and tfs.first_seen_date < (select end_date from params)
    ) as national_new_teens,
    count(distinct ce.event_id) filter (where ce.public_program_label = 'Shabbat / Immersive') as shabbat_immersive_events,
    count(distinct ce.event_id) filter (where ce.is_shabbaton or lower(ce.raw_program_type) like '%shabbaton%') as shabbaton_only_events,
    count(distinct ce.event_id) filter (where lower(ce.raw_program_type) like '%meal%') as shabbos_meal_events
  from current_attendance ca
  left join teen_first_seen tfs on tfs.teen_id = ca.teen_id
  left join categorized_events ce on ce.event_id = ca.event_id
),
growth_check as (
  select
    (select count(distinct teen_id) from current_attendance) as current_year_teens,
    (select count(distinct teen_id) from prior_attendance) as prior_year_teens
),
school_region_check as (
  select
    coalesce(rd.display_region_name, 'Unknown') as display_region_name,
    coalesce(rd.is_international, false) as is_international,
    count(distinct coalesce(ca.school_id, lower(ca.school_name))) filter (where coalesce(ca.school_id, ca.school_name) is not null) as schools_represented,
    count(*) filter (where ca.school_id is null and ca.school_name is not null) as attendance_rows_with_name_only_school,
    count(*) filter (where ca.school_id is null and ca.school_name is null) as attendance_rows_missing_school
  from current_attendance ca
  left join region_dim rd on rd.region_id = ca.region_id
  group by 1, 2
),
program_check as (
  select
    public_program_label,
    raw_program_type,
    count(distinct event_id) as events
  from categorized_events
  group by 1, 2
)
select
  'headline_metrics' as check_name,
  jsonb_build_object(
    'national_teens_reached', hm.national_teens_reached,
    'national_new_teens', hm.national_new_teens,
    'new_teens_uses_all_history_available', true,
    'national_schools_represented', hm.national_schools_represented,
    'active_jsu_club_sites', acs.active_jsu_club_sites,
    'schools_to_active_jsu_club_site_ratio', round(hm.national_schools_represented::numeric / nullif(acs.active_jsu_club_sites, 0), 2),
    'shabbat_immersive_events', hm.shabbat_immersive_events,
    'shabbaton_only_events', hm.shabbaton_only_events,
    'shabbos_meal_events', hm.shabbos_meal_events,
    'current_year_teens', gc.current_year_teens,
    'prior_year_teens', gc.prior_year_teens,
    'growth_rate_label', case when gc.prior_year_teens > 0 then round((gc.current_year_teens - gc.prior_year_teens) * 100.0 / gc.prior_year_teens)::text || '%' else null end
  ) as details
from headline_metrics hm
cross join growth_check gc
left join active_jsu_club_sites acs on true

union all

select
  'schools_by_region' as check_name,
  jsonb_agg(
    jsonb_build_object(
      'region', display_region_name,
      'is_international', is_international,
      'schools_represented', schools_represented,
      'attendance_rows_with_name_only_school', attendance_rows_with_name_only_school,
      'attendance_rows_missing_school', attendance_rows_missing_school
    )
    order by display_region_name
  ) as details
from school_region_check

union all

select
  'program_mapping_raw_drilldown' as check_name,
  jsonb_agg(
    jsonb_build_object(
      'public_program_label', public_program_label,
      'raw_program_type', raw_program_type,
      'events', events
    )
    order by public_program_label, events desc, raw_program_type
  ) as details
from program_check;
```

If there is no reliable club-site dimension, remove `active_jsu_club_sites` and treat the school-to-club ratio as unresolved rather than estimating it from chapter counts.
