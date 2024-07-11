import "./node_Worker_polyfill/worker.js";
import { M } from "./math.js";
import { NOTE } from "./note.js";

let id;
const G = {};
onmessage = (e) => {
    const d = e.data;
    actions[d.type](...d.args);
};

const actions = {
    init: (id_) => {
        NOTE.log = (str) => {
            if (!NOTE.show) { return; }
            postMessage({type: "note", arg: str});
        };
        id = id_;
        postMessage({type: "end"});
    },
    BT3_start: (FC, CF) => {
        G.FC = FC.map(C => new Set(C));
        G.CF = CF;
        postMessage({type: "end"});
    },
    BT3_stop: () => {
        G.FC.length = 0;
        G.CF.length = 0;
        delete G.FC;
        delete G.CF;
        postMessage({type: "end"});
    },
    BT3: (J) => {
        const out = J.map(([i, k, bT3x]) => {
            const [f1, f2] = M.decode(k);
            const C = G.FC[f1];
            const T = new Set();
            const X = new Set();
            const S = new Set(M.decode(bT3x));
            for (const c of G.FC[f2]) {
                if (!C.has(c)) { continue; }
                for (const f3 of G.CF[c]) {
                    if ((f3 == f1) || (f3 == f2)) { continue; }
                    if (S.has(f3)) { X.add(f3); }
                    else           { T.add(f3); }
                }
            }
            return [i, M.encode(T), X.size];
        });
        postMessage({type: "end", arg: [id, out]});
    },
};
