import { M } from "./math.js";
import { NOTE } from "./note.js";
import { CON } from "./constraints.js";
import { X } from "./conversion.js";
import { SOLVER } from "./solver.js";

NOTE.log = (str) => {
    postMessage(["note", str]);
}

onmessage = (e) => {
    const [op, args] = e.data;
    postMessage([op, WORKER[op](...args)]);
};

const WORKER = {
    BT: undefined,
    GA: undefined,
    startup: () => {
        NOTE.clear_log();
        CON.build();
    },
    constraints: (f1, f2) => {
        const i = WORKER.CONSTRAINT.FB_map.get(M.encode_order_pair([f1, f2]));
        return [i, f1, f2, WORKER.BT[i]];
    },
    overlaps: (f) => {
        return [f, WORKER.CONSTRAINT.FB[f]];
    },
    fold: (FOLD, lim) => {
        NOTE.start("*** Computing cell graph ***");
        const {V, Vf, EV, EF, EA, FE, FV, Ff} = FOLD;
        const L = EV.map((P) => M.expand(P, Vf));
        const eps = M.min_line_length(L) / M.EPS;
        NOTE.time(`Using eps ${eps} from min line length ${
            eps*M.EPS} (factor ${M.EPS})`);
        NOTE.time("Constructing points and segments from edges");
        const [P, SP, SE] = X.L_2_V_EV_EL(L, eps);
        NOTE.annotate(P, "points_coords");
        NOTE.annotate(SP, "segments_points");
        NOTE.annotate(SE, "segments_edges");
        NOTE.lap();
        NOTE.time("Constructing cells from segments");
        const [,CP] = X.V_EV_2_VV_FV(P, SP);
        NOTE.annotate(CP, "cells_points");
        NOTE.lap();
        NOTE.time("Computing segments_cells");
        const [SC, CS] = X.EV_FV_2_EF_FE(SP, CP);
        NOTE.annotate(SC, "segments_cells");
        NOTE.annotate(CS, "cells_segments");
        NOTE.lap();
        NOTE.time("Making face-cell maps");
        const [CF, FC] = X.EF_FV_SP_SE_CP_SC_2_CF_FC(EF, FV, SP, SE, CP, SC);
        NOTE.count(CF, "face-cell adjacencies");
        NOTE.lap();
        const [SE_map, ES_map] = X.EV_SP_SE_2_SEmap_ESmap(EV, SP, SE);
        const CELL = {P, SP, SE, CP, CS, SC, CF, FC, SE_map, ES_map};
        NOTE.time("Updating cell");
        postMessage(["draw_cells", CELL]);
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
        // const FB_map = new Map();
        // for (const [i, F] of BF.entries()) {
        //     FB_map.set(F, i);
        // }
        // const FB = FC.map(() => []);
        // for (const k of BF) {
        //     const [f1, f2] = M.decode(k);
        //     FB[f1].push(f2);
        //     FB[f2].push(f1);
        // }
        WORKER.BT = BT;
        NOTE.lap();
        NOTE.time("*** Computing states ***");
        const BA0 = X.EF_EA_Ff_BF_2_BA0(EF, EA, Ff, BF);
        const sol = SOLVER.solve(BF, BT, BA0, lim);
        if (sol.length == 3) {  // solve found unsatisfiable constraint
            const [type, F, E] = sol;
            postMessage(["unsatisfiable", [type, F, E, BF]]);
        } else {                // solve completed
            const [GB, GA] = sol;
            WORKER.GA = GA;
            const n = (GA == undefined) ? 0 : GA.reduce((s, A) => {
                return s*BigInt(A.length);
            }, BigInt(1));
            postMessage(["solve_complete", [n, BF, GB]]);
        }
    },
};
