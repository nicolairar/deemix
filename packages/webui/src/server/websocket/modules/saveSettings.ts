import { WebSocketServer } from "ws";
import { logger } from "@/helpers/logger.js";
import { DeemixApp } from "@/deemixApp.js";
import type { Settings, SpotifySettings } from "deemix";

const eventName = "saveSettings";

export interface SaveSettingsData {
	settings: Settings;
	spotifySettings: SpotifySettings;
	appleMusicSettings?: {
		teamId: string;
		keyId: string;
		privateKey: string;
		fallbackSearch?: boolean;
	};
}

const cb = (
	data: SaveSettingsData,
	_: any,
	__: WebSocketServer,
	deemix: DeemixApp
) => {
	const { settings, spotifySettings, appleMusicSettings } = data;
	deemix.saveSettings(settings, spotifySettings);
	if (appleMusicSettings) {
		deemix.plugins.appleMusic.saveSettings(appleMusicSettings);
	}
	logger.info("Settings saved");
	deemix.listener.send("updateSettings", { settings, spotifySettings });
};

export default { eventName, cb };
