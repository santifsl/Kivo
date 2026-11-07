// Bundles the widget loader into one file: dist/widget.js.
import * as esbuild from "esbuild";

const options = {
  entryPoints: ["src/index.ts"],
  outfile: "dist/widget.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2018",
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
