const fs = require("fs");
const path = require("path");

const DEFAULT_REGION_NAME = "West Coast";
const DEFAULT_YEAR_LABEL = "2025-2026";
const DEFAULT_BRAND_LOGO = "ncsy";
const DEFAULT_TOP_COUNT = 30;

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && String(value).trim().toUpperCase() !== "NULL";
}

function textValue(value) {
  return hasValue(value) ? String(value).trim() : "";
}

function parseInteger(value) {
  if (!hasValue(value)) {
    return null;
  }

  const numeric = Number(String(value).trim());
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function parseDate(value) {
  if (!hasValue(value)) {
    return null;
  }

  const text = String(value).trim();
  const parsed = new Date(text.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseCutoffDate(value) {
  const date = parseDate(value || "2026-06-05");

  if (!date) {
    throw new Error(`Invalid cutoff date: ${value}`);
  }

  date.setHours(23, 59, 59, 999);
  return date;
}

function splitTsvLine(line) {
  return String(line || "").split("\t");
}

function parseTsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");

  if (!lines.length) {
    return [];
  }

  const headers = splitTsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitTsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] === undefined ? "" : values[index];
    });

    return row;
  });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "junior";
}

function publicTeenName(firstName, lastName) {
  const first = textValue(firstName) || "Junior";
  const initial = textValue(lastName).charAt(0).toUpperCase();

  return initial ? `${first} ${initial}.` : first;
}

function cleanPublicLabel(value) {
  const text = textValue(value)
    .replace(/\s+/g, " ")
    .replace(/\bJewniors\b/gi, "Juniors")
    .trim();

  if (!text || /^(your school|unknown|n\/a|na|none)$/i.test(text)) {
    return "";
  }

  return text;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function countPhrase(value, singular, plural) {
  const count = Number(value) || 0;

  if (count <= 0) {
    return "";
  }

  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function sentenceList(parts) {
  if (parts.length <= 1) {
    return parts.join("");
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function eventKey(row) {
  return textValue(row.eventid) || [
    textValue(row.eventname),
    textValue(row.startdatelocal),
    textValue(row.chaptername)
  ].join("|");
}

function rowDate(row) {
  return row.__date || parseDate(row.startdatelocal);
}

function normalizeRow(row) {
  return {
    ...row,
    __date: parseDate(row.startdatelocal),
    __grade: parseInteger(row.grade),
    __eventKey: eventKey(row)
  };
}

function isEligibleRow(row, cutoffDate) {
  return row.__date && row.__date <= cutoffDate && row.__grade >= 1 && row.__grade <= 8;
}

function sortRowsByDate(rows) {
  return rows.slice().sort((a, b) => {
    const dateDiff = rowDate(a).getTime() - rowDate(b).getTime();

    if (dateDiff !== 0) {
      return dateDiff;
    }

    return eventKey(a).localeCompare(eventKey(b));
  });
}

function increment(map, key, amount = 1) {
  if (!hasValue(key)) {
    return;
  }

  map.set(key, (map.get(key) || 0) + amount);
}

function mostCommon(map, fallback = "") {
  let best = fallback;
  let bestCount = -1;

  Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, count]) => {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  });

  return best;
}

function topCategoryLabel(category, type) {
  const normalizedCategory = String(category || "").toLowerCase();
  const normalizedType = String(type || "").toLowerCase();

  if (normalizedCategory.includes("shabbaton")) {
    return "Shabbaton Energy";
  }

  if (normalizedCategory.includes("leadership") || normalizedType.includes("leadership") || normalizedType.includes("board")) {
    return "Leadership";
  }

  if (normalizedCategory.includes("educational") || normalizedType.includes("learn") || normalizedType.includes("shiur") || normalizedType.includes("class")) {
    return "Learning + Jewish Life";
  }

  if (normalizedCategory.includes("holiday") || normalizedType.includes("shabbat") || normalizedType.includes("sukkot") || normalizedType.includes("rosh")) {
    return "Shabbat + Holidays";
  }

  return "Social + Community";
}

function isBoardMeetingEvent(row) {
  const text = [
    textValue(row.eventname),
    textValue(row.programType),
    textValue(row.programCategory)
  ].join(" ").toLowerCase();

  return /\bboard\b/.test(text) && /\b(meeting|meetings|mtg|mtgs)\b/.test(text);
}

function optionNumber(options, ...keys) {
  for (const key of keys) {
    if (hasValue(options[key])) {
      return parseInteger(options[key]);
    }
  }

  return undefined;
}

function derivePersona(stats) {
  if (stats.leadershipMoments > 0) {
    return "The Teen Leader";
  }

  if (stats.shabbatons >= 2) {
    return "The Deep Diver";
  }

  if (stats.eventsAttended >= 25 || stats.longestStreak >= 8) {
    return "The All-In Regular";
  }

  if (stats.learningSessions >= Math.max(6, stats.recruitmentMoments)) {
    return "The Learner";
  }

  if (stats.longestStreak >= 4) {
    return "The Consistency Champ";
  }

  if (stats.categoryVariety >= 3) {
    return "The Explorer";
  }

  return "The Community Regular";
}

function personaLine(persona) {
  const lines = {
    "The Teen Leader": "You did more than show up. You helped set the tone.",
    "The Deep Diver": "You made space for the moments that last longer than a single event.",
    "The All-In Regular": "You made Junior NCSY part of the rhythm of your year.",
    "The Learner": "You kept coming back for Jewish learning and conversation.",
    "The Consistency Champ": "You kept showing up, and that consistency became its own story.",
    "The Explorer": "You tried the year from more than one angle.",
    "The Community Regular": "You helped turn events into community."
  };

  return lines[persona] || lines["The Community Regular"];
}

function buildChapterStats(rows) {
  const byChapter = new Map();

  rows.forEach((row) => {
    const chapter = textValue(row.chaptername);

    if (!chapter) {
      return;
    }

    if (!byChapter.has(chapter)) {
      byChapter.set(chapter, {
        events: new Set(),
        people: new Set(),
        rows: 0,
        schools: new Set()
      });
    }

    const stats = byChapter.get(chapter);
    stats.events.add(eventKey(row));
    stats.people.add(textValue(row.personid));
    stats.rows += 1;

    const school = textValue(row.schoolname);
    if (school) {
      stats.schools.add(school);
    }
  });

  return byChapter;
}

function buildChapterCalendars(rows) {
  const byChapter = new Map();

  rows.forEach((row) => {
    const chapter = textValue(row.chaptername);

    if (!chapter) {
      return;
    }

    if (!byChapter.has(chapter)) {
      byChapter.set(chapter, new Map());
    }

    const calendar = byChapter.get(chapter);
    const key = eventKey(row);

    if (!calendar.has(key) || rowDate(row) < rowDate(calendar.get(key))) {
      calendar.set(key, row);
    }
  });

  const sorted = new Map();
  byChapter.forEach((calendar, chapter) => {
    sorted.set(chapter, sortRowsByDate(Array.from(calendar.values())));
  });

  return sorted;
}

function longestStreakForPerson(personRows, calendar) {
  if (!calendar || !calendar.length) {
    return 0;
  }

  const attended = new Set(personRows.map(eventKey));
  let current = 0;
  let longest = 0;

  calendar.forEach((event) => {
    if (attended.has(eventKey(event))) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });

  return longest;
}

function countPeerEvents(rows) {
  const eventAttendees = new Map();

  rows.forEach((row) => {
    const key = [textValue(row.chaptername), eventKey(row)].join("|");

    if (!eventAttendees.has(key)) {
      eventAttendees.set(key, new Set());
    }

    eventAttendees.get(key).add(textValue(row.personid));
  });

  return eventAttendees;
}

function summarizePerson(personRows, context) {
  const sortedRows = sortRowsByDate(personRows);
  const first = sortedRows[0];
  const personId = textValue(first.personid);
  const firstName = textValue(first.firstname) || "Junior";
  const chapterCounts = new Map();
  const schoolCounts = new Map();
  const categoryCounts = new Map();
  const typeCounts = new Map();
  const levelCounts = new Map();
  const attendedEvents = new Set();
  const attendedChapterRows = [];
  let learningSessions = 0;
  let shabbatons = 0;
  let leadershipMoments = 0;
  let boardMeetingsAttended = 0;
  let recruitmentMoments = 0;
  let eventsWithPeers = 0;

  sortedRows.forEach((row) => {
    attendedEvents.add(eventKey(row));
    increment(chapterCounts, textValue(row.chaptername));
    increment(schoolCounts, textValue(row.schoolname));
    increment(categoryCounts, textValue(row.programCategory));
    increment(typeCounts, textValue(row.programType));
    increment(levelCounts, textValue(row.programlevel));

    const category = textValue(row.programCategory).toLowerCase();
    const type = textValue(row.programType).toLowerCase();

    if (category.includes("educational") || type.includes("learn") || type.includes("class") || type.includes("shiur")) {
      learningSessions += 1;
    }

    if (category.includes("shabbaton")) {
      shabbatons += 1;
    }

    if (category.includes("leadership") || type.includes("leadership") || type.includes("board")) {
      leadershipMoments += 1;
    }

    if (isBoardMeetingEvent(row)) {
      boardMeetingsAttended += 1;
    }

    if (category.includes("recruitment")) {
      recruitmentMoments += 1;
    }
  });

  const primaryChapter = mostCommon(chapterCounts, textValue(first.chaptername));
  const schoolName = cleanPublicLabel(mostCommon(schoolCounts, textValue(first.schoolname)));

  sortedRows.forEach((row) => {
    if (textValue(row.chaptername) === primaryChapter) {
      attendedChapterRows.push(row);
    }
  });

  attendedEvents.forEach((key) => {
    const peerKey = [primaryChapter, key].join("|");
    const peers = context.eventAttendees.get(peerKey);

    if (peers && peers.size > 1) {
      eventsWithPeers += 1;
    }
  });

  const longestStreak = longestStreakForPerson(attendedChapterRows, context.chapterCalendars.get(primaryChapter));
  const topCategory = mostCommon(categoryCounts, textValue(first.programCategory));
  const topType = mostCommon(typeCounts, textValue(first.programType));
  const topVibe = topCategoryLabel(topCategory, topType);
  const stats = {
    eventsAttended: attendedEvents.size,
    longestStreak,
    learningSessions,
    shabbatons,
    leadershipMoments,
    boardMeetingsAttended,
    recruitmentMoments,
    categoryVariety: categoryCounts.size
  };
  const persona = derivePersona(stats);
  const chapterStats = context.chapterStats.get(primaryChapter);

  return {
    source_personid: personId,
    first_name: firstName,
    last_name: textValue(first.lastname),
    grade: first.__grade,
    chapter_name: primaryChapter,
    school_name: schoolName,
    events_attended: attendedEvents.size,
    first_event_name: cleanPublicLabel(first.eventname),
    first_event_date_label: formatDateLabel(rowDate(first)),
    first_event_location: primaryChapter,
    longest_streak: longestStreak,
    top_vibe: topVibe,
    top_program_category: topCategory,
    top_program_type: topType,
    events_with_peers: eventsWithPeers,
    schools_in_room: chapterStats ? chapterStats.schools.size : 0,
    shabbatons,
    learning_sessions: learningSessions,
    leadership_moments: leadershipMoments,
    board_meetings_attended: boardMeetingsAttended,
    persona,
    persona_line: personaLine(persona),
    chapter_events_hosted: chapterStats ? chapterStats.events.size : 0,
    chapter_unique_teens: chapterStats ? chapterStats.people.size : 0,
    chapter_engagement_moments: chapterStats ? chapterStats.rows : 0
  };
}

function reviewToTeenRecord(review, index, context) {
  const rank = index + 1;
  const chapterName = review.chapter_name || "Junior NCSY";
  const schoolText = cleanPublicLabel(review.school_name);
  const eventsText = formatNumber(review.events_attended);
  const peerText = formatNumber(review.events_with_peers);
  const depthParts = [
    countPhrase(review.learning_sessions, "learning moment", "learning moments"),
    countPhrase(review.shabbatons, "Shabbaton moment", "Shabbaton moments"),
    countPhrase(review.board_meetings_attended, "board meeting", "board meetings"),
    countPhrase(review.leadership_moments, "leadership moment", "leadership moments")
  ].filter(Boolean);

  return {
    school_year: context.yearLabel,
    year_label: context.yearLabel,
    teen_slug: `west-coast-junior-${String(rank).padStart(2, "0")}`,
    teen_name: publicTeenName(review.first_name, review.last_name),
    brand_logo: DEFAULT_BRAND_LOGO,
    chapter_slug: slugify(chapterName),
    chapter_name: chapterName,
    region_name: context.regionName,
    school_name: schoolText || undefined,
    events_attended: review.events_attended,
    first_event_name: review.first_event_name,
    first_event_date_label: review.first_event_date_label,
    first_event_location: review.first_event_location,
    longest_streak: review.longest_streak,
    top_vibe: review.top_vibe,
    events_with_peers: review.events_with_peers,
    schools_in_room: review.schools_in_room,
    shabbatons: review.shabbatons,
    learning_sessions: review.learning_sessions,
    leadership_moments: review.leadership_moments,
    board_meetings_attended: review.board_meetings_attended,
    persona: review.persona,
    persona_line: review.persona_line,
    attendance_line: `${eventsText} Junior NCSY moments made this a year you kept coming back to.`,
    first_event_line: `${review.first_event_date_label} was your first Junior NCSY moment in this story.`,
    vibe_line: `${review.top_vibe} was the lane you returned to most.`,
    depth_line: depthParts.length ? `${sentenceList(depthParts)} added depth to the year.` : "You kept building your Junior NCSY story.",
    peer_line: `You shared ${peerText} of your events with other Junior NCSY teens.`,
    chapter_events_hosted: review.chapter_events_hosted,
    chapter_unique_teens: review.chapter_unique_teens,
    chapter_engagement_moments: review.chapter_engagement_moments,
    chapter_line: `${chapterName} gave Junior NCSY teens a year full of ways to show up.`,
    region_unique_teens: context.regionUniqueTeens,
    region_schools_represented: context.regionSchoolsRepresented,
    region_engagement_moments: context.regionEngagementMoments,
    national_teens_reached: context.nationalTeensReached,
    national_programs_hosted: context.nationalProgramsHosted,
    national_engagement_moments: context.nationalEngagementMoments,
    movement_line: `Your chapter numbers are local. The region gets bigger. Nationally, the movement is massive.`
  };
}

function deriveJuniorWrapped(rawRows, options = {}) {
  const cutoffDate = parseCutoffDate(options.cutoffDate);
  const topCount = Number(options.top || DEFAULT_TOP_COUNT);
  const normalizedRows = rawRows.map(normalizeRow);
  const eligibleRows = [];
  let excludedGradeZeroRows = 0;
  let excludedGradeNinePlusRows = 0;
  let excludedFutureRows = 0;
  let excludedMissingDateRows = 0;
  let excludedMissingGradeRows = 0;

  normalizedRows.forEach((row) => {
    if (!row.__date) {
      excludedMissingDateRows += 1;
      return;
    }

    if (row.__date > cutoffDate) {
      excludedFutureRows += 1;
      return;
    }

    if (row.__grade === null) {
      excludedMissingGradeRows += 1;
      return;
    }

    if (row.__grade === 0) {
      excludedGradeZeroRows += 1;
      return;
    }

    if (row.__grade >= 9) {
      excludedGradeNinePlusRows += 1;
      return;
    }

    if (isEligibleRow(row, cutoffDate)) {
      eligibleRows.push(row);
    }
  });

  const dedupedRows = Array.from(new Map(eligibleRows.map((row) => [[textValue(row.personid), eventKey(row)].join("|"), row])).values());
  const people = new Map();

  dedupedRows.forEach((row) => {
    const personId = textValue(row.personid);

    if (!people.has(personId)) {
      people.set(personId, []);
    }

    people.get(personId).push(row);
  });

  const regionSchools = new Set(dedupedRows.map((row) => textValue(row.schoolname)).filter(Boolean));
  const context = {
    chapterCalendars: buildChapterCalendars(dedupedRows),
    chapterStats: buildChapterStats(dedupedRows),
    eventAttendees: countPeerEvents(dedupedRows),
    regionName: options.regionName || DEFAULT_REGION_NAME,
    regionEngagementMoments: optionNumber(options, "regionEngagementMoments", "region_engagement_moments"),
    regionSchoolsRepresented: optionNumber(options, "regionSchoolsRepresented", "region_schools_represented") || regionSchools.size,
    regionUniqueTeens: optionNumber(options, "regionUniqueTeens", "region_unique_teens") || people.size,
    nationalTeensReached: optionNumber(options, "nationalTeensReached", "national_teens_reached"),
    nationalProgramsHosted: optionNumber(options, "nationalProgramsHosted", "national_programs_hosted"),
    nationalEngagementMoments: optionNumber(options, "nationalEngagementMoments", "national_engagement_moments"),
    yearLabel: options.yearLabel || DEFAULT_YEAR_LABEL
  };

  const reviewRecords = Array.from(people.values())
    .map((rows) => summarizePerson(rows, context))
    .sort((a, b) => {
      if (b.events_attended !== a.events_attended) {
        return b.events_attended - a.events_attended;
      }

      if (b.longest_streak !== a.longest_streak) {
        return b.longest_streak - a.longest_streak;
      }

      return `${a.chapter_name} ${a.first_name} ${a.last_name}`.localeCompare(`${b.chapter_name} ${b.first_name} ${b.last_name}`);
    })
    .slice(0, topCount);

  const teenRecords = reviewRecords.map((record, index) => reviewToTeenRecord(record, index, context));

  return {
    summary: {
      sourceRows: rawRows.length,
      eligibleRows: dedupedRows.length,
      eligiblePeople: people.size,
      eligibleEvents: new Set(dedupedRows.map(eventKey)).size,
      excludedGradeZeroRows,
      excludedGradeNinePlusRows,
      excludedFutureRows,
      excludedMissingDateRows,
      excludedMissingGradeRows,
      topCount: reviewRecords.length
    },
    reviewRecords,
    teenRecords
  };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function recordsToCsv(records) {
  if (!records.length) {
    return "";
  }

  const headers = Object.keys(records[0]);
  return [
    headers.join(","),
    ...records.map((record) => headers.map((header) => csvEscape(record[header])).join(","))
  ].join("\n") + "\n";
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeOutputs(result, outputDir) {
  ensureDir(outputDir);

  const reviewPath = path.join(outputDir, "top-30-junior-review.csv");
  const teenJsonPath = path.join(outputDir, "top-30-junior-teen-wrapped-2026.json");
  const summaryPath = path.join(outputDir, "top-30-junior-summary.json");

  fs.writeFileSync(reviewPath, recordsToCsv(result.reviewRecords), "utf8");
  fs.writeFileSync(teenJsonPath, JSON.stringify(result.teenRecords, null, 2) + "\n", "utf8");
  fs.writeFileSync(summaryPath, JSON.stringify(result.summary, null, 2) + "\n", "utf8");

  return {
    reviewPath,
    teenJsonPath,
    summaryPath
  };
}

function argValue(args, name, fallback) {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    return fallback;
  }

  return args[index + 1];
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = argValue(args, "--input", "");
  const outputDir = argValue(args, "--output-dir", "junior-wrapped-artifacts");
  const cutoffDate = argValue(args, "--cutoff", "2026-06-05");
  const top = Number(argValue(args, "--top", DEFAULT_TOP_COUNT));

  if (!inputPath) {
    throw new Error("Usage: node derive-junior-wrapped.js --input path/to/teen-events.tsv [--output-dir junior-wrapped-artifacts] [--cutoff 2026-06-05] [--top 30]");
  }

  const rows = parseTsv(fs.readFileSync(inputPath, "utf8"));
  const result = deriveJuniorWrapped(rows, {
    cutoffDate,
    top
  });
  const outputs = writeOutputs(result, outputDir);

  console.log(JSON.stringify({
    ...result.summary,
    outputs
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  deriveJuniorWrapped,
  parseTsv,
  recordsToCsv,
  writeOutputs
};
