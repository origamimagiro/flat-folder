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
    setup: async () => {
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
        const Vf_norm = M.normalize_points(Vf);
        NOTE.annotate(Vf, "vertices_coords_folded");
        NOTE.annotate(Ff, "faces_flip");
        NOTE.lap();
        G.FOLD = {V, Vf, Vf_norm, VK, EV, EA, EF, FV, FE, Ff};
        postMessage({type: "end", arg: G.FOLD});
    },
    solved: () => {
        postMessage({type: "end", arg: G.GA != undefined});
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
    build_constraints: async (wn) => {
        const {EF} = G.FOLD;
        const {SP, SE, CP, SC, CF, FC} = G.CELL;
        NOTE.time("Computing edge-edge overlaps");
        const ExE = X.SE_2_ExE(SE);
        NOTE.count(ExE, "edge-edge adjacencies");
        NOTE.lap();
        NOTE.time("Computing edge-face overlaps");
        const ExF = X.SE_CF_SC_2_ExF(SE, CF, SC);
        NOTE.count(ExF, "edge-face adjacencies");
        NOTE.lap();
        NOTE.time("Computing non-transitivity constraints");
        const [BT0, BT1, BT2] = X.BF_BI_EF_ExE_ExF_2_BT0_BT1_BT2(
            G.BF, G.BI, EF, ExE, ExF);
        ExE.length = 0; ExF.length = 0;
        NOTE.count(BT0, "taco-taco", 6);
        NOTE.count(BT1, "taco-tortilla", 2);
        NOTE.count(BT2, "tortilla-tortilla", 2);
        NOTE.lap();
        const W = (wn > 1) ? (await PAR.get_workers(wn, "./worker.js")) : undefined;
        NOTE.time("Computing excluded (possible) transitivity constraints");
        const BT3x = ((W != undefined)
            ? (await X.FC_BF_BI_BT0_BT1_W_2_BT3x(FC, G.BF, G.BI, BT0, BT1, W))
            : X.FC_BF_BI_BT0_BT1_2_BT3x(FC, G.BF, G.BI, BT0, BT1)
        );
        NOTE.count(BT3x, "exluded (possible) transitivity", 3);
        NOTE.lap();
        NOTE.time("Computing transitivity constraints");
        const [BT3, nx] = ((W != undefined)
            ? (await X.FC_CF_BF_BT3x_W_2_BT3(FC, CF, G.BF, BT3x, W))
            : X.EF_SP_SE_CP_FC_CF_BF_BT3x_2_BT3(EF, SP, SE, CP, FC, CF, G.BF, BT3x)
        );
        if (W != undefined) {
            PAR.end_workers(W);
            NOTE.time("*** Workers terminated ***");
        }
        BT3x.length = 0;
        const ni = NOTE.count(BT3, "independent transitivity", 3);
        NOTE.log(`   - Found ${nx + ni} total transitivity`);
        NOTE.lap();
        G.BT = G.BF.map((F,i) => [BT0[i], BT1[i], BT2[i], BT3[i]]);
        BT0.length = 0; BT1.length = 0; BT2.length = 0; BT3.length = 0;
        postMessage({type: "end", arg: []});
    },
    presolve: () => {
        const {EA, EF, Ff} = G.FOLD;
        NOTE.time("*** Computing states ***");
        NOTE.time("Assigning orders based on crease assignment");
        const BA0 = SOLVER.EF_EA_Ff_BF_BI_2_BA0(EF, EA, Ff, G.BF, G.BI);
        const out = SOLVER.initial_assignment(BA0, G.BF, G.BT, G.BI);
        if ((out.length == 3) && (out[0].length == undefined)) {
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
        const np = G.BT.reduce((a, T) => a + T[3].length, 0);
        NOTE.log(`  - Pruned to ${np/3} active transitivity`);
        NOTE.lap();
        NOTE.time("Finding unassigned components");
        G.GB = SOLVER.get_components(G.BI, G.BF, G.BT, G.BA);
        NOTE.count(G.GB.length - 1, "unassigned components");
        NOTE.lap();
        postMessage({type: "end", arg: ["ok", []]});
    },
    solve: (lim) => {
        const BA = G.BA.map(a => a);
        G.GA = SOLVER.solve(G.BI, G.BF, G.BT, BA, G.GB, lim);
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
