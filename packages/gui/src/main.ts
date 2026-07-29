import { deemixApp } from "deemix-webui";
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Menu,
	MenuItem,
	shell,
} from "electron";
import { autoUpdater } from "electron-updater";
import contextMenu from "electron-context-menu";
import fs from "fs";
import { fileURLToPath } from "node:url";
import { platform } from "os";
import { join } from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require("electron-squirrel-startup") === true) app.quit();

const argv = await yargs(hideBin(process.argv)).options({
	port: { type: "string", default: "6595" },
	host: { type: "string", default: "0.0.0.0" },
	dev: { type: "boolean", default: false },
}).argv;

import path from "node:path";

const PORT = process.env.DEEMIX_SERVER_PORT || argv.port;
process.env.DEEMIX_SERVER_PORT = PORT;
process.env.DEEMIX_HOST = argv.host;

let win: BrowserWindow | null = null;

const windowStatePath = join(app.getPath("userData"), "window-state.json");

function getWindowState() {
	try {
		const data = fs.readFileSync(windowStatePath, "utf-8");
		return JSON.parse(data);
	} catch {
		return { width: 800, height: 600, isMaximized: false };
	}
}

function saveWindowState(win: BrowserWindow) {
	if (!win) return;
	const bounds = win.getNormalBounds();
	const isMaximized = win.isMaximized();
	fs.writeFileSync(windowStatePath, JSON.stringify({ ...bounds, isMaximized }));
}

async function main() {
	const state = getWindowState();
	win = new BrowserWindow({
		width: state.width || 800,
		height: state.height || 600,
		x: state.x,
		y: state.y,
		useContentSize: true,
		autoHideMenuBar: true,
		icon: join(
			path.dirname(fileURLToPath(import.meta.url)),
			platform() === "win32" ? "build/icon.ico" : "build/64x64.png"
		),
		webPreferences: {
			preload: join(path.dirname(fileURLToPath(import.meta.url)), "preload.js"),
		},
	});

	if (state.isMaximized) {
		win.maximize();
	}

	if (process.env.NODE_ENV === "development") {
		win.setMenu(null);

		const menu = new Menu();
		menu.append(
			new MenuItem({
				label: "DevTools",
				submenu: [
					{
						role: "reload",
						accelerator: "f5",
						click: () => {
							win.reload();
						},
					},
					{
						role: "toggleDevTools",
						accelerator: "f12",
						click: () => {
							win.webContents.toggleDevTools();
						},
					},
				],
			})
		);
		Menu.setApplicationMenu(menu);
	}

	// macOS app menu with "Controlla aggiornamenti"
	if (platform() === "darwin") {
		Menu.setApplicationMenu(
			Menu.buildFromTemplate([
				{
					label: app.name,
					submenu: [
						{ role: "about" },
						{ type: "separator" },
						{
							label: "Controlla aggiornamenti…",
							click: () => checkForUpdates(false),
						},
						{ type: "separator" },
						{ role: "services" },
						{ type: "separator" },
						{ role: "hide" },
						{ role: "hideOthers" },
						{ role: "unhide" },
						{ type: "separator" },
						{ role: "quit" },
					],
				},
				{
					label: "Modifica",
					submenu: [
						{ role: "undo" },
						{ role: "redo" },
						{ type: "separator" },
						{ role: "cut" },
						{ role: "copy" },
						{ role: "paste" },
						{ role: "selectAll" },
					],
				},
				{
					label: "Visualizza",
					submenu: [
						{ role: "reload" },
						{ role: "toggleDevTools" },
						{ type: "separator" },
						{ role: "resetZoom" },
						{ role: "zoomIn" },
						{ role: "zoomOut" },
						{ type: "separator" },
						{ role: "togglefullscreen" },
					],
				},
				{
					label: "Finestra",
					submenu: [
						{ role: "minimize" },
						{ role: "zoom" },
						{ type: "separator" },
						{ role: "front" },
					],
				},
			])
		);
	}

	// Open links in external browser
	win.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: "deny" };
	});

	win.loadURL(`http://localhost:${PORT}`);

	win.on("close", () => {
		saveWindowState(win!);
		if (deemixApp.getSettings().settings.clearQueueOnExit) {
			deemixApp.cancelAllDownloads();
		}
	});
}

app.on("ready", async () => {
	main();

	contextMenu({
		showLookUpSelection: false,
		showSearchWithGoogle: false,
		showInspectElement: false,
	});

	// Only one istance per time
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			main();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

// ─── Auto-update via electron-updater + GitHub Releases ──────────────────────

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.setFeedURL({
	provider: "github",
	owner: "nicolairar",
	repo: "deemix",
	private: false,
});

const skippedVersionPath = join(app.getPath("userData"), "skipped-version.txt");

function getSkippedVersion(): string {
	try {
		return fs.readFileSync(skippedVersionPath, "utf-8").trim();
	} catch {
		return "";
	}
}

function setSkippedVersion(version: string) {
	fs.writeFileSync(skippedVersionPath, version, "utf-8");
}

let isDownloading = false;
let silentCheck = true;

autoUpdater.on("update-available", async (info) => {
	if (getSkippedVersion() === info.version) return;

	const { response } = await dialog.showMessageBox(win!, {
		type: "info",
		title: "Update available",
		message: `Deemix Pro ${info.version} is available`,
		detail: `You are on ${app.getVersion()}. Do you want to download and install the update now?`,
		buttons: ["Download & Install", "Later", "Skip this version"],
		defaultId: 0,
		cancelId: 1,
	});

	if (response === 0) {
		isDownloading = true;
		autoUpdater.downloadUpdate();
	} else if (response === 2) {
		setSkippedVersion(info.version);
	}
});

autoUpdater.on("update-not-available", () => {
	if (!silentCheck) {
		dialog.showMessageBox(win!, {
			type: "info",
			title: "No updates",
			message: "You're up to date!",
			detail: `Deemix Pro ${app.getVersion()} is the latest version.`,
			buttons: ["OK"],
		});
	}
});

autoUpdater.on("download-progress", (progress) => {
	if (!isDownloading) return;
	const pct = Math.round(progress.percent);
	win?.setProgressBar(progress.percent / 100);
	win?.setTitle(`Deemix Pro — Downloading update ${pct}%…`);
});

autoUpdater.on("update-downloaded", async () => {
	win?.setProgressBar(-1);
	win?.setTitle("Deemix Pro");
	isDownloading = false;

	await dialog.showMessageBox(win!, {
		type: "info",
		title: "Update ready",
		message: "Update downloaded",
		detail:
			"The update has been downloaded. The app will now restart to install it.",
		buttons: ["Restart now"],
	});

	autoUpdater.quitAndInstall(false, true);
});

autoUpdater.on("error", (err) => {
	win?.setProgressBar(-1);
	win?.setTitle("Deemix Pro");
	isDownloading = false;
	if (!silentCheck) {
		dialog.showMessageBox(win!, {
			type: "error",
			title: "Update failed",
			message: "Could not check for updates",
			detail: err.message,
			buttons: ["OK"],
		});
	}
});

function checkForUpdates(silent = true) {
	silentCheck = silent;
	autoUpdater.checkForUpdates().catch(() => {});
}

app.whenReady().then(() => {
	setTimeout(() => checkForUpdates(true), 5000);
});

ipcMain.on("checkForUpdates", () => checkForUpdates(false));

ipcMain.on("openDownloadsFolder", () => {
	const { downloadLocation } = deemixApp.getSettings().settings;
	shell.openPath(downloadLocation);
});

ipcMain.on("selectDownloadFolder", async (event, downloadLocation) => {
	const path = await dialog.showOpenDialog(win, {
		defaultPath: downloadLocation,
		properties: ["openDirectory", "createDirectory"],
	});
	if (path.filePaths[0])
		win.webContents.send("downloadFolderSelected", path.filePaths[0]);
});
