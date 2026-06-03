const fs = require("fs");

const INLINE_PATH = "wordpress-inline-embed.html";
const CSS_PATH = "jsu-wrapped.css";
const JS_PATH = "jsu-wrapped.js";
const RENDERER_MARKER = "(function (root, factory) {";
const STYLE_OPEN = "<style>";
const STYLE_CLOSE = "</style>";
const SCRIPT_OPEN = "<script>";
const SCRIPT_CLOSE = "</script>";

const inline = fs.readFileSync(INLINE_PATH, "utf8");
const css = fs.readFileSync(CSS_PATH, "utf8").trim();
const js = fs.readFileSync(JS_PATH, "utf8").trim();

const styleOpen = inline.indexOf(STYLE_OPEN);
const styleClose = styleOpen === -1 ? -1 : inline.indexOf(STYLE_CLOSE, styleOpen);
const rendererStart = inline.indexOf(RENDERER_MARKER);
const scriptOpen = rendererStart === -1 ? -1 : inline.lastIndexOf(SCRIPT_OPEN, rendererStart);
const scriptClose = rendererStart === -1 ? -1 : inline.indexOf(SCRIPT_CLOSE, rendererStart);

if (styleOpen === -1 || styleClose === -1 || scriptOpen === -1 || rendererStart === -1 || scriptClose === -1) {
  throw new Error("Could not find expected WordPress inline embed markers.");
}

function removeRanges(text, ranges) {
  return ranges
    .slice()
    .sort((a, b) => b.start - a.start)
    .reduce((current, range) => current.slice(0, range.start) + current.slice(range.end), text);
}

function splitIntroComment(text) {
  const trimmed = text.trimStart();
  const offset = text.length - trimmed.length;

  if (!trimmed.startsWith("<!--")) {
    return ["", trimmed.trim()];
  }

  const commentEnd = trimmed.indexOf("-->");

  if (commentEnd === -1) {
    return ["", trimmed.trim()];
  }

  return [
    text.slice(offset, offset + commentEnd + 3).trim(),
    trimmed.slice(commentEnd + 3).trim()
  ];
}

const cookieHelper = inline.slice(scriptOpen + SCRIPT_OPEN.length, rendererStart).trim();
const shellMarkup = removeRanges(inline, [
  { start: styleOpen, end: styleClose + STYLE_CLOSE.length },
  { start: scriptOpen, end: scriptClose + SCRIPT_CLOSE.length }
]);
const [introComment, shellBody] = splitIntroComment(shellMarkup);

const output = [
  introComment,
  "\n\n<style>\n",
  css,
  "\n</style>\n\n",
  shellBody,
  "\n\n<script>\n",
  cookieHelper,
  "\n\n",
  js,
  "\n</script>\n"
].join("");

fs.writeFileSync(INLINE_PATH, output);
console.log("wordpress-inline-embed.html synced");
