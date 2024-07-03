
if(!("window" in globalThis)) {
	const { Worker } = await import("node:worker_threads");

	class ErrorEvent extends Event {
		constructor(type, options) {
			super(type, options);
			this.message = options.message;
			this.filename = options.filename;
			this.lineno = options.lineno;
			this.colno = options.colno;
			this.error = options.error;
		}
	}

	class WebWorker extends EventTarget {
		#worker;

		constructor(...args) {
			super();
			this.#worker = new Worker(...args);
			this.#worker.on("error", (error) => {
				const event = new ErrorEvent("error", { error });
				this.onerror?.(event);
				this.dispatchEvent(event);
			});
			this.#worker.on("message", (data) => {
				const event = new MessageEvent("message", { data });
				this.onmessage?.(event);
				this.dispatchEvent(event);
			});
			this.#worker.on("messageerror", (data) => {
				const event = new MessageEvent("messageerror", { data });
				this.onmessageerror?.(event);
				this.dispatchEvent(event);
			});
		}

		postMessage(message, transfer) {
			this.#worker.postMessage(message, transfer);
		}

		terminate() {
			this.#worker.terminate();
		}
	}

	globalThis.Worker = WebWorker;
}
