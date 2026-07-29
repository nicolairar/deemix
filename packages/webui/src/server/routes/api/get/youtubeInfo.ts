import { type ApiHandler } from "../../../types.js";
import { getYtDlp, findNodeBinary } from "../../../helpers/ytdlp.js";
import { logger } from "../../../helpers/logger.js";

const path: ApiHandler["path"] = "/youtubeInfo";

const handler: ApiHandler["handler"] = async (req, res) => {
	const url = req.query.url as string;
	if (!url) {
		res.status(400).json({ error: "Missing url parameter" });
		return;
	}

	try {
		const ytdlp = await getYtDlp();
		const nodePath = findNodeBinary();
		const nodeArgs = nodePath ? ["--js-runtimes", `nodejs:${nodePath}`] : [];

		// --dump-single-json (-J) returns one JSON regardless of playlist vs video
		const stdout = await ytdlp.execPromise([
			url,
			"--dump-single-json",
			"--flat-playlist",
			...nodeArgs,
		]);

		const info = JSON.parse(stdout);

		if (info._type === "playlist") {
			res.json({
				type: "playlist",
				title: info.title,
				uploader: info.uploader ?? info.channel ?? "",
				thumbnail: info.thumbnails?.[0]?.url ?? null,
				count: info.entries?.length ?? 0,
				entries: (info.entries ?? []).map((e: any) => ({
					id: e.id,
					title: e.title,
					duration: e.duration,
					url: e.url?.startsWith("http")
						? e.url
						: `https://www.youtube.com/watch?v=${e.id}`,
				})),
			});
		} else {
			res.json({
				type: "video",
				id: info.id,
				title: info.title,
				uploader: info.uploader ?? info.channel ?? "",
				duration: info.duration,
				thumbnail: info.thumbnail ?? null,
				url,
			});
		}
	} catch (e: any) {
		logger.error(e);
		res.status(500).json({ error: e.message ?? "Failed to fetch info" });
	}
};

const apiHandler: ApiHandler = { path, handler };
export default apiHandler;
