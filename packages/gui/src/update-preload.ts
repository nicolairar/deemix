import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	onUpdateState: (
		cb: (state: string, payload: Record<string, unknown>) => void
	) => {
		ipcRenderer.on("update-state", (_event, state, payload) =>
			cb(state, payload)
		);
	},
	startDownload: () => ipcRenderer.send("update-start-download"),
	closeWindow: () => ipcRenderer.send("update-close-window"),
});
