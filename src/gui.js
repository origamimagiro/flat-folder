import { M } from "./math.js";
import { NOTE } from "./note.js";
import { X } from "./conversion.js";
import { SVG } from "./svg.js";

export const GUI = {   // INTERFACE
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
    update_text: (FOLD, CELL) => {
        SVG.clear("export");
        SVG.clear("flat_shrunk");
        SVG.clear("flat_text");
        if (CELL != undefined) {
            SVG.clear("cell_text");
        }
        const visible = document.getElementById("text").checked;
        if (visible) {
            const flat_text = document.getElementById("flat_text");
            const flat_shrunk = document.getElementById("flat_shrunk");
            const {V, EV, EA, FV} = FOLD;
            const F = FV.map(f => M.expand(f, V));
            const shrunk = F.map(f => {
                const c = M.centroid(f);
                return f.map(p => M.add(M.mul(M.sub(p, c), 0.5), c));
            });
            SVG.draw_polygons(flat_shrunk, shrunk, {
                text: true, id: "f_text", opacity: 0.2});
            const line_centers = EV.map(l => M.centroid(M.expand(l, V)));
            const colors = EA.map(a => GUI.COLORS.edge[a]);
            SVG.draw_points(flat_text, line_centers, {
                text: true, id: "e_text", fill: colors});
            SVG.draw_points(flat_text, V, {
                text: true, id: "v_text", fill: "green"});
            if (CELL != undefined) {
                const {P_norm, SP, CP} = CELL;
                const cell_text = document.getElementById("cell_text");
                const cell_centers = CP.map(f => M.interior_point(M.expand(f, P_norm)));
                const seg_centers = SP.map(l => M.centroid(M.expand(l, P_norm)));
                SVG.draw_points(cell_text, cell_centers, {
                    text: true, id: "c_text"});
                SVG.draw_points(cell_text, seg_centers, {
                    text: true, id: "s_text"});
                SVG.draw_points(cell_text, P_norm, {
                    text: true, id: "p_text", fill: "green"});
            }
        }
    },
    update_flat: (FOLD) => {
        SVG.clear("export");
        const {V, VK, EV, EA, FV} = FOLD;
        const svg = SVG.clear("flat");
        const F = FV.map(f => M.expand(f, V));
        SVG.draw_polygons(svg, F, {id: "flat_f", fill: GUI.COLORS.face.bottom});
        SVG.append("g", svg, {id: "flat_shrunk"});
        const K = [];
        const eps = 1/M.EPS;
        for (const [i, k] of VK.entries()) {
            if (k > eps) { K.push(V[i]); }
        }
        SVG.draw_points(svg, K, {id: "flat_check", fill: "red", r: 10});
        const lines = EV.map(l => M.expand(l, V));
        const colors = EA.map(a => GUI.COLORS.edge[a]);
        SVG.draw_segments(svg, lines, {
            id: "flat_e_flat", stroke: colors,
            stroke_width: GUI.WIDTH, filter: (i) => (EA[i] == "F")});
        SVG.draw_segments(svg, lines, {
            id: "flat_e_folded", stroke: colors,
            stroke_width: GUI.WIDTH, filter: (i) => (EA[i] != "F")});
        SVG.append("g", svg, {id: "flat_text"});
        SVG.append("g", svg, {id: "flat_notes"});
        GUI.update_text(FOLD);
    },
    update_cell: (FOLD, CELL) => {
        SVG.clear("export");
        const svg = SVG.clear("cell");
        if (CELL == undefined) {
            const F = FOLD.FV.map(f => M.expand(f, FOLD.Vf_norm));
            SVG.draw_polygons(svg, F, {id: "cell_f", opacity: 0.05});
        } else {
            const {P_norm, SP, SE, CP, SC, CF, FC} = CELL;
            const cells = CP.map(f => M.expand(f, P_norm));
            const lines = SP.map(l => M.expand(l, P_norm));
            const Ccolors = GUI.CF_2_Cbw(CF);
            SVG.draw_polygons(svg, cells, {fill: Ccolors, id: "cell_c"});
            SVG.draw_segments(svg, lines, {
                id: "cell_s", stroke: "black", stroke_width: GUI.WIDTH});
        }
        SVG.append("g", svg, {id: "cell_text"});
        SVG.append("g", svg, {id: "cell_notes"});
        SVG.append("g", svg, {id: "component_notes"});
        GUI.update_text(FOLD, CELL);
    },
    CF_2_Ccolors: (CF) => {
        return GUI.CF_2_Clayer(CF).map(l => `hsl(${
            Math.ceil((2 + l)*120)}, 100%, 50%)`);
    },
    CF_2_Cbw: (CF) => {
        return GUI.CF_2_Clayer(CF).map(l => {
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
    update_fold: (FOLD, CELL) => {
        SVG.clear("export");
        const {EF, Ff} = FOLD;
        const {P_norm, SP, SE, CP, SC, CF, CD} = CELL;
        const svg = SVG.clear("fold");
        const flip = document.getElementById("flip").checked;
        const tops = CD.map(S => flip ? S[0] : S[S.length - 1]);
        const SD = X.EF_SE_SC_CF_CD_2_SD(EF, SE, SC, CF, tops);
        const m = [0.5, 0.5];
        const Q = P_norm.map(p => (flip ? M.add(M.refX(M.sub(p, m)), m) : p));
        const cells = CP.map(V => M.expand(V, Q));
        const colors = tops.map(d => {
            if (d == undefined) { return undefined; }
            if (Ff[d] != flip)  { return GUI.COLORS.face.top; }
            else                { return GUI.COLORS.face.bottom; }
        });
        SVG.draw_polygons(svg, cells, {
            id: "fold_c", fill: colors, stroke: colors});
        const lines = SP.map((ps) => M.expand(ps, Q));
        SVG.draw_segments(svg, lines, {
            id: "fold_s_crease", stroke: GUI.COLORS.edge.F,
            filter: (i) => SD[i] == "C"});
        SVG.draw_segments(svg, lines, {
            id: "fold_s_edge", stroke: GUI.COLORS.edge.B,
            filter: (i) => SD[i] == "B"});
    },
    update_component: (FOLD, CELL, BF, GB, GA, GI) => {
        SVG.clear("export");
        const comp_select = document.getElementById("component_select");
        const c = comp_select.value;
        document.getElementById("state_config").style.display = "none";
        comp_select.style.background = "white";
        const C = [];
        if (c == "none") {
        } else if (c == "all") {
            for (const [i, _] of GA.entries()) {
                C.push(i);
            }
        } else {
            C.push(c);
            const n = GA[c].length;
            comp_select.style.background = GUI.COLORS.rand[c % GUI.COLORS.rand.length];
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
                FOLD.FO = X.edges_Ff_2_FO(edges, FOLD.Ff);
                CELL.CD = X.CF_edges_flip_2_CD(CELL.CF, edges);
                GUI.update_fold(FOLD, CELL);
                NOTE.end();
            };
        }
        const {Vf_norm, FV} = FOLD;
        const g = SVG.clear("component_notes");
        for (const comp of C) {
            const lines = GB[comp].map(b => {
                const [f1, f2] = M.decode(BF[b]);
                const p1 = M.centroid(M.expand(FV[f1], Vf_norm));
                const p2 = M.centroid(M.expand(FV[f2], Vf_norm));
                return [p1, p2];
            });
            const stroke = GUI.COLORS.rand[comp % GUI.COLORS.rand.length];
            SVG.draw_segments(g, lines, {id: "cell_comp",
                "stroke": stroke, "stroke_width": 2});
        }
    },
    update_cell_face_listeners: (FOLD, CELL, BF, BT) => {
        const {V, EV, FV, FE} = FOLD;
        const {P_norm, SP, CP, CS, CF, FC, SE} = CELL;
        const ES_map = new Map();
        for (const [i, E] of SE.entries()) {
            for (const e of E) {
                const k = M.encode(EV[e]);
                const A = ES_map.get(k);
                if (A == undefined) {
                    ES_map.set(k, [i]);
                } else {
                    A.push(i);
                }
            }
        }
        const SE_map = new Map();
        for (const [i, E] of SE.entries()) {
            SE_map.set(M.encode(SP[i]), E);
        }
        const FM = FV.map(F => M.centroid(M.expand(F, V)));
        const FB_map = new Map();
        for (const [i, F] of BF.entries()) {
            FB_map.set(F, i);
        }
        const FB = FC.map(() => []);
        for (const k of BF) {
            const [f1, f2] = M.decode(k);
            FB[f1].push(f2);
            FB[f2].push(f1);
        }
        const active = [];
        const flat_notes = document.getElementById("flat_notes");
        const cell_notes = document.getElementById("cell_notes");
        NOTE.start_check("face", FC);
        for (const [i, C] of FC.entries()) {
            NOTE.check(i);
            const face = document.getElementById(`flat_f${i}`);
            face.onclick = () => {
                NOTE.time(`Clicked face ${i}`);
                const color = face.getAttribute("fill");
                GUI.clear_notes(CF, FC, true);
                if (active.length == 1) {
                    if (color != GUI.COLORS.B) {
                        active.pop();
                        NOTE.log("   - Clearing selection");
                        NOTE.log("");
                        return;
                    }
                    active.push(i);
                    const [f1, f2] = active;
                    const ti = FB_map.get(M.encode_order_pair([f1, f2]));
                    const T = BT[ti];
                    const SL = [];
                    for (const j of [0, 1, 2]) {
                        const Ti = T[j];
                        SL.push(Ti.map((t) => `[${t.join(",")}]`));
                    }
                    SL.push(Array.from(T[3]).map(x => M.decode(x)));
                    NOTE.log(`   - variable ${ti} between faces [${f1},${f2}]`);
                    NOTE.log(`   - taco-taco: [${SL[0]}]`);
                    NOTE.log(`   - taco-tortilla: [${SL[1]}]`);
                    NOTE.log(`   - tortilla-tortilla: [${SL[2]}]`);
                    NOTE.log(`   - transitivity: [${SL[3]}]`);
                    NOTE.log("");
                    for (const j of [3, 1]) {
                        const Tj = (j == 1) ? T[j] : M.decode(T[j]);
                        for (const F of Tj) {
                            const f3 = (j == 1) ? F[2] : F;
                            const el = document.getElementById(`flat_f${f3}`);
                            el.setAttribute("fill", GUI.COLORS.TF[j]);
                        }
                    }
                    const L = [new Set(), new Set(), new Set()];
                    for (const j of [0, 1, 2]) {
                        for (const [a, b, c, d] of T[j]) {
                            L[j].add(M.encode([a, b]));
                            if (j != 1) {
                                L[j].add(M.encode_order_pair([c, d]));
                            }
                        }
                    }
                    for (const j of [0, 1, 2]) {
                        L[j] = Array.from(L[j]).map(
                            k => M.decode(k).map(x => FM[x])
                        );
                    }
                    for (const j of [1, 2, 0]) {
                        SVG.draw_segments(flat_notes, L[j], {
                            id: "flat_cons",
                            stroke: GUI.COLORS.TE[j], stroke_width: 5});
                    }
                    for (const f of [f1, f2]) {
                        for (const c of FC[f]) {
                            const el = document.getElementById(`cell_c${c}`);
                            el.setAttribute("fill", GUI.COLORS.active);
                        }
                    }
                    const C1 = new Set(FC[f1]);
                    for (const c of FC[f2]) {
                        if (C1.has(c)) {
                            const el = document.getElementById(`cell_c${c}`);
                            el.setAttribute("fill", GUI.COLORS.TF[3]);
                        }
                    }
                    for (const f of active) {
                        const el = document.getElementById(`flat_f${f}`);
                        el.setAttribute("fill", GUI.COLORS.active);
                    }
                } else {
                    while (active.length > 0) { active.pop(); }
                    if (color != GUI.COLORS.face.bottom) {
                        NOTE.log("   - Clearing selection");
                        NOTE.log("");
                        return;
                    }
                    active.push(i);
                    NOTE.log(`   - bounded by vertices [${FV[i]}]`);
                    NOTE.log(`   - bounded by edges [${FE[i]}]`);
                    NOTE.log(`   - overlaps cells [${FC[i]}]`);
                    NOTE.log("");
                    for (const f of FB[i]) {
                        const el = document.getElementById(`flat_f${f}`);
                        el.setAttribute("fill", GUI.COLORS.B);
                    }
                    const S = [];
                    const Scolors = [];
                    const Lcolors = [];
                    const L = FV[i].map((v1, j) => {
                        const v2 = FV[i][(j + 1) % FV[i].length];
                        const k = M.encode_order_pair([v1, v2]);
                        const color = GUI.COLORS.rand[j % GUI.COLORS.rand.length];
                        for (const s of ES_map.get(k)) {
                            S.push(SP[s].map(p => P_norm[p]));
                            Scolors.push(color);
                        }
                        Lcolors.push(color);
                        return [v1, v2].map(p => V[p]);
                    });
                    SVG.draw_segments(flat_notes, L, {
                        id: "flat_f_bounds", stroke: Lcolors, stroke_width: 5});
                    SVG.draw_segments(cell_notes, S, {
                        id: "cell_f_bounds", stroke: Scolors, stroke_width: 5});
                    GUI.add_active(face, C, "cell_c");
                }
            };
        }
        for (const [i, F] of CF.entries()) {
            const cell = document.getElementById(`cell_c${i}`);
            cell.onclick = () => {
                NOTE.time(`Clicked cell ${i}`);
                const active = (cell.getAttribute("fill") == GUI.COLORS.active);
                GUI.clear_notes(CF, FC, !active);
                if (active) {
                    NOTE.log("   - Clearing selection");
                    NOTE.log("");
                    return;
                }
                NOTE.log(`   - bounded by points [${CP[i]}]`);
                NOTE.log(`   - bounded by segments [${CS[i]}]`);
                NOTE.log(`   - overlaps faces [${CF[i]}]`);
                NOTE.log("");
                GUI.add_active(cell, F, "flat_f");
                const L = [];
                const Lcolors = [];
                const Scolors = [];
                const S = CP[i].map((p1, j) => {
                    const p2 = CP[i][(j + 1) % CP[i].length];
                    const k = M.encode_order_pair([p1, p2]);
                    const color = GUI.COLORS.rand[j % GUI.COLORS.rand.length];
                    for (const e of SE_map.get(k)) {
                        L.push(EV[e].map(p => V[p]));
                        Lcolors.push(color);
                    }
                    Scolors.push(color);
                    return [p1, p2].map(p => P_norm[p]);
                });
                SVG.draw_segments(flat_notes, L, {
                    id: "flat_c_bounds", stroke: Lcolors, stroke_width: 5});
                SVG.draw_segments(cell_notes, S, {
                    id: "cell_c_bounds", stroke: Scolors, stroke_width: 5});
            };
        }
    },
    clear_notes: (CF, FC, active) => {
        SVG.clear("flat_notes");
        SVG.clear("cell_notes");
        SVG.clear("export");
        for (const [i, C] of FC.entries()) {
            const f = document.getElementById(`flat_f${i}`);
            f.setAttribute("fill", GUI.COLORS.face.bottom);
        }
        const Ccolors = active ? GUI.CF_2_Cbw(CF) : GUI.CF_2_Cbw(CF);
        for (const [i, F] of CF.entries()) {
            const c = document.getElementById(`cell_c${i}`);
            c.setAttribute("fill", Ccolors[i]);
        }
    },
    add_active: (svg, A, id) => {
        svg.setAttribute("fill", GUI.COLORS.active);
        for (const a of A) {
            const el = document.getElementById(`${id}${a}`);
            el.setAttribute("fill", GUI.COLORS.active);
        }
    },
    update_error: (F, E, BF, FC) => {
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
            c.setAttribute("fill", GUI.COLORS.error[val]);
        }
    },
};
