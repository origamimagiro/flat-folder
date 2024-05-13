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
        if ((el != null) && (el.children != undefined)) {
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
        for (const [i, p] of P.entries()) {
            if (options.filter && !options.filter(i)) { continue; }
            const [x, y] = M.mul(p, SVG.SCALE);
            const color = SVG.get_val(options.fill, i, "black");
            const el = SVG.draw_point(svg, [x, y], color, SVG.get_val(options.r, i, 2));
            if (options.id) { el.setAttribute("id", `${svg.id}${i}`); }
            if (options.opacity != undefined) {
                el.setAttribute("opacity", options.opacity);
            }
            if (options.text) {
                SVG.draw_label(svg, [x, y], color, i);
            }
        }
    },
    draw_segments: (svg, L, options) => {
        for (const [i, l] of L.entries()) {
            if (options.filter && !options.filter(i)) { continue; }
            const [[x1, y1], [x2, y2]] = l.map(p => M.mul(p, SVG.SCALE));
            const el = SVG.append("line", svg, {x1, x2, y1, y2});
            const color = SVG.get_val(options.stroke, i, "black");
            const width = SVG.get_val(options.stroke_width, i, 1);
            el.setAttribute("stroke", color);
            el.setAttribute("stroke-width", width);
            el.setAttribute("stroke-linecap", "round");
            if (options.id) { el.setAttribute("id", `${svg.id}${i}`); }
            if (options.text) {
                const [x, y] = M.div(M.add([x1, y1], [x2, y2]), 2);
                SVG.draw_point(svg, [x, y], color, SVG.get_val(options.r, i, 2));
                SVG.draw_label(svg, [x, y], color, i);
            }
        }
    },
    draw_polygons: (svg, P, options) => {
        for (const [i, ps] of P.entries()) {
            if (options.filter && !options.filter(i)) { continue; }
            const F = ps.map(p => M.mul(p, SVG.SCALE));
            const color = SVG.get_val(options.fill, i, "black");
            if (color == undefined) { continue; }
            const V = F.map(v => v.join(",")).join(" ");
            const el = SVG.append("polygon", svg, {points: V, fill: color});
            if (options.stroke != undefined) {
                const stroke = SVG.get_val(options.stroke, i);
                const width = SVG.get_val(options.stroke_width, i, 1);
                el.setAttribute("stroke", stroke);
                el.setAttribute("stroke-width", width);
                el.setAttribute("stroke-linejoin", "round");
            }
            if ((options.opacity != undefined) && (options.opacity != 1)) {
                el.setAttribute("opacity", SVG.get_val(options.opacity, i));
            }
            if (options.id) { el.setAttribute("id", `${svg.id}${i}`); }
            if (options.text) {
                const [x, y] = M.interior_point(F);
                SVG.draw_point(svg, [x, y], color, SVG.get_val(options.r, i, 2));
                SVG.draw_label(svg, [x, y], color, i);
            }
        }
    },
    draw_shadows: (svg, RP, Rf, P, SP, SD, flip, level) => {
        const SD_set = new Set();
        for (const [i, d] of SD.entries()) {
            if (d.length != 2) { continue; }
            const [p, q] = SP[i];
            SD_set.add(M.encode((d == "BL") ? [p, q] : [q, p]));
        }
        for (const [i, ps] of RP.entries()) {
            const F = M.expand(ps, P).map(p => M.mul(p, SVG.SCALE));
            const V = F.map(v => v.join(",")).join(" ");
            const id = `${svg.id}${i}`;
            const clip = SVG.append("clipPath", svg, {id});
            const el = SVG.append("polygon", clip, {points: V});
            const g = SVG.append("g", svg, {"clip-path": `url(#${id})`});
            const n = 4*SVG.get_val(level, i, 2);
            const G = Array(n).fill(0).map(() => SVG.append("g", g));
            const color = (Rf[i] != flip) ? 0xAA : 0xFF;
            const shift = 3;
            const C = Array(n).fill(0).map((a, i) => {
                const c = (Math.max(color - (i + 1)*shift, 0)).toString(16);
                return `#${c}${c}${c}`;
            });
            const base = 2;
            const off = 1;
            const W = Array(n).fill(0).map((a, i) => base + 2*(n - i)*off);
            const Q = RP[i];
            for (let pi = 0; pi < Q.length; ++pi) {
                const pj = (pi + 1) % Q.length;
                if (!SD_set.has(M.encode([Q[pi], Q[pj]]))) { continue; }
                const [[x1, y1], [x2, y2]] = [pi, pj].map(
                    p => M.mul(P[Q[p]], SVG.SCALE));
                for (let i = 0; i < G.length; ++i) {
                    const e = SVG.append("line", G[i], {
                        x1, y1, x2, y2, stroke: C[i],
                        "stroke-width": W[i], "stroke-linecap": "round",
                    });
                }
            }
        }
    },
};
