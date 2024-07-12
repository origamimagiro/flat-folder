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
    BT3x_start: (BI) => {
        G.BI = BI;
        postMessage({type: "end"});
    },
    BT3x_stop: () => {
        G.BI.length = 0;
        delete G.BI;
        postMessage({type: "end"});
    },
    BT3x: (J) => {
        const out = J.map(([ci, c, C]) => {
            const cB = [];
            const K = C.map(a => G.BI.get(M.encode_order_pair([a, c])));
            for (let i = 0; i < C.length - 1; ++i) {
                const a = C[i];
                const kca = K[i];
                if (kca == undefined) { continue; }
                for (let j = i + 1; j < C.length; ++j) {
                    const b = C[j];
                    const kbc = K[j];
                    if (kbc == undefined) { continue; }
                    const kab = G.BI.get(M.encode_order_pair([a, b]));
                    if (kab == undefined) { continue; }
                    cB.push([a, b, kab, kbc, kca]);
                }
            }
            C.length = 0;
            K.length = 0;
            return [ci, c, cB];
        });
        postMessage({type: "end", arg: [id, out]});
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
