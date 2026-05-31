const fs = require("fs");

const INLINE_PATH = "wordpress-inline-embed.html";
const CSS_PATH = "jsu-wrapped.css";
const JS_PATH = "jsu-wrapped.js";
const RENDERER_MARKER = "(function (root, factory) {";

const inline = fs.readFileSync(INLINE_PATH, "utf8");
const css = fs.readFileSync(CSS_PATH, "utf8").trim();
const js = fs.readFileSync(JS_PATH, "utf8").trim();

const styleOpen = inline.indexOf("<style>");
const scriptOpen = inline.indexOf("<script>", styleOpen);
const rendererStart = inline.indexOf(RENDERER_MARKER, scriptOpen);
const scriptClose = inline.lastIndexOf("</script>");

if (styleOpen === -1 || scriptOpen === -1 || rendererStart === -1 || scriptClose === -1) {
  throw new Error("Could not find expected WordPress inline embed markers.");
}

const shellPrefix = inline.slice(0, styleOpen);
const cookieHelper = inline.slice(scriptOpen + "<script>".length, rendererStart).trim();

const output = [
  shellPrefix,
  "<style>\n",
  css,
  "\n</style>\n\n<script>\n",
  cookieHelper,
  "\n\n",
  js,
  "\n</script>\n"
].join("");

fs.writeFileSync(INLINE_PATH, output);
console.log("wordpress-inline-embed.html synced");
