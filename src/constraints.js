export const CON = {      // CONSTRAINTS
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
