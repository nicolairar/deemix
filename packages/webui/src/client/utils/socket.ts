class CustomSocket {
	private ws: WebSocket | null = null;
	private listeners: Record<string, (data: any) => any> = {};
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectDelay = 1000;

	constructor(private url: string) {
		this._connect();
	}

	private _connect() {
		this.ws = new WebSocket(this.url);

		this.ws.addEventListener("open", () => {
			this.reconnectDelay = 1000;
			// Re-register all listeners on the new socket
			for (const [key, cb] of Object.entries(this.listeners)) {
				this._addMessageListener(key, cb);
			}
		});

		this.ws.addEventListener("close", () => {
			this._scheduleReconnect();
		});

		this.ws.addEventListener("error", () => {
			this.ws?.close();
		});
	}

	private _scheduleReconnect() {
		if (this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this._connect();
		}, this.reconnectDelay);
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000);
	}

	private _addMessageListener(key: string, cb: (data: any) => any) {
		this.ws?.addEventListener("message", (event) => {
			const messageData = JSON.parse(event.data);
			if (messageData.key === key) cb(messageData.data);
		});
	}

	emit(key: string, data?: any) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
		this.ws.send(JSON.stringify({ key, data }));
		return true;
	}

	on(key: string, cb: (ev: any) => any) {
		if (!this.listeners[key]) {
			this.listeners[key] = cb;
			this._addMessageListener(key, cb);
		}
	}

	off(key: string) {
		delete this.listeners[key];
		// Listeners on the old ws are cleaned up on next reconnect (new ws instance)
	}
}

export const socket = new CustomSocket(
	(location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/"
);
