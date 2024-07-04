import { M } from "./math.js";
import { NOTE } from "./note.js";
import { CON } from "./constraints.js";
import { SVG } from "./svg.js";
import { IO } from "./io.js";
import { X } from "./conversion.js";
import { GUI } from "./gui.js";
import { SOLVER } from "./solver.js";
import { PAR } from "./parallel.js";

window.onload = () => MAIN.startup();   // entry point

const MAIN = {
    startup: async () => {
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
        for (const val of ["all", 10000, 1000, 100, 10, 1]) {
            const el = document.createElement("option");
            el.setAttribute("value", val);
            el.textContent = val;
            limit_select.appendChild(el);
        }
        for (const id of ["flat", "fold"]) {
            const rotate_select = SVG.clear(`rotate_${id}`);
            for (const val of [0, 90, 180, 270]) {
                const el = document.createElement("option");
                el.setAttribute("value", val);
                el.textContent = val;
                rotate_select.appendChild(el);
            }
        }
        const wn = ((window.Worker == undefined) ? 1
            : (navigator.hardwareConcurrency ?? 8));
        const W = await PAR.get_workers(wn, "./src/worker.js");
        document.getElementById("import").onchange = (e) => {
            if (e.target.files.length > 0) {
                const file_reader = new FileReader();
                file_reader.onload = (e) => MAIN.process_file(e, W);
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
    process_file: (e, W) => {
        NOTE.clear_log();
        NOTE.start("*** Starting File Import ***");
        NOTE.time(`Using ${(W == undefined) ? 0 : W.length} web workers`);
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
        for (const input of ["text", "flip_flat", "flip_fold", "visible", "scale"]) {
            document.getElementById(input).checked = false;
        }
        for (const id of ["rotate_flat", "rotate_fold", "shadow"]) {
            document.getElementById(id).value = 0;
        }
        NOTE.time("Drawing flat");
        GUI.update_flat(FOLD);
        NOTE.time("Drawing cell");
        GUI.update_cell(FOLD);
        SVG.clear("fold");
        document.getElementById("num_states").innerHTML = "";
        for (const [id, style] of [
            ["flat_controls", "block"], ["fold_controls", "none"],
            ["cell_controls", "block"], ["state_controls", "none"],
            ["export_button", "inline"],
        ]) {
            document.getElementById(id).style.display = style;
        }
        document.getElementById("export_button").onclick = () => IO.write(FOLD);
        document.getElementById("text").onchange = () => {
            NOTE.start("Toggling Text");
            GUI.update_text(FOLD);
            NOTE.end();
        };
        for (const [id, log] of [["flip", "Flipping"], ["rotate", "Rotating"]]) {
            document.getElementById(`${id}_flat`).onchange = () => {
                NOTE.start(`${log} crease pattern`);
                GUI.update_flat(FOLD);
                NOTE.end();
            };
            document.getElementById(`${id}_fold`).onchange = () => {
                NOTE.start(`${log} model`);
                GUI.update_cell(FOLD);
                NOTE.end();
            };
        }
        document.getElementById("fold_button").onclick = () => {
            MAIN.compute_cells(FOLD, W);
        };
        NOTE.lap();
        NOTE.end();
    },
    compute_cells: (FOLD, W) => {
        NOTE.start();
        NOTE.time("*** Computing cell graph ***");
        const {Vf, EV, EF, FV} = FOLD;
        const L = EV.map((P) => M.expand(P, Vf));
        NOTE.time("Constructing points and segments from edges");
        const [P, SP, SE, eps_i] = X.L_2_V_EV_EL(L);
        if (P.length == 0) {
            const num_states = document.getElementById("num_states");
            const error = "(Precision Error: could not find stable graph)"
            num_states.textContent = error;
            NOTE.time(error);
            NOTE.end();
            return;
        }
        FOLD.eps = M.min_line_length(L)/(2**eps_i);
        NOTE.time(`Used eps: ${2**eps_i} | ${FOLD.eps}`);
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
        window.setTimeout(MAIN.compute_constraints, 0, FOLD, CELL, W);
    },
    compute_constraints: async (FOLD, CELL, W) => {
        const {Vf, EF, FV} = FOLD;
        const {SP, SE, SC, CP, CF, FC} = CELL;
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
        NOTE.annotate(BF, "variables_faces");
        NOTE.lap();
        NOTE.time("Computing transitivity constraints");
        const BT3 = ((W == undefined) ?
            X.EF_SP_SE_CP_FC_CF_BF_2_BT3(EF, SP, SE, CP, FC, CF, BF) :
            (await X.FC_CF_BF_W_2_BT3(FC, CF, BF, W))
        );
        NOTE.count(BT3, "initial transitivity", 3);
        NOTE.lap();
        NOTE.time("Computing non-transitivity constraints");
        const [BT0, BT1, BT2] = X.BF_EF_ExE_ExF_BT3_2_BT0_BT1_BT2(
            BF, EF, ExE, ExF, BT3);
        NOTE.count(BT0, "taco-taco", 6);
        NOTE.count(BT1, "taco-tortilla", 3);
        NOTE.count(BT2, "tortilla-tortilla", 2);
        NOTE.lap();
        NOTE.time("Cleaning transitivity constraints");
        X.BF_BT0_BT1_BT3_2_clean_BT3(BF, BT0, BT1, BT3);
        NOTE.count(BT3, "independent transitivity", 3);
        const BT = BF.map((F,i) => [BT0[i], BT1[i], BT2[i], BT3[i]]);
        NOTE.lap();
        NOTE.time("Updating cell-face listeners");
        GUI.update_cell_face_listeners(FOLD, CELL, BF, BT);
        NOTE.lap();
        NOTE.time("*** Computing states ***");
        window.setTimeout(MAIN.compute_states, 0, FOLD, CELL, BF, BT);
    },
    compute_states: (FOLD, CELL, BF, BT, W) => {
        const {EA, EF, Ff} = FOLD;
        const {CF, FC} = CELL;
        const val = document.getElementById("limit_select").value;
        const lim = (val == "all") ? Infinity : +val;
        NOTE.time("Assigning orders based on crease assignment");
        const out = SOLVER.initial_assignment(EF, EA, Ff, BF, BT);
        if (out.length == 3) {
            const [type, F, E] = out;
            const str = `Unable to resolve ${CON.names[type]} on faces [${F}]`;
            NOTE.log(`   - ${str}`);
            NOTE.log(`   - Faces participating in conflict: [${E}]`);
            GUI.update_error(F, E, BF, FC);
            document.getElementById("fold_button").onclick = undefined;
            for (const id of ["flip_flat", "rotate_flat", "flip_fold", "rotate_fold"]) {
                document.getElementById(id).onchange = undefined;
            }
            NOTE.time("Solve completed");
            NOTE.count(0, "folded states");
            const num_states = document.getElementById("num_states");
            num_states.textContent = `(Found 0 states) ${str}`;
            NOTE.lap();
            NOTE.end();
            return;
        }
        const [BI, BA] = out;
        NOTE.annotate(BA.map((_, i) => i).filter(i => BA[i] != 0),
            "initially assignable variables");
        NOTE.lap();
        NOTE.time("Finding unassigned components");
        const GB = SOLVER.get_components(BI, BF, BT, BA);
        NOTE.count(GB.length - 1, "unassigned components");
        NOTE.lap();
        const GA = SOLVER.solve(BI, BF, BT, BA, GB, lim);
        const n = ((GA.length == undefined) ? 0
            : GA.reduce((s, A) => s*BigInt(A.length), BigInt(1)));
        NOTE.time("Solve completed");
        NOTE.count(n, "folded states");
        NOTE.lap();
        const num_states = document.getElementById("num_states");
        num_states.textContent = `(Found ${n} state${(n == 1) ? "" : "s"})`;
        if (n == 0) {
            const gi = GA;
            NOTE.log(`   - Unable to resolve component ${gi}`);
            const F = new Set();
            for (const bi of GB[gi]) {
                for (const f of M.decode(BF[bi])) { F.add(f); }
            }
            GUI.update_component_error(F, FC);
            document.getElementById("fold_button").onclick = undefined;
            for (const id of ["flip_flat", "rotate_flat", "flip_fold", "rotate_fold"]) {
                document.getElementById(id).onchange = undefined;
            }
        } else {
            const GI = GB.map(() => 0);
            NOTE.time("Computing state");
            const edges = X.BF_GB_GA_GI_2_edges(BF, GB, GA, GI);
            FOLD.FO = X.edges_Ff_2_FO(edges, Ff);
            CELL.CD = X.CF_edges_2_CD(CF, edges);
            document.getElementById("fold_controls").style.display = "inline";
            document.getElementById("state_controls").style.display = "block";
            for (const [id, log] of [["flip", "Flipping"], ["rotate", "Rotating"]]) {
                document.getElementById(`${id}_flat`).onchange = () => {
                    NOTE.start(`${log} crease pattern`);
                    GUI.update_flat(FOLD);
                    GUI.update_visible(FOLD, CELL);
                    GUI.update_cell_face_listeners(FOLD, CELL, BF, BT);
                    NOTE.end();
                };
                document.getElementById(`${id}_fold`).onchange = () => {
                    NOTE.start(`${log} folded state`);
                    GUI.update_fold(FOLD, CELL);
                    GUI.update_cell(FOLD, CELL);
                    GUI.update_cell_face_listeners(FOLD, CELL, BF, BT);
                    GUI.update_component(FOLD, CELL, BF, GB, GA, GI);
                    NOTE.end();
                };
            }
            document.getElementById("shadow").onchange = () => {
                NOTE.start("Toggling shadows");
                GUI.update_fold(FOLD, CELL);
                NOTE.end();
            };
            document.getElementById("visible").onchange = () => {
                NOTE.start("Toggling visible faces");
                GUI.update_visible(FOLD, CELL);
                NOTE.end();
            };
            document.getElementById("scale").onchange = () => {
                NOTE.start("Toggling scale faces");
                if (document.getElementById("scale").checked) {
                    const [p_min, p_max] = M.bounding_box(CELL.P);
                    const d = M.sub(p_max, p_min);
                    NOTE.log(`Scaled to [width, height] = [${d[0]},${d[1]}]`);
                }
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
        NOTE.end();
    },
};
