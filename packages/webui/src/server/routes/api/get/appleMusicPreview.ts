import { type ApiHandler } from "../../../types.js";
import { logger } from "../../../helpers/logger.js";

const path: ApiHandler["path"] = "/appleMusicPreview";

const handler: ApiHandler["handler"] = async (req, res) => {
	const deemix = req.app.get("deemix");
	const url = req.query.url as string;

	if (!url) {
		res.status(400).json({ error: "Missing url parameter" });
		return;
	}

	try {
		const preview = await deemix.plugins.appleMusic.getPlaylistPreview(url);
		res.json(preview);
	} catch (e: any) {
		logger.error(e);
		res.status(500).json({ error: e.message ?? "Failed to fetch Apple Music playlist" });
	}
};

const apiHandler: ApiHandler = { path, handler };
export default apiHandler;
