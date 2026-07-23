import { type ApiHandler } from "../../../types.js";

const path: ApiHandler["path"] = "/appleMusicStatus";

const handler: ApiHandler["handler"] = (req, res) => {
	const deemix = req.app.get("deemix");
	res.send({ enabled: deemix.plugins.appleMusic.enabled });
};

const apiHandler: ApiHandler = { path, handler };

export default apiHandler;
