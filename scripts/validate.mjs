import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { compile } from "sass";

const about = JSON.parse(await readFile(new URL("../about.json", import.meta.url)));
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
assert.equal(about.component, true);
assert.equal(about.theme_version, pkg.version, "about.json theme_version 与 package.json version 不一致");

compile("common/common.scss");
await build({
  entryPoints: ["javascripts/discourse/api-initializers/moaclab-cad-viewer.gjs"],
  loader: { ".gjs": "js" },
  bundle: true,
  external: ["discourse/lib/api", "discourse-i18n"],
  write: false,
  logLevel: "silent",
});
console.log(`Moaclab CAD Viewer ${about.theme_version}: metadata, CSS and JavaScript checks passed.`);
