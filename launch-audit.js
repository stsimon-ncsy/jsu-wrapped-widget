const childProcess = require("child_process");

const WORDPRESS_URL = "https://ncsy.org/ncsy-wrapped/?chapter=baltimore";
const GA4_PROPERTY = "G-Y3LLF5KQ23";

const automatedLocalGates = [
  {
    command: "node check-production.js",
    proves: "Syncs the inline WordPress handoff, validates JSON/config, regenerates share pages, runs QA/render smoke, and checks generated-file drift."
  },
  {
    command: "node render-smoke.js --skip-if-missing",
    proves: "Checks local mobile/desktop rendering, CTA form/link prefill, analytics smoke, layout smoke, and builder DOM when a browser is available."
  }
];

const postDeployLiveGates = [
  {
    command: "node hosted-smoke.js",
    proves: "Confirms GitHub Pages serves the current widget assets, JSON/config, builder, share pages, noindex QA pages, social image, and CORS for NCSY.org."
  },
  {
    command: `node wordpress-smoke.js --url "${WORDPRESS_URL}"`,
    proves: "Confirms the live NCSY.org shell has widget markup/assets, static first-paint shell, CTA target/form panel, GTM plumbing, privacy affordance, and crawler metadata."
  },
  {
    command: `node wordpress-runtime-smoke.js --url "${WORDPRESS_URL}"`,
    proves: "Launches a mobile browser against the live WordPress page and checks rendered height, final-card Share/Download/CTA, dataLayer context, and Gravity Forms prefill."
  }
];

const manualExternalConfirmations = [
  `GTM Preview and GA4 DebugView show JSU/NCSY Wrapped events arriving for property ${GA4_PROPERTY}.`,
  "Gravity Forms receives a real chapter-link test submission and staff can see the chapter, region, source URL, scope, variant, and year context.",
  "Run `node visual-review-packet.js`, then complete a human mobile and desktop visual review for clipped controls, overlapping text, missing logos, broken numbers, awkward first-load height, and framing.",
  "A real social share/debugger preview uses the intended JSU/NCSY title, description, URL, and campaign image for at least one chapter link.",
  "Staff ownership is clear for form replies, pilot builder submissions, and post-launch follow-up."
];

function gitOutput(args) {
  try {
    return childProcess.execFileSync("git", args, {
      encoding: "utf8",
      stdio: "pipe"
    }).trim();
  } catch (error) {
    return "";
  }
}

function workingTreeStatus() {
  const status = gitOutput(["status", "--porcelain"]);
  return status ? "dirty - review uncommitted changes before launch" : "clean";
}

function latestCommit() {
  return gitOutput(["rev-parse", "--short", "HEAD"]) || "unknown";
}

function formatGateList(items) {
  return items.map((item, index) => [
    `${index + 1}. ${item.command}`,
    `   Proves: ${item.proves}`
  ].join("\n")).join("\n");
}

function formatManualList(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function buildReport() {
  return [
    "JSU/NCSY Wrapped launch audit",
    "",
    `Latest commit: ${latestCommit()}`,
    `Working tree: ${workingTreeStatus()}`,
    "",
    "Automated local gates",
    formatGateList(automatedLocalGates),
    "",
    "Post-deploy and live gates",
    formatGateList(postDeployLiveGates),
    "",
    "Manual external confirmations",
    formatManualList(manualExternalConfirmations),
    "",
    "This command does not replace manual launch approval; it makes the automated and human gates explicit before a wider rollout."
  ].join("\n");
}

function main() {
  console.log(buildReport());
}

if (require.main === module) {
  main();
}

module.exports = {
  GA4_PROPERTY,
  WORDPRESS_URL,
  automatedLocalGates,
  buildReport,
  manualExternalConfirmations,
  postDeployLiveGates
};
