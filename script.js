window.onload = () => { MAIN.startup(); }   // entry point

const MAIN = {
    startup: () => {
        NOTE.clear_log();
        NOTE.start("*** Starting Flat-Folder ***");
        NOTE.time("Initializing interface");
        const [b, s] = [50, SVG.SCALE];
        const main = document.getElementById("main");
        for (const [k, v] of Object.entries({
            xmlns: SVG.NS, 
            style: `background: ${GUI.COLORS.background}`, 
            viewBox: [0, 0, 3*s, s].join(" "),
        })) {
            main.setAttribute(k, v);
        }
        for (const [i, id] of ["flat", "cell", "fold"].entries()) {
            const svg = document.getElementById(id);
            for (const [k, v] of Object.entries({
                xmlns: SVG.NS,
                height: s,
                width: s,
                x: i*s,
                y: 0,
                viewBox: [-b, -b, s + 2*b, s + 2*b].join(" "),
            })) {
                svg.setAttribute(k, v);
            }
        }
        const limit_select = document.getElementById("limit_select");
        for (const val of ["all", 1000, 100, 10, 1]) {
            const el = document.createElement("option");
            el.setAttribute("value", val);
            el.textContent = val;
            limit_select.appendChild(el);
        }
        document.getElementById("import").onchange = (e) => {
            if (e.target.files.length > 0) {
                const file_reader = new FileReader();
                file_reader.onload = MAIN.process_file;
                file_reader.readAsText(e.target.files[0]);
            }
        };
        NOTE.time("Computing constraint implication maps");
        CON.build();
        NOTE.end();
    },
    process_file: (e) => {
        NOTE.clear_log();
        NOTE.start("*** Starting File Import ***");
        const doc = e.target.result;
        const file_name = document.getElementById("import").value;
        const parts = file_name.split(".");
        const type = parts[parts.length - 1].toLowerCase();
        NOTE.time(`Importing from file ${file_name}`);
        const [P, VV, EV, EA, EF, FV] = IO.doc_type_2_V_VV_EV_EA_EF_FV(doc, type);
        if (P == undefined) { return; }
        const VK = X.V_VV_EV_EA_2_VK(P, VV, EV, EA);
        const V = M.normalize_points(P);
        NOTE.annotate(V, "vertices_coords");
        NOTE.annotate(EV, "edges_vertices");
        NOTE.annotate(EA, "edges_assignments");
        NOTE.annotate(EF, "edges_faces");
        NOTE.annotate(FV, "faces_vertices");
        const [Pf, Ff] = X. V_VF_EV_EA_2_Vf_Ff(V, FV, EV, EA);
        const Vf = M.normalize_points(Pf);
        NOTE.annotate(Vf, "vertices_coords_folded");
        NOTE.annotate(Ff, "faces_flip");
        NOTE.lap();
        const FOLD = {V, Vf, VK, EV, EA, EF, FV, Ff};
        NOTE.time("Drawing flat");
        GUI.update_flat(FOLD);
        NOTE.time("Drawing cell");
        GUI.update_cell(FOLD);
        SVG.clear("fold");
        document.getElementById("num_states").innerHTML = "";
        document.getElementById("fold_controls").style.display = "inline";
        document.getElementById("state_controls").style.display = "none";
        document.getElementById("state_config").style.display = "none";
        document.getElementById("export_button").style.display = "inline";
        document.getElementById("export_button").onclick = () => IO.write(FOLD);
        document.getElementById("text").onchange = () => {
            NOTE.start("Toggling Text");
            GUI.update_text(FOLD);
            NOTE.end();
        };
        document.getElementById("fold_button").onclick = () => {
            MAIN.compute_cells(FOLD);
        };
        NOTE.lap();
        NOTE.end();
    },
    compute_cells: (FOLD) => {
        NOTE.start("*** Computing cell graph ***");
        const {V, Vf, EV, FV, Ff} = FOLD;
        const L = EV.map((P) => M.expand(P, Vf));
        const eps = M.min_line_length(L) / M.EPS;
        NOTE.time(`Using eps ${eps} from min line length ${eps*M.EPS}`);
        NOTE.time("Constructing points and segments from edges");
        const [P, SP, SE] = X.L_2_V_EV_EL(L, eps);
        NOTE.annotate(P, "points_coords");
        NOTE.annotate(SP, "segments_points");
        NOTE.lap();
        NOTE.time("Constructing cells from segments");
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
        NOTE.time("Updating cell");
        GUI.update_cell(FOLD, CELL);
        NOTE.lap();
        document.getElementById("text").onchange = (e) => {
            NOTE.start("Toggling Text");
            GUI.update_text(FOLD, CELL);
            NOTE.end();
        };
        window.setTimeout(MAIN.compute_constraints, 0, FOLD, CELL);
    },
    compute_constraints: (FOLD, CELL) => {
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
        NOTE.time("Updating cell-face listeners");
        GUI.update_cell_face_listeners(FOLD, CELL, BF, BT);
        NOTE.lap();
        window.setTimeout(MAIN.compute_states, 0, FOLD, CELL, BF, BT);
    },
    compute_states: (FOLD, CELL, BF, BT) => {
        const {V, Vf, EV, EA, EF, FV, Ff} = FOLD;
        const {P, SP, SE, CP, SC, CF, FC} = CELL;
        NOTE.time("*** Computing states ***");
        const BA0 = X.EF_EA_Ff_BF_2_BA(EF, EA, Ff, BF);
        const val = document.getElementById("limit_select").value;
        const lim = (val == "all") ? Infinity : +val;
        const [GB, GA] = SOLVER.solve(BF, BT, BA0, lim);
        const n = (GA == undefined) ? 0 : GA.reduce((s, A) => s*A.length, 1);
        NOTE.time("Solve completed");
        NOTE.count(n, "folded states");
        NOTE.lap();
        const num_states = document.getElementById("num_states");
        num_states.textContent = `(Found ${n} state${(n == 1) ? "" : "s"})`;
        if (n > 0) {
            const GI = GB.map(() => 0);
            NOTE.time("Computing state");
            const edges = SOLVER.BF_GB_GA_GI_2_edges(BF, GB, GA, GI);
            FOLD.FO = SOLVER.edges_Ff_2_FO(edges, Ff);
            CELL.CD = SOLVER.CF_edges_flip_2_CD(CF, edges);
            document.getElementById("state_controls").style.display = "inline"; 
            document.getElementById("flip").onchange = (e) => {
                NOTE.start("Flipping model");
                GUI.update_fold(FOLD, CELL);
                NOTE.end();
            };
            const comp_select = SVG.clear("component_select");
            for (const opt of ["none", "all"]) {
                const el = document.createElement("option");
                el.setAttribute("value", opt);
                el.textContent = opt;
                comp_select.appendChild(el);
            }
            for (const [i, _] of GB.entries()) {
                const el = document.createElement("option");
                el.setAttribute("value", `${i}`);
                el.textContent = `${i}`;
                comp_select.appendChild(el);
            }
            comp_select.onchange = (e) => {
                NOTE.start("Changing component");
                GUI.update_component(FOLD, CELL, BF, GB, GA, GI);
                NOTE.end();
            };
            NOTE.time("Drawing fold");
            GUI.update_fold(FOLD, CELL);
            NOTE.time("Drawing component");
            GUI.update_component(FOLD, CELL, BF, GB, GA, GI);
        }
        NOTE.lap();
        stop = Date.now();
        NOTE.end();
    },
};

const SOLVER = {    // STATE SOLVER
    infer: (T, BI, BA) => {
        // In:   T | constraint of form [type, F]
        //      BI | map from variable keys to indices
        //      BA | array of variable assignments
        // Out:  I | false if BA conflicts with T, else array of pairs [i, a]
        //         | where a is assignment inferred for variable at index i
        const [type,] = T;
        const pairs = X.T_2_pairs(T);
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
    EF_SE_SC_CD_2_SD: (EF, SE, SC, CD) => {
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
        for (const [i, idx] of I.entries()) {    // find line-line intersections
            NOTE.check(i);
            const [a, b] = L[idx];
            P.push([a, idx]);
            P.push([b, idx]);
            for (const [k, X] of crossings.entries()) {
                const [[c, d], j] = X;
                const [x1, y1] = a;
                const [x2, y2] = d;
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
    V_VF_EV_EA_2_Vf_Ff: (V, FV, EV, EA) => {
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
    EV_FV_2_EF: (EV, FV) => {
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
        return EF;
    },
    V_FV_P_CP_2_CF_FC: (V, FV, P, CP) => {
        const centers = CP.map(f => M.interior_point(M.expand(f, P)));
        const CF = CP.map(() => []);
        NOTE.start_check("face", FV);
        const FC = FV.map((f, i) => {
            NOTE.check(i);
            const F = M.expand(f, V);
            const Cs = [];
            for (const [j, Fs] of CF.entries()) {
                if (M.convex_contains_point(F, centers[j])) {
                    Fs.push(i);
                    Cs.push(j);
                }
            }
            return Cs;
        });
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
        for (const [i, k] of ExF.entries()) {
            NOTE.check(i);
            const [e, f3] = M.decode(k);
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
    EF_EA_Ff_BF_2_BA: (EF, EA, Ff, BF) => {
        const BI_map = new Map();
        for (const [i, k] of BF.entries()) {
            BI_map.set(k, i);
        }
        const BA = BF.map(() => 0);
        for (const [i, a] of EA.entries()) {
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
        const {V, Vf, EV, EA, FV, FO} = FOLD;
        const path = document.getElementById("import").value.split("\\");
        const name = path[path.length - 1].split(".")[0];
        FOLD = {
            file_spec: 1.1,
            file_creator: "flat-folder",
            file_title: `${name}_cp`,
            file_classes: ["singleModel"],
            vertices_coords:  V,
            edges_vertices:   EV,
            edges_assignment: EA,
            faces_vertices:   FV,
        };
        const data = {};
        data.cp = new Blob([JSON.stringify(FOLD, undefined, 2)], {
            type: "application/json"});
        FOLD.vertices_coords = Vf;
        FOLD.file_title = `${name}_state`;
        if (FO != undefined) {
            FOLD.faceOrders = FO;   // TODO: remove implied face orders?
        }
        data.state = new Blob([JSON.stringify(FOLD, undefined, 2)], {
            type: "application/json"});
        data.img = new Blob([document.getElementById("main").outerHTML], {
            type: "image/svg+xml"});
        data.log = new Blob([NOTE.lines.join("\n")], {
            type: "text/plain"});
        const ex = SVG.clear("export");
        for (const [type, ext] of [
            ["cp", "fold"], 
            ["state", "fold"], 
            ["img", "svg"], 
            ["log", "txt"]
        ]) {
            const link = document.createElement("a");
            const button = document.createElement("input");
            ex.appendChild(link); 
            link.appendChild(button); 
            link.setAttribute("download", `${name}_${type}.${ext}`);
            link.setAttribute("href", window.URL.createObjectURL(data[type]));
            button.setAttribute("type", "button");
            button.setAttribute("value", type);
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
                    const attr = parts[0].trim();
                    const  val = parts[1].trim();
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
    FOLD_2_V_EV_EA_VV_FV: (doc) => {
        let V, EV, EA, VV, FV;
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
            VV = X.V_FV_2_VV(V, FV);
        }
        return [V, EV, EA, VV, FV];
    },
    doc_type_2_V_VV_EV_EA_EF_FV: (doc, type) => {
        let V, VV, EV, EA, FV;
        if (type == "fold") {
            [V, EV, EA, VV, FV] = IO.FOLD_2_V_EV_EA_VV_FV(doc);
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
            NOTE.time("Constructing FOLD from lines");
            [V, EV, EL] = X.L_2_V_EV_EL(L, eps);
            EA = EL.map(l => L[l[0]][2]); 
        }
        if (FV == undefined) {
            [VV, FV] = X.V_EV_2_VV_FV(V, EV);
        }
        const EF = X.EV_FV_2_EF(EV, FV);
        for (const [i, F] of EF.entries()) {    // boundary edge assignment
            if (F.length == 1) {
                EA[i] = "B";
            }
        }
        return [V, VV, EV, EA, EF, FV];
    },
};

const CON = {      // CONSTRAINTS
    types: [0, 1, 2, 3],
    taco_taco: 0,
    taco_tortilla: 1,
    tortilla_tortilla: 2,
    transitivity: 3,
    valid: [
        ["111112", "111121", "111222", "112111",    // 0: taco-taco
         "121112", "121222", "122111", "122212", 
         "211121", "211222", "212111", "212221", 
         "221222", "222111", "222212", "222221"],
        ["112", "121", "212", "221"],               // 1: taco-tortilla
        ["11", "22"],                               // 2: tortilla-tortilla
        ["112", "121", "122", "211", "212", "221"], // 3: transitivity
    ],
    implied: [],
    build: () => {
        for (const type of [0, 1, 2, 3]) {
            const n = CON.valid[type][0].length;
            const I = [];
            for (let i = 0; i <= n; ++i) {
                I.push(new Map());
            }
            for (let i = 0; i < 3**n; ++i) {
                let [k, num_zeros] = [i, 0];
                const A = [];
                for (let j = 0; j < n; ++j) {
                    const val = k % 3;
                    num_zeros += (val == 0) ? 1 : 0;
                    A.push(val);
                    k = (k - A[j]) / 3;
                }
                I[num_zeros].set(A.join(""), 0);
            }
            for (const k of CON.valid[type]) {
                I[0].set(k, 1);
            }
            for (let i = 1; i <= n; ++i) {
                for (const [k, _] of I[i]) {
                    const A = Array.from(k);
                    let good = 0;
                    for (let j = 0; j < n; ++j) {
                        const check = [];
                        if (A[j] == "0") {
                            for (const c of ["1", "2"]) {
                                A[j] = c;
                                if (I[i - 1].get(A.join("")) != 0) {
                                    check.push([j, +c]);
                                }
                            }
                            A[j] = "0";
                            if ((good == 0) && (check.length > 0)) {
                                good = [];
                            }
                            if (check.length == 1) {
                                good.push(check[0]);
                            }
                        }
                    }
                    if (Array.isArray(good) && (good.length == 0)) {
                        good = 1;
                    }
                    I[i].set(k, good);
                }
            }
            CON.implied[type] = new Map();
            for (let i = n; i >= 0; --i) {
                for (const [k, v] of I[i]) {
                    CON.implied[type].set(k, v);
                }
            }
        }
    },
};

const GUI = {   // INTERFACE
    WIDTH: 1,
    COLORS: {
        background: "lightgray",
        active: "yellow",
        B: "lightskyblue",
        TE: ["green", "red", "orange", "cyan"],
        TF: ["lightgreen", "lightpink", "lightorange", "lightskyblue"],
        edge: {
            U: "black",
            F: "lightgray",
            M: "red",
            V: "blue",
            B: "black",
        },
        face: {
            top: "gray",
            bottom: "white",
        },
        rand: ["lime", "red", "blue", "green", "aqua", "orange", "pink", 
            "purple", "brown", "darkviolet", "teal", "olivedrab", "fuchsia", 
            "deepskyblue", "orangered", "maroon", "yellow"],
    },
    update_text: (FOLD, CELL) => {
        SVG.clear("export");
        SVG.clear("flat_shrunk");
        SVG.clear("flat_text");
        if (CELL != undefined) {
            SVG.clear("cell_text");
        }
        const visible = document.getElementById("text").checked;
        if (visible) {
            const flat_text = document.getElementById("flat_text");
            const flat_shrunk = document.getElementById("flat_shrunk");
            const {V, EV, EA, FV} = FOLD;
            const F = FV.map(f => M.expand(f, V));
            const shrunk = F.map(f => {
                const c = M.centroid(f);
                return f.map(p => M.add(M.mul(M.sub(p, c), 0.5), c));
            });
            SVG.draw_polygons(flat_shrunk, shrunk, {
                text: true, id: "f_text", opacity: 0.2});
            const line_centers = EV.map(l => M.centroid(M.expand(l, V)));
            const colors = EA.map(a => GUI.COLORS.edge[a]);
            SVG.draw_points(flat_text, line_centers, {
                text: true, id: "e_text", fill: colors});
            SVG.draw_points(flat_text, V, {
                text: true, id: "v_text", fill: "green"});
            if (CELL != undefined) {
                const {P, SP, CP} = CELL;
                const cell_text = document.getElementById("cell_text");
                const cell_centers = CP.map(f => M.interior_point(M.expand(f, P)));
                const seg_centers = SP.map(l => M.centroid(M.expand(l, P)));
                SVG.draw_points(cell_text, cell_centers, {
                    text: true, id: "c_text"});
                SVG.draw_points(cell_text, seg_centers, {
                    text: true, id: "s_text"});
                SVG.draw_points(cell_text, P, {
                    text: true, id: "p_text", fill: "green"});
            }
        }
    },
    update_flat: (FOLD) => {
        SVG.clear("export");
        const {V, VK, EV, EA, FV} = FOLD;
        const svg = SVG.clear("flat");
        const F = FV.map(f => M.expand(f, V));
        SVG.draw_polygons(svg, F, {id: "flat_f", fill: GUI.COLORS.face.bottom});
        SVG.append("g", svg, {id: "flat_shrunk"});
        const K = [];
        for (const [i, k] of VK.entries()) {
            if (k > 0.00001) { K.push(V[i]); }
        }
        SVG.draw_points(svg, K, {id: "flat_check", fill: "red", r: 10});
        const lines = EV.map(l => M.expand(l, V));
        const colors = EA.map(a => GUI.COLORS.edge[a]);
        const creases = [];
        const edges = [];
        for (const [i, a] of EA.entries()) {
            if (a == "F") {
                creases.push(i);
            } else {
                edges.push(i);
            }
        }
        SVG.draw_segments(svg, creases.map(i => lines[i]), {
            id: "flat_e_flat", stroke: creases.map(i => colors[i]), 
            stroke_width: GUI.WIDTH});
        SVG.draw_segments(svg, edges.map(i => lines[i]), {
            id: "flat_e_folded", stroke: edges.map(i => colors[i]), 
            stroke_width: GUI.WIDTH});
        SVG.append("g", svg, {id: "flat_text"});
        SVG.append("g", svg, {id: "flat_notes"});
        GUI.update_text(FOLD);
    },
    update_cell: (FOLD, CELL) => {
        SVG.clear("export");
        const svg = SVG.clear("cell");
        if (CELL == undefined) {
            const {Vf, FV} = FOLD;
            const F = FV.map(f => M.expand(f, Vf));
            SVG.draw_polygons(svg, F, {id: "cell_f", opacity: 0.05});
        } else {
            const {P, SP, SE, CP, SC, CF, FC} = CELL;
            const cells = CP.map(f => M.expand(f, P));
            const lines = SP.map(l => M.expand(l, P));
            const Ccolors = GUI.CF_2_Cbw(CF);
            SVG.draw_polygons(svg, cells, {fill: Ccolors, id: "cell_c"});
            SVG.draw_segments(svg, lines, {
                id: "cell_s", stroke: "black", stroke_width: GUI.WIDTH});
        }
        SVG.append("g", svg, {id: "cell_text"});
        SVG.append("g", svg, {id: "cell_notes"});
        SVG.append("g", svg, {id: "component_notes"});
        GUI.update_text(FOLD, CELL);
    },
    CF_2_Ccolors: (CF) => {
        return GUI.CF_2_Clayer(CF).map(l => `hsl(${
            Math.ceil((2 + l)*120)}, 100%, 50%)`);
    },
    CF_2_Cbw: (CF) => {
        return GUI.CF_2_Clayer(CF).map(l => `hsl(0, 0%, ${
            Math.ceil((1 - l*0.8)*100)}%)`);
    },
    CF_2_Clayer: (CF) => {
        let max_layers = 0;
        for (const F of CF) {
            if (max_layers < F.length) {
                max_layers = F.length;
            }
        }
        return CF.map(F => F.length/max_layers);
    },
    update_fold: (FOLD, CELL) => {
        SVG.clear("export");
        const {EF, Ff} = FOLD;
        const {P, SP, SE, CP, SC, CD} = CELL;
        const svg = SVG.clear("fold");
        const flip = document.getElementById("flip").checked;
        const tops = CD.map(S => flip ? S[0] : S[S.length - 1]);
        const SD = SOLVER.EF_SE_SC_CD_2_SD(EF, SE, SC, tops);
        const m = [0.5, 0.5];
        const Q = P.map(p => (flip ? M.add(M.refX(M.sub(p, m)), m) : p));
        const cells = CP.map(V => M.expand(V, Q));
        const colors = tops.map(d => (Ff[d] != flip) ? 
            GUI.COLORS.face.top : GUI.COLORS.face.bottom);
        SVG.draw_polygons(svg, cells, {
            id: "fold_c", fill: colors, stroke: colors});
        const [creases, segments] = [[], []];
        for (const [i, a] of SD.entries()) {
            if (a == "C") { creases.push(M.expand(SP[i], Q)); }
            if (a == "B") { segments.push(M.expand(SP[i], Q)); }
        }
        SVG.draw_segments(svg, creases, {
            id: "fold_s_crease", stroke: GUI.COLORS.edge.F});
        SVG.draw_segments(svg, segments, {
            id: "fold_s_edge", stroke: GUI.COLORS.edge.B});
    },
    update_component: (FOLD, CELL, BF, GB, GA, GI) => {
        SVG.clear("export");
        const comp_select = document.getElementById("component_select");
        const c = comp_select.value;
        document.getElementById("state_config").style.display = "none"; 
        comp_select.style.background = "white";
        const C = [];
        if (c == "none") {
        } else if (c == "all") {
            for (const [i, _] of GA.entries()) { 
                C.push(i);
            }
        } else {
            C.push(c);
            const n = GA[c].length;
            comp_select.style.background = GUI.COLORS.rand[c % GUI.COLORS.rand.length];
            document.getElementById("state_config").style.display = "inline"; 
            const state_label = document.getElementById("state_label");
            const state_select = document.getElementById("state_select");
            state_label.innerHTML = `${n} State${(n == 1) ? "" : "s"}`;
            state_select.setAttribute("min", 1);
            state_select.setAttribute("max", n);
            state_select.value = GI[c] + 1;
            state_select.onchange = (e) => {
                NOTE.start("Computing new state");
                let j = +e.target.value;
                if (j < 1) { j = 1; }
                if (j > n) { j = n; }
                state_select.value = j;
                GI[c] = j - 1;
                const edges = SOLVER.BF_GB_GA_GI_2_edges(BF, GB, GA, GI);
                FOLD.FO = SOLVER.edges_Ff_2_FO(edges, FOLD.Ff);
                CELL.CD = SOLVER.CF_edges_flip_2_CD(CELL.CF, edges);
                GUI.update_fold(FOLD, CELL);
                NOTE.end();
            };
        }
        const {Vf, FV} = FOLD;
        const g = SVG.clear("component_notes");
        for (const comp of C) {
            const lines = GB[comp].map(b => {
                const [f1, f2] = M.decode(BF[b]);
                const p1 = M.centroid(M.expand(FV[f1], Vf));
                const p2 = M.centroid(M.expand(FV[f2], Vf));
                return [p1, p2];
            });
            const stroke = GUI.COLORS.rand[comp % GUI.COLORS.rand.length];
            SVG.draw_segments(g, lines, {id: "cell_comp", 
                "stroke": stroke, "stroke_width": 2});
        }
    },
    update_cell_face_listeners: (FOLD, CELL, BF, BT) => {
        const {V, EV, FV} = FOLD;
        const {P, SP, CP, CF, FC, SE} = CELL;
        const ES_map = new Map();
        for (const [i, E] of SE.entries()) {
            for (const e of E) {
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
        for (const [i, E] of SE.entries()) {
            SE_map.set(M.encode(SP[i]), E);
        }
        const FM = FV.map(F => M.centroid(M.expand(F, V)));
        const FB_map = new Map();
        for (const [i, F] of BF.entries()) {
            FB_map.set(F, i);
        }
        const FB = FC.map(() => []);
        for (const k of BF) { 
            const [f1, f2] = M.decode(k);
            FB[f1].push(f2);
            FB[f2].push(f1);
        }
        const active = [];
        const flat_notes = document.getElementById("flat_notes");
        const cell_notes = document.getElementById("cell_notes");
        NOTE.start_check("face", FC);
        for (const [i, C] of FC.entries()) {
            NOTE.check(i);
            const face = document.getElementById(`flat_f${i}`);
            face.onclick = () => {
                const color = face.getAttribute("fill");
                GUI.clear_notes(CF, FC, true);
                if (active.length == 1) {
                    if (color == GUI.COLORS.B) {
                        active.push(i);
                        const [f1, f2] = active;
                        const T = BT[FB_map.get(M.encode_order_pair([f1, f2]))];
                        for (const j of [3, 1]) {
                            const Tj = (j == 1) ? T[j] : M.decode(T[j]);
                            for (const F of Tj) {
                                const f3 = (j == 1) ? F[2] : F;
                                const el = document.getElementById(`flat_f${f3}`);
                                el.setAttribute("fill", GUI.COLORS.TF[j]);
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
                            SVG.draw_segments(flat_notes, L[j], {
                                id: "flat_cons",
                                stroke: GUI.COLORS.TE[j], stroke_width: 5});
                        }
                        for (const f of [f1, f2]) {
                            for (const c of FC[f]) {
                                const el = document.getElementById(`cell_c${c}`);
                                el.setAttribute("fill", GUI.COLORS.active);
                            }
                        }
                        const C1 = new Set(FC[f1]);
                        for (const c of FC[f2]) {
                            if (C1.has(c)) {
                                const el = document.getElementById(`cell_c${c}`);
                                el.setAttribute("fill", GUI.COLORS.TF[3]);
                            }
                        }
                        for (const f of active) {
                            const el = document.getElementById(`flat_f${f}`);
                            el.setAttribute("fill", GUI.COLORS.active);
                            
                        }
                    } else {
                        active.pop();
                    }
                } else {
                    while (active.length > 0) { active.pop(); }
                    if (color != GUI.COLORS.face.bottom) { return; }
                    active.push(i);
                    for (const f of FB[i]) {
                        const el = document.getElementById(`flat_f${f}`);
                        el.setAttribute("fill", GUI.COLORS.B);
                    }
                    const S = [];
                    const Scolors = [];
                    const Lcolors = [];
                    const L = FV[i].map((v1, j) => {
                        const v2 = FV[i][(j + 1) % FV[i].length];
                        const k = M.encode_order_pair([v1, v2]);
                        const color = GUI.COLORS.rand[j % GUI.COLORS.rand.length];
                        for (const s of ES_map.get(k)) {
                            S.push(SP[s].map(p => P[p]));
                            Scolors.push(color);
                        }
                        Lcolors.push(color);
                        return [v1, v2].map(p => V[p]);
                    });
                    SVG.draw_segments(flat_notes, L, {
                        id: "flat_f_bounds", stroke: Lcolors, stroke_width: 5});
                    SVG.draw_segments(cell_notes, S, {
                        id: "cell_f_bounds", stroke: Scolors, stroke_width: 5});
                    GUI.add_active(face, C, "cell_c");
                }
            };
        }
        for (const [i, F] of CF.entries()) {
            const cell = document.getElementById(`cell_c${i}`);
            cell.onclick = () => {
                const active = (cell.getAttribute("fill") == GUI.COLORS.active);
                GUI.clear_notes(CF, FC, !active);
                if (!active) {
                    GUI.add_active(cell, F, "flat_f");
                    const L = [];
                    const Lcolors = [];
                    const Scolors = [];
                    const S = CP[i].map((p1, j) => {
                        const p2 = CP[i][(j + 1) % CP[i].length];
                        const k = M.encode_order_pair([p1, p2]);
                        const color = GUI.COLORS.rand[j % GUI.COLORS.rand.length];
                        for (const e of SE_map.get(k)) {
                            L.push(EV[e].map(p => V[p]));
                            Lcolors.push(color);
                        }
                        Scolors.push(color);
                        return [p1, p2].map(p => P[p]);
                    });
                    SVG.draw_segments(flat_notes, L, {
                        id: "flat_c_bounds", stroke: Lcolors, stroke_width: 5});
                    SVG.draw_segments(cell_notes, S, {
                        id: "cell_c_bounds", stroke: Scolors, stroke_width: 5});
                }
            };
        }
    },
    clear_notes: (CF, FC, active) => {
        SVG.clear("flat_notes");
        SVG.clear("cell_notes");
        SVG.clear("export");
        for (const [i, C] of FC.entries()) {
            const f = document.getElementById(`flat_f${i}`);
            f.setAttribute("fill", GUI.COLORS.face.bottom);
        }
        const Ccolors = active ? GUI.CF_2_Cbw(CF) : GUI.CF_2_Cbw(CF);
        for (const [i, F] of CF.entries()) {
            const c = document.getElementById(`cell_c${i}`);
            c.setAttribute("fill", Ccolors[i]);
        }
    },
    add_active: (svg, A, id) => {
        svg.setAttribute("fill", GUI.COLORS.active);
        for (const a of A) {
            const el = document.getElementById(`${id}${a}`);
            el.setAttribute("fill", GUI.COLORS.active);
        }
    },
};

const SVG = {   // DRAWING
    SCALE: 1000,
    NS: "http://www.w3.org/2000/svg",
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
        if (el.children != undefined) {
            while (el.children.length > 0) {
                el.removeChild(el.firstChild);
            }
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
        for (const [i, p] of P.entries()) {
            const [x, y] = M.mul(p, SVG.SCALE);
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
        for (const [i, l] of L.entries()) {
            NOTE.check(i);
            const [[x1, y1], [x2, y2]] = l.map(p => M.mul(p, SVG.SCALE));
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
        for (const [i, ps] of P.entries()) {
            NOTE.check(i);
            const F = ps.map(p => M.mul(p, SVG.SCALE));
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

const TIME = {  // TIME
    main_start: 0, main_lap: 0,
    est_start:  0, est_lap:  0, est_lim: 0,
    start_main: () => {
        TIME.main_start = Date.now();
        TIME.main_lap = TIME.main_start;
    },
    read_time: () => TIME.str(Date.now() - TIME.main_start),
    lap: () => {
        const stop = Date.now();
        const time = stop - TIME.main_lap;
        TIME.main_lap = stop;
        return TIME.str(time);
    },
    read_est: () => Date.now() - TIME.est_lap,
    start_est: (lim) => {
        TIME.est_start = Date.now();
        TIME.est_lap = TIME.est_start;
        TIME.est_lim = lim;
    },
    lap_est: () => (TIME.est_lap = Date.now()),
    remaining: (i) => {
        return TIME.str((Date.now() - TIME.est_start)*(TIME.est_lim/i - 1));
    },
    str: (time) => {
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
};

const NOTE = {  // ANNOTATION
    start: (label) => {
        TIME.start_main()
        if (label != undefined) {
            NOTE.time(label);
        }
    },
    lap: () => NOTE.log(`   - Time elapsed: ${TIME.lap()}`),
    start_check: (label, A, interval = 5000) => {
        const lim = (A == undefined) ? A : A.length;
        TIME.start_est(lim);
        NOTE.check_interval = interval;
        NOTE.check_label = label;
    },
    check: (i) => {
        if (TIME.read_est() > NOTE.check_interval) {
            if (TIME.est_lim != undefined) {
                NOTE.log(`    On ${
                    NOTE.check_label} ${i} out of ${
                    TIME.est_lim}, est time left: ${TIME.remaining(i)}`);
            } else {
                NOTE.log(`    On ${NOTE.check_label} ${i} of unknown`);
            }
            TIME.lap_est();
        }
    },
    annotate: (A, label) => {
        const main = `   - Found ${A.length} ${label}`;
        const detail = (A.length == 0) ? "" : `[0] = ${JSON.stringify(A[0])}`;
        NOTE.log(main.concat(detail));
    },
    time: (label) => {
        const time = (new Date()).toLocaleTimeString();
        NOTE.log(`${time} | ${label}`);
    },
    end: () => {
        NOTE.log(`*** Total Time elapsed: ${TIME.read_time()} ***`);
        NOTE.log("");
    },
    count: (A, label, div = 1) => {
        const n = Array.isArray(A) ? M.count_subarrays(A)/div : A;
        NOTE.log(`   - Found ${n} ${label}`);
    },
    log: (str) => {
        console.log(str);
        NOTE.lines.push(str);
    },
    clear_log: () => {
        NOTE.lines = [];
    },
};

const M = {     // MATH
    EPS: 300,
    encode: (A) => {
        const B = [];
        for (const a of A) {
            B.push(String.fromCodePoint(a));
        }
        return B.join("");
    },
    encode_order_pair: ([a, b]) => M.encode((a < b) ? [a, b] : [b, a]),
    decode: (S) => {
        const B = [];
        for (const s of S) {
            B.push(s.codePointAt(0));
        }
        return B;
    },
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
    previous_in_list: (A, v) => {
        for (const [i, x] of A.entries()) {
            if (x == v) {
                if (i == 0) { return A[A.length - 1]; } 
                else        { return A[i - 1]; }
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
        const is_tall = (x_diff < y_diff);
        const diff = is_tall ? y_diff : x_diff;
        const off = M.sub([0.5, 0.5], M.div([x_diff, y_diff], 2*diff));
        return P.map(p => M.add(M.div(M.sub(p, [x_min, y_min]), diff), off));
    },
    interior_point: (P) => {    // currently O(n^2), could be O(n log n)
        // In:  P | array of 2D points that define a simple polygon with the
        //        | inside of the polygon on the left of the boundary tour
        // Out: x | centroid of P's largest ear, i.e., triangle formed by three
        //        | consecutive points of P that lies entirely in P, two of
        //        | which exist by the two ears theorem.
        const n = P.length;
        let largest_ear;
        let max_area = -Infinity;
        let [p1, p2] = [P[n - 2], P[n - 1]];
        for (const p3 of P) {
            const a = M.area2(p1, p2, p3);
            if (a <= 0) {           // reflex vertex cannot be an ear
                continue;
            }
            let found = true;
            for (const p of P) {    // check if triangle contains another vertex
                if ((p != p1) && (p != p2) && (p != p3) && 
                    ((M.area2(p1, p2, p) >= 0) &&
                     (M.area2(p2, p3, p) >= 0) &&
                     (M.area2(p3, p1, p) >= 0))
                ) {
                    found = false;
                    break;
                }
            }
            if (found) {            // convex ear is contained in P
                if (max_area < a) {
                    max_area = a;
                    largest_ear = [p1, p2, p3];
                }
            }
            [p1, p2] = [p2, p3];
        }
        if (largest_ear == undefined) { debugger; }
        return M.centroid(largest_ear);
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
        let p1 = P[P.length - 1];
        for (const p2 of P) {
            area += (p1[0] + p2[0])*(p2[1] - p1[1]);
            p1 = p2;
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
        if (n == 0) { return []; }
        const A = [];
        for (const bite of M.decode(B)) {
            for (let j = 0; j < 8; ++j) {
                A.push(((bite >> j) & 1) + 1);
                if (A.length == n) {
                    return A;
                }
            }
        }
        debugger; // input array shorter than requested length
    },
};
