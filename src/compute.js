import { M } from "./math.js";
import { NOTE } from "./note.js";
import { CON } from "./constraints.js";
import { IO } from "./io.js";
import { X } from "./conversion.js";
import { SOLVER } from "./solver.js";

const G = {};
onmessage = (e) => {
    const d = e.data;
    actions[d.type](...d.args);
};

const actions = {
    setup: () => {
        NOTE.log = (str) => {
            if (!NOTE.show) { return; }
            postMessage({type: "note", arg: str});
        };
        NOTE.time("Computing constraint implication maps");
        CON.build();
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
        NOTE.annotate(Vf, "vertices_coords_folded");
        NOTE.annotate(Ff, "faces_flip");
        NOTE.lap();
        G.FOLD = {V, Vf, VK, EV, EA, EF, FV, FE, Ff};
        postMessage({type: "end", arg: G.FOLD});
    },
    solved: () => {
        postMessage({type: "end", arg: G.GA != undefined});
    },
    get_cell: () => {
        NOTE.start("*** Computing cell graph ***");
        const {Vf, EV, EF, FV} = G.FOLD;
        const L = EV.map((P) => M.expand(P, Vf));
        NOTE.time("Constructing points and segments from edges");
        const [P, SP, SE, eps_i] = X.L_2_V_EV_EL(L);
        if (P.length == 0) { postMessage([undefined, [], []]); return; }
        const eps = M.min_line_length(L)/(2**eps_i);
        NOTE.time(`Used eps: ${2**eps_i} | ${eps}`);
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
        const [CF, FC] = X.EF_FV_P_SP_SE_CP_SC_2_CF_FC(EF, FV, P, SP, SE, CP, SC);
        NOTE.count(CF, "face-cell adjacencies");
        NOTE.lap();
        G.CELL = {P, SP, SE, CP, CS, SC, CF, FC, eps: eps_i};
        postMessage({type: "end", arg: G.CELL});
    },
    build_variables: () => {
        const {EF} = G.FOLD;
        const {SP, SE, CP, CF} = G.CELL;
        NOTE.start("*** Computing constraints ***");
        NOTE.time("Computing variables");
        G.BF = X.EF_SP_SE_CP_CF_2_BF(EF, SP, SE, CP, CF);
        G.BI = new Map();
        for (const [i, F] of G.BF.entries()) { G.BI.set(F, i); }
        NOTE.annotate(G.BF, "variables_faces");
        NOTE.lap();
        postMessage({type: "end", arg: []});
    },
    build_constraints: () => {
        const {EF} = G.FOLD;
        const {SP, SE, CP, SC, CF, FC} = G.CELL;
        NOTE.time("Computing non-transitivity constraints");
        G.BT = X.BF_BI_EF_SE_CF_SC_2_BT(G.BF, G.BI, EF, SE, CF, SC);
        const BTn = [0, 0, 0];
        for (const bT of G.BT) {
            for (let i = 0; i < 3; ++i) { BTn[i] += bT[i].length; }
        }
        for (const [i, d] of [[0, 6], [1, 2], [2, 2]]) { BTn[i] /= d; }
        NOTE.log(`   - Found ${BTn[0]} taco-taco`);
        NOTE.log(`   - Found ${BTn[1]} taco-tortilla`);
        NOTE.log(`   - Found ${BTn[2]} tortilla-tortilla`);
        NOTE.lap();
        NOTE.time("Computing taco-tortilla implied transitivity");
        G.CC = X.FC_BF_BI_BT_2_CC(FC, G.BF, G.BI, G.BT);
        NOTE.lap();
        postMessage({type: "end", arg: []});
    },
    presolve: () => {
        const {EA, EF, Ff} = G.FOLD;
        const {FC, CF} = G.CELL;
        NOTE.time("*** Computing states ***");
        NOTE.time("Assigning orders based on crease assignment");
        const BA0 = SOLVER.EF_EA_Ff_BF_BI_2_BA0(EF, EA, Ff, G.BF, G.BI);
        const trans_count = {all: 0, reduced: 0};
        const out = SOLVER.initial_assignment(BA0, G.BF, G.BT, G.BI,
            FC, CF, G.CC, trans_count);
        if ((out.length == 3) && (out[1].length != undefined)) {
            const [type, F, E] = out;
            const str = `Unable to resolve ${CON.names[type]} on faces [${F}]`;
            NOTE.log(`   - ${str}`);
            NOTE.log(`   - Faces participating in conflict: [${E}]`);
            postMessage({type: "end", arg: ["assign_error", out]});
            return;
        }
        G.BA = out;
        NOTE.annotate(G.BA.map((_, i) => i).filter(i => G.BA[i] != 0),
            "initially assignable variables");
        NOTE.lap();
        NOTE.time("Finding unassigned components");
        G.GB = SOLVER.get_components(G.BI, G.BF, G.BT, G.BA,
            FC, CF, G.CC, trans_count);
        NOTE.count(G.GB.length - 1, "unassigned components");
        NOTE.log(`   - Found ${trans_count.reduced/3} reduced transitivity`);
        NOTE.log(`   - Found ${trans_count.all/3} total transitivity`);
        NOTE.lap();
        postMessage({type: "end", arg: ["ok", []]});
    },
    solve: (lim) => {
        const {FC, CF} = G.CELL;
        const BA = G.BA.map(a => a);
        G.GA = SOLVER.solve(G.BI, G.BF, G.BT, BA, G.GB, FC, CF, G.CC, lim);
        if (G.GA.length == undefined) {
            const gi = G.GA;
            const F = new Set();
            for (const bi of G.GB[gi]) {
                for (const f of M.decode(G.BF[bi])) { F.add(f); }
            }
            postMessage({
                type: "end",
                arg: ["component_error", [gi, Array.from(F)]]
            });
            return;
        }
        const Gn = G.GA.map(A => A.length);
        NOTE.time("Solve completed");
        NOTE.lap();
        postMessage({type: "end", arg: ["success", Gn]});
    },
    Gi_2_CD_FO: (Gi) => {
        const {Ff} = G.FOLD;
        const {CF} = G.CELL;
        NOTE.time("Computing state");
        const edges = X.BF_GB_GA_GI_2_edges(G.BF, G.GB, G.GA, Gi);
        const CD = X.CF_edges_2_CD(CF, edges);
        const FO = X.edges_Ff_2_FO(edges, Ff);
        postMessage({type: "end", arg: [CD, FO]});
    },
    f1_f2_2_T: (f1, f2) => {
        const bi = G.BI.get(M.encode_order_pair([f1, f2]));
        postMessage({type: "end", arg: [bi, G.BT[bi]]});
    },
    g_2_gBF: (g) => {
        const gBF = g.map(gi => G.GB[gi].map(b => M.decode(G.BF[b])));
        postMessage({type: "end", arg: gBF});
    },
};
