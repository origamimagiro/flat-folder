import { NOTE } from "./note.js";

let worker;
function create_worker() {
	if(worker) worker.terminate();
	worker = new Worker("src/worker/worker.js", { type: "module" });
}
create_worker();

// Handle NOTE 
worker.onmessage = event => {
    const data = event.data;
    NOTE[data.name](...data.args);
}

const rejects = new Set();
const handler = {
    get(target, name) {
        target[name] = target[name] || function(...args) {
            return new Promise((resolve, reject) => {
                const channel = new MessageChannel();
				rejects.add(reject);
                channel.port1.onmessage = event => {
					rejects.delete(reject);
					resolve(event.data);
				};
                worker.postMessage({ action: target._, name, args }, [channel.port2]);
            });
        };
        return target[name];
    }
};

export function abort() {
	// Reject all pending Promises
	for(const reject of rejects) reject();
	rejects.clear();
	
	// Simply kill the previous worker, releasing all memory
	create_worker();
}

// Proxy objects
export const X = new Proxy({ _: "X" }, handler);
export const SOLVER = new Proxy({ _: "SOLVER" }, handler);