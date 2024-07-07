import { M } from "./math.js";
import { NOTE } from "./note.js";
import { CON } from "./constraints.js";
import { IO } from "./io.js";
import { X } from "./conversion.js";
import { SOLVER } from "./solver.js";
import { PAR } from "./parallel.js";

let W;
const G = {};
onmessage = (e) => {
    const d = e.data;
    actions[d.type](...d.args);
};

const actions = {
    setup: async (wn) => {
        NOTE.log = (str) => {
            if (!NOTE.show) { return; }
            postMessage({type: "note", arg: str});
        };
        NOTE.time("Computing constraint implication maps");
        CON.build();
        W = await PAR.get_workers(wn, "./worker.js");
        postMessage({type: "end"});
    },
    clear: () => {
        for (const k of Object.keys(G)) { delete G[k]; }
        postMessage({type: "end"});
    },
    doc_type_side_2_fold: (doc, type, side) => {
        NOTE.start("*** Beginning import ***");
        const [V, VV, EV, EA, EF, FV, FE] =
            IO.doc_type_side_2_V_VV_EV_EA_EF_FV_FE(doc, type, side);
        if (V == undefined) { return; }
        const VK = X.V_VV_EV_EA_2_VK(V, VV, EV, EA);
        NOTE.annotate(V, "vertices_coords");
        NOTE.annotate(EV, "edges_vertices");
        NOTE.annotate(EA, "edges_assignments");
        NOTE.annotate(EF, "edges_faces");
        NOTE.annotate(FV, "faces_vertices");
        NOTE.annotate(FE, "faces_edges");
        const [Vf, Ff] = X.V_FV_EV_EA_2_Vf_Ff(V, FV, EV, EA);
        const Vf_norm = M.normalize_points(Vf);
        NOTE.annotate(Vf, "vertices_coords_folded");
        NOTE.annotate(Ff, "faces_flip");
        NOTE.lap();
        G.FOLD = {V, Vf, Vf_norm, VK, EV, EA, EF, FV, FE, Ff};
        postMessage({type: "end", arg: G.FOLD});
    },
    get_cell: async () => {
        NOTE.start("*** Computing cell graph ***");
        const {Vf, EV, EF, FV} = G.FOLD;
        const L = EV.map((P) => M.expand(P, Vf));
        NOTE.time("Constructing points and segments from edges");
        const [P, SP, SE, eps_i] = X.L_2_V_EV_EL(L);
        if (P.length == 0) { postMessage([undefined, [], []]); return; }
        const eps = M.min_line_length(L)/(2**eps_i);
        NOTE.time(`Used eps: ${2**eps_i} | ${eps}`);
        const P_norm = M.normalize_points(P);
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
        G.CELL = {P, P_norm, SP, SE, CP, CS, SC, CF, FC, eps: eps_i};
        postMessage({type: "end", arg: G.CELL});
    },
    solve: async (lim) => {
        const {EA, EF, Ff} = G.FOLD;
        const {P, P_norm, SP, SE, CP, CS, SC, CF, FC} = G.CELL;
        NOTE.start("*** Computing constraints ***");
        NOTE.time("Computing edge-edge overlaps");
        const ExE = X.SE_2_ExE(SE);
        NOTE.count(ExE, "edge-edge adjacencies");
        NOTE.lap();
        NOTE.time("Computing edge-face overlaps");
        const ExF = X.SE_CF_SC_2_ExF(SE, CF, SC);
        NOTE.count(ExF, "edge-face adjacencies");
        NOTE.lap();
        NOTE.time("Computing variables");
        const BF = X.EF_SP_SE_CP_CF_2_BF(EF, SP, SE, CP, CF);
        const BI = new Map();
        for (const [i, F] of BF.entries()) { BI.set(F, i); }
        NOTE.annotate(BF, "variables_faces");
        NOTE.lap();
        NOTE.time("Computing non-transitivity constraints");
        const [BT0, BT1, BT2] = X.BF_BI_EF_ExE_ExF_2_BT0_BT1_BT2(
            BF, BI, EF, ExE, ExF);
        NOTE.count(BT0, "taco-taco", 6);
        NOTE.count(BT1, "taco-tortilla", 2);
        NOTE.count(BT2, "tortilla-tortilla", 2);
        NOTE.lap();
        NOTE.time("Computing transitivity constraints");
        const BT3 = ((W == undefined) ?
            X.EF_SP_SE_CP_FC_CF_BF_2_BT3(EF, SP, SE, CP, FC, CF, BF) :
            (await X.FC_CF_BF_W_2_BT3(FC, CF, BF, W))
        );
        NOTE.count(BT3, "initial transitivity", 3);
        NOTE.lap();
        NOTE.time("Cleaning transitivity constraints");
        X.FC_BF_BI_BT0_BT1_BT3_2_clean_BT3(FC, BF, BI, BT0, BT1, BT3);
        NOTE.count(BT3, "independent transitivity", 3);
        const BT = BF.map((F,i) => [BT0[i], BT1[i], BT2[i], BT3[i]]);
        NOTE.lap();
        NOTE.time("*** Computing states ***");
        NOTE.time("Assigning orders based on crease assignment");
        const out = SOLVER.initial_assignment(EF, EA, Ff, BF, BT, BI);
        if ((out.length == 3) && (out[0].length == undefined)) {
            const [type, F, E] = out;
            const str = `Unable to resolve ${CON.names[type]} on faces [${F}]`;
            NOTE.log(`   - ${str}`);
            NOTE.log(`   - Faces participating in conflict: [${E}]`);
            postMessage({type: "end", arg: ["assign_error", out]});
            return;
        }
        const BA = out;
        NOTE.annotate(BA.map((_, i) => i).filter(i => BA[i] != 0),
            "initially assignable variables");
        NOTE.lap();
        NOTE.time("Finding unassigned components");
        const GB = SOLVER.get_components(BI, BF, BT, BA);
        NOTE.count(GB.length - 1, "unassigned components");
        NOTE.lap();
        const GA = SOLVER.solve(BI, BF, BT, BA, GB, lim);
        if (GA.length == undefined) {
            const gi = GA;
            const F = new Set();
            for (const bi of GB[gi]) {
                for (const f of M.decode(BF[bi])) { F.add(f); }
            }
            postMessage({
                type: "end",
                arg: ["component_error", [gi, Array.from(F)]]
            });
            return;
        }
        const Gn = GA.map(A => A.length);
        NOTE.time("Solve completed");
        NOTE.lap();
        G.SOLVE = {BF, BI, BT, GB, GA};
        postMessage({type: "end", arg: ["success", Gn]});
    },
    Gi_2_CD_FO: (Gi) => {
        const {Ff} = G.FOLD;
        const {CF} = G.CELL;
        const {BF, GB, GA} = G.SOLVE;
        NOTE.time("Computing state");
        const edges = X.BF_GB_GA_GI_2_edges(BF, GB, GA, Gi);
        const CD = X.CF_edges_2_CD(CF, edges);
        const FO = X.edges_Ff_2_FO(edges, Ff);
        postMessage({type: "end", arg: [CD, FO]});
    },
    f1_f2_2_T: (f1, f2) => {
        const {BI, BT} = G.SOLVE;
        const bi = BI.get(M.encode_order_pair([f1, f2]));
        postMessage({type: "end", arg: [bi, BT[bi]]});
    },
    g_2_gBF: (g) => {
        const {BF, GB} = G.SOLVE;
        const gBF = g.map(gi => GB[gi].map(b => M.decode(BF[b])));
        postMessage({type: "end", arg: gBF});
    },
};
