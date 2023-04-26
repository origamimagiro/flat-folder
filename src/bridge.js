import { NOTE } from "./note.js";

// Initialize worker
const worker = new Worker("src/worker/worker.js", { type: "module" });

// Handle NOTE 
worker.onmessage = event => {
    const data = event.data;
    NOTE[data.name](...data.args);
}

const handler = {
    get(target, name) {
        target[name] = target[name] || function(...args) {
            return new Promise(resolve => {
                const channel = new MessageChannel();
                channel.port1.onmessage = event => resolve(event.data);
                worker.postMessage({ action: target._, name, args }, [channel.port2]);
            });
        };
        return target[name];
    }
};

// Proxy objects
export const X = new Proxy({ _: "X" }, handler);
export const SOLVER = new Proxy({ _: "SOLVER" }, handler);