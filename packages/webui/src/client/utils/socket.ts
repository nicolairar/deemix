class CustomSocket {
	private ws: WebSocket | null = null;
	private _listeners: Record<string, (data: any) => any> = {};
	private _rawListeners: Array<{ type: string; cb: EventListenerOrEventListenerObject }> = [];
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectDelay = 1000;

	constructor(private url: string) {
		this._connect();
	}

	private _connect() {
		this.ws = new WebSocket(this.url);

		// Re-attach raw listeners (addEventListener calls from outside)
		for (const { type, cb } of this._rawListeners) {
			this.ws.addEventListener(type, cb);
		}

		this.ws.addEventListener("open", () => {
			this.reconnectDelay = 1000;
			// Re-register message listeners on the new socket
			for (const [key, cb] of Object.entries(this._listeners)) {
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

	get readyState(): number {
		return this.ws?.readyState ?? WebSocket.CONNECTING;
	}

	addEventListener(type: string, cb: EventListenerOrEventListenerObject) {
		this._rawListeners.push({ type, cb });
		this.ws?.addEventListener(type, cb);
	}

	emit(key: string, data?: any) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
		this.ws.send(JSON.stringify({ key, data }));
		return true;
	}

	on(key: string, cb: (ev: any) => any) {
		if (!this._listeners[key]) {
			this._listeners[key] = cb;
			this._addMessageListener(key, cb);
		}
	}

	off(key: string) {
		delete this._listeners[key];
	}
}

export const socket = new CustomSocket(
	(location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/"
);
