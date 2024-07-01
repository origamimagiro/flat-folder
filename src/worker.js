import { M } from "./math.js";
import { NOTE } from "./note.js";

let id;
const G = {};
onmessage = (e) => {
    const d = e.data;
    let out;
    switch (d.type) {
        case "map": out = actions[d.args.pop()](...d.args); break;
        case "init": NOTE.start(); id = d.args[0]; break;
        case "start": for (const [k, v] of Object.entries(d.args)) { G[k] = v; } break;
        case "stop": for (const k of Object.keys(G)) { delete G[k]; } break;
    }
    postMessage(out);
};

const actions = {
    BF: (J) => {
        if (J.length == 0) { return []; }
        const BF_set = new Set();
        if (id == 0) { NOTE.start_check(`worker ${id}: cell`, J); }
        for (let i = 0; i < J.length; ++i) {
            if (id == 0) { NOTE.check(i); }
            const [ji, F] = J[i];
            for (const [j, f1] of F.entries()) {
                for (let k = j + 1; k < F.length; k++) {
                    const f2 = F[k];
                    BF_set.add(M.encode([f1, f2]));
                }
            }
        }
        const out = J.map(([i, F]) => [i, []]);
        out[0][1] = Array.from(BF_set);
        return out;
    },
    BT3: (J) => {
        if (J.length == 0) { return []; }
        for (let i = 0; i < G.FC.length; ++i) { G.FC[i] = new Set(G.FC[i]); }
        const out = [];
        if (id == 0) { NOTE.start_check(`worker ${id}: variable`, J); }
        for (let i = 0; i < J.length; ++i) {
            if (id == 0) { NOTE.check(i); }
            const [ji, k] = J[i];
            const [f1, f2] = M.decode(k);
            const C = G.FC[f1];
            const T = new Set();
            for (const c of G.FC[f2]) {
                if (!C.has(c)) { continue; }
                for (const f3 of G.CF[c]) {
                    T.add(f3);
                }
            }
            T.delete(f1);
            T.delete(f2);
            out.push([ji, M.encode(T)]);
        }
        return out;
    },
};
