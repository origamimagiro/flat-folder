import { M } from "./math.js";
import { NOTE } from "./note.js";
import { SVG } from "./svg.js";
import { IO } from "./io.js";

window.onload = () => { MAIN.startup(); };  // entry point

const MAIN = {
    FOLD: undefined,
    CELL: undefined,
    VAR: undefined,
    SOL: undefined,
    worker: new Worker("./src/worker.js", {type: "module"}),
    gui: {
        active: [],
    },
    startup: () => {
        NOTE.clear_log();
        NOTE.start("*** Starting Flat-Folder ***");
        NOTE.time("Initializing interface");
        const [b, s] = [50, SVG.SCALE];
        const main = document.getElementById("main");
        for (const [k, v] of Object.entries({
            xmlns: SVG.NS,
            style: `background: ${MAIN.COLORS.background}`,
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
        NOTE.time("Setting up Web Worker");
        NOTE.time("Computing constraint implication maps");
        MAIN.worker.postMessage(["startup", []]);
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
        const [V, VV, VK, EV, EA, EF, FV, FE, Vf, Ff] =
            IO.doc_type_2_V_VV_VK_EV_EA_EF_FV_FE_Vf_Ff(doc, type);
        if (V == undefined) { return; }
        for (const [a, label] of [
            [V, "vertices_coords"],         [EV, "edges_vertices"],
            [EA, "edges_assignments"],      [EF, "edges_faces"],
            [FV, "faces_vertices"],         [FE, "faces_edges"],
            [Vf, "vertices_coords_folded"], [Ff, "faces_flip"],
        ]) {
            NOTE.annotate(a, label);
        }
        MAIN.FOLD = {V, Vf, VK, EV, EA, EF, FV, FE, Ff};
        NOTE.lap();
        NOTE.time("Drawing flat");
        MAIN.update_flat();
        NOTE.time("Drawing cell");
        MAIN.update_cell();
        SVG.clear("fold");
        document.getElementById("num_states").innerHTML = "";
        document.getElementById("fold_controls").style.display = "inline";
        document.getElementById("state_controls").style.display = "none";
        document.getElementById("state_config").style.display = "none";
        document.getElementById("export_button").style.display = "inline";
        document.getElementById("export_button").onclick = () => IO.write(MAIN.FOLD);
        document.getElementById("text").onchange = () => {
            NOTE.start("Toggling Text");
            MAIN.update_text();
            NOTE.end();
        };
        document.getElementById("fold_button").onclick = () => {
            const val = document.getElementById("limit_select").value;
            const lim = (val == "all") ? Infinity : +val;
            MAIN.worker.postMessage(["fold", [MAIN.FOLD, lim]]);
        };
        MAIN.worker.onmessage = MAIN.handle_worker_message;
        NOTE.lap();
        NOTE.end();
    },
    handle_worker_message: (e) => {
        const [type, arg] = e.data;
        switch (type) {
            case "note":
                NOTE.log(arg); break;
            case "draw_cells":
                MAIN.CELL = arg;
                MAIN.update_cell(); break;
            case "unsatisfiable":
                MAIN.unsatisfiable(...arg); break;
            case "solve_complete":
                MAIN.solve_complete(arg); break;
            case "constraints":
                MAIN.draw_constraints(...arg); break;
            case "overlaps":
                MAIN.draw_overlaps(...arg); break;
        }
    },
    unsatisfiable: (type, F, E, BF) => {
        MAIN.VAR = {BF};
        const str = `Unable to resolve ${CON.names[type]} on faces [${F}]`;
        NOTE.log(`   - ${str}`);
        NOTE.log(`   - Faces participating in conflict: [${E}]`);
        MAIN.update_error(F, E, FC);
        NOTE.time("Solve completed");
        NOTE.count(0, "folded states");
        const num_states = document.getElementById("num_states");
        num_states.textContent = `(Found 0 states) ${str}`;
        NOTE.lap();
        NOTE.time("Updating cell-face listeners");
        MAIN.update_cell_face_listeners();
        stop = Date.now();
        NOTE.end();
    },
    draw_component: (GA) => {
        const edges = X.BF_GB_GA_GI_2_edges(BF, GB, GA);
        FOLD.FO = X.edges_Ff_2_FO(edges, Ff);
        CELL.CD = X.CF_edges_2_CD(CF, edges);
        document.getElementById("state_controls").style.display = "inline";
        document.getElementById("flip").onchange = (e) => {
            NOTE.start("Flipping model");
            MAIN.update_fold(FOLD, CELL);
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
            MAIN.update_component(FOLD, CELL, BF, GB, GA, GI);
            NOTE.end();
        };
        NOTE.time("Drawing fold");
        MAIN.update_fold(FOLD, CELL);
        NOTE.time("Drawing component");
        MAIN.update_component(FOLD, CELL, BF, GB, GA, GI);
    },
    solve_complete: (n, BF, GB) => {
        MAIN.VAR = {BF};
        MAIN.SOL = {GB};
        NOTE.time("Solve completed");
        NOTE.count(n, "folded states");
        NOTE.lap();
        const num_states = document.getElementById("num_states");
        num_states.textContent = `(Found ${n} state${(n == 1) ? "" : "s"})`;
        if (n > 0) {
            const GI = GB.map(() => 0);
            NOTE.time("Computing state");
            MAIN.worker.postMessage(["state", [GI]]);
        }
        NOTE.lap();
        NOTE.time("Updating cell-face listeners");
        MAIN.update_cell_face_listeners();
        stop = Date.now();
        NOTE.end();
    },
    WIDTH: 1,
    COLORS: {
        background: "lightgray",
        active: "yellow",
        B: "lightskyblue",
        TE: ["green", "red", "orange", "cyan"],
        TF: ["lightgreen", "lightpink", "lightorange", "lightskyblue"],
        edge: {
            U: "black",
            F: "lightgray",
            M: "blue",  // crease pattern is
            V: "red",   // rendered white-side up
            B: "black",
        },
        face: {
            top: "gray",
            bottom: "white",
        },
        rand: ["lime", "red", "blue", "green", "aqua", "orange", "pink",
            "purple", "brown", "darkviolet", "teal", "olivedrab", "fuchsia",
            "deepskyblue", "orangered", "maroon", "yellow"],
        error: ["yellow", "lightskyblue", "lightpink", "lightgreen"],
    },
    update_text: () => {
        SVG.clear("export");
        SVG.clear("flat_shrunk");
        SVG.clear("flat_text");
        if (MAIN.CELL != undefined) {
            SVG.clear("cell_text");
        }
        const visible = document.getElementById("text").checked;
        if (visible) {
            const flat_text = document.getElementById("flat_text");
            const flat_shrunk = document.getElementById("flat_shrunk");
            const {V, EV, EA, FV} = MAIN.FOLD;
            const F = FV.map(f => M.expand(f, V));
            const shrunk = F.map(f => {
                const c = M.centroid(f);
                return f.map(p => M.add(M.mul(M.sub(p, c), 0.5), c));
            });
            SVG.draw_polygons(flat_shrunk, shrunk, {
                text: true, id: "f_text", opacity: 0.2});
            const line_centers = EV.map(l => M.centroid(M.expand(l, V)));
            const colors = EA.map(a => MAIN.COLORS.edge[a]);
            SVG.draw_points(flat_text, line_centers, {
                text: true, id: "e_text", fill: colors});
            SVG.draw_points(flat_text, V, {
                text: true, id: "v_text", fill: "green"});
            if (MAIN.CELL != undefined) {
                const {P, SP, CP} = MAIN.CELL;
                const cell_text = document.getElementById("cell_text");
                const cell_centers = CP.map(f => M.interior_point(M.expand(f, P)));
                const seg_centers = SP.map(l => M.centroid(M.expand(l, P)));
                SVG.draw_points(cell_text, cell_centers, {
                    text: true, id: "c_text"});
                SVG.draw_points(cell_text, seg_centers, {
                    text: true, id: "s_text"});
                SVG.draw_points(cell_text, P, {
                    text: true, id: "p_text", fill: "green"});
            }
        }
    },
    update_flat: () => {
        SVG.clear("export");
        const {V, VK, EV, EA, FV} = MAIN.FOLD;
        const svg = SVG.clear("flat");
        const F = FV.map(f => M.expand(f, V));
        SVG.draw_polygons(svg, F, {id: "flat_f", fill: MAIN.COLORS.face.bottom});
        SVG.append("g", svg, {id: "flat_shrunk"});
        const K = [];
        const eps = 1/M.EPS;
        for (const [i, k] of VK.entries()) {
            if (k > eps) { K.push(V[i]); }
        }
        SVG.draw_points(svg, K, {id: "flat_check", fill: "red", r: 10});
        const lines = EV.map(l => M.expand(l, V));
        const colors = EA.map(a => MAIN.COLORS.edge[a]);
        SVG.draw_segments(svg, lines, {
            id: "flat_e_flat", stroke: colors,
            stroke_width: MAIN.WIDTH, filter: (i) => (EA[i] == "F")});
        SVG.draw_segments(svg, lines, {
            id: "flat_e_folded", stroke: colors,
            stroke_width: MAIN.WIDTH, filter: (i) => (EA[i] != "F")});
        SVG.append("g", svg, {id: "flat_text"});
        SVG.append("g", svg, {id: "flat_notes"});
        MAIN.update_text();
    },
    update_cell: () => {
        SVG.clear("export");
        const svg = SVG.clear("cell");
        if (MAIN.CELL == undefined) {
            const {Vf, FV} = MAIN.FOLD;
            const F = FV.map(f => M.expand(f, Vf));
            SVG.draw_polygons(svg, F, {id: "cell_f", opacity: 0.05});
        } else {
            const {P, SP, SE, CP, SC, CF, FC} = MAIN.CELL;
            const cells = CP.map(f => M.expand(f, P));
            const lines = SP.map(l => M.expand(l, P));
            const Ccolors = MAIN.CF_2_Cbw(CF);
            SVG.draw_polygons(svg, cells, {fill: Ccolors, id: "cell_c"});
            SVG.draw_segments(svg, lines, {
                id: "cell_s", stroke: "black", stroke_width: MAIN.WIDTH});
        }
        SVG.append("g", svg, {id: "cell_text"});
        SVG.append("g", svg, {id: "cell_notes"});
        SVG.append("g", svg, {id: "component_notes"});
        MAIN.update_text();
    },
    CF_2_Ccolors: (CF) => {
        return MAIN.CF_2_Clayer(CF).map(l => `hsl(${
            Math.ceil((2 + l)*120)}, 100%, 50%)`);
    },
    CF_2_Cbw: (CF) => {
        return MAIN.CF_2_Clayer(CF).map(l => {
            if (l == 0) {
                return "hsla(0, 0%, 0%, 0.0)";
            }
            return `hsl(0, 0%, ${Math.ceil((1 - l*0.8)*100)}%)`;
        });
    },
    CF_2_Clayer: (CF) => {
        let max_layers = 0;
        for (const F of CF) {
            if (max_layers < F.length) {
                max_layers = F.length;
            }
        }
        return CF.map(F => F.length/max_layers);
    },
    update_fold: () => {
        SVG.clear("export");
        const {EF, Ff} = MAIN.FOLD;
        const {P, SP, SE, CP, SC, CF, CD} = MAIN.CELL;
        const svg = SVG.clear("fold");
        const flip = document.getElementById("flip").checked;
        const tops = CD.map(S => flip ? S[0] : S[S.length - 1]);
        const SD = SOLVER.EF_SE_SC_CF_CD_2_SD(EF, SE, SC, CF, tops);
        const m = [0.5, 0.5];
        const Q = P.map(p => (flip ? M.add(M.refX(M.sub(p, m)), m) : p));
        const cells = CP.map(V => M.expand(V, Q));
        const colors = tops.map(d => {
            if (d == undefined) { return undefined; }
            if (Ff[d] != flip)  { return MAIN.COLORS.face.top; }
            else                { return MAIN.COLORS.face.bottom; }
        });
        SVG.draw_polygons(svg, cells, {
            id: "fold_c", fill: colors, stroke: colors});
        const lines = SP.map((ps) => M.expand(ps, Q));
        SVG.draw_segments(svg, lines, {
            id: "fold_s_crease", stroke: MAIN.COLORS.edge.F,
            filter: (i) => SD[i] == "C"});
        SVG.draw_segments(svg, lines, {
            id: "fold_s_edge", stroke: MAIN.COLORS.edge.B,
            filter: (i) => SD[i] == "B"});
    },
    update_component: () => {
        SVG.clear("export");
        const comp_select = document.getElementById("component_select");
        const c = comp_select.value;
        document.getElementById("state_config").style.display = "none";
        comp_select.style.background = "white";
        const C = [];
        if (c == "none") {
        } else if (c == "all") {
            for (const [i, _] of MAIN.SOL.GB.entries()) {
                C.push(i);
            }
        } else {
            C.push(c);
            const n = MAIN.SOL.GA[c].length;
            comp_select.style.background = MAIN.COLORS.rand[c % MAIN.COLORS.rand.length];
            document.getElementById("state_config").style.display = "inline";
            const state_label = document.getElementById("state_label");
            const state_select = document.getElementById("state_select");
            state_label.innerHTML = `${n} State${(n == 1) ? "" : "s"}`;
            state_select.setAttribute("min", 1);
            state_select.setAttribute("max", n);
            state_select.value = GI[c] + 1;
            state_select.onchange = (e) => {
                NOTE.start("Computing new state");
                let j = +e.target.value;
                if (j < 1) { j = 1; }
                if (j > n) { j = n; }
                state_select.value = j;
                GI[c] = j - 1;
                const edges = X.BF_GB_GA_GI_2_edges(BF, GB, GA, GI);
                MAIN.FOLD.FO = X.edges_Ff_2_FO(edges, MAIN.FOLD.Ff);
                MAIN.CELL.CD = X.CF_edges_flip_2_CD(MAIN.CELL.CF, edges);
                MAIN.update_fold();
                NOTE.end();
            };
        }
        const {Vf, FV} = MAIN.FOLD;
        const g = SVG.clear("component_notes");
        for (const comp of C) {
            const lines = GB[comp].map(b => {
                const [f1, f2] = M.decode(BF[b]);
                const p1 = M.centroid(M.expand(FV[f1], Vf));
                const p2 = M.centroid(M.expand(FV[f2], Vf));
                return [p1, p2];
            });
            const stroke = MAIN.COLORS.rand[comp % MAIN.COLORS.rand.length];
            SVG.draw_segments(g, lines, {id: "cell_comp",
                "stroke": stroke, "stroke_width": 2});
        }
    },
    click_face: (i) => {
        NOTE.time(`Clicked face ${i}`);
        const {CF, FC} = MAIN.CELL;
        const active = MAIN.gui.active;
        const face = document.getElementById(`flat_f${i}`);
        const color = face.getAttribute("fill");
        MAIN.clear_notes(CF, FC, true);
        if (active.length == 1) {
            if (color != MAIN.COLORS.B) {
                active.pop();
                NOTE.log("   - Clearing selection");
                NOTE.log("");
                return;
            }
            active.push(i);
            const [f1, f2] = active;
            MAIN.worker.postMessage(["constraints", [f1, f2]]);
        } else {
            while (active.length > 0) { active.pop(); }
            if (color != MAIN.COLORS.face.bottom) {
                NOTE.log("   - Clearing selection");
                NOTE.log("");
                return;
            }
            active.push(i);
            const {FV, FE} = MAIN.FOLD;
            NOTE.log(`   - bounded by vertices [${FV[i]}]`);
            NOTE.log(`   - bounded by edges [${FE[i]}]`);
            NOTE.log(`   - overlaps cells [${FC[i]}]`);
            NOTE.log("");
            MAIN.worker.postMessage(["overlaps", [i]]);
        }
    },
    draw_constraints: (ti, f1, f2, T) => {
        const {V, FV} = MAIN.FOLD;
        const {FC} = MAIN.CELL;
        const SL = [];
        for (const i of [0, 1, 2]) {
            const Ti = T[i];
            SL.push(Ti.map((t) => `[${t.join(",")}]`));
        }
        SL.push(Array.from(T[3]).map(x => M.decode(x)));
        NOTE.log(`   - variable ${ti} between faces [${f1},${f2}]`);
        NOTE.log(`   - taco-taco: [${SL[0]}]`);
        NOTE.log(`   - taco-tortilla: [${SL[1]}]`);
        NOTE.log(`   - tortilla-tortilla: [${SL[2]}]`);
        NOTE.log(`   - transitivity: [${SL[3]}]`);
        NOTE.log("");
        for (const i of [3, 1]) {
            const Ti = (i == 1) ? T[i] : M.decode(T[i]);
            for (const F of Ti) {
                const f3 = (i == 1) ? F[2] : F;
                const el = document.getElementById(`flat_f${f3}`);
                el.setAttribute("fill", MAIN.COLORS.TF[i]);
            }
        }
        const L = [new Set(), new Set(), new Set()];
        for (const i of [0, 1, 2]) {
            for (const [a, b, c, d] of T[i]) {
                L[i].add(M.encode([a, b]));
                if (i != 1) {
                    L[i].add(M.encode_order_pair([c, d]));
                }
            }
        }
        for (const i of [0, 1, 2]) {
            L[i] = Array.from(L[i]).map(
                k => M.decode(k).map(f => M.centroid(M.expand(FV[f], V)))
            );
        }
        const flat_notes = document.getElementById("flat_notes");
        for (const i of [1, 2, 0]) {
            SVG.draw_segments(flat_notes, L[i], {
                id: "flat_cons",
                stroke: MAIN.COLORS.TE[i], stroke_width: 5});
        }
        for (const f of [f1, f2]) {
            for (const c of FC[f]) {
                const el = document.getElementById(`cell_c${c}`);
                el.setAttribute("fill", MAIN.COLORS.active);
            }
        }
        const C1 = new Set(FC[f1]);
        for (const c of FC[f2]) {
            if (C1.has(c)) {
                const el = document.getElementById(`cell_c${c}`);
                el.setAttribute("fill", MAIN.COLORS.TF[3]);
            }
        }
        for (const f of [f1, f2]) {
            const el = document.getElementById(`flat_f${f}`);
            el.setAttribute("fill", MAIN.COLORS.active);
        }
    },
    draw_overlaps: (i, F) => {
        const {V, FV} = MAIN.FOLD;
        const {P, FC, ES_map, SP} = MAIN.CELL;
        for (const f of F) {
            const el = document.getElementById(`flat_f${f}`);
            el.setAttribute("fill", MAIN.COLORS.B);
        }
        const S = [];
        const Scolors = [];
        const Lcolors = [];
        const L = FV[i].map((v1, j) => {
            const v2 = FV[i][(j + 1) % FV[i].length];
            const k = M.encode_order_pair([v1, v2]);
            const color = MAIN.COLORS.rand[j % MAIN.COLORS.rand.length];
            for (const s of ES_map.get(k)) {
                S.push(SP[s].map(p => P[p]));
                Scolors.push(color);
            }
            Lcolors.push(color);
            return [v1, v2].map(p => V[p]);
        });
        const flat_notes = document.getElementById("flat_notes");
        const cell_notes = document.getElementById("cell_notes");
        SVG.draw_segments(flat_notes, L, {
            id: "flat_f_bounds", stroke: Lcolors, stroke_width: 5});
        SVG.draw_segments(cell_notes, S, {
            id: "cell_f_bounds", stroke: Scolors, stroke_width: 5});
        const face = document.getElementById(`flat_f${i}`);
        MAIN.add_active(face, FC[i], "cell_c");
    },
    click_cell: (i) => {
        NOTE.time(`Clicked cell ${i}`);
        const cell = document.getElementById(`cell_c${i}`);
        const active = (cell.getAttribute("fill") == MAIN.COLORS.active);
        const {V, EV} = MAIN.FOLD;
        const {P, CP, CS, CF, FC, SE_map} = MAIN.CELL;
        MAIN.clear_notes(CF, FC, !active);
        if (active) {
            NOTE.log("   - Clearing selection");
            NOTE.log("");
            return;
        }
        NOTE.log(`   - bounded by points [${CP[i]}]`);
        NOTE.log(`   - bounded by segments [${CS[i]}]`);
        NOTE.log(`   - overlaps faces [${CF[i]}]`);
        NOTE.log("");
        MAIN.add_active(cell, CF[i], "flat_f");
        const L = [];
        const Lcolors = [];
        const Scolors = [];
        const S = CP[i].map((p1, j) => {
            const p2 = CP[i][(j + 1) % CP[i].length];
            const k = M.encode_order_pair([p1, p2]);
            const color = MAIN.COLORS.rand[j % MAIN.COLORS.rand.length];
            for (const e of SE_map.get(k)) {
                L.push(EV[e].map(p => V[p]));
                Lcolors.push(color);
            }
            Scolors.push(color);
            return [p1, p2].map(p => P[p]);
        });
        const flat_notes = document.getElementById("flat_notes");
        const cell_notes = document.getElementById("cell_notes");
        SVG.draw_segments(flat_notes, L, {
            id: "flat_c_bounds", stroke: Lcolors, stroke_width: 5});
        SVG.draw_segments(cell_notes, S, {
            id: "cell_c_bounds", stroke: Scolors, stroke_width: 5});
    },
    update_cell_face_listeners: () => {
        const {CF, FC} = MAIN.CELL;
        for (let i = 0; i < FC.length; ++i) {
            const face = document.getElementById(`flat_f${i}`);
            face.onclick = () => { MAIN.click_face(i); };
        }
        for (let i = 0; i < CF.length; ++i) {
            const cell = document.getElementById(`cell_c${i}`);
            cell.onclick = () => { MAIN.click_cell(i); };
        }
    },
    clear_notes: (CF, FC, active) => {
        SVG.clear("flat_notes");
        SVG.clear("cell_notes");
        SVG.clear("export");
        for (const [i, C] of FC.entries()) {
            const f = document.getElementById(`flat_f${i}`);
            f.setAttribute("fill", MAIN.COLORS.face.bottom);
        }
        const Ccolors = active ? MAIN.CF_2_Cbw(CF) : MAIN.CF_2_Cbw(CF);
        for (const [i, F] of CF.entries()) {
            const c = document.getElementById(`cell_c${i}`);
            c.setAttribute("fill", Ccolors[i]);
        }
    },
    add_active: (svg, A, id) => {
        svg.setAttribute("fill", MAIN.COLORS.active);
        for (const a of A) {
            const el = document.getElementById(`${id}${a}`);
            el.setAttribute("fill", MAIN.COLORS.active);
        }
    },
    update_error: (F, E, FC) => {
        for (const i of E) {
            const f = document.getElementById(`flat_f${i}`);
            f.setAttribute("opacity", 0.2);
        }
        const CFnum = new Map();
        for (const i of F) {
            const f = document.getElementById(`flat_f${i}`);
            f.setAttribute("fill", "red");
            for (const j of FC[i]) {
                const val = CFnum.get(j);
                CFnum.set(j, (val == undefined) ? 0 : val + 1);
            }
        }
        for (const [i, val] of CFnum) {
            const c = document.getElementById(`cell_c${i}`);
            c.setAttribute("fill", MAIN.COLORS.error[val]);
        }
    },
};
