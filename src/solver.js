import { M } from "./math.js";
import { NOTE } from "./note.js";
import { CON } from "./constraints.js";

const flip = [[0, 1, 2], [0, 2, 1]];
export const SOLVER = {    // STATE SOLVER
    infer: (type, F, BI, BA) => {
        // In: type | constraint type
        //        F | array of constraint face indices
        //       BI | map from variable keys to indices
        //       BA | array of variable assignments
        // Out:   I | false if BA conflicts with T, else array of pairs [i, a]
        //          | where a is assignment inferred for variable at index i
        const pairs = CON.type_F_2_pairs(type, F);
        const tuple = pairs.map(([x, y]) => {
            const a = BA[BI.get(M.encode_order_pair([x, y]))];
            return flip[+(y < x)][a];
        });
        const I = CON.implied[type].get(tuple.join(""));
        if (!Array.isArray(I)) { return I; } // I in [0, 1, 2]
        return I.map(([i, a]) => {      // flip infered orders as necessary
            const [x, y] = pairs[i];
            const bi = BI.get(M.encode_order_pair([x, y]));
            return [bi, flip[+(y < x)][a]];
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
                    const I = SOLVER.infer(type, F, BI, BA);
                    if (I == CON.state.conflict) {
                        for (const j of B) { BA[j] = 0; }
                        return [];
                    }
                    if (!Array.isArray(I)) { continue; }
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
            }
            ++idx;
        }
        return B;
    },
    get_components: (BI, BF, BT, BA) => {
        const B0 = BA.map((_, i) => i).filter(i => BA[i] != 0);
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
                            const I = SOLVER.infer(type, F, BI, BA);
                            if (I == CON.state.dead) { continue; }
                            const vars = CON.type_F_2_pairs(type, F).map(
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
        if (type == CON.T.transitivity) {
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
    EF_EA_Ff_BF_BI_2_BA0: (EF, EA, Ff, BF, BI) => {
        const BA0 = BF.map(() => 0);
        for (const [i, a] of EA.entries()) {
            if ((a == "M") || (a == "V")) {
                const k = M.encode_order_pair(EF[i]);
                const [f1, f2] = M.decode(k);
                const o = ((!Ff[f1] && (a == "M")) ||
                            (Ff[f1] && (a == "V"))) ? 2 : 1;
                BA0[BI.get(k)] = o;
            }
        }
        return BA0;
    },
    initial_assignment: (BA, BF, BT, BI) => {
        const BP = BA.map(() => undefined);
        let level = [];
        for (const [i, a] of BA.entries()) {
            if (a != 0) { level.push([i, a]); BP[i] = []; }
        }
        const types = CON.types.map(t => t);
        types.pop();
        NOTE.log(`   - First pass, no transitivity`);
        let out = SOLVER.flood_by_constraints(level, BF, BI, BA, BT, BP, types);
        if (Array.isArray(out) && (out.length == 3)) { return out; }
        NOTE.log(`   - Cleaning transitivity`);
        out = SOLVER.clean_dead(BF, BI, BA, BT, BP);
        if (Array.isArray(out) && (out.length == 3)) { return out; }
        const new_level = out[1];
        NOTE.log(`   - Found ${out[0]/3} middle transitivity`);
        NOTE.log(`   - Second pass, with transitivity`);
        out = SOLVER.flood_by_constraints(new_level, BF, BI, BA, BT, BP, CON.types);
        if (Array.isArray(out) && (out.length == 3)) { return out; }
        NOTE.log(`   - Cleaning transitivity`);
        out = SOLVER.clean_dead(BF, BI, BA, BT, BP);
        if (Array.isArray(out) && (out.length == 3)) { return out; }
        NOTE.log(`   - Found ${out[0]/3} final transitivity`);
        return BA;
    },
    flood_by_constraints: (level, BF, BI, BA, BT, BP, constraints) => {
        let [count, depth] = [0, 0];
        NOTE.start_check("variable", BA);
        while (level.length > 0) {      // second pass, all constraints
            NOTE.log(`   - ${level.length} orders assigned at depth ${depth}`);
            for (const [i, a] of level) { BA[i] = a; }
            const new_level = [];
            for (const [i, a] of level) {
                NOTE.check(count);
                ++count;
                const [f1, f2] = M.decode(BF[i]);
                const C = BT[i];
                for (const type of constraints) {
                    const CF = SOLVER.unpack_cons(C, type, f1, f2);
                    for (const [ci, F] of CF.entries()) {
                        const I = SOLVER.infer(type, F, BI, BA);
                        if (I == CON.state.conflict) {
                            const E = SOLVER.error_faces(type, F, BF, BT, BI, BA, BP);
                            return [type, F, E]; // constraint unsatisfiable
                        }
                        if (I == CON.state.alive) { continue; }
                        if (I == CON.state.dead) { continue; }
                        for (const [i_, a_] of I) {
                            if (BP[i_] != undefined) { continue; }
                            BP[i_] = [type, i, ci];
                            new_level.push([i_, a_]);
                        }
                    }
                }
            }
            level = new_level;
            ++depth;
        }
    },
    clean_dead: (BF, BI, BA, BT, BP) => {
        const level = [];
        let tn = 0;
        const type = CON.T.transitivity;
        NOTE.start_check("variable", BA);
        for (const [i, k] of BF.entries()) { // remove dead transitivity
            NOTE.check(i);
            const [f1, f2] = M.decode(k);
            const T = M.decode(BT[i][type]);
            const T_ = [];
            for (const [ci, f3] of T.entries()) {
                const F = [f1, f2, f3];
                const I = SOLVER.infer(type, F, BI, BA);
                if (I == CON.state.conflict) {
                    const E = SOLVER.error_faces(type, F, BF, BT, BI, BA, BP);
                    return [type, F, E]; // constraint unsatisfiable
                }
                if (I == CON.state.dead) { continue; }
                if (I == CON.state.alive) { T_.push(f3); continue; }
                for (const [i_, a_] of I) {
                    if (BP[i_] != undefined) { continue; }
                    BP[i_] = [type, i, ci];
                    level.push([i_, a_]);
                }
            }
            delete BT[i][type];
            BT[i][type] = M.encode(T_);
            tn += T_.length;
            T.length = 0;
            T_.length = 0;
        }
        return [tn, level];
    },
    solve: (BI, BF, BT, BA, GB, lim) => {
        // In:   BI | map from variable keys to indices
        //       BF | array for each variable: key
        //       BT | array for each variable: constraints
        //       GB | array for each independent group:
        //          |   array of variables in group
        //       BA | array for each variable: known assignment
        //      lim | upper limit on # solutions to return per group
        // Out:  GA | array for each independent group:
        //          |   array of valid assignments:  (max length lim)
        //          |     array for each variable in group: an assignment
        //          | returns index of an unsatisfiable group if no solutions found
        const B0 = BA.map((_, i) => i).filter(i => BA[i] != 0);
        const GA = [[M.bit_encode(B0.map(i => BA[i]))]];
        for (const [i, B] of GB.entries()) {
            if (i == 0) { continue; }
            NOTE.time(`Solving component ${i}/${GB.length - 1} with size ${B.length}`);
            const A = SOLVER.guess_vars(B, BI, BF, BT, BA, lim);
            NOTE.count(A.length, "assignments");
            if (A.length == 0) { return i; }
            GA.push(A);
        }
        return GA;
    },
    error_faces: (type, F, BF, BT, BI, BA, BP) => {
        const vars = [];
        for (const pair of CON.type_F_2_pairs(type, F)) {
            vars.push(BI.get(M.encode_order_pair(pair)));
        }
        const seen = new Set();
        while (vars.length > 0) {
            const i = vars.pop();
            seen.add(i);
            const a = BA[i];
            if (a != 0) {
                const par = BP[i];
                if (par.length > 0) {
                    const [type, bi, ci] = par;
                    const [f1, f2] = M.decode(BF[bi]);
                    const F = SOLVER.unpack_cons(BT[bi], type, f1, f2)[ci];
                    for (const pair of CON.type_F_2_pairs(type, F)) {
                        const i_ = BI.get(M.encode_order_pair(pair));
                        if (!seen.has(i_)) {
                            vars.push(i_);
                        }
                    }
                }
            }
        }
        const E_set = new Set();
        for (const i of seen) {
            for (const f of M.decode(BF[i])) {
                E_set.add(f);
            }
        }
        const E = Array.from(E_set);
        E.sort((a, b) => (a < b) ? -1 : 1);
        return E;
    },
};
