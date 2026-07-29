import { type ApiHandler } from "../../../types.js";
import {
	getYtDlp,
	ffmpegPath,
	findNodeBinary,
} from "../../../helpers/ytdlp.js";
import { logger } from "../../../helpers/logger.js";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { join } from "path";

const path: ApiHandler["path"] = "/youtubePlaylistDownload";

const handler: ApiHandler["handler"] = async (req, res) => {
	const { title, artist, cover, folder, entries } = req.body as {
		title: string;
		artist?: string;
		cover?: string;
		folder?: string;
		entries: { url: string; title: string }[];
	};

	if (!entries?.length) {
		res.status(400).json({ error: "Missing entries" });
		return;
	}

	const deemix = req.app.get("deemix");
	const settings = deemix.getSettings().settings;
	const downloadLocation: string = settings.downloadLocation;
	const concurrency: number = Math.max(1, settings.queueConcurrency ?? 3);

	const uuid = randomUUID();
	const outputDir = folder
		? join(downloadLocation, folder.replace(/[/\\:*?"<>|]/g, "_"))
		: downloadLocation;

	res.json({ result: true, uuid });

	const send = (key: string, data: unknown) => deemix.listener.send(key, data);
	const nodePath = findNodeBinary();
	const nodeArgs = nodePath ? ["--js-runtimes", `nodejs:${nodePath}`] : [];

	const firstUrl = entries[0]?.url ?? "";
	const source = firstUrl.includes("soundcloud.com") ? "soundcloud" : "youtube";

	send("addedToQueue", {
		uuid,
		title: title || "Playlist",
		artist: artist || "",
		cover: cover ?? null,
		size: entries.length,
		downloaded: 0,
		failed: 0,
		progress: 0,
		errors: [],
		type: `${source}_playlist`,
	});
	send("startDownload", uuid);

	try {
		mkdirSync(outputDir, { recursive: true });
		const ytdlp = await getYtDlp();
		const ffArgs = ffmpegPath ? ["--ffmpeg-location", ffmpegPath] : [];

		let completed = 0;

		async function downloadEntry(entry: { url: string; title: string }) {
			try {
				await new Promise<void>((resolve, reject) => {
					ytdlp
						.exec([
							entry.url,
							"-x",
							"--audio-format",
							"mp3",
							"--audio-quality",
							"0",
							"-o",
							`${outputDir}/%(title)s.%(ext)s`,
							"--no-playlist",
							"--embed-thumbnail",
							"--add-metadata",
							"--newline",
							...nodeArgs,
							...ffArgs,
						])
						.on("ytDlpEvent", (eventType: string, eventData: string) => {
							if (eventType === "download") {
								const m = eventData.match(/([\d.]+)%/);
								if (m) {
									// Progress = completed tracks + fraction of current track, averaged over total
									const overall =
										((completed + parseFloat(m[1]) / 100) / entries.length) *
										100;
									send("updateQueue", {
										uuid,
										progress: Math.min(99, overall),
									});
								}
							}
						})
						.on("error", (err: Error) => reject(err))
						.on("close", () => resolve());
				});

				completed++;
				send("updateQueue", { uuid, downloaded: true });
			} catch (e: any) {
				logger.error(e);
				completed++;
				send("updateQueue", {
					uuid,
					failed: true,
					error: e.message,
					data: { artist: artist || "", title: entry.title },
				});
			}
		}

		// Run up to `concurrency` downloads in parallel
		const queue = [...entries];
		const workers = Array.from(
			{ length: Math.min(concurrency, entries.length) },
			async () => {
				while (queue.length) {
					const entry = queue.shift()!;
					await downloadEntry(entry);
				}
			}
		);
		await Promise.all(workers);

		send("finishDownload", { uuid });
	} catch (e: any) {
		logger.error(e);
		send("updateQueue", {
			uuid,
			failed: true,
			error: e.message,
			data: { artist: artist || "", title },
		});
		send("finishDownload", { uuid });
	}
};

const apiHandler: ApiHandler = { path, handler };
export default apiHandler;
