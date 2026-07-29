class CustomSocket {
	private ws: WebSocket | null = null;
	private _listeners: Record<string, Array<(data: any) => any>> = {};
	private _rawListeners: Array<{
		type: string;
		cb: EventListenerOrEventListenerObject;
	}> = [];
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
		});

		this.ws.addEventListener("message", (event) => {
			this._dispatchMessage(event);
		});

		this.ws.addEventListener("close", () => {
			this._scheduleReconnect();
		});

		this.ws.addEventListener("error", () => {
			this.ws?.close();
		});
	}

	private _dispatchMessage(event: MessageEvent) {
		try {
			const messageData = JSON.parse(event.data);
			const cbs = this._listeners[messageData.key];
			if (cbs) {
				for (const cb of cbs) {
					cb(messageData.data);
				}
			}
		} catch {
			// ignore malformed messages
		}
	}

	private _scheduleReconnect() {
		if (this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this._connect();
		}, this.reconnectDelay);
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000);
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
			this._listeners[key] = [];
		}
		if (!this._listeners[key].includes(cb)) {
			this._listeners[key].push(cb);
		}
	}

	off(key: string, cb?: (ev: any) => any) {
		if (!this._listeners[key]) return;
		if (cb) {
			this._listeners[key] = this._listeners[key].filter((fn) => fn !== cb);
		} else {
			delete this._listeners[key];
		}
	}
}

export const socket = new CustomSocket(
	(location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/"
);
