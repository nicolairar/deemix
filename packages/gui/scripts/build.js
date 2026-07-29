import * as esbuild from "esbuild";
import fsp from "node:fs/promises";
import https from "node:https";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";
import { getArg, hasArg, log } from "./utils.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-set version: yyyy.mm.dd for the first build of the day,
// yyyy.mm.ddNN (NN = 02, 03…) for subsequent builds.
// If offline / no releases found today → plain date with no suffix.
async function resolveVersion() {
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth() + 1;
	const day = now.getDate();
	const todayPrefix = `${year}.${month}.${day}`;

	let hasPlainDate = false;
	let latestNN = 0;

	try {
		const headers = { "User-Agent": "deemix-build-script" };
		if (process.env.GITHUB_TOKEN)
			headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
		const tags = await new Promise((resolve) => {
			https
				.get(
					"https://api.github.com/repos/nicolairar/deemix/releases?per_page=20",
					{ headers },
					(res) => {
						let body = "";
						res.on("data", (c) => {
							body += c;
						});
						res.on("end", () => {
							try {
								resolve(JSON.parse(body).map((r) => r.tag_name));
							} catch {
								resolve([]);
							}
						});
					}
				)
				.on("error", () => resolve([]));
		});
		for (const tag of tags) {
			if (tag === todayPrefix) {
				hasPlainDate = true;
			} else if (tag.startsWith(todayPrefix)) {
				const nn = parseInt(tag.slice(todayPrefix.length), 10);
				if (!isNaN(nn) && nn > latestNN) latestNN = nn;
			}
		}
	} catch {
		// offline — no releases found, use plain date
	}

	// No releases today at all → first build, plain date
	if (!hasPlainDate && latestNN === 0) return todayPrefix;
	// Plain date exists but no numbered builds yet → next is 02
	if (hasPlainDate && latestNN === 0) return `${todayPrefix}02`;
	// Numbered builds exist → increment
	return `${todayPrefix}${String(latestNN + 1).padStart(2, "0")}`;
}

const version = await resolveVersion();
console.log(`[build] Version: ${version}`);
packageJson.version = version;
await fsp.writeFile(
	path.resolve(__dirname, "../package.json"),
	JSON.stringify(packageJson, null, "\t") + "\n"
);

async function main(argv) {
	const IS_WATCH = hasArg(argv, "--watch");
	const BUILD_MODE = getArg(argv, "--mode") || "development";
	const MAIN_DIR = path.resolve(__dirname, "../");
	const DIST_DIR = path.resolve(MAIN_DIR, "dist");
	const WEBUI_DIR = path.resolve(MAIN_DIR, "../webui");

	// Clear the dist folder
	console.log("[build] Clear dist dir");
	try {
		await fsp.rm(DIST_DIR, { recursive: true });
		await fsp.mkdir(DIST_DIR, { recursive: true });
	} catch (error) {
		console.log("[build] Clear dist error", error.message);
	}

	// Copy Web static resources
	if (BUILD_MODE == "production" || BUILD_MODE == "prerelease") {
		// Copy Web static resources
		console.log("[build] Copy web static dist");
		await fsp.cp(
			path.resolve(WEBUI_DIR, "dist/public"),
			path.resolve(DIST_DIR, "public"),
			{ recursive: true }
		);
	}

	// Copy update window HTML
	await fsp.copyFile(
		path.resolve(MAIN_DIR, "src/update-window.html"),
		path.resolve(DIST_DIR, "update-window.html")
	);

	// Build main and preload
	console.log("[build] Build 'main' and 'preload'");
	await Promise.all([
		(async () => {
			/**
			 * @type {import('esbuild').BuildOptions}
			 */
			const options = {
				inject: ["./scripts/cjs-shim.js"],
				entryPoints: ["./src/main.ts"],
				bundle: true,
				platform: "node",
				outfile: "./dist/main.js",
				target: "esnext",
				format: "esm",
				external: ["electron", "lightningcss"],
				define: {
					"process.env.NODE_ENV": JSON.stringify(BUILD_MODE),
					"process.env.GUI_VERSION": JSON.stringify(packageJson.version),
				},
				loader: {
					".node": "copy",
					".png": "file",
				},
				plugins: [log],
			};

			if (IS_WATCH) {
				await esbuild.context(options).then((ctx) => ctx.watch());
			} else {
				await esbuild.build(options);
			}
		})(),
		(async () => {
			/**
			 * @type {import('esbuild').BuildOptions}
			 */
			const options = {
				entryPoints: ["./src/preload.ts"],
				bundle: true,
				platform: "browser",
				outfile: "./dist/preload.js",
				target: "es2017",
				format: "iife",
				external: ["electron"],
				sourcemap: true,
				plugins: [log],
			};

			if (IS_WATCH) {
				await esbuild.context(options).then((ctx) => ctx.watch());
			} else {
				await esbuild.build(options);
			}
		})(),
		(async () => {
			const options = {
				entryPoints: ["./src/update-preload.ts"],
				bundle: true,
				platform: "browser",
				outfile: "./dist/update-preload.js",
				target: "es2017",
				format: "iife",
				external: ["electron"],
				sourcemap: true,
				plugins: [log],
			};

			if (IS_WATCH) {
				await esbuild.context(options).then((ctx) => ctx.watch());
			} else {
				await esbuild.build(options);
			}
		})(),
	]);

	console.log("[build] Complete.");
}

await main(process.argv);
