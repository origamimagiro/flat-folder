import { M } from "./math.js";
import { NOTE } from "./note.js";
import { SVG } from "./svg.js";
import { IO } from "./io.js";
import { X } from "./conversion.js";
import { GUI } from "./gui.js";
import { PAR } from "./parallel.js";

window.onload = () => MAIN.startup();   // entry point

let FOLD, CELL, COMP;
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
        const thread_select = document.getElementById("thread_select");
        for (const val of ["all", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
            const el = document.createElement("option");
            el.setAttribute("value", val);
            el.textContent = val;
            thread_select.appendChild(el);
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
        NOTE.time("*** Setting up computing worker ***");
        COMP = new Worker("./src/compute.js", {type: "module"});
        COMP.onerror = (e) => { debugger; }
        await PAR.send_message(COMP, "setup", []);
        document.getElementById("import").onchange = (e) => {
            if (e.target.files.length > 0) {
                const file_reader = new FileReader();
                file_reader.onload = (e) => MAIN.process_file(e, COMP);
                file_reader.readAsText(e.target.files[0]);
            }
        };
        document.getElementById("side").onclick = (e) => {
            const side = ((e.target.value == "+") ? "-" : "+");
            e.target.setAttribute("value", side);
        };
        NOTE.end();
    },
    process_file: async (e, COMP) => {
        NOTE.clear_log();
        NOTE.start("*** Starting File Import ***");
        let doc = e.target.result;
        const file_name = document.getElementById("import").value;
        const parts = file_name.split(".");
        let type = parts[parts.length - 1].toLowerCase();
        if ((type == "svg") || (type == "opx")) {
            const L = (type == "svg") ? IO.SVG_2_L(doc) : IO.OPX_2_L(doc);
            const M = {U: 5, B: 1, M: 2, V: 3, F: 4};
            doc = L.map(([[x1, y1], [x2, y2], a]
                ) => [M[a], x1, y1, x2, y2].join(" ")).join("\n");
            type = "cp";
        }
        const side = document.getElementById("side").value == "+";
        NOTE.time(`Importing from file ${file_name}`);
        await PAR.send_message(COMP, "clear", []);
        CELL = undefined;
        FOLD = await PAR.send_message(COMP,
            "doc_type_side_2_fold", [doc, type, side]);
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
            MAIN.compute();
        };
        NOTE.end();
    },
    compute: async () => {
        const val = document.getElementById("limit_select").value;
        const lim = (val == "all") ? Infinity : +val;
        NOTE.start(`*** Starting solve with limit ${lim} ***`);
        const solved = await PAR.send_message(COMP, "solved", []);
        if (solved) {
            NOTE.log("   - Using information from previous solve");
        } else {
            CELL = await PAR.send_message(COMP, "get_cell", []);
            if (CELL == undefined) {
                const num_states = document.getElementById("num_states");
                const error = "(Precision Error: could not find stable graph)"
                num_states.textContent = error;
                NOTE.time(error);
                NOTE.end();
                return;
            }
            NOTE.time("Updating cell");
            GUI.update_cell(FOLD, CELL);
            document.getElementById("text").onchange = (e) => {
                NOTE.start("Toggling Text");
                GUI.update_text(FOLD, CELL);
                NOTE.end();
            };
            for (const [id, log] of [["flip", "Flipping"], ["rotate", "Rotating"]]) {
                document.getElementById(`${id}_fold`).onchange = () => {
                    NOTE.start(`${log} model`);
                    GUI.update_cell(FOLD, CELL);
                    NOTE.end();
                };
            }
            await PAR.send_message(COMP, "build_variables", []);
            const thr = document.getElementById("thread_select").value;
            const max_t = (thr == "all") ? Infinity : +thr;
            const wn = ((window.Worker == undefined) ? 1
                : Math.min((navigator.hardwareConcurrency ?? 8), max_t));
            await PAR.send_message(COMP, "build_constraints", [wn]);
            const [type, out] = await PAR.send_message(COMP, "presolve", []);
            if (type == "assign_error") {
                const [type, F, E] = out;
                GUI.update_error(F, E, CELL.FC);
                document.getElementById("fold_button").onclick = undefined;
                for (const id of ["flip_flat", "rotate_flat", "flip_fold", "rotate_fold"]) {
                    document.getElementById(id).onchange = undefined;
                }
                NOTE.time("Solve completed");
                NOTE.count(0, "folded states");
                const num_states = document.getElementById("num_states");
                num_states.textContent = `(Found 0 states)`;
                NOTE.end();
                return;
            }
        }
        const [type, out] = await PAR.send_message(COMP, "solve", [lim]);
        if (type == "component_error") {
            const [gi, F] = out;
            NOTE.log(`   - Unable to resolve component ${gi}`);
            GUI.update_component_error(F, CELL.FC);
            document.getElementById("fold_button").onclick = undefined;
            for (const id of ["flip_flat", "rotate_flat", "flip_fold", "rotate_fold"]) {
                document.getElementById(id).onchange = undefined;
            }
            NOTE.time("Solve completed");
            NOTE.count(0, "folded states");
            const num_states = document.getElementById("num_states");
            num_states.textContent = `(Found 0 states)`;
            NOTE.end();
            return;
        }
        const Gn = out;
        NOTE.time("Updating cell-face listeners");
        await GUI.update_cell_face_listeners(FOLD, CELL, COMP);
        const n = Gn.reduce((s, gn) => s*BigInt(gn), BigInt(1));
        NOTE.count(n, "folded states");
        const num_states = document.getElementById("num_states");
        num_states.textContent = `(Found ${n} state${(n == 1) ? "" : "s"})`;
        const Gi = Gn.map(() => 0);
        const [CD, FO] = await PAR.send_message(COMP, "Gi_2_CD_FO", [Gi]);
        CELL.CF = CD;
        FOLD.FO = FO;
        document.getElementById("fold_controls").style.display = "inline";
        document.getElementById("state_controls").style.display = "block";
        for (const [id, log] of [["flip", "Flipping"], ["rotate", "Rotating"]]) {
            document.getElementById(`${id}_flat`).onchange = async () => {
                NOTE.start(`${log} crease pattern`);
                GUI.update_flat(FOLD);
                GUI.update_visible(FOLD, CELL);
                await GUI.update_cell_face_listeners(FOLD, CELL, COMP);
                NOTE.end();
            };
            document.getElementById(`${id}_fold`).onchange = async () => {
                NOTE.start(`${log} folded state`);
                GUI.update_fold(FOLD, CELL);
                GUI.update_cell(FOLD, CELL);
                await GUI.update_cell_face_listeners(FOLD, CELL, COMP);
                GUI.update_component(FOLD, CELL, COMP, Gn, Gi);
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
        for (const [i, _] of Gn.entries()) {
            const el = document.createElement("option");
            el.setAttribute("value", `${i}`);
            el.textContent = `${i}`;
            comp_select.appendChild(el);
        }
        comp_select.onchange = (e) => {
            NOTE.start("Changing component");
            GUI.update_component(FOLD, CELL, COMP, Gn, Gi);
            NOTE.end();
        };
        NOTE.time("Drawing fold");
        GUI.update_fold(FOLD, CELL);
        NOTE.time("Drawing component");
        GUI.update_component(FOLD, CELL, COMP, Gn, Gi);
        NOTE.end();
    },
};
