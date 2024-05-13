import { M } from "./math.js";
import { CON } from "./constraints.js";
import { NOTE } from "./note.js";

export const X = {     // CONVERSION
    L_2_V_EV_EL: (L, eps) => {
        for (const l of L) {    // sort line's points by X then Y
            l.sort(([x1, y1], [x2, y2]) => {
                return (Math.abs(x1 - x2) < eps) ? (y1 - y2) : (x1 - x2);
            });
        }
        const I = L.map((_, i) => i);
        I.sort((i, j) => {      // sort first endpoint of lines by X then Y
            const [[x1, y1],] = L[i];
            const [[x2, y2],] = L[j];
            return (Math.abs(x1 - x2) < eps) ? (y1 - y2) : (x1 - x2);
        });
        const P = [];   // point with corresponding edge index [[x, y], i]
        let crossings = [];
        NOTE.start_check("line", L);
        for (const [i, idx] of I.entries()) {    // find line-line intersections
            NOTE.check(i);
            const [a, b] = L[idx];
            P.push([a, idx]);
            P.push([b, idx]);
            for (const [k, X] of crossings.entries()) {
                const [[c, d], j] = X;
                if ((d[0] + eps) < a[0]) {
                    crossings[k] = undefined;
                } else {
                    const x = M.intersect([a, b], [c, d], eps);
                    if (x != undefined) {
                        P.push([x, idx]);
                        P.push([x, j]);
                    }
                    if (M.on_segment(a, b, c, eps)) { P.push([c, idx]); }
                    if (M.on_segment(a, b, d, eps)) { P.push([d, idx]); }
                    if (M.on_segment(c, d, a, eps)) { P.push([a, j]); }
                    if (M.on_segment(c, d, b, eps)) { P.push([b, j]); }
                }
            }
            const temp = [[[a, b], idx]];
            for (const line of crossings) {
                if (line != undefined) {
                    temp.push(line);
                }
            }
            crossings = temp;
        }
        P.sort(([[x1, y1], i1], [[x2, y2], i2]) => {
            return (Math.abs(x1 - x2) < eps) ? (y1 - y2) : (x1 - x2);
        });
        let curr = [P[0]];
        const compressed_P = [curr];
        for (const point of P) {
            const [p, i1] = curr[0];
            const [q, i2] = point;
            if (M.close(p, q, eps)) {
                curr.push(point);
            } else {
                curr = [point];
                compressed_P.push(curr);
            }
        }
        const V = compressed_P.map((ps) => ps[0][0]);
        // 2) Constructing map from edges to overlapping lines
        const LP = L.map(() => new Set());
        for (const [i, cP] of compressed_P.entries()) {
            for (const [, j] of cP) {
                LP[j].add(i);
            }
        }
        const edges = new Map();
        for (const [i, S] of LP.entries()) {
            const points_on_line = Array.from(S);
            const [a, b] = L[i];
            const dir = M.sub(b, a);
            points_on_line.sort((pk, qk) => {
                const dp = M.dot(dir, V[pk]);
                const dq = M.dot(dir, V[qk]);
                return dp - dq;
            });
            let prev = points_on_line[0];
            for (const [j, curr] of points_on_line.entries()) {
                if (j == 0) { continue; }
                const k = M.encode_order_pair([curr, prev]);
                const E = edges.get(k);
                if (E == undefined) {
                    edges.set(k, [i]);
                } else {
                    E.push(i);
                }
                prev = curr;
            }
        }
        // 3) separate into EV and EL
        const [EV, EL] = [[], []];
        for (const [k, E] of edges) {
            EV.push(M.decode(k));
            EL.push(E);
        }
        return [V, EV, EL];
    },
    V_EV_2_VV_FV: (V, EV) => {
        const adj = V.map(() => []);
        for (const [pi, qi] of EV) {
            adj[pi].push(qi);
            adj[qi].push(pi);
        }
        const VV = [];
        for (const [i, v0] of V.entries()) {
            const A = [];
            for (const vi of adj[i]) {
                A.push([vi, M.angle(M.sub(V[vi], v0))]);
            }
            A.sort(([v1, a1], [v2, a2]) => a1 - a2);
            VV.push(A.map(([v, a]) => v));
        }
        const FV = [];
        const seen = new Set();
        for (const [v1, A] of VV.entries()) {
            for (const v2 of A) {
                const key = M.encode([v1, v2]);
                if (!(seen.has(key))) {
                    seen.add(key);
                    const F = [v1];
                    let [i, j] = [v1, v2];
                    while (j != v1) {
                        F.push(j);
                        [i, j] = [j, M.previous_in_list(VV[j], i)];
                        seen.add(M.encode([i, j]));
                    }
                    if (F.length > 2) {
                        FV.push(F);
                    }
                }
            }
        }
        M.sort_faces(FV, V);
        FV.pop(); // remove outer face
        return [VV, FV];
    },
    V_FV_2_VV: (V, FV) => {
        const next = V.map(() => new Map());
        const prev = V.map(() => new Map());
        for (const [fi, V] of FV.entries()) {
            let [v1, v2] = [V[V.length - 2], V[V.length - 1]];
            for (const v3 of V) {
                next[v2].set(v1, v3);
                prev[v2].set(v3, v1);
                [v1, v2] = [v2, v3];
            }
        }
        const VV = V.map(() => []);
        for (const [i, Adj] of VV.entries()) {
            const v0 = next[i].keys().next().value;
            let [v, v_] = [v0, undefined];
            const v1 = prev[i].get(v0);
            if (v1 != undefined) {
                [v, v_] = [v1, prev[i].get(v)];
                while ((v_ != undefined) && (v_ != v0)) {
                    [v, v_] = [v_, prev[i].get(v_)];
                }
            }
            const start = v;
            Adj.push(start);
            v = next[i].get(v);
            while ((v != undefined) && (v != start)) {
                Adj.push(v);
                v = next[i].get(v);
            }
        }
        return VV;
    },
    V_VV_EV_EA_2_VK: (V, VV, EV, EA) => {
        const VVA_map = new Map();
        for (const [i, [v1, v2]] of EV.entries()) {
            const a = EA[i];
            VVA_map.set(M.encode([v1, v2]), a);
            VVA_map.set(M.encode([v2, v1]), a);
        }
        const VK = [];
        for (const [i, A] of VV.entries()) {
            const adj = [];
            let boundary = false;
            let [count_M, count_V, count_U] = [0, 0, 0];
            for (const j of A) {
                const a = VVA_map.get(M.encode([i, j]));
                if (a == "B") {
                    boundary = true;
                    break;
                }
                if (a == "V" || a == "M" || a == "U") {
                    adj.push(j);
                }
                if (a == "M") { ++count_M; }
                if (a == "V") { ++count_V; }
                if (a == "U") { ++count_U; }
            }
            if (boundary || (adj.length == 0)) {
                VK.push(0);
            } else if (
                ((count_U == 0) && (Math.abs(count_M - count_V) != 2)) ||
                (adj.length % 2 != 0)
            ) {                       // violates Maekawa
                VK.push(1);           // far from zero
            } else {
                const angles = adj.map(j => M.angle(M.sub(V[j], V[i])));
                angles.sort((a, b) => a - b);
                let kawasaki = 0;
                for (let j = 0; j < angles.length; j += 2) {
                    kawasaki += angles[j + 1] - angles[j];
                }
                VK.push(Math.abs(kawasaki - Math.PI));
            }
        }
        return VK;
    },
    V_FV_EV_EA_2_Vf_Ff: (V, FV, EV, EA) => {
        const EA_map = new Map();
        for (const [i, vs] of EV.entries()) {
            EA_map.set(M.encode_order_pair(vs), EA[i]);
        }
        const EF_map = new Map();
        for (const [i, F] of FV.entries()) {
            for (const [j, v1] of F.entries()) {
                const v2 = F[(j + 1) % F.length];
                EF_map.set(M.encode([v2, v1]), i);
            }
        }
        const Vf = V.map((p) => undefined);
        const seen = new Set();
        seen.add(0);                    // start search at face 0
        const [v1, v2,] = FV[0];        // first edge of first face
        for (const i of [v1, v2]) {
            Vf[i] = V[i];
        }            // [face, edge, len, parity]
        const Ff = new Array(FV.length);
        const queue = [[0, v1, v2, Infinity, true]];
        let next = 0;
        while (next < queue.length) {                   // Prim's algorithm to
            const [fi, i1, i2, l, s] = queue[next];     // traverse face graph
            Ff[fi] = !s;                                // over spanning tree
            next += 1;                                  // crossing edges of
            const F = FV[fi];                           // maximum length
            const x = M.unit(M.sub(V[i2], V[i1]));
            const y = M.perp(x);
            const xf = M.unit(M.sub(Vf[i2], Vf[i1]));
            const yf = M.perp(xf);
            let vi = F[F.length - 1];
            for (const vj of F) {
                if (Vf[vj] == undefined) {
                    const v = M.sub(V[vj], V[i1]);
                    const dx = M.mul(xf, M.dot(v, x));
                    const dy = M.mul(yf, M.dot(v, y) * (s ? 1 : -1));
                    const vnew = M.add(M.add(dx, dy), Vf[i1]);
                    Vf[vj] = vnew;
                }
                const len = M.distsq(V[vi], V[vj]);
                const f = EF_map.get(M.encode([vi, vj]));
                const a = EA_map.get(M.encode_order_pair([vi, vj]));
                const new_s = (a == "M" || a == "V" || a == "U") ? !s : s;
                if ((f != undefined) && !seen.has(f)) {
                    queue.push([f, vj, vi, len, new_s]);
                    seen.add(f);
                    let prev = len;
                    for (let i = queue.length - 1; i > next; --i) {
                        const curr = queue[i - 1][3];   // O(n^2) but could be
                        if (curr < prev) {              // O(n log n)
                            [queue[i], queue[i - 1]] = [queue[i - 1], queue[i]];
                        } else {
                            break;
                        }
                        prev = curr;
                    }
                }
                vi = vj;
            }
        }
        for (const p of Vf) { if (p == undefined) { debugger; } }
        return [Vf, Ff];
    },
    EV_FV_2_EF_FE: (EV, FV) => {
        const EV_map = new Map();
        for (const [i, V] of EV.entries()) {
            EV_map.set(M.encode(V), i);
        }
        const EF = EV.map(() => [undefined, undefined]);
        for (const [i, F] of FV.entries()) {
            for (const [j, v1] of F.entries()) {
                const v2 = F[(j + 1) % F.length];
                const ei = EV_map.get(M.encode_order_pair([v1, v2]));
                const c = (v2 < v1) ? 0 : 1;
                EF[ei][c] = i;
            }
        }
        for (const [i, F] of EF.entries()) {
            const c = (F[0] == undefined) ? 1 :
                     ((F[1] == undefined) ? 0 : undefined);
            if (c != undefined) {
                EF[i] = [F[c]];
            }
        }
        const FE = FV.map((V) => {
            const E = [];
            let v1 = V[0];
            for (let i = 1; i < V.length; ++i) {
                const v2 = V[i];
                const k = M.encode_order_pair([v1, v2]);
                E.push(EV_map.get(k));
                v1 = v2;
            }
            const k = M.encode_order_pair([v1, V[0]]);
            E.push(EV_map.get(k));
            return E;
        });
        return [EF, FE];
    },
    EF_FV_SP_SE_CP_SC_2_CF_FC: (EF, FV, SP, SE, CP, SC) => {
        const SF_map = new Map();
        for (const [i, vs] of SP.entries()) {
            const Fs = [];
            for (const ei of SE[i]) {
                for (const f of EF[ei]) {
                    Fs.push(f);
                }
            }
            SF_map.set(M.encode_order_pair(vs), Fs);
        }
        const SC_map = new Map();
        for (const [i, C] of CP.entries()) {
            let v1 = C[C.length - 1];
            for (const v2 of C) {
                SC_map.set(M.encode([v2, v1]), i);
                v1 = v2;
            }
        }
        const CF = CP.map(() => []);
        const seen = new Set();
        const queue = [];
        for (const [i, Cs] of SC.entries()) {   // Look for a segment on the
            if (Cs.length == 1) {               // border of the overlap graph
                const ci = Cs[0];               // to start BFS
                CF[ci] = SF_map.get(M.encode_order_pair(SP[i]));
                queue.push(ci);
                seen.add(ci);
                break;
            }
        }
        let next = 0;
        while (next < queue.length) {   // BFS on cells in the overlap graph
            const ci = queue[next];
            next++;
            const C = CP[ci];
            let v1 = C[C.length - 1];
            for (const v2 of C) {
                const c = SC_map.get(M.encode([v1, v2]));
                if ((c != undefined) && !seen.has(c)) {
                    queue.push(c);
                    seen.add(c);
                    const Fs = new Set(CF[ci]);
                    const k = M.encode_order_pair([v1, v2]);
                    for (const f of SF_map.get(k)) {
                        const removed = Fs.delete(f);
                        if (!removed) {
                            Fs.add(f);
                        }
                    }
                    CF[c] = Array.from(Fs);
                }
                v1 = v2;
            }
        }
        const FC = FV.map(() => []);
        for (let ci = 0; ci < CF.length; ci++) {
            CF[ci].sort((a, b) => a - b);
            for (const f of CF[ci]) {
                FC[f].push(ci);
            }
        }
        return [CF, FC];
    },
    SE_2_ExE: (SE) => {
        const ExE = new Set();
        for (const edges of SE) {
            for (const [j, v1] of edges.entries()) {
                for (let k = j + 1; k < edges.length; ++k) {
                    const v2 = edges[k];
                    ExE.add(M.encode_order_pair([v1, v2]));
                }
            }
        }
        return Array.from(ExE);
    },
    SE_CF_SC_2_ExF: (SE, CF, SC) => {
        const ExF = new Set();
        for (const [i, C] of SC.entries()) {
            if (C.length == 2) {
                const E = SE[i];
                const [c1, c2] = C;
                const F = [];
                const F1 = new Set(CF[c1]);
                for (const fi of CF[c2]) {
                    if (F1.has(fi)) {
                        F.push(fi);
                    }
                }
                for (const ei of E) {
                    for (const fi of F) {
                        ExF.add(M.encode([ei, fi]));
                    }
                }
            }
        }
        return Array.from(ExF);
    },
    CF_2_BF: (CF) => {                          // O(|C|t^2) <= O(|F|^4)
        const BF_set = new Set();               // t is max faces in a cell
        NOTE.start_check("cell", CF);           // t^2 = O(|B|) <= O(|F|^2)
        for (const [i, F] of CF.entries()) {    // |C| = O(|F|^2)
            NOTE.check(i);
            for (const [j, f1] of F.entries()) {
                for (let k = j + 1; k < F.length; k++) {
                    const f2 = F[k];
                    BF_set.add(M.encode([f1, f2]));
                }
            }
        }
        const BF = Array.from(BF_set);
        BF.sort();
        return BF;                              // |BF| = O(|F|^2)
    },
    check_overlap: (p, BF_map) => {
        return (BF_map.has(M.encode_order_pair(p)) ? 1 : 0);
    },
    add_constraint: (T, BF_map, BT) => {
        if (T != undefined) {
            const [type, F] = T;
            const pairs = CON.type_F_2_pairs(type, F);
            for (const p of pairs) {
                const i = BF_map.get(M.encode_order_pair(p));
                if (i == undefined) { debugger; }
                BT[type][i].push(F);
            }
        }
    },
    BF_EF_ExE_ExF_BT3_2_BT0_BT1_BT2: (BF, EF, ExE, ExF, BT3) => {
        const BT0 = BF.map(() => []); // taco-taco
        const BT1 = BF.map(() => []); // taco-tortilla
        const BT2 = BF.map(() => []); // tortilla-tortilla
        const BT = [BT0, BT1, BT2];
        const BF_map = new Map();
        for (const [i, F] of BF.entries()) {
            BF_map.set(F, i);
        }
        NOTE.time("Computing from edge-edge intersections");
        NOTE.start_check("edge-edge intersection", ExE);
        for (const [i, k] of ExE.entries()) {
            NOTE.check(i);
            const [e1, e2] = M.decode(k);
            if ((EF[e1].length != 2) || (EF[e2].length != 2)) { continue; }
            const [f1, f2] = EF[e1];
            const [f3, f4] = EF[e2];
            // note that all of f1, f2, f3, f4 must be unique
            const f1f2 = X.check_overlap([f1, f2], BF_map);
            const f1f3 = X.check_overlap([f1, f3], BF_map);
            const f1f4 = X.check_overlap([f1, f4], BF_map);
            let cons;
            const choice = (f1f2 << 2) | (f1f3 << 1) | f1f4;
            switch (choice) {
                case 0: // 000
                    cons = [CON.T.taco_tortilla, [f3, f4, f2]]; break;
                case 1: // 001
                    cons = [CON.T.tortilla_tortilla, [f1, f2, f4, f3]]; break;
                case 2: // 010
                    cons = [CON.T.tortilla_tortilla, [f1, f2, f3, f4]]; break;
                case 3: // 011
                    cons = [CON.T.taco_tortilla, [f3, f4, f1]]; break;
                case 4: // 100  no overlap
                    break;
                case 5: // 101
                    cons = [CON.T.taco_tortilla, [f1, f2, f4]]; break;
                case 6: // 110
                    cons = [CON.T.taco_tortilla, [f1, f2, f3]]; break;
                case 7: // 111
                    cons = [CON.T.taco_taco, [f1, f2, f3, f4]]; break;
                default: break;
            }
            X.add_constraint(cons, BF_map, BT);
        }
        NOTE.time("Computing from edge-face intersections");
        NOTE.start_check("edge-face intersection", ExF);
        for (const [i, k] of ExF.entries()) {
            NOTE.check(i);
            const [e, f3] = M.decode(k);
            if (EF[e].length != 2) { continue; }
            const [f1, f2] = EF[e];
            if ((f1 == f3) || (f2 == f3)) { continue; }
            const f1f2 = X.check_overlap([f1, f2], BF_map);
            let cons;
            if (f1f2 == 1) {
                cons = [CON.T.taco_tortilla, [f1, f2, f3]];
            } else {
                cons = [CON.T.tortilla_tortilla, [f1, f2, f3, f3]];
            }
            X.add_constraint(cons, BF_map, BT);
        }
        NOTE.time("Cleaning transitivity constraints");
        const T3 = new Set();
        NOTE.start_check("variable", BF);
        for (const [i, k] of BF.entries()) {
            NOTE.check(i);
            for (const f3 of M.decode(BT3[i])) {
                T3.add(f3);
            }
            const [f1, f2] = M.decode(k);
            for (const T of [BT0[i], BT1[i]]) {
                for (const F of T) {
                    for (const f of F) {
                        T3.delete(f);
                    }
                }
            }
            BT3[i] = M.encode(T3);
            T3.clear();
        }
        return BT;
    },
    FC_CF_BF_2_BT3: (FC, CF, BF) => {            // O(|B|kt) <= O(|F|^5)
        const BT3 = [];                          // k is max cells in a face,
        const FC_sets = FC.map(C => new Set(C)); // t is max faces in a cell
        const T = new Set();                     // k = O(|C|) <= O(|F|^2)
        NOTE.start_check("variable", BF);        // t = O(|F|)
        for (const [i, k] of BF.entries()) {     // |B| = O(|F|^2)
            NOTE.check(i);
            const [f1, f2] = M.decode(k);
            const C = FC_sets[f1];
            for (const c of FC[f2]) {
                if (C.has(c)) {
                    for (const f3 of CF[c]) {
                        T.add(f3);
                    }
                }
            }
            T.delete(f1);
            T.delete(f2);
            BT3.push(M.encode(T));
            T.clear();
        }
        return BT3;                             // |BT3| = O(|B||F|) <= O(|F|^3)
    },
    EF_EA_Ff_BF_2_BA0: (EF, EA, Ff, BF) => {
        const BI_map = new Map();
        for (const [i, k] of BF.entries()) {
            BI_map.set(k, i);
        }
        const BA0 = BF.map(() => 0);
        for (const [i, a] of EA.entries()) {
            if ((a == "M") || (a == "V")) {
                const k = M.encode_order_pair(EF[i]);
                const [f1, f2] = M.decode(k);
                const o = ((!Ff[f1] && (a == "M")) ||
                            (Ff[f1] && (a == "V"))) ? 2 : 1;
                BA0[BI_map.get(k)] = o;
            }
        }
        return BA0;
    },
    BF_GB_GA_GI_2_edges: (BF, GB, GA, GI) => {
        const edges = [];
        NOTE.start_check("group", GB);
        for (const [i, B] of GB.entries()) {
            NOTE.check(i);
            const orders = M.bit_decode(GA[i][GI[i]], B.length);
            for (const [j, F] of B.entries()) {
                const [f1, f2] = M.decode(BF[F]);
                const o = orders[j];
                edges.push(M.encode((o == 1) ? [f1, f2] : [f2, f1]));
            }
        }
        return edges;
    },
    edges_Ff_2_FO: (edges, Ff) => {
        return edges.map((k) => {
            const [f1, f2] = M.decode(k);
            return [f1, f2, (Ff[f2] ? 1 : -1)];
        });
    },
    CF_edges_2_CD: (CF, edges) => {
        const edge_map = new Set(edges);
        NOTE.start_check("cell", CF);
        return CF.map((F, i) => {
            NOTE.check(i);
            const S = F.map(i => i);
            S.sort((a, b) => (edge_map.has(M.encode([a, b])) ? 1 : -1));
            return S;
        });
    },
    EF_SE_SC_CF_CD_2_SD: (EF, SE, SC, CF, CD) => {
        const FE_map = new Map();
        for (const [i, F] of EF.entries()) {
            if (F.length == 2) {
                const k = M.encode_order_pair(F);
                if (FE_map.has(k)) {
                    FE_map.get(k).push(i);
                } else {
                    FE_map.set(k, [i]);
                }
            }
        }
        const SE_map = SE.map(E => new Set(E));
        NOTE.start_check("segment", SC);
        return SC.map((C, i) => {
            NOTE.check(i);
            if ((C.length == 2) &&
                (CF[C[0]].length > 0) &&
                (CF[C[1]].length > 0)
            ) {
                const [f1, f2] = C.map(c => CD[c]);
                if ((f1 == undefined) && (f2 == undefined)) {
                    return "N";
                }
                if ((f1 == undefined) || (f2 == undefined)) {
                    return "B";
                }
                if (f1 == f2) {
                    return "N";
                }
                const k = M.encode_order_pair([f1, f2]);
                const E = FE_map.get(k);
                if (E != undefined) {
                    for (const e of E) {
                        if (SE_map[i].has(e)) {
                            return "C";
                        }
                    }
                }
            }
            return (CD[C[0]] == undefined) ? "N" : "B";
        });
    },
    Ctop_SC_SE_EF_Ff_2_SD: (Ctop, SC, SE, EF, Ff) => {
        const EF_set = new Set(
            EF.filter(F => F.length == 2).map(F => M.encode_order_pair(F)));
        const SD = SC.map((C, si) => {
            const F = C.map(ci => Ctop[ci]);
            if (F[0] == F[1]) { return "N"; }
            if ((F[0] == undefined) || (F[1] == undefined)) { return "B"; }
            const flips = F.map(fi => Ff[fi]);
            if ((flips[0] == flips[1]) &&
                EF_set.has(M.encode_order_pair(F))) { return "C"; }
            let left = false, right = false;
            for (const ei of SE[si]) {
                const [fi, fj] = EF[ei];
                if (Ff[fi] == Ff[fj]) { continue; }
                if ((fi == F[0]) || (fj == F[0])) { left = true; }
                if ((fi == F[1]) || (fj == F[1])) { right = true; }
            }
            if (left == right) { return "B"; }
            return left ? "BL" : "BR";
        });
        return SD;
    },
    Ctop_CP_SC_SD_Ff_P_2_RP_Rf: (Ctop, CP, SC, SD, Ff, P) => {
        const cn = Ctop.length;
        const CC = Array(cn).fill(0).map(() => []);
        for (let si = 0; si < SC.length; ++si) {
            const C = SC[si];
            if (C.length != 2) { continue; }
            const d = SD[si];
            if (SD[si][0] == "B") { continue; }
            const [ci, cj] = C;
            CC[ci].push(cj);
            CC[cj].push(ci);
        }
        const RP = [];
        const Rf = [];
        let ri = 0;
        const seen = Array(cn).fill(false);
        for (let ci = 0; ci < cn; ++ci) {
            const fi = Ctop[ci];
            if ((fi == undefined) || seen[ci]) { continue; }
            seen[ci] = true;
            const C = [ci];
            let i = 0;
            while (i < C.length) {
                for (const cj of CC[C[i]]) {
                    if (!seen[cj]) {
                        seen[cj] = true;
                        C.push(cj);
                    }
                }
                ++i;
            }
            const Adj = P.map(() => new Set());
            for (const ci of C) {
                const P_ = CP[ci];
                let pi = P_[P_.length - 1];
                for (const pj of P_) {
                    const A = Adj[pj];
                    if (A.has(pi)) {
                        A.delete(pi);
                    } else {
                        Adj[pi].add(pj);
                    }
                    pi = pj;
                }
            }
            let start;
            for (let i = 0; i < Adj.length; ++i) {
                if (Adj[i].size == 1) { start = i; break; }
            }
            const Q = [];
            let u = start;
            do {
                Q.push(u);
                let v;
                for (v of Adj[u]) { break; }
                u = v;
            } while (u != start);
            RP.push(Q);
            Rf.push(Ff[fi]);
        }
        return [RP, Rf];
    },
};
