import { NOTE } from "./note.js";

export const PAR = {
    send_message: async (w, type, args) => {
        return new Promise((res) => {
            w.onmessage = (e) => {
                if (e.data.type == "note") { NOTE.log(e.data.arg); return; }
                res(e.data.arg);
            };
            w.postMessage({type, args});
        });
    },
    get_workers: async (wn, path) => {
        if (wn == 1) { return undefined; }
        if ((typeof process !== 'undefined') && (process.release.name === 'node')) {
            await import("./node_Worker_polyfill/main.js");
        }
        NOTE.time(`*** Setting up ${wn} web workers ***`);
        const W = Array(wn).fill()
            .map(() => new Worker(path, {type: "module"}));
        for (const w of W) { w.onerror = (e) => { debugger; }; }
        await Promise.all(W.map((w, wi) => PAR.send_message(w, "init", [wi])));
        return W;
    },
    end_workers: async (W) => {
        for (const w of W) { w.terminate(); }
    },
};
