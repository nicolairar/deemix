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

const path: ApiHandler["path"] = "/youtubeDownload";

interface TrackMeta {
	title: string;
	artist: string;
	cover: string | null;
}

async function fetchMeta(url: string, nodeArgs: string[]): Promise<TrackMeta> {
	const ytdlp = await getYtDlp();
	const lines: string[] = [];
	await new Promise<void>((resolve, reject) => {
		ytdlp
			.exec([
				url,
				"--no-playlist",
				"--print",
				"%(title)s",
				"--print",
				"%(uploader|channel)s",
				"--print",
				"%(thumbnail)s",
				...nodeArgs,
			])
			.on("ytDlpEvent", (_: string, data: string) => {
				lines.push(data.trim());
			})
			.on("error", reject)
			.on("close", () => resolve());
	});
	return {
		title: lines[0] || url,
		artist: lines[1] || "",
		cover: lines[2] || null,
	};
}

const handler: ApiHandler["handler"] = async (req, res) => {
	const { url, title, artist, cover, folder } = req.body as {
		url: string;
		title?: string;
		artist?: string;
		cover?: string;
		folder?: string;
	};
	if (!url) {
		res.status(400).json({ error: "Missing url" });
		return;
	}

	const deemix = req.app.get("deemix");
	const downloadLocation: string =
		deemix.getSettings().settings.downloadLocation;
	const uuid = randomUUID();

	const outputDir = folder
		? join(downloadLocation, folder.replace(/[/\\:*?"<>|]/g, "_"))
		: downloadLocation;

	res.json({ result: true, uuid });

	const send = (key: string, data: unknown) => deemix.listener.send(key, data);

	const nodePath = findNodeBinary();
	const nodeArgs = nodePath ? ["--js-runtimes", `nodejs:${nodePath}`] : [];

	const needsMeta = !title || !cover;

	// Show item in queue immediately with placeholder while we fetch metadata
	const source = url.includes("soundcloud.com") ? "soundcloud" : "youtube";

	send("addedToQueue", {
		uuid,
		title: title || "Fetching…",
		artist: artist || "",
		cover: cover || null,
		size: 1,
		downloaded: 0,
		failed: 0,
		progress: 0,
		errors: [],
		type: `${source}_track`,
	});

	let trackTitle = title || "";
	let trackArtist = artist || "";
	let trackCover: string | null = cover || null;

	if (needsMeta) {
		try {
			const meta = await fetchMeta(url, nodeArgs);
			trackTitle = trackTitle || meta.title;
			trackArtist = trackArtist || meta.artist;
			trackCover = trackCover || meta.cover;
			// Update the queue item with real metadata
			send("updateQueueItem", {
				uuid,
				title: trackTitle,
				artist: trackArtist,
				cover: trackCover,
			});
		} catch {
			trackTitle = trackTitle || url;
		}
	}

	send("startDownload", uuid);

	try {
		mkdirSync(outputDir, { recursive: true });

		const ytdlp = await getYtDlp();
		const ffArgs = ffmpegPath ? ["--ffmpeg-location", ffmpegPath] : [];

		const args = [
			url,
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
		];

		let inConversion = false;

		await new Promise<void>((resolve, reject) => {
			ytdlp
				.exec(args)
				.on("ytDlpEvent", (eventType: string, eventData: string) => {
					if (eventType === "download") {
						const m = eventData.match(/([\d.]+)%/);
						if (m) {
							send("updateQueue", {
								uuid,
								progress: parseFloat(m[1]),
							});
						}
					} else if (
						(eventType === "ffmpeg" || eventData.includes("Destination")) &&
						!inConversion
					) {
						inConversion = true;
						send("startConversion", { uuid, title: trackTitle });
					}
				})
				.on("error", (err: Error) => reject(err))
				.on("close", () => resolve());
		});

		if (inConversion) {
			send("finishConversion", { uuid, size: 1 });
		}
		send("updateQueue", { uuid, downloaded: true });
		send("finishDownload", { uuid });
	} catch (e: any) {
		logger.error(e);
		send("updateQueue", {
			uuid,
			failed: true,
			error: e.message,
			data: { artist: trackArtist, title: trackTitle },
		});
		send("finishDownload", { uuid });
	}
};

const apiHandler: ApiHandler = { path, handler };
export default apiHandler;
