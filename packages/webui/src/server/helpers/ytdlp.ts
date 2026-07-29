// eslint-disable-next-line @typescript-eslint/no-require-imports
const YTDlpWrap = require("yt-dlp-wrap")
	.default as typeof import("yt-dlp-wrap").default;

import https from "https";
import fs from "fs";
import { join } from "path";
import { homedir } from "os";
import { chmodSync, mkdirSync, existsSync } from "fs";

const binDir = join(homedir(), ".config", "deemix-pro");
const binPath = join(
	binDir,
	process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);

function getAssetName(): string {
	if (process.platform === "win32") return "yt-dlp.exe";
	if (process.platform === "darwin") return "yt-dlp_macos";
	return "yt-dlp";
}

async function downloadBinary(dest: string): Promise<void> {
	const asset = getAssetName();
	const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
	mkdirSync(binDir, { recursive: true });

	await new Promise<void>((resolve, reject) => {
		function get(urlStr: string) {
			https
				.get(urlStr, (res) => {
					if (res.statusCode === 301 || res.statusCode === 302) {
						get(res.headers.location!);
						return;
					}
					if (res.statusCode !== 200) {
						reject(new Error(`Download failed: HTTP ${res.statusCode}`));
						return;
					}
					const file = fs.createWriteStream(dest);
					res.pipe(file);
					file.on("finish", () => file.close(() => resolve()));
					file.on("error", reject);
				})
				.on("error", reject);
		}
		get(url);
	});

	chmodSync(dest, 0o755);
}

let _instance: InstanceType<typeof YTDlpWrap> | null = null;

export async function getYtDlp(): Promise<InstanceType<typeof YTDlpWrap>> {
	if (_instance) return _instance;

	if (!existsSync(binPath)) {
		await downloadBinary(binPath);
	}

	_instance = new YTDlpWrap(binPath);
	return _instance;
}

// Resolve ffmpeg: prefer binary copied next to main.js at build time
function resolveFfmpegPath(): string | null {
	const bundled = join(
		__dirname,
		process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
	);
	if (existsSync(bundled)) return bundled;

	// Fallback: try ffmpeg-static (works when running from real node_modules)
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const p = require("ffmpeg-static") as string | null;
		if (p && existsSync(p)) return p;
	} catch {
		// no ffmpeg-static
	}

	return null;
}

export const ffmpegPath: string | null = resolveFfmpegPath();

// Find Node.js binary for yt-dlp's JS runtime (needed for YouTube extraction)
export function findNodeBinary(): string | null {
	const candidates = [
		"/opt/homebrew/opt/node@24/bin/node",
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
		"/usr/bin/node",
		"/usr/bin/nodejs",
	];
	for (const p of candidates) {
		if (existsSync(p)) return p;
	}
	return null;
}
