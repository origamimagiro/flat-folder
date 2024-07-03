import { NOTE } from "./note.js";

export const PAR = {
    send_work: async (W, type, args_f) => {
        return await Promise.all(W.map((w, wi) => new Promise((res) => {
            w.onmessage = (e) => res(e.data);
            const msg = {type, args: args_f(wi)};
            w.postMessage(msg);
        })));
    },
    get_workers: async (wn, path) => {
        if (wn == 1) { return undefined; }
        // await import("./node_Worker_polyfill/main.js");
        NOTE.time(`*** Setting up ${wn} web workers ***`);
        const W = Array(wn).fill()
            .map(() => new Worker(path, {type: "module"}));
        for (const w of W) { w.onerror = (e) => { debugger; }; }
        await PAR.send_work(W, "init", wi => [wi]);
        return W;
    },
    map_workers: async (W, A, type, init_args) => {
        NOTE.log(` -- Partitioning work`);
        const wn = W.length;
        const J = Array(wn).fill().map(() => []);
        for (let i = 0, ji = 0; i < A[0].length; ++i, ji = (ji + 1) % wn) {
            const args = [i];
            for (const a of A) { args.push(a[i]); }
            J[ji].push(args);
        }
        NOTE.log(` -- Initializing workers`);
        await PAR.send_work(W, "start", () => init_args);
        NOTE.log(` -- Assigning jobs to workers`);
        const R = await PAR.send_work(W, "map", wi => [J[wi], type]);
        NOTE.log(` -- Stopping workers`);
        await PAR.send_work(W, "stop", () => [type]);
        NOTE.log(" -- Compiling work");
        const out = Array(A[0].length).fill();
        for (const r of R) { for (const [i, x] of r) { out[i] = x; } }
        return out;
    },
};
