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

let updateWin: BrowserWindow | null = null;
let silentUpdateCheck = true;

function openUpdateWindow() {
	if (updateWin && !updateWin.isDestroyed()) {
		updateWin.focus();
		return;
	}
	updateWin = new BrowserWindow({
		width: 420,
		height: 360,
		resizable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		title: "Deemix Update",
		titleBarStyle: "hiddenInset",
		backgroundColor: "#1a1a2e",
		webPreferences: {
			preload: join(__dirname, "update-preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	updateWin.loadFile(join(__dirname, "update-window.html"));
	updateWin.on("closed", () => {
		updateWin = null;
	});
}

function sendToUpdateWin(state: string, payload?: Record<string, unknown>) {
	if (updateWin && !updateWin.isDestroyed()) {
		updateWin.webContents.send("update-state", state, payload ?? {});
	}
}

autoUpdater.on("checking-for-update", () => {
	sendToUpdateWin("checking");
});

autoUpdater.on("update-available", (info) => {
	if (silentUpdateCheck) {
		openUpdateWindow();
	}
	sendToUpdateWin("available", {
		version: info.version,
		current: app.getVersion(),
	});
});

autoUpdater.on("update-not-available", () => {
	if (!silentUpdateCheck) {
		sendToUpdateWin("not-available", { current: app.getVersion() });
	} else {
		updateWin?.close();
	}
});

autoUpdater.on("download-progress", (progress) => {
	sendToUpdateWin("progress", {
		percent: progress.percent,
		transferred: progress.transferred,
		total: progress.total,
	});
	win?.setProgressBar(progress.percent / 100);
});

autoUpdater.on("update-downloaded", () => {
	win?.setProgressBar(-1);
	sendToUpdateWin("downloaded");
	setTimeout(() => autoUpdater.quitAndInstall(false, true), 1500);
});

autoUpdater.on("error", (err) => {
	if (!silentUpdateCheck) {
		sendToUpdateWin("error", { message: err.message });
	} else {
		updateWin?.close();
	}
});

ipcMain.on("update-start-download", () => autoUpdater.downloadUpdate());
ipcMain.on("update-close-window", () => updateWin?.close());

function checkForUpdates(silent = false) {
	silentUpdateCheck = silent;
	if (!silent) openUpdateWindow();
	autoUpdater.checkForUpdates().catch(() => {});
}

// Check on startup (silent — only show dialog if update found)
app.whenReady().then(() => {
	setTimeout(() => checkForUpdates(true), 5000);
});

// Expose to renderer via IPC for a "Controlla aggiornamenti" menu item
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
