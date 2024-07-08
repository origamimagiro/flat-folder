import { M } from "./math.js";
import { NOTE } from "./note.js";
import { X } from "./conversion.js";
import { SVG } from "./svg.js";
import { PAR } from "./parallel.js";

export const GUI = {   // INTERFACE
    WIDTH: 1,
    COLORS: {
        background: "lightgray",
        active: "yellow",
        B: "lightskyblue",
        TE: ["green", "red", "orange", "cyan"],
        TF: ["lightgreen", "lightpink", "lightorange", "lightskyblue"],
        edge: {
            U: "#000",
            F: "#CCC",
            M: "blue",  // crease pattern is
            V: "red",   // rendered white-side up
            B: "#000",
        },
        face: {
            top: "#AAA",
            bottom: "#FFF",
            visible: "#000",
        },
        rand: ["lime", "red", "blue", "green", "aqua", "orange", "pink",
            "purple", "brown", "darkviolet", "teal", "olivedrab", "fuchsia",
            "deepskyblue", "orangered", "maroon", "yellow"],
        error: ["yellow", "lightskyblue", "lightpink", "lightgreen"],
    },
    update_text: (FOLD, CELL) => {
        SVG.clear("export");
        const flat_text = SVG.clear("flat_text");
        const cell_text = SVG.clear("cell_text");
        const visible = document.getElementById("text").checked;
        if (!visible) { return; }
        const G = {};
        for (const id of ["f", "e", "v"]) {
            G[id] = SVG.append("g", flat_text, {id: `text_${id}`});
        }
        const {V, EV, EA, FV} = FOLD;
        const V_ = GUI.transform_points(V, "flat");
        const F = FV.map(f => M.expand(f, V_));
        const shrunk = F.map(f => {
            const c = M.centroid(f);
            return f.map(p => M.add(M.mul(M.sub(p, c), 0.5), c));
        });
        SVG.draw_polygons(G.f, shrunk, {text: true, opacity: 0.2});
        const line_centers = EV.map(l => M.centroid(M.expand(l, V_)));
        const colors = EA.map(a => GUI.COLORS.edge[a]);
        SVG.draw_points(G.e, line_centers, {text: true, fill: colors});
        SVG.draw_points(G.v, V_, {text: true, fill: "green"});
        if (CELL != undefined) {
            const {P_norm, SP, CP} = CELL;
            const P_ = GUI.transform_points(P_norm, "fold");
            const cell_centers = CP.map(f => M.interior_point(M.expand(f, P_)));
            const seg_centers = SP.map(l => M.centroid(M.expand(l, P_)));
            for (const id of ["c", "s", "p"]) {
                G[id] = SVG.append("g", cell_text, {id: `text_${id}`});
            }
            SVG.draw_points(G.c, cell_centers, {text: true});
            SVG.draw_points(G.s, seg_centers, {text: true});
            SVG.draw_points(G.p, P_, {text: true, fill: "green"});
        }
    },
    update_flat: (FOLD) => {
        SVG.clear("export");
        const {V, VK, EV, EA, FV} = FOLD;
        const svg = SVG.clear("flat");
        const V_ = GUI.transform_points(V, "flat");
        const F = FV.map(f => M.expand(f, V_));
        const G = {};
        for (const id of ["f", "fnotes", "vis",
            "check", "e_flat", "e_folded", "text", "enotes", "cons", "click",
        ]) {
            G[id] = SVG.append("g", svg, {id: `flat_${id}`});
        }
        const flip = document.getElementById("flip_flat").checked;
        SVG.draw_polygons(G.f, F, {id: true, fill: (
            GUI.COLORS.face[flip ? "top" : "bottom"])});
        const K = [];
        const eps = 1/M.EPS;
        for (const [i, k] of VK.entries()) {
            if (k > eps) { K.push(V_[i]); }
        }
        SVG.draw_points(G.check, K, {fill: "red", r: 10});
        const lines = EV.map(l => M.expand(l, V_));
        const colors = EA.map(a => {
            if (flip) {
                switch (a) {
                    case "V": a = "M"; break;
                    case "M": a = "V";
                }
            }
            return GUI.COLORS.edge[a];
        });
        SVG.draw_segments(G.e_flat, lines, {id: true, stroke: colors,
            stroke_width: GUI.WIDTH, filter: (i) => (EA[i] == "F")});
        SVG.draw_segments(G.e_folded, lines, {id: true, stroke: colors,
            stroke_width: GUI.WIDTH, filter: (i) => (EA[i] != "F")});
        SVG.draw_polygons(G.click, F, {id: true, opacity: 0});
        GUI.update_text(FOLD);
    },
    update_visible: (FOLD, CELL) => {
        SVG.clear("flat_vis");
        const visible = document.getElementById("visible").checked;
        if (!visible) { return; }
        const flip = document.getElementById("flip_flat").checked;
        const {V, Vf_norm, Ff, FV} = FOLD;
        const {P_norm, CP, CF} = CELL;
        const visFC = [];
        for (let i = 0; i < CF.length; ++i) {
            const S = CF[i];
            if (S.length == 0) { continue; }
            const [t, b] = [S[0], S[S.length - 1]];
            if (flip != Ff[t]) {
                visFC.push([t, i]);
            }
            if (flip == Ff[b]) {
                visFC.push([b, i]);
            }
        }
        const vis = visFC.map(([fi, ci]) => GUI.transform_points(M.image(
            M.expand(FV[fi], Vf_norm),
            M.expand(FV[fi], V),
            M.expand(CP[ci], P_norm)
        ), "flat"));
        const vis_el = SVG.clear("flat_vis");
        SVG.draw_polygons(vis_el, vis, {stroke: "none",
            fill: GUI.COLORS.face.visible, opacity: 0.1});
    },
    update_cell: (FOLD, CELL) => {
        SVG.clear("export");
        const svg = SVG.clear("cell");
        const G = {};
        for (const id of ["f", "c", "s", "text", "notes", "comps", "click"]) {
            G[id] = SVG.append("g", svg, {id: `cell_${id}`});
        }
        const {Vf_norm, FV} = FOLD;
        if (CELL == undefined) {
            const P = GUI.transform_points(Vf_norm, "fold");
            const F = FV.map(f => M.expand(f, P));
            SVG.draw_polygons(G.f, F, {opacity: 0.05});
        } else {
            const {P_norm, SP, CP, CF} = CELL;
            const P = GUI.transform_points(P_norm, "fold");
            const cells = CP.map(f => M.expand(f, P));
            const lines = SP.map(l => M.expand(l, P));
            const Ccolors = GUI.CF_2_Cbw(CF);
            SVG.draw_polygons(G.c, cells, {id: true, fill: Ccolors});
            SVG.draw_segments(G.s, lines, {id: true,
                stroke: "black", stroke_width: GUI.WIDTH});
            SVG.draw_polygons(G.click, cells, {id: true, opacity: 0});
        }
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
        const {Ff, EF} = FOLD;
        const {P, P_norm, CP, CF, SP, SC, SE} = CELL;
        const svg = SVG.clear("fold");
        const scale = document.getElementById("scale").checked;
        const P_ = GUI.transform_points(
            scale ? M.center_points_on(P, [0.5, 0.5]) : P_norm, "fold");
        const flip = document.getElementById("flip_fold").checked;
        const Ctop = CF.map(S => flip ? S[0] : S[S.length - 1]);
        const SD = X.Ctop_SC_SE_EF_Ff_2_SD(Ctop, SC, SE, EF, Ff);
        const [RP, Rf] = X.Ctop_CP_SC_SD_Ff_P_2_RP_Rf(Ctop, CP, SC, SD, Ff, P_);
        const regions = RP.map(V => M.expand(V, P_));
        const colors = Rf.map(f => {
            if (f == undefined) { return undefined; }
            return GUI.COLORS.face[(f != flip) ? "top" : "bottom"];
        });
        const G = {};
        for (const id of ["c", "shadow", "s_crease", "s_edge", "notes", "comps"]) {
            G[id] = SVG.append("g", svg, {id: `fold_${id}`});
        }
        SVG.draw_polygons(G.c, regions, {fill: colors, stroke: colors});
        const n = +document.getElementById("shadow").value;
        if (n > 0) { SVG.draw_shadows(G.shadow, RP, Rf, P_, SP, SD, flip, n); }
        const lines = SP.map((ps) => M.expand(ps, P_));
        SVG.draw_segments(G.s_crease, lines, {
            stroke: GUI.COLORS.edge.F, filter: (i) => SD[i][0] == "C"});
        SVG.draw_segments(G.s_edge, lines, {
            stroke: GUI.COLORS.edge.B, filter: (i) => SD[i][0] == "B"});
    },
    update_component: async (FOLD, CELL, COMP, Gn, Gi) => {
        SVG.clear("export");
        const comp_select = document.getElementById("component_select");
        const state_config = document.getElementById("state_config");
        state_config.style.display = "none";
        const c = comp_select.value;
        comp_select.style.background = "white";
        const C = [];
        if (c == "none") {
        } else if (c == "all") {
            for (const [i, _] of Gi.entries()) {
                C.push(i);
            }
        } else {
            C.push(c);
            const n = Gn[c];
            comp_select.style.background = GUI.COLORS.rand[c % GUI.COLORS.rand.length];
            state_config.style.display = "inline";
            const state_label = document.getElementById("state_label");
            const state_select = document.getElementById("state_select");
            state_label.innerHTML = `${n} State${(n == 1) ? "" : "s"}`;
            state_select.setAttribute("min", 1);
            state_select.setAttribute("max", n);
            state_select.value = Gi[c] + 1;
            state_select.onchange = async (e) => {
                NOTE.start("Computing new state");
                let j = +e.target.value;
                if (j < 1) { j = 1; }
                if (j > n) { j = n; }
                state_select.value = j;
                Gi[c] = j - 1;
                const [CD, FO] = await PAR.send_message(COMP, "Gi_2_CD_FO", [Gi]);
                CELL.CF = CD;
                FOLD.FO = FO;
                GUI.update_fold(FOLD, CELL);
                GUI.update_visible(FOLD, CELL);
                NOTE.end();
            };
        }
        const {Vf_norm, FV} = FOLD;
        const V_ = GUI.transform_points(Vf_norm, "fold");
        const g = SVG.clear("cell_comps");
        const gBF = await PAR.send_message(COMP, "g_2_gBF", [C]);
        for (let i = 0; i < C.length; ++i) {
            const comp = C[i];
            const lines = gBF[i].map(([f1, f2]) => {
                const p1 = M.centroid(M.expand(FV[f1], V_));
                const p2 = M.centroid(M.expand(FV[f2], V_));
                return [p1, p2];
            });
            const stroke = GUI.COLORS.rand[comp % GUI.COLORS.rand.length];
            const comp_svg = SVG.append("g", g, {id: `comp${i}#`});
            SVG.draw_segments(comp_svg, lines, {
                "stroke": stroke, "stroke_width": 2});
        }
    },
    update_cell_face_listeners: async (FOLD, CELL, COMP) => {
        const {V, EV, FV, FE, Vf_norm} = FOLD;
        const {P_norm, SP, CP, CS, CF, FC, SE} = CELL;
        GUI.clear_notes(CF, FC);
        const V_ = GUI.transform_points(V, "flat");
        const P_ = GUI.transform_points(P_norm, "fold");
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
        const FM = FV.map(F => M.centroid(M.expand(F, V_)));
        const active = [];
        const flat_fnotes = document.getElementById("flat_fnotes");
        const flat_enotes = document.getElementById("flat_enotes");
        const cell_notes = document.getElementById("cell_notes");
        NOTE.start_check("face", FC);
        for (const [i, C] of FC.entries()) {
            NOTE.check(i);
            const face = document.getElementById(`flat_click${i}`);
            face.onclick = async () => {
                NOTE.time(`Clicked face ${i}`);
                const f = document.getElementById(`flat_f${i}`);
                const color = f.getAttribute("fill");
                GUI.clear_notes(CF, FC);
                if (active.length == 1) {
                    const fB_set = X.f_FC_CF_2_fB_set(active[0], FC, CF);
                    if ((i == active[0]) || !fB_set.has(i)) {
                        active.pop();
                        NOTE.log("   - Clearing selection");
                        NOTE.log("");
                        return;
                    }
                    active.push(i);
                    const [f1, f2] = active;
                    const [ti, T] = await PAR.send_message(
                        COMP, "f1_f2_2_T", [f1, f2]);
                    const SL = [];
                    for (const j of [0, 1, 2]) {
                        const Ti = T[j];
                        SL.push(Ti.map((t) => `[${t.join(",")}]`));
                    }
                    const S = new Set();
                    const bC = [];
                    const C1 = new Set(FC[f1]);
                    for (const c of FC[f2]) {
                        if (C1.has(c)) { bC.push(c); }
                    }
                    for (const c of bC) {
                        for (const f3 of CF[c]) { S.add(f3); }
                    }
                    S.delete(f1);
                    S.delete(f2);
                    T[3] = Array.from(S);
                    SL.push(`[${T[3].join(",")}`);
                    NOTE.log(`   - variable ${ti} between faces [${f1},${f2}]`);
                    NOTE.log(`   - taco-taco: [${SL[0]}]`);
                    NOTE.log(`   - taco-tortilla: [${SL[1]}]`);
                    NOTE.log(`   - tortilla-tortilla: [${SL[2]}]`);
                    NOTE.log(`   - transitivity: [${SL[3]}]`);
                    NOTE.log("");
                    for (const f3 of T[3]) {
                        const el = document.getElementById(`flat_f${f3}`);
                        el.setAttribute("fill", GUI.COLORS.TF[3]);
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
                        SVG.draw_segments(flat_enotes, L[j], {
                            id: "flat_cons",
                            stroke: GUI.COLORS.TE[j], stroke_width: 5});
                    }
                    for (const f of [f1, f2]) {
                        for (const c of FC[f]) {
                            const el = document.getElementById(`cell_c${c}`);
                            el.setAttribute("fill", GUI.COLORS.active);
                        }
                    }
                    for (const c of bC) {
                        const el = document.getElementById(`cell_c${c}`);
                        el.setAttribute("fill", GUI.COLORS.TF[3]);
                    }
                    for (const f of active) {
                        const el = document.getElementById(`flat_f${f}`);
                        el.setAttribute("fill", GUI.COLORS.active);
                    }
                } else {
                    while (active.length > 0) { active.pop(); }
                    if (color == GUI.COLORS.active) {
                        NOTE.log("   - Clearing selection");
                        NOTE.log("");
                        return;
                    }
                    active.push(i);
                    NOTE.log(`   - bounded by vertices [${FV[i]}]`);
                    NOTE.log(`   - bounded by edges [${FE[i]}]`);
                    NOTE.log(`   - overlaps cells [${FC[i]}]`);
                    NOTE.log("");
                    for (const f of X.f_FC_CF_2_fB_set(i, FC, CF)) {
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
                            S.push(SP[s].map(p => P_[p]));
                            Scolors.push(color);
                        }
                        Lcolors.push(color);
                        return [v1, v2].map(p => V_[p]);
                    });
                    SVG.draw_segments(flat_enotes, L, {
                        id: "flat_f_bounds", stroke: Lcolors, stroke_width: 5});
                    SVG.draw_segments(cell_notes, S, {
                        id: "cell_f_bounds", stroke: Scolors, stroke_width: 5});
                    GUI.add_active(f, C, "cell_c");
                }
            };
        }
        for (const [i, F] of CF.entries()) {
            const cell = document.getElementById(`cell_click${i}`);
            cell.onclick = () => {
                NOTE.time(`Clicked cell ${i}`);
                const c = document.getElementById(`cell_c${i}`);
                const active = (c.getAttribute("fill") == GUI.COLORS.active);
                GUI.clear_notes(CF, FC);
                if (active) {
                    NOTE.log("   - Clearing selection");
                    NOTE.log("");
                    return;
                }
                NOTE.log(`   - bounded by points [${CP[i]}]`);
                NOTE.log(`   - bounded by segments [${CS[i]}]`);
                NOTE.log(`   - overlaps faces [${CF[i]}]`);
                NOTE.log("");
                c.setAttribute("fill", GUI.COLORS.active);
                const C_ = F.map(fi => {
                    const v = M.expand(FV[fi], Vf_norm);
                    const v_ = M.expand(FV[fi], V);
                    const p = M.expand(CP[i], P_norm);
                    return GUI.transform_points(M.image(v, v_, p), "flat");
                });
                SVG.draw_polygons(flat_fnotes, C_,
                    {stroke: "none", fill: GUI.COLORS.active});
                const L = [];
                const Lcolors = [];
                const Scolors = [];
                const S = CP[i].map((p1, j) => {
                    const p2 = CP[i][(j + 1) % CP[i].length];
                    const k = M.encode_order_pair([p1, p2]);
                    const color = GUI.COLORS.rand[j % GUI.COLORS.rand.length];
                    for (const e of SE_map.get(k)) {
                        L.push(EV[e].map(p => V_[p]));
                        Lcolors.push(color);
                    }
                    Scolors.push(color);
                    return [p1, p2].map(p => P_[p]);
                });
                SVG.draw_segments(flat_enotes, L, {stroke: Lcolors, stroke_width: 5});
                SVG.draw_segments(cell_notes, S, {stroke: Scolors, stroke_width: 5});
            };
        }
    },
    clear_notes: (CF, FC) => {
        SVG.clear("flat_enotes");
        SVG.clear("flat_fnotes");
        SVG.clear("cell_notes");
        SVG.clear("export");
        const flip = document.getElementById("flip_flat").checked;
        for (const [i, C] of FC.entries()) {
            const f = document.getElementById(`flat_f${i}`);
            f.setAttribute("fill", GUI.COLORS.face[(flip ? "top" : "bottom")]);
        }
        const Ccolors = GUI.CF_2_Cbw(CF);
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
            c.setAttribute("fill", GUI.COLORS.error[val]);
        }
    },
    update_component_error: (F, FC) => {
        const CFnum = new Map();
        for (const i of F) {
            const f = document.getElementById(`flat_f${i}`);
            f.setAttribute("opacity", 0.2);
            f.setAttribute("fill", "red");
            for (const j of FC[i]) {
                const c = document.getElementById(`cell_c${j}`);
                c.setAttribute("opacity", 0.2);
                c.setAttribute("fill", "red");
            }
        }
    },
    transform_points: (P, id) => {
        const flip = document.getElementById(`flip_${id}`).checked;
        const ri = (+document.getElementById(`rotate_${id}`).value)/90;
        const [cos, sin] = [[1, 0], [0, -1], [-1, 0], [0, 1]][ri];
        const m = [0.5, 0.5];
        return P.map(p => M.add(M.rotate_cos_sin(M.sub(p, m), cos, sin), m))
            .map(p => (flip ? M.add(M.refX(M.sub(p, m)), m) : p));
    },
};
