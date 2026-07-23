import { fetchData } from "@/utils/api-utils";

let settingsData = {};
let defaultSettingsData = {};
let spotifyCredentials: any = {};
let appleMusicCredentials: any = {};

export async function getSettingsData() {
	const data = await fetchData("getSettings");
	const { settings, defaultSettings, spotifySettings, appleMusicSettings } = data;

	settingsData = settings;
	defaultSettingsData = defaultSettings;
	spotifyCredentials = spotifySettings || {};
	appleMusicCredentials = appleMusicSettings || {};

	return { settingsData, defaultSettingsData, spotifyCredentials, appleMusicCredentials };
}

export function getInitialPreviewVolume() {
	let volume = parseInt(localStorage.getItem("previewVolume") ?? "");

	if (isNaN(volume)) {
		volume = 80; // Default
		localStorage.setItem("previewVolume", volume.toString());
	}

	return volume;
}
