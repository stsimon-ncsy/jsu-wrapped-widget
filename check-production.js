const childProcess = require("child_process");

const COMMANDS = [
  nodeCommand("sync-wordpress-inline.js"),
  nodeCommand("--check", "check-production.js"),
  nodeCommand("--check", "jsu-wrapped.js"),
  nodeCommand("--check", "wrapped-builder.js"),
  nodeCommand("--check", "validate-wrapped-data.js"),
  nodeCommand("--check", "sync-wordpress-inline.js"),
  nodeCommand("--check", "generate-share-pages.js"),
  nodeCommand("--check", "merge-builder-submission.js"),
  nodeCommand("--check", "bump-cache-token.js"),
  nodeCommand("--check", "qa-smoke.js"),
  nodeCommand("validate-wrapped-data.js"),
  nodeCommand("generate-share-pages.js"),
  nodeCommand("qa-smoke.js"),
  command("git", ["diff", "--exit-code", "wordpress-inline-embed.html"], "git diff --exit-code wordpress-inline-embed.html"),
  command("git", ["diff", "--exit-code", "share"], "git diff --exit-code share"),
  command("git", ["status", "--porcelain", "--", "share"], "git status --porcelain -- share", { expectEmptyStdout: true }),
  command("git", ["diff", "--check"], "git diff --check")
];

function nodeCommand(...args) {
  return command(process.execPath, args, ["node"].concat(args).join(" "));
}

function command(file, args, display, options = {}) {
  return {
    args,
    display,
    expectEmptyStdout: Boolean(options.expectEmptyStdout),
    file
  };
}

function listCommands() {
  COMMANDS.forEach((item) => {
    console.log(item.display);
  });
}

function runCommand(item) {
  console.log(`\n> ${item.display}`);

  const result = childProcess.spawnSync(item.file, item.args, {
    encoding: "utf8",
    shell: false,
    stdio: item.expectEmptyStdout ? "pipe" : "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (item.expectEmptyStdout) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  }

  if (result.status !== 0) {
    throw new Error(`${item.display} exited with code ${result.status}`);
  }

  if (item.expectEmptyStdout && result.stdout.trim()) {
    throw new Error(`${item.display} returned unexpected output`);
  }
}

function runAll() {
  COMMANDS.forEach(runCommand);
  console.log("\nproduction check ok");
}

function main() {
  if (process.argv.includes("--list")) {
    listCommands();
    return;
  }

  runAll();
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`\nproduction check failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  COMMANDS,
  listCommands,
  runAll
};
