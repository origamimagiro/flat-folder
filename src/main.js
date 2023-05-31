import { M } from "./math.js";
import { NOTE } from "./note.js";
import { CON } from "./constraints.js";
import { SVG } from "./svg.js";
import { IO } from "./io.js";
import { X } from "./conversion.js";
import { GUI } from "./gui.js";
import { SOLVER } from "./solver.js";

window.onload = () => { MAIN.startup(); };  // entry point

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
        document.getElementById("side").onclick = (e) => {
            const side = ((e.target.value == "+") ? "-" : "+");
            e.target.setAttribute("value", side);
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
        const [V, VV, EV, EA, EF, FV, FE] =
            IO.doc_type_2_V_VV_EV_EA_EF_FV_FE(doc, type);
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
        const FOLD = {V, Vf, Vf_norm, VK, EV, EA, EF, FV, FE, Ff};
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
        const {Vf, EV, EF, FV} = FOLD;
        const L = EV.map((P) => M.expand(P, Vf));
        FOLD.eps = M.min_line_length(L) / M.EPS;
        NOTE.time(`Using eps ${FOLD.eps} from min line length ${
            FOLD.eps*M.EPS} (factor ${M.EPS})`);
        NOTE.time("Constructing points and segments from edges");
        const [P, SP, SE] = X.L_2_V_EV_EL(L, FOLD.eps);
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
        const CELL = {P, P_norm, SP, SE, CP, CS, SC, CF, FC};
        NOTE.time("Updating cell");
        GUI.update_cell(FOLD, CELL);
        NOTE.lap();
        document.getElementById("text").onchange = (e) => {
            NOTE.start("Toggling Text");
            GUI.update_text(FOLD, CELL);
            NOTE.end();
        };
        NOTE.time("*** Computing constraints ***");
        window.setTimeout(MAIN.compute_constraints, 0, FOLD, CELL);
    },
    compute_constraints: (FOLD, CELL) => {
        const {Vf, EF, FV} = FOLD;
        const {SE, SC, CF, FC} = CELL;
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
        NOTE.time("*** Computing states ***");
        window.setTimeout(MAIN.compute_states, 0, FOLD, CELL, BF, BT);
    },
    compute_states: (FOLD, CELL, BF, BT) => {
        const {EA, EF, Ff} = FOLD;
        const {CF, FC} = CELL;
        const BA0 = X.EF_EA_Ff_BF_2_BA0(EF, EA, Ff, BF);
        const val = document.getElementById("limit_select").value;
        const lim = (val == "all") ? Infinity : +val;
        const sol = SOLVER.solve(BF, BT, BA0, lim);
        if (sol.length == 3) { // solve found unsatisfiable constraint
            const [type, F, E] = sol;
            const str = `Unable to resolve ${CON.names[type]} on faces [${F}]`;
            NOTE.log(`   - ${str}`);
            NOTE.log(`   - Faces participating in conflict: [${E}]`);
            GUI.update_error(F, E, BF, FC);
            NOTE.time("Solve completed");
            NOTE.count(0, "folded states");
            const num_states = document.getElementById("num_states");
            num_states.textContent = `(Found 0 states) ${str}`;
            NOTE.lap();
            stop = Date.now();
            NOTE.end();
            return;
        } // solve completed
        const [GB, GA] = sol;
        const n = (GA == undefined) ? 0 : GA.reduce((s, A) => {
            return s*BigInt(A.length);
        }, BigInt(1));
        NOTE.time("Solve completed");
        NOTE.count(n, "folded states");
        NOTE.lap();
        const num_states = document.getElementById("num_states");
        num_states.textContent = `(Found ${n} state${(n == 1) ? "" : "s"})`;
        if (n > 0) {
            const GI = GB.map(() => 0);
            NOTE.time("Computing state");
            const edges = X.BF_GB_GA_GI_2_edges(BF, GB, GA, GI);
            FOLD.FO = X.edges_Ff_2_FO(edges, Ff);
            CELL.CD = X.CF_edges_flip_2_CD(CF, edges);
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
