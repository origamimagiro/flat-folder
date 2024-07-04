import { M } from "./math.js";
import { NOTE } from "./note.js";
import { SVG } from "./svg.js";
import { X } from "./conversion.js";

export const IO = {    // INPUT-OUTPUT
    write: (FOLD) => {
        const {V, Vf, EV, EA, FV, FO} = FOLD;
        const path = document.getElementById("import").value.split("\\");
        const name = path[path.length - 1].split(".")[0];
        FOLD = {
            file_spec: 1.1,
            file_creator: "flat-folder",
            file_title: `${name}_cp`,
            file_classes: ["singleModel"],
            vertices_coords:  V,
            edges_vertices:   EV,
            edges_assignment: EA,
            faces_vertices:   FV,
        };
        const data = {};
        data.cp = new Blob([JSON.stringify(FOLD, undefined, 2)], {
            type: "application/json"});
        FOLD.vertices_coords = Vf;
        FOLD.file_title = `${name}_state`;
        if (FO != undefined) {
            FOLD.faceOrders = FO;   // TODO: remove implied face orders?
        }
        data.state = new Blob([JSON.stringify(FOLD, undefined, 2)], {
            type: "application/json"});
        data.img = new Blob([document.getElementById("main").outerHTML], {
            type: "image/svg+xml"});
        data.log = new Blob([NOTE.lines.join("\n")], {
            type: "text/plain"});
        const ex = SVG.clear("export");
        for (const [type, ext] of [
            ["cp", "fold"],
            ["state", "fold"],
            ["img", "svg"],
            ["log", "txt"]
        ]) {
            const link = document.createElement("a");
            const button = document.createElement("input");
            ex.appendChild(link);
            link.appendChild(button);
            link.setAttribute("download", `${name}_${type}.${ext}`);
            link.setAttribute("href", window.URL.createObjectURL(data[type]));
            button.setAttribute("type", "button");
            button.setAttribute("value", type);
        }
    },
    OPX_2_L: (doc) => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(doc, "text/xml");
        const opx_lines = Array.from(dom.getElementsByClassName("oripa.OriLineProxy"));
        const lines = [];
        const coords = ["x0", "x1", "y0", "y1"];
        const map = ["", "F", "M", "V", "U"];
        for (const opx_line of opx_lines) {
            if (opx_line.nodeName == "object") {
                const line = new Map();
                for (const f of coords) {
                    line.set(f, 0);
                }
                for (const node of opx_line.children) {
                    const property = node.getAttribute("property");
                    line.set(property, +node.firstElementChild.innerHTML);
                }
                const [x0, x1, y0, y1] = coords.map(c => line.get(c));
                const type = map[line.get("type")];
                lines.push([[x0, y0], [x1, y1], (type == undefined) ? "F" : type]);
            }
        }
        return lines;
    },
    CP_2_L: (doc) => {
        const map = ["U", "B", "M", "V", "F"];
        const L = doc.split("\n").filter(line => line.length > 0).map(line => {
            line = line.trim();
            const [a, x1, y1, x2, y2] = line.split(" ").map(t => t.trim());
            return [[+x1, +y1], [+x2, +y2], map[+a] ?? "U"];
        });
        return L;
    },
    SVGstyle_2_A: (sty) => {
        let a = "U";
        if (!sty) { return a; }
        const pairs = sty.split(";");
        for (const pair of pairs) {
            const parts = pair.split(":");
            if (parts.length == 2) {
                const attr = parts[0].trim();
                const  val = parts[1].trim();
                if (attr == "stroke") {
                    if (val == "red" || val == "#FF0000") {
                        a = "M";
                    } else if (val == "blue" || val == "#0000FF") {
                        a = "V";
                    } else if (val == "gray" || val == "#808080") {
                        a = "F";
                    } else if (val == "black" || val == "#000000") {
                        a = "B";
                    }
                    break;
                }
            }
        }
        return a;
    },
    SVG_2_L: (doc) => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(doc, "image/svg+xml")
        const svg_lines = Array.from(dom.getElementsByTagName("line"));
        const lines = [];
        for (const svg_line of svg_lines) {
            const x1 = +svg_line.getAttribute("x1");
            const y1 = +svg_line.getAttribute("y1");
            const x2 = +svg_line.getAttribute("x2");
            const y2 = +svg_line.getAttribute("y2");
            const sty = svg_line.getAttribute("style");
            const a = IO.SVGstyle_2_A(sty);
            lines.push([[x1, y1], [x2, y2], a]);
        }
        const svg_polys = Array.from(dom.getElementsByTagName("polyline"));
        for (const svg_poly of svg_polys) {
            const sty = svg_poly.getAttribute("style");
            if (sty == undefined) { continue; }
            const a = IO.SVGstyle_2_A(sty);
            const P = svg_poly.getAttribute("points").split(" ");
            if (P[0].split(",").length == 2) {
                let v1;
                for (const p of P) {
                    if (p == "") { continue; }
                    const coords = p.split(",");
                    if (v1 == undefined) {
                        v1 = coords.map(c => +c);
                    } else {
                        const v2 = coords.map(c => +c);
                        lines.push([v1, v2, a]);
                        v1 = v2;
                    }
                }
            } else if (P.length % 2 == 0) {
                const Q = [];
                for (let i = 0; i < P.length; i += 2) {
                    Q.push([+P[i], P[i + 1]]);
                }
                for (let i = 1; i < Q.length; ++i) {
                    lines.push([Q[i - 1], Q[i], a]);
                }
            }
        }
        const svg_paths = Array.from(dom.getElementsByTagName("path"));
        for (const svg_path of svg_paths) {
            const sty = svg_path.getAttribute("style");
            const a = IO.SVGstyle_2_A(sty);
            const P = svg_path.getAttribute("d").split(" ");
            let start, v1;
            for (const p of P) {
                const coords = p.split(",");
                if (coords.length != 2) {
                    if (p.toUpperCase() == "Z") {
                        lines.push([v1, start, a]);
                        break;
                    }
                    continue;
                }
                if (v1 == undefined) {
                    v1 = coords.map(c => +c);
                    start = v1;
                } else {
                    const v2 = coords.map(c => +c);
                    lines.push([v1, v2, a]);
                    v1 = v2;
                }
            }
        }
        return lines;
    },
    FOLD_2_V_EV_EA_VV_FV: (doc) => {
        let V, EV, EA, VV, FV;
        const ex = JSON.parse(doc);
        if ("vertices_coords" in ex) {
            V = ex["vertices_coords"];
        } else {
            NOTE.time("FOLD file does not contain vertices_coords");
            return [];
        }
        if ("edges_vertices" in ex) {
            EV = ex["edges_vertices"].map(
                ([v1, v2]) => (v1 < v2) ? [v1, v2] : [v2, v1]);
        } else {
            NOTE.time("FOLD file does not contain edges_vertices");
            return [];
        }
        if ("edges_assignment" in ex) {
            EA = ex["edges_assignment"];
        } else {
            NOTE.time("FOLD file does not contain edges_assignments");
            NOTE.time("   - assuming all unassigned");
            EA = EV.map(() => "U");
        }
        if ("faces_vertices" in ex) {
            FV = ex["faces_vertices"];
            M.sort_faces(FV, V);
            VV = X.V_FV_2_VV(V, FV);
        }
        return [V, EV, EA, VV, FV];
    },
    doc_type_side_2_V_VV_EV_EA_EF_FV_FE: (doc, type, side) => {
        let V, VV, EV, EA, FV, EF, FE, eps_i;
        if (type == "fold") {
            [V, EV, EA, VV, FV] = IO.FOLD_2_V_EV_EA_VV_FV(doc);
            if (V == undefined) { return []; }
        } else {
            let L, EL;
            if      (type == "svg") { L = IO.SVG_2_L(doc); }
            else if (type ==  "cp") { L =  IO.CP_2_L(doc); }
            else if (type == "opx") { L = IO.OPX_2_L(doc); }
            else {
                NOTE.time(`ERROR: File extension .${type} not supported!`);
                NOTE.time("       Please use from [.fold, .svg, .cp, .opx]");
                return [];
            }
            NOTE.annotate(L, "lines");
            NOTE.lap();
            NOTE.time("Constructing FOLD from lines");
            [V, EV, EL, eps_i] = X.L_2_V_EV_EL(L);
            const eps = M.min_line_length(L)/(2**eps_i);
            NOTE.time(`Used eps: ${2**eps_i} | ${eps}`);
            EA = EL.map(l => L[l[0]][2]);
        }
        V = M.normalize_points(V);
        const flip_EA = (EA) => {
            return EA.map((a) => (a == "M") ? "V" : ((a == "V") ? "M" : a));
        };
        const flip_Y = (V) => V.map(([x, y]) => [x, -y + 1]);
        const reverse_FV = (FV) => {
            for (const F of FV) {
                F.reverse();
            }
        };
        if (FV == undefined) {
            if (side) {
                EA = flip_EA(EA);
            } else {
                V = flip_Y(V);
            }
            [VV, FV] = X.V_EV_2_VV_FV(V, EV);
        } else {
            if (M.polygon_area2(M.expand(FV[0], V)) < 0) {
                EA = flip_EA(EA);
                reverse_FV(FV);
            }
            if (!side) {
                EA = flip_EA(EA);
                reverse_FV(FV);
                V = flip_Y(V);
            }
        }
        [EF, FE] = X.EV_FV_2_EF_FE(EV, FV);     // remove holes
        if (FV.length > 1) {
            FV = FV.filter((F, i) => !FE[i].every(e => (EA[e] == "B")));
        }
        if (FV.length != FE.length) {           // recompute face maps
            [EF, FE] = X.EV_FV_2_EF_FE(EV, FV);
        }
        for (const [i, F] of EF.entries()) {    // boundary edge assignment
            if (F.length == 1) {
                EA[i] = "B";
            }
        }
        return [V, VV, EV, EA, EF, FV, FE];
    },
};
