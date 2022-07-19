import {CONSTRAINTS, CON, NOC} from "./constraints.js";

window.onload = () => {     // entry point
    document.getElementById("import-file").onchange = (e) => {
        if (e.target.files.length > 0) {
            const file_reader = new FileReader();
            file_reader.onload = process_file;
            file_reader.readAsText(e.target.files[0]);
        }
    };
    SVG.init("main", {h: 700, w: 700, x:   0, y:   0, s:  700, m:  0}); 
    SVG.init("flat", {h: 350, w: 350, x:   0, y:   0, s: 1000, m: 50}); 
    SVG.init("cell", {h: 350, w: 350, x: 350, y:   0, s: 1000, m: 50}); 
    SVG.init("xray", {h: 350, w: 350, x:   0, y: 350, s: 1000, m: 50}); 
    SVG.init("fold", {h: 350, w: 350, x: 350, y: 350, s: 1000, m: 50}); 
    for (const id of ["fold-controls", "state-display", "fold_link", 
            "svg_link", "log_link"]) {
        document.getElementById(id).style.display = "none";
    }
};

const process_file = (e) => {
    NOTE.clear_log();
    NOTE.time("*** Starting File Import ***");
    const start = Date.now();
    NOTE.start_lap();
    const doc = e.target.result;
    const file_name = document.getElementById("import-file").value;
    const parts = file_name.split(".");
    const type = parts[parts.length - 1].toLowerCase();
    NOTE.time(`Importing from file ${file_name}`);
    const [P, VV, EV, EA, EF, FV] = IO.doc_type_2_V_VV_EV_EA_EF_FV(doc, type);
    if (P == undefined) { return; }
    const VK = (VV == undefined) ? undefined : X.V_VV_EV_EA_2_VK(P, VV, EV, EA);
    const V = M.normalize_points(P);
    NOTE.annotate(V, "vertices_coords");
    NOTE.annotate(EV, "edges_vertices");
    NOTE.annotate(EA, "edges_assignments");
    NOTE.annotate(EF, "edges_faces");
    NOTE.annotate(FV, "faces_vertices");
    const Vf = M.normalize_points(X.V_VF_EV_EA_2_Vf(V, FV, EV, EA));
    NOTE.annotate(Vf, "vertices_coords_folded");
    const Ff = X.V_FV_2_Ff(Vf, FV);
    NOTE.annotate(Ff, "faces_flip");
    NOTE.lap();
    const FOLD = {V, Vf, VK, EV, EA, EF, FV, Ff};
    NOTE.time("Updating Interface...");
    GUI.update_flat(FOLD);
    GUI.update_xray(FOLD);
    for (const id of ["fold", "cell", "component-select", "state-select", 
            "num-states"]) {
        SVG.clear(id);
    }
    document.getElementById("state-display").style.display = "none";
    document.getElementById("fold-controls").style.display = "block";
    document.getElementById("display-text").onchange = (e) => {
        GUI.update_flat(FOLD);
    };
    document.getElementById("export_button").onclick = (e) => {
        IO.write(FOLD);
    };
    document.getElementById("fold_button").onclick = (e) => {
        compute_cells(FOLD);
    };
    NOTE.lap();
    stop = Date.now();
    NOTE.time(`End of computation, total time elapsed ${
        NOTE.time_string(stop - start)}`);
};

const compute_cells = (FOLD) => {
    const start = Date.now();
    NOTE.time("*** Computing cell graph ***");
    const {V, Vf, EV, FV, Ff} = FOLD;
    const L = EV.map((P) => M.expand(P, Vf));
    const eps = M.min_line_length(L) / M.EPS;
    NOTE.lap();
    NOTE.time(`Using eps ${eps} from min line length ${eps*M.EPS}`);
    NOTE.time("Constructing points and segments from edges...");
    const [P, SP, SE] = X.L_2_V_EV_EL(L, eps);
    NOTE.annotate(P, "points_coords");
    NOTE.annotate(SP, "segments_points");
    NOTE.lap();
    NOTE.time("Constructing cells from segments...");
    const [,CP] = X.V_EV_2_VV_FV(P, SP);
    NOTE.annotate(CP, "cells_points");
    NOTE.lap();
    NOTE.time("Computing segments_cells");
    const SC = X.EV_FV_2_EF(SP, CP);
    NOTE.annotate(SC, "segments_cells");
    NOTE.lap();
    NOTE.time("Making face-cell maps");
    const [CF, FC] = X.V_FV_P_CP_2_CF_FC(Vf, FV, P, CP);
    NOTE.count(CF, "face-cell adjacencies");
    NOTE.lap();
    const CELL = {P, SP, SE, CP, SC, CF, FC};
    GUI.update_cell(CELL);
    NOTE.lap();
    document.getElementById("display-text").onchange = (e) => {
        GUI.update_flat(FOLD);
        GUI.update_cell(CELL);
    };
    window.setTimeout(compute_constraints, 0, FOLD, CELL, start);
};

const compute_constraints = (FOLD, CELL, start) => {
    const {V, Vf, EV, EA, EF, FV, Ff} = FOLD;
    const {P, SP, SE, CP, SC, CF, FC} = CELL;
    NOTE.time("*** Computing constraints ***");
    NOTE.time("Computing edge-edge overlaps");
    const ExE = X.SE_2_ExE(SE);
    NOTE.count(ExE, "edge-edge adjacencies");
    NOTE.lap();
    NOTE.time("Computing edge-face overlaps");
    const ExF = X.SE_CF_SC_2_ExF(SE, CF, SC);
    NOTE.count(ExF, "edge-face adjacencies");
    NOTE.lap();
    NOTE.time("Computing variables");
    const BF = X.CF_2_BF(CF);
    NOTE.annotate(BF, "variables_faces");
    NOTE.lap();
    NOTE.time("Computing transitivity constraints");
    const BT3 = X.FC_CF_BF_2_BT3(FC, CF, BF);
    NOTE.count(BT3, "initial transitivity", 3);
    NOTE.lap();
    NOTE.time("Computing non-transitivity constraints");
    const [BT0, BT1, BT2] = X.BF_EF_ExE_ExF_BT3_2_BT0_BT1_BT2(BF, EF, ExE, ExF, BT3);
    NOTE.count(BT0, "taco-taco", 6);
    NOTE.count(BT1, "taco-tortilla", 3);
    NOTE.count(BT2, "tortilla-tortilla", 2);
    NOTE.count(BT3, "independent transitivity", 3);
    const BT = BF.map((F,i) => [BT0[i], BT1[i], BT2[i], BT3[i]]);
    NOTE.lap();
    GUI.update_cell_face_listeners(FOLD, CELL, BF, BT);
    document.getElementById("display-text").onchange = (e) => {
        GUI.update_flat(FOLD);
        GUI.update_cell(CELL);
        GUI.update_cell_face_listeners(FOLD, CELL, BF, BT);
    };
    window.setTimeout(compute_states, 0, FOLD, CELL, BF, BT, start);
};

const compute_states = (FOLD, CELL, BF, BT, start) => {
    const {V, Vf, EV, EA, EF, FV, Ff} = FOLD;
    const {P, SP, SE, CP, SC, CF, FC} = CELL;
    NOTE.time("*** Computing states ***");
    const BA0 = X.EF_EA_Ff_BF_2_BA(EF, EA, Ff, BF);
    const val = document.getElementById("limit-select").value;
    const lim = (val == "1") ? 1 : ((val == "10") ? 10 : Infinity);
    const [GB, GA] = SOLVER.solve(BF, BT, BA0, lim);
    let n = 0;
    if (GA != undefined) {
        n = 1;
        for (const A of GA) {
            n *= A.length;
        }
    }
    NOTE.count(n, "folded states");
    NOTE.lap();
    GUI.update_xray(FOLD, BF, GB, GA);
    NOTE.lap();
    document.getElementById("state-display").style.display = "block";
    const state_controls = document.getElementById("state-controls");
    const num_states = document.getElementById("num-states");
    if (n == 0) {
        state_controls.style.display = "none"; 
        num_states.textContent = `# States Found: 0 || `;
    } else {
        state_controls.style.display = "inline"; 
        num_states.textContent = `# States Found: ${n} || `;
        const GI = GB.map(() => 0);
        const comp_select = SVG.clear("component-select");
        for (let i = 0; i < GI.length; ++i) {
            const el = document.createElement("option");
            el.setAttribute("value", `${i}`);
            el.textContent = `${i}`
            comp_select.appendChild(el);
        }
        comp_select.onchange = (e) => {
            GUI.update_component(FOLD, CELL, BF, GB, GA, GI, +e.target.value);
        };
        document.getElementById("flip").onchange = (e) => {
            GUI.update_fold(FOLD, CELL, BF, GB, GA, GI);
        };
        GUI.update_component(FOLD, CELL, BF, GB, GA, GI, 0);
        GUI.update_fold(FOLD, CELL, BF, GB, GA, GI);
    }
    NOTE.lap();
    stop = Date.now();
    NOTE.time(`End of computation, total time elapsed ${
        NOTE.time_string(stop - start)}`);
};

const SOLVER = {    // STATE SOLVER
    infer: (T, BI, BA) => {
        // In:   T | constraint of form [type, F]
        //      BI | map from variable keys to indices
        //      BA | map from variable keys to assignments
        // Out:  I | false if BA conflicts with T, else array of pairs [i, a]
        //         | where a is assignment inferred for variable at index i
        const [type,] = T;
        const pairs = X.T_2_pairs(T);
        const tuple = pairs.map(([x, y]) => {
            const a = BA[BI.get(M.encode_order_pair([x, y]))];
            if (a == undefined) { debugger; }
            return ((x < y) || (a == 0)) ? a : ((a == 1) ? 2 : 1);
        });
        const I = CONSTRAINTS[NOC[type]][tuple.join("")];
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
        //      BF | array of variable keys
        //      BT | array of variable constraints
        //      BI | map from variable keys to indices
        //      BA | map from variable keys to assignments
        // Out:  B | array of variable indices assigned after assigning a to i
        //         | if assigning i to a impossible, returns empty array
        const B = [bi];
        BA[bi] = a;
        let idx = 0;
        while (idx < B.length) {  // BFS
            const i = B[idx];
            const [f1, f2] = M.decode(BF[i]);
            const C = BT[i];
            for (let type = 0; type < 4; ++type) {
                const T = (type == 3) ? M.decode(C[type]) : C[type];
                for (let F of T) {
                    if (type == CON.transitivity) {
                        F = [f1, f2, F];
                    }
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
        for (let bi = 0; bi < BA.length; ++bi) {
            if (!seen.has(bi) && (BA[bi] == 0)) {
                const stack = [bi]; // DS for connected component
                seen.add(bi);
                let si = 0;
                while (si < stack.length) {
                    const bi_ = stack[si];
                    const C = BT[bi_];
                    const [f1, f2] = M.decode(BF[bi_]);
                    for (let type = 0; type < 4; ++type) {
                        const T = (type == 3) ? M.decode(C[type]) : C[type];
                        for (let F of T) {
                            if (type == CON.transitivity) {
                                F = [f1, f2, F];
                            }
                            const vars = X.T_2_pairs([type, F]).map(
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
        GB.push(B0);
        GB.reverse();
        return GB;
    },
    guess_vars: (G, BI, BF, BT, BA, lim) => {
        const guesses = [];
        const A = [];
        let idx = 0;
        let backtracking = false;  
        let start = Date.now();    
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
                    const sol = G.map(i => BA[i]);
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
        const BA = BF.map(() => 0);
        const BI = new Map();
        for (let i = 0; i < BF.length; ++i) { 
            BI.set(BF[i], i);
        }
        NOTE.time("Assigning orders based on crease assignment");
        const L = [];
        let n = 0;
        NOTE.start_check("crease", BA0);
        for (let i = 0; i < BA0.length; ++i) {
            NOTE.check(i);
            const a = BA0[i];
            if (a != 0) {
                if (BA[i] != 0) {
                    if (BA[i] != a) {
                        return [];
                    }
                } else {
                    const B = SOLVER.propagate(i, a, BI, BF, BT, BA);
                    if (B.length == 0) {
                        return [];
                    } else {
                        L.push(B); 
                        n += B.length;
                    }
                }
            }
        }
        const B0 = [];
        for (const l of L) { 
            for (const b of l) { 
                B0.push(b); 
            } 
        }
        NOTE.annotate(B0, "initially assignable variables");
        NOTE.lap();
        NOTE.time("Finding unassigned components");
        const GB = SOLVER.get_components(BI, BF, BT, BA, B0);
        NOTE.count(GB.length - 1, "unassigned components");
        NOTE.lap();
        const GA = [[M.bit_encode(B0.map(i => BA[i]))]];
        for (let i = 1; i < GB.length; ++i) {
            const B = GB[i];
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
        for (let i = 0; i < GB.length; ++i) {
            NOTE.check(i);
            const B = GB[i];
            const orders = M.bit_decode(GA[i][GI[i]], B.length);
            for (let j = 0; j < B.length; ++j) {
                const [f1, f2] = M.decode(BF[B[j]]);
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
    CF_edges_flip_2_CD: (CF, edges, flip) => {
        const edge_map = new Set(edges);
        NOTE.start_check("cell", CF);
        return CF.map((F, i) => {
            NOTE.check(i);
            const S = F.map(i => i);
            S.sort((a, b) => (edge_map.has(M.encode([a, b])) ? 1 : -1));
            return (flip ? S[0] : S[S.length - 1]);
        });
    },
    EF_SE_SC_CD_2_SD: (EF, SE, SC, CD) => {
        const FE_map = new Map();
        for (let i = 0; i < EF.length; ++i) {
            if (EF[i].length == 2) {
                FE_map.set(M.encode_order_pair(EF[i]), i);
            }
        }
        const SE_map = SE.map(E => new Set(E));
        NOTE.start_check("segment", SC);
        return SC.map((C, i) => {
            NOTE.check(i);
            if (C.length == 2) {
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

const X = {     // CONVERSION
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
        const P = [];
        let crossings = [];
        NOTE.start_check("line", L);
        for (let i = 0; i < L.length; ++i) {    // find line-line intersections
            NOTE.check(i);
            const [a, b] = L[I[i]];
            P.push([a, I[i]]);
            P.push([b, I[i]]);
            for (let k = 0; k < crossings.length; ++k) {
                const [[c, d], j] = crossings[k];
                const [x1, y1] = a;
                const [x2, y2] = d;
                if ((d[0] + eps) < a[0]) {
                    crossings[k] = undefined;
                } else {
                    const x = M.intersect([a, b], [c, d], eps);         
                    if (x != undefined) {
                        P.push([x, I[i]]);
                        P.push([x, j]);
                    }
                    if (M.on_segment(a, b, c, eps)) { P.push([c, I[i]]); }
                    if (M.on_segment(a, b, d, eps)) { P.push([d, I[i]]); }
                    if (M.on_segment(c, d, a, eps)) { P.push([a, j]); }
                    if (M.on_segment(c, d, b, eps)) { P.push([b, j]); }
                }
            }
            const temp = [[[a, b], I[i]]];
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
        for (let i = 1; i < P.length; ++i) {
            const [p, i1] = curr[0];
            const [q, i2] = P[i];
            if (M.close(p, q, eps)) {
                curr.push(P[i]);
            } else {
                curr = [P[i]];
                compressed_P.push(curr);
            }
        }
        const V = compressed_P.map((ps) => ps[0][0]); 
        // 2) Constructing map from edges to overlapping lines
        const LP = L.map(() => new Set());
        for (let i = 0; i < compressed_P.length; ++i) {
            const cP = compressed_P[i];
            for (const [, j] of cP) {
                LP[j].add(i);
            }
        }
        const edges = new Map();
        for (let i = 0; i < LP.length; ++i) {
            const points_on_line = Array.from(LP[i]);
            const [a, b] = L[i];
            const dir = M.sub(b, a);
            points_on_line.sort((pk, qk) => {
                const dp = M.dot(dir, V[pk]);
                const dq = M.dot(dir, V[qk]);
                return dp - dq;
            });
            let prev = points_on_line[0];
            for (let j = 1; j < points_on_line.length; ++j) {
                const curr = points_on_line[j];
                const k = M.encode_order_pair([curr, prev]);
                let E = edges.get(k);
                if (E == undefined) {
                    E = [];
                    edges.set(k, E);
                }
                E.push(i);
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
        for (let i = 0; i < EV.length; ++i) {
            const [pi, qi] = EV[i];
            adj[pi].push(qi); 
            adj[qi].push(pi); 
        }
        const VV = [];
        for (let i = 0; i < V.length; ++i) {
            const v0 = V[i];
            const A = [];
            for (const vi of adj[i]) {
                A.push([vi, M.angle(M.sub(V[vi], v0))]);
            }
            A.sort(([v1, a1], [v2, a2]) => a1 - a2);
            VV.push(A.map(([v, a]) => v));
        }
        const FV = [];
        const seen = new Set();
        NOTE.start_check("vertex", VV);
        for (let i = 0; i < VV.length; ++i) {
            NOTE.check(i);
            for (let j of VV[i]) {
                const key = M.encode([i, j]);
                if (!(seen.has(key))) {
                    seen.add(key);
                    const F = [i];
                    let k = i;
                    while (j != i) {
                        F.push(j);
                        [k, j] = [j, M.previous_in_list(VV[j], k)];
                        seen.add(M.encode([k, j]));
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
    V_VV_EV_EA_2_VK: (V, VV, EV, EA) => {
        const VVA_map = new Map();
        for (let i = 0; i < EV.length; ++i) {
            const [v1, v2] = EV[i];
            const a = EA[i];
            VVA_map.set(M.encode([v1, v2]), a);
            VVA_map.set(M.encode([v2, v1]), a);
        }
        const VK = [];
        for (let i = 0; i < VV.length; ++i) {
            const adj = [];
            let boundary = false;
            let [count_M, count_V, count_U] = [0, 0, 0];
            for (const j of VV[i]) {
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
            let kawasaki;
            if (boundary || (adj.length == 0)) {
                kawasaki = 0;
            } else if (
                ((count_U == 0) && (Math.abs(count_M - count_V) != 2)) || 
                (adj.length % 2 != 0)
            ) {                       // violates Maekawa
                kawasaki = Math.PI/2; // obviously far from zero
            } else {
                const angles = adj.map(j => M.angle(M.sub(V[j], V[i])));
                kawasaki = 0;
                for (let j = 0; j < angles.length; j += 2) {
                    kawasaki += angles[j + 1] - angles[j];
                }
                kawasaki = Math.abs(kawasaki - Math.PI);
            }
            VK.push(kawasaki);
        }
        return VK;
    },
    V_VF_EV_EA_2_Vf: (V, FV, EV, EA) => {
        const EA_map = new Map();
        for (let i = 0; i < EV.length; ++i) {
            EA_map.set(M.encode_order_pair(EV[i]), EA[i]);
        }
        const EF_map = new Map();
        for (let i = 0; i < FV.length; ++i) {
            const F = FV[i];
            for (let j = 0; j < F.length; ++j) {
                const k = (j + 1) % F.length;
                EF_map.set(M.encode([F[k],F[j]]), i);
            }
        }
        const Vf = V.map((p) => undefined);
        const seen = new Set();
        seen.add(0);                    // start search at face 0
        const [v1, v2,] = FV[0];        // first edge of first face
        for (const i of [v1, v2]) {
            Vf[i] = V[i];
        }            // [face, edge, len, parity]
        const queue = [[0, v1, v2, Infinity, true]];    
        let next = 0;
        while (next < queue.length) {   // BFS across face graph
            const [fi, i1, i2, l, s] = queue[next];
            next += 1;
            const F = FV[fi];
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
                    for (let i = queue.length - 1; i > 0; --i) {
                        const curr = queue[i - 1][3];
                        if (curr < prev) {
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
        return M.center_points(Vf, 0.5, 0.5);
    },
    EV_FV_2_EF: (EV, FV) => {
        const EV_map = new Map();
        for (let i = 0; i < EV.length; ++i) {
            EV_map.set(M.encode(EV[i]), i);
        }
        const EF = EV.map(() => [undefined, undefined]);
        for (let i = 0; i < FV.length; ++i) {
            const F = FV[i];
            for (let j = 0; j < F.length; ++j) {
                const k = (j + 1) % F.length;
                const ei = EV_map.get(M.encode_order_pair([F[j], F[k]]));
                const c = (F[k] < F[j]) ? 0 : 1;
                EF[ei][c] = i;
            }
        }
        for (let i = 0; i < EF.length; ++i) {
            const c = (EF[i][0] == undefined) ? 1 : 
                ((EF[i][1] == undefined) ? 0 : undefined);
            if (c != undefined) {
                EF[i] = [EF[i][c]];
            }
        }
        return EF;
    },
    V_FV_2_Ff: (V, FV) => {
        return FV.map(F => (M.orientation(M.expand(F, V)) < 0));
    },
    V_FV_P_CP_2_CF_FC: (V, FV, P, CP) => {
        const centers = CP.map(f => M.interior_point(M.expand(f, P)));
        const CF = CP.map(() => []);
        NOTE.start_check("face", FV);
        const FC = FV.map((f, i) => {
            NOTE.check(i);
            const F = M.expand(f, V);
            const C = [];
            for (let j = 0; j < CP.length; ++j) {
                if (M.convex_contains_point(F, centers[j])) {
                    CF[j].push(i);
                    C.push(j);
                }
            }
            return C;
        });
        return [CF, FC];
    },
    SE_2_ExE: (SE) => {
        const ExE = new Set();
        for (let i = 0; i < SE.length; ++i) {
            const edges = SE[i];
            for (let j = 0; j < edges.length; ++j) {
                for (let k = j + 1; k < edges.length; ++k) {
                    const es = [edges[j], edges[k]]
                    if (edges[k] < edges[j]) {
                        es.reverse();
                    }
                    ExE.add(M.encode(es)); 
                }
            }
        } 
        return Array.from(ExE);
    },
    SE_CF_SC_2_ExF: (SE, CF, SC) => {
        const ExF = new Set();
        for (let i = 0; i < SC.length; ++i) {
            if (SC[i].length == 2) {
                const E = SE[i];
                const [c1, c2] = SC[i];
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
    CF_2_BF: (CF) => {
        const BF_set = new Set();
        NOTE.start_check("cell", CF);
        for (let i = 0; i < CF.length; ++i) { 
            NOTE.check(i);
            const F = CF[i];
            for (let j = 0; j < F.length; j++) {
                for (let k = j + 1; k < F.length; k++) {
                    BF_set.add(M.encode([F[j], F[k]]));
                }
            }
        }
        const BF = Array.from(BF_set);
        BF.sort();
        return BF;
    },
    check_overlap: (p, BF_map) => {
        return (BF_map.has(M.encode_order_pair(p)) ? 1 : 0);
    },
    add_constraint: (T, BF_map, BT) => {
        if (T != undefined) {
            const [type, F] = T;
            const pairs = X.T_2_pairs(T);
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
        for (let i = 0; i < BF.length; ++i) {
            BF_map.set(BF[i], i);
        }
        NOTE.time("Computing from edge-edge intersections");
        NOTE.start_check("edge-edge intersection", ExE);
        for (let i = 0; i < ExE.length; ++i) {
            NOTE.check(i);
            const k = ExE[i];
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
                    cons = [CON.taco_tortilla, [f3, f4, f2]]; break;
                case 1: // 001
                    cons = [CON.tortilla_tortilla, [f1, f2, f4, f3]]; break;
                case 2: // 010
                    cons = [CON.tortilla_tortilla, [f1, f2, f3, f4]]; break;
                case 3: // 011
                    cons = [CON.taco_tortilla, [f3, f4, f1]]; break;
                case 4: // 100  no overlap
                    break;      
                case 5: // 101
                    cons = [CON.taco_tortilla, [f1, f2, f4]]; break;
                case 6: // 110
                    cons = [CON.taco_tortilla, [f1, f2, f3]]; break;
                case 7: // 111
                    cons = [CON.taco_taco, [f1, f2, f3, f4]]; break;
                default: break;
            }
            X.add_constraint(cons, BF_map, BT);
        }
        NOTE.time("Computing from edge-face intersections");
        NOTE.start_check("edge-face intersection", ExF);
        for (let i = 0; i < ExF.length; ++i) {
            NOTE.check(i);
            const [e, f3] = M.decode(ExF[i]);
            if (EF[e].length != 2) { continue; }
            const [f1, f2] = EF[e];
            if ((f1 == f3) || (f2 == f3)) { continue; }
            const f1f2 = X.check_overlap([f1, f2], BF_map);
            let cons;
            if (f1f2 == 1) {
                cons = [CON.taco_tortilla, [f1, f2, f3]];
            } else {
                cons = [CON.tortilla_tortilla, [f1, f2, f3, f3]];
            }
            X.add_constraint(cons, BF_map, BT);
        }
        NOTE.time("Cleaning transitivity constraints");
        NOTE.start_check("variable", BF);
        for (let i = 0; i < BF.length; ++i) {
            NOTE.check(i);
            const [f1, f2] = M.decode(BF[i]);
            const T3 = new Set(M.decode(BT3[i]));
            for (const T of [BT0[i], BT1[i]]) {
                for (const F of T) {
                    for (const f of F) {
                        T3.delete(f);
                    }
                }
            }
            BT3[i] = M.encode(Array.from(T3));
        }
        return BT;
    },
    FC_CF_BF_2_BT3: (FC, CF, BF) => {
        const BT3 = [];
        let start = Date.now();
        const FC_sets = FC.map(C => new Set(C));
        NOTE.start_check("variable", BF);
        for (let i = 0; i < BF.length; ++i) { 
            NOTE.check(i);
            const [f1, f2] = M.decode(BF[i]);
            const T = new Set();
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
            BT3.push(M.encode(Array.from(T)));
        }
        return BT3;
    },
    EF_EA_Ff_BF_2_BA: (EF, EA, Ff, BF) => {
        const BI_map = new Map();
        for (let i = 0; i < BF.length; ++i) {
            BI_map.set(BF[i], i);
        }
        const BA = BF.map(() => 0);
        for (let i = 0; i < EA.length; ++i) {
            const a = EA[i];
            if ((a == "M") || (a == "V")) {
                const k = M.encode_order_pair(EF[i]);
                const [f1, f2] = M.decode(k);
                const o = ((!Ff[f1] && (a == "M")) ||
                            (Ff[f1] && (a == "V"))) ? 1 : 2;
                BA[BI_map.get(k)] = o;
            }
        }
        return BA;
    },
    T_2_pairs: ([type, F]) => {
        let pairs, A, B, C, D;
        switch (type) {
            case CON.taco_taco: {
                [A, C, B, D] = F;
                pairs = [[A,C],[B,D],[B,C],[A,D],[A,B],[C,D]];
                break;
            } case CON.taco_tortilla: {
                [A, C, B] = F;
                pairs = [[A,C],[A,B],[B,C]];
                break;
            } case CON.transitivity: {
                [A, B, C] = F;
                pairs = [[A,B],[B,C],[C,A]];
                break;
            } case CON.tortilla_tortilla: {
                [A, B, C, D] = F;
                pairs = [[A,C],[B,D]];
                break;
            }
        }
        return pairs;
    },
};

const IO = {    // INPUT-OUTPUT
    write: (FOLD) => {
        const {V, EV, EA, FV} = FOLD;
        const out = {
            vertices_coords:  V,
            edges_vertices:   EV,
            edges_assignment: EA,
            faces_vertices:   FV,
        };
        const fold = new Blob([JSON.stringify(out, undefined, 2)], {
            type: "application/json"});
        const main = document.getElementById("main");
        const svg = new Blob([main.outerHTML], {type: "image/svg+xml"});
        const log = new Blob([NOTE.lines.join("\n")], {type: "text/plain"});
        for (const [id, data] of [["fold", fold], ["svg", svg], ["log", log]]) {
            const link = document.getElementById(`${id}_link`);
            window.URL.revokeObjectURL(link);
            link.setAttribute("style", {display: "inline-block"})
            link.setAttribute("href", window.URL.createObjectURL(data));
        }
    },
    OPX_2_L: (doc) => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(doc, "text/xml");
        const opx_lines = Array.from(dom.getElementsByClassName("oripa.OriLineProxy"));
        const lines = [];
        const coords = ["x0", "x1", "y0", "y1"];
        const map = ["", "F", "M", "V"];
        for (const opx_line of opx_lines) {
            if (opx_line.nodeName == "object") {
                const line = new Map();
                for (const f of coords) {
                    line.set(f, 0);
                }
                line.set("type", 1);
                for (const node of opx_line.children) {
                    const property = node.getAttribute("property");
                    line.set(property, +node.firstElementChild.innerHTML);
                }
                const [x0, x1, y0, y1] = coords.map(c => line.get(c));
                const type = map[line.get("type")];
                lines.push([[x0, y0], [x1, y1], type]);
            }
        }
        return lines;
    },
    CP_2_L: (doc) => {
        const map = ["", "F", "M", "V"];
        const L = doc.split("\n").map(line => {
            line = line.trim();
            const [a, x1, y1, x2, y2] = line.split(" ").map(t => t.trim());
            return [[+x1, +y1], [+x2, +y2], map[+a]];
        });
        while (L[L.length - 1][2] == "") {
            L.pop();
        }
        return L;
    },
    SVG_2_L: (doc) => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(doc, "image/svg+xml")
        const svg_lines = Array.from(dom.getElementsByTagName("line"));
        const lines = [];
        for (const svg_line of svg_lines) {
            const x1 = +svg_line.getAttribute("x1");
            const y1 = +svg_line.getAttribute("y1");
            const x2 = +svg_line.getAttribute("x2");
            const y2 = +svg_line.getAttribute("y2");
            const sty = svg_line.getAttribute("style").split(";");
            let color = "U";
            for (const pair of sty) {
                const parts = pair.split(":");
                if (parts.length == 2) {
                    let [attr, val] = parts;
                    attr = attr.trim();
                    val = val.trim();
                    if (attr == "stroke") {
                        if (val == "red" || val == "#FF0000") {
                            color = "M";
                        } else if (val == "blue" || val == "#0000FF") {
                            color = "V";
                        } else if (val == "gray" || val == "#808080") {
                            color = "F";
                        }
                    }
                }
            } 
            lines.push([[x1, y1], [x2, y2], color]);
        }
        return lines;
    },
    FOLD_2_V_EV_EA_FV: (doc) => {
        let V, EV, EA, FV;
        const ex = JSON.parse(doc);
        if ("vertices_coords" in ex) {
            V = ex["vertices_coords"]; 
        } else {
            NOTE.time("FOLD file does not contain vertices_coords");
            return [];
        }
        if ("edges_vertices" in ex) {
            EV = ex["edges_vertices"].map(
                ([v1, v2]) => (v1 < v2) ? [v1, v2] : [v2, v1]); 
        } else {
            NOTE.time("FOLD file does not contain edges_vertices");
            return [];
        }
        if ("edges_assignment" in ex) {
            EA = ex["edges_assignment"]; 
        } else {
            NOTE.time("FOLD file does not contain edges_assignments");
            NOTe.time("   - assuming all unassigned");
            EA = EV.map(() => "U");
        }
        if ("faces_vertices" in ex) {
            FV = ex["faces_vertices"]; 
            M.sort_faces(FV, V);
        }
        return [V, EV, EA, FV];
    },
    doc_type_2_V_VV_EV_EA_EF_FV: (doc, type) => {
        let V, VV, EV, EA, FV;
        if (type == "fold") {
            [V, EV, EA, FV] = IO.FOLD_2_V_EV_EA_FV(doc);
            if (V == undefined) { return []; }
        } else {
            let L, EL;
            if      (type == "svg") { L = IO.SVG_2_L(doc); }
            else if (type ==  "cp") { L =  IO.CP_2_L(doc); }
            else if (type == "opx") { L = IO.OPX_2_L(doc); }
            else {
                NOTE.time(`ERROR: File extension .${type} not supported!`);
                NOTE.time("       Please use from [.fold, .svg, .cp, .opx]");
                return [];
            }
            NOTE.annotate(L, "lines");
            NOTE.lap();
            const eps = M.min_line_length(L) / M.EPS;
            NOTE.time(`Using eps ${eps} from min line length ${eps*M.EPS}`);
            NOTE.lap();
            NOTE.time("Constructing FOLD from lines...");
            [V, EV, EL] = X.L_2_V_EV_EL(L, eps);
            EA = EL.map(l => L[l[0]][2]); 
        }
        if (FV == undefined) {
            [VV, FV] = X.V_EV_2_VV_FV(V, EV);
        }
        const EF = X.EV_FV_2_EF(EV, FV);
        for (let i = 0; i < EF.length; ++i) {   // boundary edge assignment
            if (EF[i].length == 1) {
                EA[i] = "B";
            }
        }
        return [V, VV, EV, EA, EF, FV];
    },
};

const GUI = {   // INTERFACE
    WIDTH: 1,
    COLORS: {
        active: "yellow",
        B: "cyan",
        T: ["green", "red", "orange", "cyan"],
    },
    update_flat: (FOLD) => {
        NOTE.time("Drawing flat");
        const {V, VK, EV, EA, FV} = FOLD;
        const svg = SVG.clear("flat");
        const visible = document.getElementById("display-text").checked;
        let F = FV.map(f => M.expand(f, V));
        if (visible) {
            const shrunk = F.map(f => {
                const c = M.centroid(f);
                return f.map(p => M.add(M.mul(M.sub(p, c), 0.5), c));
            });
            SVG.draw_polygons(svg, shrunk, {opacity: 0.2});
        }
        SVG.draw_polygons(svg, F, {text: visible, opacity: 0.1, id: "f"});
        if (VK != undefined) {
            const K = [];
            for (let i = 0; i < VK.length; ++i) {
                if (VK[i] > 0.0000001) { K.push(V[i]); }
            }
            SVG.draw_points(svg, K, {fill: "red", r: 10});
        }
        const lines = EV.map(l => M.expand(l, V));
        const colors = EA.map(a => SVG.TYPES_COLOR[a]);
        SVG.draw_segments(svg, lines, {
            text: visible, id: "e", stroke: colors, stroke_width: GUI.WIDTH});
        if (visible) {
            SVG.draw_points(svg, V, {text: visible, id: "v", fill: "green"});
        }
    },
    update_xray: (FOLD, BF, GB) => {
        NOTE.time("Drawing xray");
        const {Vf, FV} = FOLD;
        const svg = SVG.clear("xray");
        const F = FV.map(f => M.expand(f, Vf));
        SVG.draw_polygons(svg, F, {opacity: 0.05});
        if (GB != undefined) {
            for (let i = 0; i < GB.length; ++i) {
                if ((i == 0) && GB[0].length > 10000) {
                    continue;
                }
                const lines = GB[i].map(i => {
                    const [f1, f2] = M.decode(BF[i]);
                    const p1 = M.centroid(M.expand(FV[f1], Vf));
                    const p2 = M.centroid(M.expand(FV[f2], Vf));
                    return [p1, p2];
                });
                const stroke = SVG.COLORS[i % SVG.COLORS.length];
                SVG.draw_segments(svg, lines, {stroke});
            }
        }
    },
    update_cell: (CELL) => {
        NOTE.time("Drawing cell");
        const {P, SP, SE, CP, SC, CF, FC} = CELL;
        const svg = SVG.clear("cell");
        const visible = document.getElementById("display-text").checked;
        let max_layers = 0;
        for (const F of CF) {
            if (max_layers < F.length) {
                max_layers = F.length;
            }
        }
        const Ccolors = CF.map(F => 0.1 + F.length/max_layers*0.7);
        const cells = CP.map(f => M.expand(f, P));
        const lines = SP.map(l => M.expand(l, P));
        SVG.draw_polygons(svg, cells, {
            text: visible, opacity: Ccolors, id: "c"});
        SVG.draw_segments(svg, lines, {
            text: visible, id: "s", stroke: "black", stroke_width: GUI.WIDTH});
        if (visible) {
            SVG.draw_points(svg, P, {text: visible, id: "p", fill: "green"});
        }
    },
    update_fold: (FOLD, CELL, BF, GB, GA, GI) => {
        NOTE.time("Computing state");
        const {EF, Ff} = FOLD;
        const {P, SP, SE, CP, SC, CF} = CELL;
        const svg = SVG.clear("fold");
        const edges = SOLVER.BF_GB_GA_GI_2_edges(BF, GB, GA, GI);
        FOLD.FO = SOLVER.edges_Ff_2_FO(edges, Ff);
        const flip = document.getElementById("flip").checked;
        NOTE.time("Drawing fold");
        const CD = SOLVER.CF_edges_flip_2_CD(CF, edges, flip);
        const SD = SOLVER.EF_SE_SC_CD_2_SD(EF, SE, SC, CD);
        const m = [0.5, 0.5];
        const Q = P.map(p => (flip ? M.add(M.refX(M.sub(p, m)), m) : p));
        const cells = CP.map(V => M.expand(V, Q));
        const colors = CD.map(d => (Ff[d] != flip) ? "gray" : "lightgray");
        SVG.draw_polygons(svg, cells, {fill: colors, stroke: colors});
        const [creases, segments] = [[], []];
        for (let i = 0; i < SD.length; ++i) {
            const a = SD[i];
            if (a == "C") { creases.push(M.expand(SP[i], Q)); }
            if (a == "B") { segments.push(M.expand(SP[i], Q)); }
        }
        SVG.draw_segments(svg, creases, {stroke: SVG.TYPES_COLOR["C"]});
        SVG.draw_segments(svg, segments, {stroke: SVG.TYPES_COLOR["B"]});
    },
    update_component: (FOLD, CELL, BF, GB, GA, GI, c) => {
        NOTE.time("Updating component");
        const comp_label = document.getElementById("component-label");
        comp_label.style.backgroundColor = SVG.COLORS[c];
        const state_select = SVG.clear("state-select");
        for (let i = 0; i < GA[c].length; ++i) {
            const el = document.createElement("option");
            el.setAttribute("value", `${i}`);
            el.textContent = `${i}`
            state_select.appendChild(el);
        }
        state_select.onchange = (e) => {
            const j = e.target.value;
            GI[c] = +j;
            GUI.update_fold(FOLD, CELL, BF, GB, GA, GI);
        };
    },
    update_cell_face_listeners: (FOLD, CELL, BF, BT) => {
        NOTE.time("Updating cell-face listeners");
        const {V, EV, FV} = FOLD;
        const {P, SP, CP, CF, FC, SE} = CELL;
        const ES_map = new Map();
        for (let i = 0; i < SE.length; ++i) {
            for (const e of SE[i]) {
                const k = M.encode(EV[e]);
                const A = ES_map.get(k);
                if (A == undefined) {
                    ES_map.set(k, [i]);
                } else {
                    A.push(i)
                }
            }
        }
        const SE_map = new Map();
        for (let i = 0; i < SE.length; ++i) {
            SE_map.set(M.encode(SP[i]), SE[i]);
        }
        const FM = FV.map(F => M.centroid(M.expand(F, V)));
        const FB_map = new Map();
        for (let i = 0; i < BF.length; ++i) {
            FB_map.set(BF[i], i);
        }
        const FB = FC.map(() => []);
        for (const k of BF) { 
            const [f1, f2] = M.decode(k);
            FB[f1].push(f2);
            FB[f2].push(f1);
        }
        const active = [];
        const flat_svg = document.getElementById("flat");
        const cell_svg = document.getElementById("cell");
        NOTE.start_check("face", FC);
        for (let i = 0; i < FC.length; ++i) {
            NOTE.check(i);
            const face = document.getElementById(`f${i}`);
            face.onclick = () => {
                const color = face.getAttribute("fill");
                GUI.clear_active(CF, FC);
                const flat_note = SVG.append("g", flat_svg, {id: "flat_notes"});
                const cell_note = SVG.append("g", cell_svg, {id: "cell_notes"});
                if (active.length == 1) {
                    if (color == GUI.COLORS.B) {
                        active.push(i);
                        const [f1, f2] = active;
                        const T = BT[FB_map.get(M.encode_order_pair([f1, f2]))];
                        for (const j of [3, 1]) {
                            const Tj = (j == 1) ? T[j] : M.decode(T[j]);
                            for (const F of Tj) {
                                const f3 = (j == 1) ? F[2] : F;
                                const el = document.getElementById(`f${f3}`);
                                el.setAttribute("fill", GUI.COLORS.T[j]);
                            }
                        }
                        const L = [new Set(), new Set(), new Set()];
                        for (const j of [0, 1, 2]) {
                            for (const [a, b, c, d] of T[j]) {
                                L[j].add(M.encode([a, b]));
                                if (j != 1) {
                                    L[j].add(M.encode_order_pair([c, d]));
                                }
                            }
                        }
                        for (const j of [0, 1, 2]) {
                            L[j] = Array.from(L[j]).map(
                                k => M.decode(k).map(x => FM[x]));
                        }
                        for (const j of [1, 2, 0]) {
                            SVG.draw_segments(flat_note, L[j], {fill: "none", 
                                stroke: GUI.COLORS.T[j], stroke_width: 5});
                        }
                        const C = new Set(FC[f1]);
                        for (const f of [f1, f2]) {
                            for (const c of FC[f]) {
                                const el = document.getElementById(`c${c}`);
                                el.setAttribute("fill", GUI.COLORS.active);
                            }
                        }
                        for (const c of FC[f2]) {
                            if (C.has(c)) {
                                const el = document.getElementById(`c${c}`);
                                el.setAttribute("fill", GUI.COLORS.T[3]);
                            }
                        }
                    } else {
                        active.pop();
                    }
                } else {
                    while (active.length > 0) { active.pop(); }
                    active.push(i);
                    GUI.change_active(face, FC[i], "c", GUI.COLORS.active);
                    for (const f of FB[i]) {
                        const el = document.getElementById(`f${f}`);
                        el.setAttribute("fill", GUI.COLORS.B);
                    }
                    const S = [];
                    const Scolors = [];
                    const Lcolors = [];
                    const L = FV[i].map((v1, j) => {
                        const v2 = FV[i][(j + 1) % FV[i].length];
                        const k = M.encode_order_pair([v1, v2]);
                        const color = SVG.COLORS[j % SVG.COLORS.length];
                        for (const s of ES_map.get(k)) {
                            S.push(SP[s].map(p => P[p]));
                            Scolors.push(color);
                        }
                        Lcolors.push(color);
                        return [v1, v2].map(p => V[p]);
                    });
                    SVG.draw_segments(flat_note, L, {
                        stroke: Lcolors, stroke_width: 5});
                    SVG.draw_segments(cell_note, S, {
                        stroke: Scolors, stroke_width: 5});
                }
                for (const f of active) {
                    const el = document.getElementById(`f${f}`);
                    el.setAttribute("fill", GUI.COLORS.active);
                }
            };
        }
        for (let i = 0; i < CF.length; ++i) {
            const cell = document.getElementById(`c${i}`);
            cell.onclick = () => {
                const active = (cell.getAttribute("fill") != "black");
                GUI.clear_active(CF, FC);
                const flat_note = SVG.append("g", flat_svg, {id: "flat_notes"});
                const cell_note = SVG.append("g", cell_svg, {id: "cell_notes"});
                if (!active) {
                    GUI.change_active(cell, CF[i], "f", GUI.COLORS.active);
                    const L = [];
                    const Lcolors = [];
                    const Scolors = [];
                    const S = CP[i].map((p1, j) => {
                        const p2 = CP[i][(j + 1) % CP[i].length];
                        const k = M.encode_order_pair([p1, p2]);
                        const color = SVG.COLORS[j % SVG.COLORS.length];
                        for (const e of SE_map.get(k)) {
                            L.push(EV[e].map(p => V[p]));
                            Lcolors.push(color);
                        }
                        Scolors.push(color);
                        return [p1, p2].map(p => P[p]);
                    });
                    SVG.draw_segments(flat_note, L, {
                        stroke: Lcolors, stroke_width: 5});
                    SVG.draw_segments(cell_note, S, {
                        stroke: Scolors, stroke_width: 5});
                }
            };
        }
        NOTE.lap();
    },
    clear_active: (CF, FC) => {
        const flat_notes = document.getElementById("flat_notes");
        if (flat_notes != undefined) {
            flat_notes.parentElement.removeChild(flat_notes);
        }
        const cell_notes = document.getElementById("cell_notes");
        if (cell_notes != undefined) {
            cell_notes.parentElement.removeChild(cell_notes);
        }
        for (let i = 0; i < FC.length; ++i) {
            const f = document.getElementById(`f${i}`);
            if (f.getAttribute("fill") != "black") {
                GUI.change_active(f, FC[i], "c", "black");
            }
        }
        for (let i = 0; i < CF.length; ++i) {
            const c = document.getElementById(`c${i}`);
            if (c.getAttribute("fill") != "black") {
                GUI.change_active(c, CF[i], "f", "black");
            }
        }
    },
    change_active: (svg, C, type, color) => {
        svg.setAttribute("fill", color);
        for (const c of C) {
            document.getElementById(`${type}${c}`).setAttribute("fill", color);
        }
    },
};

const NOTE = {  // ANNOTATION
    time_string: (time) => {
        if (time < 1000) {
            const milli = Math.ceil(time);
            return `${milli} millisecs`;
        } else if (time < 60000) {
            const secs = Math.ceil(time / 1000);
            return `${secs} secs`;
        } else {
            const mins = Math.floor(time / 60000);
            const secs = Math.ceil((time - mins*60000) / 1000);
            return `${mins} mins ${secs} secs`;
        }
    },
    start_lap: () => NOTE.lap_start = Date.now(),
    lap: () => {
        const stop = Date.now();
        const time = stop - NOTE.lap_start;
        NOTE.log(`   - Time elapsed: ${NOTE.time_string(time)}`);
        NOTE.lap_start = stop;
    },
    start_check: (label, target, interval = 5000) => {
        NOTE.check_start = Date.now();
        NOTE.check_lap = NOTE.check_start;
        NOTE.check_interval = interval;
        NOTE.check_label = label;
        NOTE.check_lim = (target == undefined) ? "unknown" : target.length;
    },
    check: (i, extra) => {
        if ((Date.now() - NOTE.check_lap) > NOTE.check_interval) {
            NOTE.check_lap = Date.now();
            if (NOTE.check_lim == "unknown") {
                NOTE.log(`    On ${NOTE.check_label} ${i} of unknown`);
            } else {
                const time = NOTE.check_lap - NOTE.check_start;
                NOTE.log(`    On ${
                    NOTE.check_label} ${i} out of ${
                    NOTE.check_lim}, est time left: ${
                    NOTE.time_string(time*(NOTE.check_lim/i - 1))
                }`);
            }
            if (extra != undefined) {
                NOTE.log(extra);
            }
        }
    },
    annotate: (A, label) => {
        if (A.length < 1) { return; }
        const first = Array.from(A[0]);
        NOTE.log(`   - Found ${A.length} ${label}`.concat(
            (first.length == 0) ? "" : `[0] = ${JSON.stringify(first)}`));
    },
    time: (label) => {
        const time = (new Date()).toLocaleTimeString();
        NOTE.log(`${time} | ${label} ...`);
    },
    clear_log: () => {
        NOTE.lines = [];
    },
    log: (str) => {
        console.log(str);
        NOTE.lines.push(str);
    },
    count: (A, label, div = 1) => {
        if (A.length != undefined) {
            A = M.count_subarrays(A)/div;
        }
        NOTE.log(`   - Found ${A} ${label}`);
    },
};

const SVG = {   // DRAWING
    SCALE: 1000,
    COLORS: ["lime", "red", "blue", "green", "aqua", "orange", "pink", "purple", 
        "brown", "darkviolet", "teal", "olivedrab", "fuchsia", "deepskyblue", 
        "orangered", "maroon", "yellow"],
    TYPES_COLOR: {
        "U": "black",
        "F": "gray",
        "M": "red",
        "V": "blue",
        "B": "black",
        "C": "white",
    },
    NS: "http://www.w3.org/2000/svg",
    init: (id, {h, w, x, y, s, m}) => {
        const svg = document.getElementById(id);
        svg.setAttribute("xmlns", SVG.NS);
        svg.setAttribute("style", `background: white`);
        svg.setAttribute("height", h);
        svg.setAttribute("width", w);
        svg.setAttribute("x", x);
        svg.setAttribute("y", y);
        svg.setAttribute("viewBox", [-m, -m, s + 2*m, s + 2*m].join(" "));
        return svg;
    },
    append: (type, par, attrs = {}) => {
        const el = document.createElementNS(SVG.NS, type);
        for (const [k, v] of Object.entries(attrs)) { 
            el.setAttribute(k, v); 
        }
        par.appendChild(el);
        return el;
    },
    clear: (id) => {
        const el = document.getElementById(id);
        while (el.children.length > 0) {
            el.removeChild(el.children[0]);
        }
        return el;
    },
    get_val: (val, i, def) => {
        if (val == undefined)   { return def;    }
        if (Array.isArray(val)) { return val[i]; }
        return val;
    },
    draw_point: (svg, [x, y], color, r) => {
        return SVG.append("circle", svg, {cx: x, cy: y, r: r, "fill": color});
    },
    draw_label: (svg, [x, y], color, i) => {
        const t = SVG.append("text", svg, {
            x: x, y: y, "fill": color, "font-size": "15pt"});
        t.innerHTML = i;
        return t;
    },
    draw_points: (svg, P, options) => {
        const g = SVG.append("g", svg);
        if (options.id != undefined) { g.setAttribute("id", options.id); }
        for (let i = 0; i < P.length; ++i) {
            const [x, y] = M.mul(P[i], SVG.SCALE);
            const color = SVG.get_val(options.fill, i, "black");
            SVG.draw_point(g, [x, y], color, SVG.get_val(options.r, i, 2));
            if (options.text) {
                SVG.draw_label(g, [x, y], color, i);
            }
        }
        return g;
    },
    draw_segments: (svg, L, options) => {
        const g = SVG.append("g", svg);
        if (options.id != undefined) { g.setAttribute("id", options.id); }
        NOTE.start_check("segment", L);
        for (let i = 0; i < L.length; ++i) {
            NOTE.check(i);
            const [[x1, y1], [x2, y2]] = L[i].map(p => M.mul(p, SVG.SCALE));
            const p = SVG.append("line", g, {x1, x2, y1, y2});
            const color = SVG.get_val(options.stroke, i, "black");
            const width = SVG.get_val(options.stroke_width, i, 1);
            p.setAttribute("stroke", color);
            p.setAttribute("stroke-width", width);
            p.setAttribute("stroke-linecap", "round");
            if (options.id != "") {
                p.setAttribute("id", `${options.id}${i}`);
            }
            if (options.text) {
                const [x, y] = M.div(M.add([x1, y1], [x2, y2]), 2);
                SVG.draw_point(g, [x, y], color, SVG.get_val(options.r, i, 2));
                SVG.draw_label(g, [x, y], color, i);
            }
        }
        return g;
    },
    draw_polygons: (svg, P, options) => {
        const g = SVG.append("g", svg);
        if (options.id != undefined) { g.setAttribute("id", options.id); }
        NOTE.start_check("polygon", P);
        for (let i = 0; i < P.length; ++i) {
            NOTE.check(i);
            const F = P[i].map(p => M.mul(p, SVG.SCALE));
            const color = SVG.get_val(options.fill, i, "black");
            const V = F.map(v => v.join(",")).join(" ");
            const p = SVG.append("polygon", g, {points: V, fill: color});
            if (options.stroke != undefined) {
                const stroke = SVG.get_val(options.stroke, i);
                const width = SVG.get_val(options.stroke_width, i, 1);
                p.setAttribute("stroke", stroke);
                p.setAttribute("stroke-width", width);
                p.setAttribute("stroke-linejoin", "round");
            }
            if ((options.opacity != undefined) && (options.opacity != 1)) {
                p.setAttribute("opacity", SVG.get_val(options.opacity, i));
            }
            if (options.id != undefined) {
                p.setAttribute("id", `${options.id}${i}`);
            }
            if (options.text) {
                const [x, y] = M.interior_point(F);
                SVG.draw_point(g, [x, y], color, SVG.get_val(options.r, i, 2));
                SVG.draw_label(g, [x, y], color, i);
            }
        }
        return g;
    },
};

const M = {     // MATH
    EPS: 300,
    encode: (A) => A.map(i => String.fromCodePoint(i)).join(""),
    encode_order_pair: ([a, b]) => M.encode((a < b) ? [a, b] : [b, a]),
    decode: (S) => Array.from(S).map(c => c.codePointAt(0)),
    expand: (F, V) => F.map((vi) => V[vi]),
    mul: ([x, y], s) => [s*x, s*y],
    div: (v, s) => M.mul(v, 1/s),
    add: ([x1, y1], [x2, y2]) => [x1 + x2, y1 + y2],
    sub: ([x1, y1], [x2, y2]) => [x1 - x2, y1 - y2],
    dot: ([x1, y1], [x2, y2]) => x1*x2 + y1*y2,
    magsq: (v) => M.dot(v, v),
    mag: (v) => Math.sqrt(M.magsq(v)),
    unit: (v) => M.mul(v, 1/M.mag(v)),
    perp: ([x, y]) => [y, -x],
    refX: ([x, y]) => [-x, y],
    refY: ([x, y]) => [x, -y],
    distsq: (v1, v2) => M.magsq(M.sub(v2, v1)),
    dist: (v1, v2) => M.mag(M.sub(v2, v1)),
    close: (v1, v2, eps) => ((Math.abs(v1[0] - v2[0]) < eps) && 
                             (Math.abs(v1[1] - v2[1]) < eps)),
    area2: ([x1, y1], [x2, y2], [x3, y3]) =>
        ((x2 - x1)*(y3 - y1) - (x3 - x1)*(y2 - y1)),
    angle: ([x, y]) => {
        const ang = Math.atan2(y, x);
        return ang + ((ang < 0) ? 2*Math.PI : 0);
    },
    centroid: (P) => {
        const n = P.length;
        let p = [0, 0];
        for (let i = 0; i < n; ++i) {
            p = M.add(p, P[i]);
        }
        return M.div(p, n);
    },
    previous_in_list: (list, v) => {
        for (let i = 0; i < list.length; ++i) {
            if (list[i] == v) {
                if (i == 0) { return list[list.length - 1]; } 
                else        { return list[i - 1]; }
            }
        }
    },
    min_line_length: (lines) => {
        let min_line_lengthsq = Infinity;
        for (const [p, q] of lines) {
            const lensq = M.distsq(p, q);
            if (lensq < min_line_lengthsq) {
                min_line_lengthsq = lensq;
            }
        }
        return min_line_lengthsq**0.5;
    },
    count_subarrays: (A) => {
        let n = 0;
        for (const adj of A) {
            n += adj.length;
        }
        return n;
    },
    sort_faces: (FV, V) => {
        FV.sort((f1, f2) => {
            const A1 = M.polygon_area2(M.expand(f1, V));
            const A2 = M.polygon_area2(M.expand(f2, V));
            return A2 - A1;
        });
    },
    normalize_points: (P) => {
        let [x_min, x_max] = [Infinity, -Infinity];
        let [y_min, y_max] = [Infinity, -Infinity];
        for (const [x, y] of P) {
            if (x < x_min) { x_min = x; }
            if (x > x_max) { x_max = x; }
            if (y < y_min) { y_min = y; }
            if (y > y_max) { y_max = y; }
        }
        const x_diff = x_max - x_min;
        const y_diff = y_max - y_min;
        const diff = (x_diff < y_diff) ? y_diff : x_diff;
        return P.map(p => M.div(M.sub(p, [x_min, y_min]), diff));
    },
    center_points: (points, cx, cy) => {
        const inf = Infinity;
        let [min_x, min_y, max_x, max_y] = [inf, inf, -inf, -inf];
        for (let i = 0; i < points.length; ++i) {
            if (points[i] == undefined) { debugger; }
            const [x, y] = points[i];
            if (x < min_x) { min_x = x; }
            if (y < min_y) { min_y = y; }
            if (x > max_x) { max_x = x; }
            if (y > max_y) { max_y = y; }
        }
        const dx = cx - (max_x + min_x)/2;
        const dy = cy - (max_y + min_y)/2;
        return points.map(([x, y]) => [x + dx, y + dy]);
    },
    orientation: (P) => {
        const n = P.length;
        let [i, j] = [n - 2, n - 1];
        for (let k = 0; k < n; ++k) {
            const o = Math.sign(M.area2(P[i], P[j], P[k]));
            if (o != 0) { return o; }
            [i, j] = [j, k];
        }
        return 0; 
    },
    interior_point: (P) => {
        const n = P.length;
        let best_triangle;
        let max_area = -Infinity;
        for (let i = 0; i < P.length; ++i) {
            const [p1, p2, p3] = [P[i], P[(i + 1) % n], P[(i + 2) % n]];
            let found = true;
            for (const p of P) {
                if ((p != p1) && (p != p2) && (p != p3) && 
                    M.convex_contains_point(P, p)
                ) {
                    found = false;
                    break;
                }
            }
            if (found) {
                const a = M.area2(p1, p2, p3);
                if (max_area < a) {
                    max_area = a;
                    best_triangle = [p1, p2, p3];
                }
            }
        }
        if (best_triangle == undefined) { debugger; }
        return M.centroid(best_triangle);
    },
    convex_contains_point: (P, q) => {
        let p0 = P[P.length - 1]; 
        const first = (M.area2(p0, P[0], q) <= 0);
        for (const p1 of P) {                           
            if ((M.area2(p0, p1, q) <= 0) != first) {
                return false;
            } 
            p0 = p1;
        }
        return true;
    },
    on_segment: (a, b, c, eps) => {
        // assumes a, b, c all pairwise separated by more than eps
        // returns true if c is within dist_eps of segment a, b
        const v = M.sub(b, a);
        const [pa, pb, pc] = [a, b, c].map(p => M.dot(p, v));
        if ((pc < pa) == (pc < pb)) {
            // projection of c is not between a and b
            return false;
        }
        const d = M.dot(M.unit(M.perp(v)), M.sub(c, a));
        return (Math.abs(d) <= eps);
    },
    polygon_area2: (P) => {
        let area = 0;
        for (let i = 0; i < P.length; ++i) {
            const j = (i + 1) % P.length;
            area += (P[i][0] + P[j][0])*(P[j][1] - P[i][1]);
        }
        return area;
    },
    intersect: ([a, b], [c, d], eps) => {
        // Transcribed from Computational Geometry in C [O'Rourke]
        // Returns a proper intersection point of segments [a, b] and [c, d]
        // or undefined if no proper intersection point exists
        if (M.close(a, c, eps) || M.close(a, d, eps) || 
            M.close(b, c, eps) || M.close(b, d, eps) ||
            M.on_segment(a, b, c, eps) || M.on_segment(a, b, d, eps) ||
            M.on_segment(c, d, a, eps) || M.on_segment(c, d, b, eps)) {
            return;
        }
        const denom = (
            a[0] * (d[1] - c[1]) + b[0] * (c[1] - d[1]) +
            d[0] * (b[1] - a[1]) + c[0] * (a[1] - b[1])
        );
        if (denom == 0) { return; }
        const s = (
            a[0] * (d[1] - c[1]) + 
            c[0] * (a[1] - d[1]) + 
            d[0] * (c[1] - a[1])
        ) / denom;
        const t = -(
            a[0] * (c[1] - b[1]) + 
            b[0] * (a[1] - c[1]) + 
            c[0] * (b[1] - a[1])
        ) / denom;
        if ((s <= 0) || (1 <= s) || (t <= 0) || (1 <= t)) { return; }
        const p = [
            a[0] + s * (b[0] - a[0]), 
            a[1] + s * (b[1] - a[1])
        ];
        if (M.close(a, p, eps) || M.close(b, p, eps) || 
            M.close(c, p, eps) || M.close(d, p, eps)) {
            return;
        }
        return p;
    },
    bit_encode: (A) => {
        const B = [];
        for (let i = 0; i < A.length; i += 8) {
            let bite = 0;
            for (let j = 0; j < 8; ++j) {
                if (i + j < A.length) {
                    const b = A[i + j] - 1;
                    bite = bite | (b << j);
                }
            }
            B.push(bite);
        }
        return M.encode(B);
    },
    bit_decode: (B, n) => {
        const A = [];
        for (const bite of M.decode(B)) {
            for (let j = 0; j < 8; ++j) {
                A.push(((bite >> j) & 1) + 1);
                if (A.length == n) {
                    return A;
                }
            }
        }
        console.assert("Error: input array shorter than requested length");
    },
};
