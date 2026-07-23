import crypto from "crypto";
import { Collection, Convertable } from "@/download-objects/Collection.js";
import { generateAlbumItem } from "@/download-objects/generateAlbumItem.js";
import { generateTrackItem } from "@/download-objects/generateTrackItem.js";
import {
	AlbumNotOnDeezer,
	LinkNotRecognized,
	PluginNotEnabledError,
	TrackNotOnDeezer,
} from "@/errors.js";
import { type Settings } from "@/types/Settings.js";
import { getConfigFolder } from "@/utils/localpaths.js";
import { queue } from "async";
import { Deezer, type DeezerTrack } from "deezer-sdk";
import fs from "fs";
import got from "got";
import { sep } from "path";
import BasePlugin from "./base.js";

// ─── Apple Music type definitions ────────────────────────────────────────────

interface AppleMusicArtwork {
	url: string;
	width?: number;
	height?: number;
}

interface AppleMusicTrackAttributes {
	name: string;
	artistName: string;
	albumName: string;
	isrc?: string;
	artwork?: AppleMusicArtwork;
	url?: string;
}

interface AppleMusicTrack {
	id: string;
	type: string;
	attributes: AppleMusicTrackAttributes;
}

interface AppleMusicAlbumAttributes {
	name: string;
	artistName: string;
	upc?: string;
	artwork?: AppleMusicArtwork;
	url?: string;
}

interface AppleMusicPlaylistAttributes {
	name: string;
	curatorName?: string;
	description?: { standard?: string };
	artwork?: AppleMusicArtwork;
	url?: string;
}

interface CachedTrack {
	id?: number | string;
	isrc?: string;
	data?: {
		title?: string;
		artist: string;
		album: string;
	};
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createDeveloperToken(
	teamId: string,
	keyId: string,
	privateKey: string
): string {
	const header = Buffer.from(
		JSON.stringify({ alg: "ES256", kid: keyId })
	).toString("base64url");
	const now = Math.floor(Date.now() / 1000);
	const payload = Buffer.from(
		JSON.stringify({ iss: teamId, iat: now, exp: now + 15777000 })
	).toString("base64url");
	const sign = crypto.createSign("SHA256");
	sign.update(`${header}.${payload}`);
	const sig = sign
		.sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
		.toString("base64url");
	return `${header}.${payload}.${sig}`;
}

function formatArtworkUrl(url: string, size = 500): string {
	return url.replace("{w}", String(size)).replace("{h}", String(size));
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class AppleMusicPlugin extends BasePlugin {
	credentials: { teamId: string; keyId: string; privateKey: string };
	settings: { fallbackSearch: boolean };
	enabled: boolean;
	configFolder: string;
	developerToken: string;

	constructor(configFolder = undefined) {
		super();
		this.credentials = { teamId: "", keyId: "", privateKey: "" };
		this.settings = { fallbackSearch: false };
		this.enabled = false;
		this.developerToken = "";
		this.configFolder = configFolder || getConfigFolder();
		this.configFolder += `apple-music${sep}`;
		return this;
	}

	override setup() {
		fs.mkdirSync(this.configFolder, { recursive: true });
		this.loadSettings();
		return this;
	}

	override async parseLink(link: string) {
		// Remove query string and trailing slash
		if (link.includes("?")) link = link.slice(0, link.indexOf("?"));
		if (link.includes("&")) link = link.slice(0, link.indexOf("&"));
		if (link.endsWith("/")) link = link.slice(0, -1);

		if (!link.includes("music.apple.com"))
			return [link, undefined, undefined, undefined];

		// https://music.apple.com/{storefront}/{type}/{name}/{id}
		const match =
			/music\.apple\.com\/([a-z]{2})\/(?:playlist|album|song)\/[^/]+\/([^/?&]+)/.exec(
				link
			);
		if (!match) return [link, undefined, undefined, undefined];

		const storefront = match[1];
		const id = match[2];

		let link_type: string;
		if (/\/playlist\//.test(link)) {
			link_type = "playlist";
		} else if (/\/album\//.test(link)) {
			link_type = "album";
		} else if (/\/song\//.test(link)) {
			link_type = "track";
		} else {
			return [link, undefined, undefined, undefined];
		}

		return [link, link_type, id, storefront];
	}

	override async generateDownloadObject(dz, link, bitrate) {
		let link_type, link_id, storefront;
		[link, link_type, link_id, storefront] = await this.parseLink(link);

		if (link_type == null || link_id == null) return null;

		switch (link_type) {
			case "track":
				return this.generateTrackItem(dz, link_id, bitrate, storefront);
			case "album":
				return this.generateAlbumItem(dz, link_id, bitrate, storefront);
			case "playlist":
				return this.generatePlaylistItem(dz, link_id, bitrate, storefront);
		}
	}

	// ─── Track ─────────────────────────────────────────────────────────────

	async generateTrackItem(
		dz: Deezer,
		linkId: string,
		bitrate: number,
		storefront = "us"
	) {
		const cache = this.loadCache();

		let cachedTrack: CachedTrack;
		if (cache.tracks[linkId]) {
			cachedTrack = cache.tracks[linkId];
		} else {
			cachedTrack = await this.getTrack(linkId, storefront);
			cache.tracks[linkId] = cachedTrack;
			this.saveCache(cache);
		}

		if (cachedTrack.isrc) {
			try {
				return generateTrackItem(dz, `isrc:${cachedTrack.isrc}`, bitrate);
			} catch {
				/* empty */
			}
		}

		if (this.settings.fallbackSearch) {
			if (!cachedTrack.id || cachedTrack.id === 0) {
				const trackID = await dz.api.get_track_id_from_metadata(
					cachedTrack.data.artist,
					cachedTrack.data.title,
					cachedTrack.data.album
				);
				if (trackID !== "0") {
					cachedTrack.id = trackID;
					cache.tracks[linkId] = cachedTrack;
					this.saveCache(cache);
				}
			}
			if (cachedTrack.id !== 0)
				return generateTrackItem(dz, cachedTrack.id, bitrate);
		}

		throw new TrackNotOnDeezer(
			`https://music.apple.com/song/${linkId}`
		);
	}

	// ─── Album ─────────────────────────────────────────────────────────────

	async generateAlbumItem(
		dz: Deezer,
		link_id: string,
		bitrate: number,
		storefront = "us"
	) {
		const cache = this.loadCache();

		let cachedAlbum;
		if (cache.albums[link_id]) {
			cachedAlbum = cache.albums[link_id];
		} else {
			cachedAlbum = await this.getAlbum(link_id, storefront);
			cache.albums[link_id] = cachedAlbum;
			this.saveCache(cache);
		}

		try {
			return generateAlbumItem(dz, `upc:${cachedAlbum.upc}`, bitrate);
		} catch {
			throw new AlbumNotOnDeezer(
				`https://music.apple.com/album/${link_id}`
			);
		}
	}

	// ─── Playlist ──────────────────────────────────────────────────────────

	async generatePlaylistItem(
		dz: Deezer,
		link_id: string,
		bitrate: number,
		storefront = "us"
	) {
		let link = `https://music.apple.com/${storefront}/playlist/x/${link_id}`;
		if (!this.enabled) throw new PluginNotEnabledError("Apple Music", link);

		const baseUrl = `https://api.music.apple.com/v1/catalog/${storefront}`;
		const headers = { Authorization: `Bearer ${this.developerToken}` };

		// Fetch first page (up to 300 tracks)
		let playlistResp: any;
		try {
			playlistResp = await got
				.get(`${baseUrl}/playlists/${link_id}?include=tracks`, {
					headers,
					responseType: "json",
				})
				.json();
		} catch (e: any) {
			if (e?.response?.statusCode === 401) {
				throw new PluginNotEnabledError("Apple Music", link);
			}
			if (e?.response?.statusCode === 404) {
				throw new LinkNotRecognized(link);
			}
			throw e;
		}

		const playlist = playlistResp.data[0];
		const attrs: AppleMusicPlaylistAttributes = playlist.attributes;

		// Collect all tracks, paginating if needed
		const tracklist: AppleMusicTrack[] = [
			...(playlist.relationships?.tracks?.data ?? []),
		];

		let nextUrl: string | null =
			playlist.relationships?.tracks?.next ?? null;
		while (nextUrl) {
			const page: any = await got
				.get(`https://api.music.apple.com${nextUrl}`, {
					headers,
					responseType: "json",
				})
				.json();
			if (Array.isArray(page.data)) {
				tracklist.push(...page.data);
			}
			nextUrl = page.next ?? null;
		}

		const artworkUrl = attrs.artwork
			? formatArtworkUrl(attrs.artwork.url)
			: "";
		const curatorName = attrs.curatorName ?? "";
		link = attrs.url ?? link;

		const playlistAPI: any = this._convertPlaylistStructure(
			playlist,
			tracklist,
			link,
			artworkUrl,
			curatorName
		);

		// Required so Album.makePlaylistCompilation sets mainArtist (used in path generation)
		playlistAPI.various_artist = await dz.api.get_artist(5080);

		return new Convertable({
			type: "apple_playlist",
			id: link_id,
			bitrate,
			title: attrs.name,
			artist: curatorName,
			cover: artworkUrl,
			explicit: false,
			size: tracklist.length,
			collection: {
				tracks: [],
				playlistAPI,
			},
			plugin: "appleMusic",
			conversion_data: tracklist,
		});
	}

	_convertPlaylistStructure(
		playlist: any,
		tracklist: AppleMusicTrack[],
		link: string,
		artworkUrl: string,
		curatorName: string
	) {
		const attrs: AppleMusicPlaylistAttributes = playlist.attributes;
		return {
			checksum: playlist.id,
			collaborative: false,
			creation_date: "XXXX-00-00",
			creator: {
				id: playlist.id,
				name: curatorName,
				tracklist: link,
				type: "user",
			},
			description: attrs.description?.standard ?? "",
			duration: 0,
			fans: 0,
			id: playlist.id,
			is_loved_track: false,
			link,
			nb_tracks: tracklist.length,
			picture: artworkUrl,
			picture_small: artworkUrl,
			picture_medium: artworkUrl,
			picture_big: artworkUrl,
			picture_thumbnail: artworkUrl,
			picture_xl: artworkUrl,
			public: true,
			share: link,
			title: attrs.name,
			tracklist: link,
			type: "playlist",
		};
	}

	// ─── Convert ───────────────────────────────────────────────────────────

	async convert(
		dz: Deezer,
		downloadObject: Convertable,
		settings: Settings,
		listener: any = null
	): Promise<Collection> {
		const cache = this.loadCache();

		let conversion = 0;
		let conversionNext = 0;

		const collection = [];
		if (listener)
			listener.send("startConversion", {
				uuid: downloadObject.uuid,
				title: downloadObject.title,
			});

		const q = queue(
			async (data: { track: AppleMusicTrack; pos: number }, callback) => {
				const { track, pos } = data;
				if (downloadObject.isCanceled) return;

				let cachedTrack: CachedTrack;
				if (cache.tracks[track.id]) {
					cachedTrack = cache.tracks[track.id];
				} else {
					cachedTrack = {
						isrc: track.attributes.isrc,
						data: {
							title: track.attributes.name,
							artist: track.attributes.artistName,
							album: track.attributes.albumName,
						},
					};
					cache.tracks[track.id] = cachedTrack;
					this.saveCache(cache);
				}

				let trackAPI: DeezerTrack;
				if (cachedTrack.isrc) {
					try {
						trackAPI = await dz.api.getTrackByISRC(cachedTrack.isrc);
						if (!trackAPI.id || !trackAPI.title) trackAPI = null;
					} catch {
						/* empty */
					}
				}

				if (this.settings.fallbackSearch && !trackAPI) {
					if (!cachedTrack.id || cachedTrack.id === "0") {
						const trackID = await dz.api.get_track_id_from_metadata(
							cachedTrack.data.artist,
							cachedTrack.data.title,
							cachedTrack.data.album
						);
						if (trackID !== "0") {
							cachedTrack.id = trackID;
							cache.tracks[track.id] = cachedTrack;
							this.saveCache(cache);
						}
					}
					if (cachedTrack.id !== "0")
						trackAPI = await dz.api.getTrack(cachedTrack.id);
				}

				if (!trackAPI) {
					trackAPI = {
						id: "0",
						title: track.attributes.name,
						duration: 0,
						md5_origin: 0,
						media_version: 0,
						filesizes: {},
						album: {
							title: track.attributes.albumName,
							md5_image: "",
						},
						artist: {
							id: 0,
							name: track.attributes.artistName,
							md5_image: "",
						},
					} as any;
				}

				(trackAPI as any).position = pos + 1;
				collection[pos] = trackAPI;

				conversionNext += (1 / downloadObject.size) * 100;
				if (
					Math.round(conversionNext) !== conversion &&
					Math.round(conversionNext) % 10 === 0 &&
					Math.round(conversionNext) !== 100
				) {
					conversion = Math.round(conversionNext);
					if (listener)
						listener.send("updateQueue", {
							uuid: downloadObject.uuid,
							title: downloadObject.title,
							conversion,
						});
				}

				callback();
			},
			settings.queueConcurrency
		);

		(downloadObject.conversionData as any[]).forEach((track, pos) => {
			q.push({ track, pos }, () => {});
		});

		await q.drain();

		downloadObject.collection.tracks = collection;
		downloadObject.size = collection.length;

		const returnCollection = new Collection(downloadObject.toDict());
		if (listener)
			listener.send("finishConversion", returnCollection.getSlimmedDict());

		fs.writeFileSync(this.configFolder + "cache.json", JSON.stringify(cache));
		return returnCollection;
	}

	// ─── MusicKit API helpers ──────────────────────────────────────────────

	async getTrack(trackId: string, storefront = "us"): Promise<CachedTrack> {
		if (!this.enabled) throw new PluginNotEnabledError("Apple Music");

		const url = `https://api.music.apple.com/v1/catalog/${storefront}/songs/${trackId}`;
		const resp: any = await got
			.get(url, {
				headers: { Authorization: `Bearer ${this.developerToken}` },
				responseType: "json",
			})
			.json();

		const track: AppleMusicTrack = resp.data[0];
		return {
			isrc: track.attributes.isrc,
			data: {
				title: track.attributes.name,
				artist: track.attributes.artistName,
				album: track.attributes.albumName,
			},
		};
	}

	async getAlbum(albumId: string, storefront = "us") {
		if (!this.enabled) throw new PluginNotEnabledError("Apple Music");

		const url = `https://api.music.apple.com/v1/catalog/${storefront}/albums/${albumId}`;
		const resp: any = await got
			.get(url, {
				headers: { Authorization: `Bearer ${this.developerToken}` },
				responseType: "json",
			})
			.json();

		const album = resp.data[0];
		const attrs: AppleMusicAlbumAttributes = album.attributes;
		return {
			upc: attrs.upc,
			data: {
				title: attrs.name,
				artist: attrs.artistName,
			},
		};
	}

	// ─── Settings / Credentials ────────────────────────────────────────────

	loadSettings() {
		if (!fs.existsSync(this.configFolder + "config.json")) {
			fs.writeFileSync(
				this.configFolder + "config.json",
				JSON.stringify(
					{
						...this.credentials,
						...this.settings,
					},
					null,
					2
				)
			);
		}
		let settings;
		try {
			settings = JSON.parse(
				fs.readFileSync(this.configFolder + "config.json").toString()
			);
		} catch (e) {
			if (e.name === "SyntaxError") {
				fs.writeFileSync(
					this.configFolder + "config.json",
					JSON.stringify(
						{
							...this.credentials,
							...this.settings,
						},
						null,
						2
					)
				);
			}
			settings = JSON.parse(
				JSON.stringify({
					...this.credentials,
					...this.settings,
				})
			);
		}
		this.setSettings(settings);
		this.checkCredentials();
	}

	saveSettings(newSettings?: any) {
		if (newSettings) this.setSettings(newSettings);
		this.checkCredentials();
		fs.writeFileSync(
			this.configFolder + "config.json",
			JSON.stringify(
				{
					...this.credentials,
					...this.settings,
				},
				null,
				2
			)
		);
	}

	getSettings() {
		return {
			...this.credentials,
			...this.settings,
		};
	}

	setSettings(newSettings: any) {
		this.credentials = {
			teamId: newSettings.teamId ?? "",
			keyId: newSettings.keyId ?? "",
			privateKey: newSettings.privateKey ?? "",
		};
		const settings = { ...newSettings };
		delete settings.teamId;
		delete settings.keyId;
		delete settings.privateKey;
		this.settings = {
			fallbackSearch: settings.fallbackSearch ?? false,
		};
	}

	// ─── Cache ─────────────────────────────────────────────────────────────

	loadCache() {
		let cache;
		try {
			cache = JSON.parse(
				fs.readFileSync(this.configFolder + "cache.json").toString()
			);
		} catch (e) {
			if (e.name === "SyntaxError") {
				fs.writeFileSync(
					this.configFolder + "cache.json",
					JSON.stringify({ tracks: {}, albums: {} }, null, 2)
				);
			}
			cache = { tracks: {}, albums: {} };
		}
		return cache;
	}

	saveCache(newCache: any) {
		fs.writeFileSync(
			this.configFolder + "cache.json",
			JSON.stringify(newCache)
		);
	}

	// ─── Credentials ───────────────────────────────────────────────────────

	checkCredentials() {
		// Env vars override config file
		const teamId =
			process.env.APPLE_TEAM_ID || this.credentials.teamId;
		const keyId =
			process.env.APPLE_KEY_ID || this.credentials.keyId;
		const rawKey =
			process.env.APPLE_PRIVATE_KEY || this.credentials.privateKey;

		// Normalise literal \n sequences embedded in env var values
		const privateKey = rawKey.replace(/\\n/g, "\n");

		if (!teamId || !keyId || !privateKey) {
			this.enabled = false;
			return;
		}

		try {
			this.developerToken = createDeveloperToken(teamId, keyId, privateKey);
			this.enabled = true;
		} catch {
			this.enabled = false;
		}
	}

	async getPlaylistPreview(url: string): Promise<{
		title: string;
		curator: string;
		artworkUrl: string;
		tracks: Array<{
			position: number;
			name: string;
			artist: string;
			album: string;
			isrc?: string;
		}>;
	}> {
		if (!this.enabled) throw new PluginNotEnabledError("Apple Music", url);

		const parsed = await this.parseLink(url);
		const [, link_type, link_id, storefront] = parsed;
		if (link_type !== "playlist" || !link_id) {
			throw new Error("URL is not an Apple Music playlist");
		}

		const baseUrl = `https://api.music.apple.com/v1/catalog/${storefront}`;
		const headers = { Authorization: `Bearer ${this.developerToken}` };

		let playlistResp: any;
		try {
			playlistResp = await got.get(`${baseUrl}/playlists/${link_id}?include=tracks`, {
				headers,
				responseType: "json",
			}).json();
		} catch (e: any) {
			if (e?.response?.statusCode === 401) throw new PluginNotEnabledError("Apple Music", url);
			if (e?.response?.statusCode === 404) throw new Error("Playlist not found on Apple Music");
			throw e;
		}

		const playlist = playlistResp.data[0];
		const attrs = playlist.attributes;
		const tracklist: AppleMusicTrack[] = [...(playlist.relationships?.tracks?.data ?? [])];

		// Paginate if needed
		let nextUrl: string | null = playlist.relationships?.tracks?.next ?? null;
		while (nextUrl) {
			const page: any = await got.get(`https://api.music.apple.com${nextUrl}`, {
				headers,
				responseType: "json",
			}).json();
			if (Array.isArray(page.data)) tracklist.push(...page.data);
			nextUrl = page.next ?? null;
		}

		return {
			title: attrs.name,
			curator: attrs.curatorName ?? "",
			artworkUrl: attrs.artwork ? formatArtworkUrl(attrs.artwork.url) : "",
			tracks: tracklist.map((t, i) => ({
				position: i + 1,
				name: t.attributes.name,
				artist: t.attributes.artistName,
				album: t.attributes.albumName,
				isrc: t.attributes.isrc,
			})),
		};
	}

	getCredentials() {
		return this.credentials;
	}

	setCredentials(teamId: string, keyId: string, privateKey: string) {
		this.credentials = {
			teamId: teamId.trim(),
			keyId: keyId.trim(),
			privateKey: privateKey.trim(),
		};
		this.saveSettings();
	}
}
