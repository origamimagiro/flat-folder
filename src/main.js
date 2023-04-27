import { M } from "./math.js";
import { NOTE } from "./note.js";
import { SVG } from "./svg.js";
import { IO } from "./io.js";
import { GUI } from "./gui.js";
import { SOLVER, X, abort } from "./bridge.js";

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
        NOTE.end();
    },
    process_file: async (e) => {
        NOTE.clear_log();
        NOTE.start("*** Starting File Import ***");
        const doc = e.target.result;
        const file_name = document.getElementById("import").value;
        const parts = file_name.split(".");
        const type = parts[parts.length - 1].toLowerCase();
        NOTE.time(`Importing from file ${file_name}`);
        const [V, VV, EV, EA, EF, FV, FE] =
            await IO.doc_type_2_V_VV_EV_EA_EF_FV_FE(doc, type);
        if (V == undefined) { return; }
        const VK = await X.V_VV_EV_EA_2_VK(V, VV, EV, EA);
        NOTE.annotate(V, "vertices_coords");
        NOTE.annotate(EV, "edges_vertices");
        NOTE.annotate(EA, "edges_assignments");
        NOTE.annotate(EF, "edges_faces");
        NOTE.annotate(FV, "faces_vertices");
        NOTE.annotate(FE, "faces_edges");
        const [Pf, Ff] = await X.V_FV_EV_EA_2_Vf_Ff(V, FV, EV, EA);
        const Vf = M.normalize_points(Pf);
        NOTE.annotate(Vf, "vertices_coords_folded");
        NOTE.annotate(Ff, "faces_flip");
        NOTE.lap();
        const FOLD = {V, Vf, VK, EV, EA, EF, FV, FE, Ff};
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
        document.getElementById("fold_button").onclick = async () => {
            try {
                MAIN.toggle_controls(false);
                await MAIN.compute_cells(FOLD);
            } catch(e) {
				// Folding stopped
				NOTE.time("Folding stopped.");
				NOTE.end();
			} finally {
                MAIN.toggle_controls(true);
            }
        };
		document.getElementById("stop_button").onclick = abort;
        NOTE.lap();
        NOTE.end();
    },
    toggle_controls: (enabled) => {
        document.getElementById("fold_controls")
            .querySelectorAll("input:not(#stop_button),select")
            .forEach(e => e.disabled = !enabled);
        document.getElementById("fold_button").style.display = enabled ? "inline" : "none";
		document.getElementById("stop_button").style.display = enabled ? "none" : "inline";
    },
    compute_cells: async (FOLD) => {
        NOTE.start("*** Computing cell graph ***");
        const {Vf, EV, EA, EF, FV, Ff} = FOLD;
        const L = EV.map((P) => M.expand(P, Vf));
        const eps = M.min_line_length(L) / M.EPS;
        NOTE.time(`Using eps ${eps} from min line length ${
            eps*M.EPS} (factor ${M.EPS})`);
        NOTE.time("Constructing points and segments from edges");
        const [P, SP, SE] = await X.L_2_V_EV_EL(L, eps);
        NOTE.annotate(P, "points_coords");
        NOTE.annotate(SP, "segments_points");
        NOTE.annotate(SE, "segments_edges");
        NOTE.lap();
        NOTE.time("Constructing cells from segments");
        const [,CP] = await X.V_EV_2_VV_FV(P, SP);
        NOTE.annotate(CP, "cells_points");
        NOTE.lap();
        NOTE.time("Computing segments_cells");
        const [SC, CS] = await X.EV_FV_2_EF_FE(SP, CP);
        NOTE.annotate(SC, "segments_cells");
        NOTE.annotate(CS, "cells_segments");
        NOTE.lap();
        NOTE.time("Making face-cell maps");
        const [CF, FC] = await X.EF_FV_SP_SE_CP_SC_2_CF_FC(EF, FV, SP, SE, CP, SC);
        NOTE.count(CF, "face-cell adjacencies");
        NOTE.lap();
        const CELL = {P, SP, SE, CP, CS, SC, CF, FC};
        NOTE.time("Updating cell");
        GUI.update_cell(FOLD, CELL);
        NOTE.lap();
        document.getElementById("text").onchange = (e) => {
            NOTE.start("Toggling Text");
            GUI.update_text(FOLD, CELL);
            NOTE.end();
        };
        NOTE.time("*** Computing constraints ***");

        NOTE.time("Computing edge-edge overlaps");
        const ExE = await X.SE_2_ExE(SE);
        NOTE.count(ExE, "edge-edge adjacencies");
        NOTE.lap();
        NOTE.time("Computing edge-face overlaps");
        const ExF = await X.SE_CF_SC_2_ExF(SE, CF, SC);
        NOTE.count(ExF, "edge-face adjacencies");
        NOTE.lap();
        NOTE.time("Computing variables");
        const BF = await X.CF_2_BF(CF);
        NOTE.annotate(BF, "variables_faces");
        NOTE.lap();
        NOTE.time("Computing transitivity constraints");
        const BT3 = await X.FC_CF_BF_2_BT3(FC, CF, BF);
        NOTE.count(BT3, "initial transitivity", 3);
        NOTE.lap();
        NOTE.time("Computing non-transitivity constraints");
        const [BT0, BT1, BT2] = await X.BF_EF_ExE_ExF_BT3_2_BT0_BT1_BT2(BF, EF, ExE, ExF, BT3);
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

        const BA0 = await X.EF_EA_Ff_BF_2_BA0(EF, EA, Ff, BF);
        const val = document.getElementById("limit_select").value;
        const lim = (val == "all") ? Infinity : +val;
        const [GB, GA] = await SOLVER.solve(BF, BT, BA0, lim);
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
            const edges = await SOLVER.BF_GB_GA_GI_2_edges(BF, GB, GA, GI);
            FOLD.FO = await SOLVER.edges_Ff_2_FO(edges, Ff);
            CELL.CD = await SOLVER.CF_edges_flip_2_CD(CF, edges);
            document.getElementById("state_controls").style.display = "inline"; 
            document.getElementById("flip").onchange = async (e) => {
                NOTE.start("Flipping model");
                await GUI.update_fold(FOLD, CELL);
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
            await GUI.update_fold(FOLD, CELL);
            NOTE.time("Drawing component");
            GUI.update_component(FOLD, CELL, BF, GB, GA, GI);
        }
        NOTE.lap();
        stop = Date.now();
        NOTE.end();
    },
};
