import type { ApiHandler } from "@/types.js";

const path = "/saveAppleMusicCredentials";

interface SaveAppleMusicCredentialsData {
	teamId: string;
	keyId: string;
	privateKey: string;
	fallbackSearch?: boolean;
}

const handler: ApiHandler["handler"] = (req, res) => {
	const deemix = req.app.get("deemix");
	const {
		teamId,
		keyId,
		privateKey,
		fallbackSearch,
	}: SaveAppleMusicCredentialsData = req.body ?? req.query;

	const newSettings: any = { teamId, keyId, privateKey };
	if (fallbackSearch !== undefined) newSettings.fallbackSearch = fallbackSearch;

	deemix.plugins.appleMusic.saveSettings(newSettings);

	res.send({
		result: true,
		enabled: deemix.plugins.appleMusic.enabled,
	});
};

const apiHandler: ApiHandler = { path, handler };

export default apiHandler;
