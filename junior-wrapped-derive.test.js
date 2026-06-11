const assert = require("assert");
const wrappedApi = require("./jsu-wrapped.js");
const {
  deriveJuniorWrapped,
  parseTsv
} = require("./derive-junior-wrapped.js");

const FIXTURE = [
  "personid\tfirstname\tlastname\teventid\teventname\tprogramType\tprogramCategory\tprogramlevel\tstartdatelocal\tchaptername\tschoolname\tgrade\tIsJuniorEvent",
  "101\tAri\tAlpha\t1\tKickoff\tSocial Event\tRecruitment\t1\t2025-09-01 18:00:00.000\tLas Vegas\tDesert Torah Academy\t8\t0",
  "101\tAri\tAlpha\t2\tLearning Night\tLatte and Learning\tEducational\t2\t2025-09-08 18:00:00.000\tLas Vegas\tDesert Torah Academy\t8\t0",
  "202\tBea\tBeta\t1\tKickoff\tSocial Event\tRecruitment\t1\t2025-09-01 18:00:00.000\tLas Vegas\tDesert Torah Academy\t7\t0",
  "202\tBea\tBeta\t3\tBowling\tSocial Event\tRecruitment\t1\t2025-09-15 18:00:00.000\tLas Vegas\tDesert Torah Academy\t7\t0",
  "101\tAri\tAlpha\t4\tShabbaton\tChapter Shabbaton\tShabbaton\t3\t2025-09-22 18:00:00.000\tLas Vegas\tDesert Torah Academy\t8\t0",
  "101\tAri\tAlpha\t8\tChapter Board Meeting\tBoard Meeting\tLeadership\t2\t2025-09-29 18:00:00.000\tLas Vegas\tDesert Torah Academy\t8\t0",
  "303\tCee\tGamma\t5\tGrade zero\tSocial Event\tRecruitment\t1\t2025-09-29 18:00:00.000\tLas Vegas\tDesert Torah Academy\t0\t1",
  "404\tDee\tDelta\t6\tTeen helper\tSocial Event\tRecruitment\t1\t2025-09-29 18:00:00.000\tLas Vegas\tDesert Torah Academy\t9\t1",
  "505\tEli\tFuture\t7\tSummer Future\tCamp Kesher\tSummer Programs\t4\t2026-06-21 20:00:00.000\tLas Vegas\tDesert Torah Academy\t6\t0"
].join("\n");

function main() {
  const rows = parseTsv(FIXTURE);
  const result = deriveJuniorWrapped(rows, {
    cutoffDate: "2026-06-05",
    top: 10
  });

  assert.strictEqual(result.summary.eligibleRows, 6);
  assert.strictEqual(result.summary.excludedGradeZeroRows, 1);
  assert.strictEqual(result.summary.excludedGradeNinePlusRows, 1);
  assert.strictEqual(result.summary.excludedFutureRows, 1);
  assert.strictEqual(result.summary.eligiblePeople, 2);

  const ariReview = result.reviewRecords.find((record) => record.source_personid === "101");
  assert(ariReview, "Ari should be in the review records");
  assert.strictEqual(ariReview.events_attended, 4);
  assert.strictEqual(ariReview.first_event_name, "Kickoff");
  assert.strictEqual(ariReview.longest_streak, 2);
  assert.strictEqual(ariReview.learning_sessions, 1);
  assert.strictEqual(ariReview.shabbatons, 1);
  assert.strictEqual(ariReview.board_meetings_attended, 1);
  assert.strictEqual(ariReview.leadership_moments, 1);
  assert.strictEqual(ariReview.events_with_peers, 1);

  const publicAri = result.teenRecords.find((record) => record.teen_name === "Ari A.");
  assert(publicAri, "Ari should have a public teen record");
  assert.strictEqual(publicAri.teen_name, "Ari A.");
  assert.strictEqual(publicAri.teen_slug, "west-coast-junior-01");
  assert.strictEqual(publicAri.brand_logo, "ncsy");
  assert.strictEqual(publicAri.chapter_name, "Las Vegas");
  assert.strictEqual(publicAri.region_name, "West Coast");
  assert(!Object.prototype.hasOwnProperty.call(publicAri, "personid"), "public record must not include personid");
  assert(!Object.prototype.hasOwnProperty.call(publicAri, "last_name"), "public record must not include last name");
  assert(!Object.prototype.hasOwnProperty.call(publicAri, "lastname"), "public record must not include raw lastname");
  assert(!Object.prototype.hasOwnProperty.call(publicAri, "friends_brought"), "public record must not invent friends_brought");
  assert(!Object.prototype.hasOwnProperty.call(publicAri, "streak_line"), "public record should not generate stale streak copy");
  assert.strictEqual(publicAri.board_meetings_attended, 1);

  const teenCards = wrappedApi.createTeenCards(publicAri);
  const connectorCard = teenCards.find((card) => card.theme === "teen-connector");
  assert.deepStrictEqual(connectorCard.connectorStats[0], {
    value: "1",
    label: "events with peers"
  });
  assert(!teenCards.some((card) => card.theme === "teen-streak"), "teen cards should not render a longest-streak card");
  assert(teenCards.some((card) => card.theme === "teen-schools" && card.stat === "1"), "teen cards should spotlight schools in the room");
  assert(teenCards.some((card) => card.theme === "teen-depth" && card.depthStats.some((stat) => stat.label === "board meeting")), "teen depth card should include board meeting count");
}

main();
console.log("junior wrapped derive test ok");
