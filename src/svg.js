import { M } from "./math.js";

export const SVG = {   // DRAWING
    SCALE: 1000,
    NS: "http://www.w3.org/2000/svg",
    append: (type, par, attrs = {}) => {
        const el = document.createElementNS(SVG.NS, type);
        for (const [k, v] of Object.entries(attrs)) {
            el.setAttribute(k, v);
        }
        par.appendChild(el);
        return el;
    },
    clear: (id) => {
        const el = document.getElementById(id);
        if (el.children != undefined) {
            while (el.children.length > 0) {
                el.removeChild(el.firstChild);
            }
        }
        return el;
    },
    get_val: (val, i, def) => {
        if (val == undefined)   { return def;    }
        if (Array.isArray(val)) { return val[i]; }
        return val;
    },
    draw_point: (svg, [x, y], color, r) => {
        return SVG.append("circle", svg, {cx: x, cy: y, r: r, "fill": color});
    },
    draw_label: (svg, [x, y], color, i) => {
        const t = SVG.append("text", svg, {
            x: x, y: y, "fill": color, "font-size": "15pt"});
        t.innerHTML = i;
        return t;
    },
    draw_points: (svg, P, options) => {
        const g = SVG.append("g", svg);
        if (options.id != undefined) { g.setAttribute("id", options.id); }
        for (const [i, p] of P.entries()) {
            const [x, y] = M.mul(p, SVG.SCALE);
            const color = SVG.get_val(options.fill, i, "black");
            SVG.draw_point(g, [x, y], color, SVG.get_val(options.r, i, 2));
            if (options.text) {
                SVG.draw_label(g, [x, y], color, i);
            }
        }
        return g;
    },
    draw_segments: (svg, L, options) => {
        const g = SVG.append("g", svg);
        if (options.id != undefined) { g.setAttribute("id", options.id); }
        for (const [i, l] of L.entries()) {
            if (options.filter && !options.filter(i)) { continue; }
            const [[x1, y1], [x2, y2]] = l.map(p => M.mul(p, SVG.SCALE));
            const p = SVG.append("line", g, {x1, x2, y1, y2});
            const color = SVG.get_val(options.stroke, i, "black");
            const width = SVG.get_val(options.stroke_width, i, 1);
            p.setAttribute("stroke", color);
            p.setAttribute("stroke-width", width);
            p.setAttribute("stroke-linecap", "round");
            if (options.id != "") {
                p.setAttribute("id", `${options.id}${i}`);
            }
            if (options.text) {
                const [x, y] = M.div(M.add([x1, y1], [x2, y2]), 2);
                SVG.draw_point(g, [x, y], color, SVG.get_val(options.r, i, 2));
                SVG.draw_label(g, [x, y], color, i);
            }
        }
        return g;
    },
    draw_polygons: (svg, P, options) => {
        const g = SVG.append("g", svg);
        if (options.id != undefined) { g.setAttribute("id", options.id); }
        for (const [i, ps] of P.entries()) {
            const F = ps.map(p => M.mul(p, SVG.SCALE));
            const color = SVG.get_val(options.fill, i, "black");
            if (color == undefined) { continue; }
            const V = F.map(v => v.join(",")).join(" ");
            const p = SVG.append("polygon", g, {points: V, fill: color});
            if (options.stroke != undefined) {
                const stroke = SVG.get_val(options.stroke, i);
                const width = SVG.get_val(options.stroke_width, i, 1);
                p.setAttribute("stroke", stroke);
                p.setAttribute("stroke-width", width);
                p.setAttribute("stroke-linejoin", "round");
            }
            if ((options.opacity != undefined) && (options.opacity != 1)) {
                p.setAttribute("opacity", SVG.get_val(options.opacity, i));
            }
            if (options.id != undefined) {
                p.setAttribute("id", `${options.id}${i}`);
            }
            if (options.text) {
                const [x, y] = M.interior_point(F);
                SVG.draw_point(g, [x, y], color, SVG.get_val(options.r, i, 2));
                SVG.draw_label(g, [x, y], color, i);
            }
        }
        return g;
    },
};
