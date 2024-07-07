export const CON = {      // CONSTRAINTS
    // Format for constraint state for overlapping face pair [A,B] is:
    //      '0' if no order has been assigned
    //      '1' if A is assigned over B
    //      '2' if B is assigned over A
    T: { taco_taco: 0, taco_tortilla: 1, tortilla_tortilla: 2, transitivity: 3 },
    names: ["taco-taco", "taco-tortilla", "tortilla-tortilla", "transitivity"],
    types: [0, 1, 2, 3],
    pair_maps: [
        ([A,B,C,D]) => [[A,B],[C,D],[C,B],[A,D],[A,C],[B,D]], // 0: taco-taco
            // Faces A, B, C, D that all overlap,
            // with A-B and C-D adjacent via edges that properly intersect.
        ([A,B,C]) => [[A,C],[C,B]],                 // 1: taco-tortilla
            // Faces A, B, C that all overlap,
            // with A-B adjacent via an edge that properly intersects C.
        ([A,B,C,D]) => [[A,C],[B,D]],               // 2: tortilla-tortilla
            // Faces A, B, C, D where only A,C and B,D overlap,
            // with A-B and C-D adjacent via edges that properly intersect.
        ([A,B,C]) => [[A,B],[B,C],[C,A]],           // 3: transitivity
            // Faces A, B, C that all overlap,
            // where C properly intersects the overlap between A and B.
    ],
    type_F_2_pairs: (type, F) => CON.pair_maps[type](F),
    valid: [
        ["111112", "111121", "111222", "112111",    // 0: taco-taco
         "121112", "121222", "122111", "122212",
         "211121", "211222", "212111", "212221",
         "221222", "222111", "222212", "222221"],
        ["12", "21"],                               // 1: taco-tortilla
        ["11", "22"],                               // 2: tortilla-tortilla
        ["112", "121", "122", "211", "212", "221"], // 3: transitivity
    ],
    implied: [],
    state: { conflict: 0, alive: 1, dead: 2 },
    build: () => {
        // gives state for each config:
        //   0: config is not possible (conflict)
        //   1: config is possible, but some assignments invalid (alive)
        //   2: config is possible, and all assignments valid (dead)
        //  []: config is possible, and some assignments implied (array)
        //      array element [i, a] implies var at idx i has assignment a
        for (const type of CON.types) {
            const valid = CON.valid[type];
            const n = valid[0].length;
            const I = Array(n + 1).fill().map(() => new Map());
            for (let i = 0; i < 3**n; ++i) {
                let [k, num_zeros] = [i, 0];
                const A = [];
                for (let j = 0; j < n; ++j) {
                    const val = k % 3;
                    num_zeros += (val == 0) ? 1 : 0;
                    A.push(val);
                    k = (k - A[j]) / 3;
                }
                I[num_zeros].set(A.join(""), CON.state.conflict);
            }
            for (const k of valid) {
                I[0].set(k, CON.state.dead);
            }
            for (let i = 1; i <= n; ++i) {
                for (const [k, _] of I[i]) {
                    const A = Array.from(k);
                    const implied = [];
                    let [conflict, dead] = [true, true];
                    for (let j = 0; j < n; ++j) {
                        if (A[j] != "0") { continue; }
                        let possible = 0;
                        for (const c of ["1", "2"]) {
                            A[j] = c;
                            const state = I[i - 1].get(A.join(""));
                            if (state != CON.state.dead) {
                                dead = false;
                            }
                            if (state != CON.state.conflict) {
                                possible |= +c;
                            }
                        }
                        A[j] = "0";
                        if (possible) {
                            conflict = false;
                            if (possible < 3) {
                                implied.push([j, possible]);
                            }
                        }
                    }
                    const state = conflict ? CON.state.conflict : (
                        (implied.length > 0) ? implied : (
                        dead ? CON.state.dead : CON.state.alive
                    ));
                    I[i].set(k, state);
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
