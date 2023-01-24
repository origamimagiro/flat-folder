import { M } from "./math.js";
import { NOTE } from "./note.js";
import { CON } from "./constraints.js";
import { X } from "./conversion.js";

export const SOLVER = {    // STATE SOLVER
    infer: (T, BI, BA) => {
        // In:   T | constraint of form [type, F]
        //      BI | map from variable keys to indices
        //      BA | array of variable assignments
        // Out:  I | false if BA conflicts with T, else array of pairs [i, a]
        //         | where a is assignment inferred for variable at index i
        const [type,] = T;
        const pairs = CON.T_2_pairs(T);
        const tuple = pairs.map(([x, y]) => {
            const a = BA[BI.get(M.encode_order_pair([x, y]))];
            if (a == undefined) { debugger; }
            return ((x < y) || (a == 0)) ? a : ((a == 1) ? 2 : 1);
        });
        const I = CON.implied[type].get(tuple.join(""));
        if (I == undefined) { debugger; }
        if (I == 0) { return false; }   // assignment not possible
        if (I == 1) { return [];    }   // possible, but nothing inferable
        return I.map(([i, a]) => {      // flip infered orders as necessary
            const [x, y] = pairs[i];
            const bi = BI.get(M.encode_order_pair([x, y]));
            if (y < x) { a = ((a == 1) ? 2 : 1); }
            return [bi, a];
        });
    },
    propagate: (bi, a, BI, BF, BT, BA) => {
        // In:  bi | variable index to be assigned
        //       a | proposed assignment
        //      BI | map from variable keys to indices
        //      BF | array of variable keys
        //      BT | array of variable constraints
        //      BA | array of variable assignments
        // Out:  B | array of variable indices assigned after assigning a to i
        //         | if assigning i to a impossible, returns empty array
        const B = [bi];
        BA[bi] = a;
        let idx = 0;
        while (idx < B.length) {  // BFS
            const i = B[idx];
            const [f1, f2] = M.decode(BF[i]);
            const C = BT[i];
            for (const type of CON.types) {
                for (const F of SOLVER.unpack_cons(C, type, f1, f2)) {
                    const I = SOLVER.infer([type, F], BI, BA);
                    if (I) {
                        for (const [j, s] of I) {
                            if (BA[j] == 0) {
                                B.push(j);
                                BA[j] = s;
                            } else {
                                if (BA[j] != s) {
                                    I = false;
                                    break;
                                } 
                            }
                        }
                    }
                    if (!I) {
                        for (const j of B) { // reset BA
                            BA[j] = 0;
                        }
                        return [];
                    }
                }
            }
            ++idx;
        }
        return B;
    },
    get_components: (BI, BF, BT, BA, B0) => {
        const GB = [];
        const seen = new Set();
        NOTE.start_check("variable", BF);
        for (const [bi, a] of BA.entries()) {
            if (!seen.has(bi) && (a == 0)) {
                const stack = [bi]; // DS for connected component
                seen.add(bi);
                let si = 0;
                while (si < stack.length) {
                    const bi_ = stack[si];
                    const C = BT[bi_];
                    const [f1, f2] = M.decode(BF[bi_]);
                    for (const type of CON.types) {
                        for (const F of SOLVER.unpack_cons(C, type, f1, f2)) {
                            const vars = CON.T_2_pairs([type, F]).map(
                                (p) => M.encode_order_pair(p));
                            for (const k__ of vars) {
                                const bi__ = BI.get(k__);
                                if (!seen.has(bi__) && (BA[bi__] == 0)) {
                                    stack.push(bi__);
                                    seen.add(bi__);
                                }
                                NOTE.check(seen.size);
                            }
                        }
                    }
                    ++si;
                }
                GB.push(stack);
            }
        }
        GB.sort((A, B) => A.length - B.length);
        GB.unshift(B0);
        return GB;
    },
    unpack_cons: (C, type, f1, f2) => {
        if (type == CON.transitivity) {
            return M.decode(C[type]).map(f3 => [f1, f2, f3]);
        } else {
            return C[type];
        }
    },
    guess_vars: (G, BI, BF, BT, BA, lim) => {
        const guesses = [];
        const A = [];
        const sol = G.map(() => 0);
        let idx = 0;
        let backtracking = false;  
        NOTE.start_check("state"); // at start of loop, idx is an index of G     
        while (true) {             // if backtracking, idx after the last guess
            NOTE.check(A.length);  //            else, idx to guess next        
            for (let i = 0; i < idx; ++i) { if (BA[G[i]] == 0) { debugger; } }
            if (backtracking) {
                if (guesses.length == 0) {
                    break;
                } 
                const guess = guesses.pop();
                const a = BA[guess[0]];
                while (G[idx] != guess[0]) {
                    idx--;
                    if (idx < 0) { debugger; }
                }
                for (const i of guess) {
                    BA[i] = 0;
                }
                if (a == 1) {
                    const B = SOLVER.propagate(G[idx], 2, BI, BF, BT, BA);
                    if (B.length > 0) {
                        guesses.push(B);
                        backtracking = false;
                        idx++;
                    } else {
                        guesses.push([G[idx]]);
                        BA[G[idx]] = 2;
                    }
                }
            } else {
                if (idx == G.length) {
                    for (const [i, gi] of G.entries()) {
                        sol[i] = BA[gi];
                    }
                    A.push(M.bit_encode(sol));
                    if (A.length >= lim) {
                        return A;
                    }
                    backtracking = true;
                } else {
                    if (BA[G[idx]] == 0) { // variable not yet set
                        const B = SOLVER.propagate(G[idx], 1, BI, BF, BT, BA);
                        if (B.length > 0) {
                            guesses.push(B);
                        } else {
                            guesses.push([G[idx]]);
                            BA[G[idx]] = 1;
                            backtracking = true;
                        }
                    }
                    idx++;
                }
            }
        }
        return A;
    },
    solve: (BF, BT, BA0, lim) => {
        // In:   BF | array for each variable: key 
        //       BT | array for each variable: constraints
        //      BA0 | array for each variable: known assignment
        //      lim | upper limit on # solutions to return per group
        // Out:  GB | array for each independent group: 
        //          |   array of variables in group
        //       GA | array for each independent group: 
        //          |   array of valid assignments:  (max length lim)
        //          |     array for each variable in group: an assignment
        //          | returns [] if no solutions found
        const BA = BA0.map(a => 0);
        const BI = new Map();
        for (const [i, F] of BF.entries()) {
            BI.set(F, i);
        }
        NOTE.time("Assigning orders based on crease assignment");
        const B0 = [];
        NOTE.start_check("crease", BA0);
        for (const [i, a] of BA0.entries()) {
            NOTE.check(i);
            const conflict = `  - Conflict assigning variable ${M.decode(BF[i])}`;
            if (a != 0) {
                if (BA[i] != 0) {
                    if (BA[i] != a) {
                        NOTE.log(conflict);
                        return [];
                    }
                } else {
                    const B = SOLVER.propagate(i, a, BI, BF, BT, BA);
                    if (B.length == 0) {
                        NOTE.log(conflict);
                        return [];
                    } else {
                        for (const b of B) {
                            B0.push(b); 
                        }
                    }
                }
            }
        }
        NOTE.annotate(B0, "initially assignable variables");
        NOTE.lap();
        NOTE.time("Finding unassigned components");
        const GB = SOLVER.get_components(BI, BF, BT, BA, B0);
        NOTE.count(GB.length - 1, "unassigned components");
        NOTE.lap();
        const GA = [[M.bit_encode(B0.map(i => BA[i]))]];
        for (const [i, B] of GB.entries()) {
            if (i == 0) { continue; }
            NOTE.time(`Solving component ${i} with size ${B.length}`);
            const A = SOLVER.guess_vars(B, BI, BF, BT, BA, lim);
            NOTE.count(A.length, "assignments");
            if (A.length == 0) {
                return [];
            }
            GA.push(A);
        }
        return [GB, GA];
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
    CF_edges_flip_2_CD: (CF, edges) => {
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
                FE_map.set(M.encode_order_pair(F), i);
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
                if (f1 == f2) {
                    return "N";
                }
                const k = M.encode_order_pair([f1, f2]);
                const e = FE_map.get(k);
                if ((e != undefined) && SE_map[i].has(e)) {
                    return "C";
                }
            }
            return "B";
        });
    },
};
