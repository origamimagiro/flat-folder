export const M = {     // MATH
    EPS: 300,
    FLOAT_EPS: 10**(-16),
    near_zero: (a) => Math.abs(a) < M.FLOAT_EPS,
    encode: (A) => {
        const B = [];
        for (const a of A) {
            B.push(String.fromCodePoint(a));
        }
        return B.join("");
    },
    encode_order_pair: ([a, b]) => M.encode((a < b) ? [a, b] : [b, a]),
    decode: (S) => {
        const B = [];
        for (const s of S) {
            B.push(s.codePointAt(0));
        }
        return B;
    },
    expand: (F, V) => F.map((vi) => V[vi]),
    mul: ([x, y], s) => [s*x, s*y],
    div: (v, s) => M.mul(v, 1/s),
    add: ([x1, y1], [x2, y2]) => [x1 + x2, y1 + y2],
    sub: ([x1, y1], [x2, y2]) => [x1 - x2, y1 - y2],
    dot: ([x1, y1], [x2, y2]) => x1*x2 + y1*y2,
    magsq: (v) => M.dot(v, v),
    mag: (v) => Math.sqrt(M.magsq(v)),
    unit: (v) => M.mul(v, 1/M.mag(v)),
    perp: ([x, y]) => [y, -x],
    refX: ([x, y]) => [-x, y],
    refY: ([x, y]) => [x, -y],
    distsq: (v1, v2) => M.magsq(M.sub(v2, v1)),
    dist: (v1, v2) => M.mag(M.sub(v2, v1)),
    close: (v1, v2, eps) => ((Math.abs(v1[0] - v2[0]) < eps) &&
                             (Math.abs(v1[1] - v2[1]) < eps)),
    area2: ([x1, y1], [x2, y2], [x3, y3]) =>
        ((x2 - x1)*(y3 - y1) - (x3 - x1)*(y2 - y1)),
    angle: ([x, y]) => {
        const ang = Math.atan2(y, x);
        return ang + ((ang < 0) ? 2*Math.PI : 0);
    },
    centroid: (P) => {
        const n = P.length;
        let p = [0, 0];
        for (let i = 0; i < n; ++i) {
            p = M.add(p, P[i]);
        }
        return M.div(p, n);
    },
    previous_in_list: (A, v) => {
        for (const [i, x] of A.entries()) {
            if (x == v) {
                if (i == 0) { return A[A.length - 1]; }
                else        { return A[i - 1]; }
            }
        }
    },
    min_line_length: (lines) => {
        let min_line_lengthsq = Infinity;
        for (const [p, q] of lines) {
            const lensq = M.distsq(p, q);
            if (lensq < min_line_lengthsq) {
                min_line_lengthsq = lensq;
            }
        }
        return min_line_lengthsq**0.5;
    },
    sort_faces: (FV, V) => {
        FV.sort((f1, f2) => {
            const A1 = M.polygon_area2(M.expand(f1, V));
            const A2 = M.polygon_area2(M.expand(f2, V));
            return A2 - A1;
        });
    },
    normalize_points: (P) => {
        let [x_min, x_max] = [Infinity, -Infinity];
        let [y_min, y_max] = [Infinity, -Infinity];
        for (const [x, y] of P) {
            if (x < x_min) { x_min = x; }
            if (x > x_max) { x_max = x; }
            if (y < y_min) { y_min = y; }
            if (y > y_max) { y_max = y; }
        }
        const x_diff = x_max - x_min;
        const y_diff = y_max - y_min;
        const is_tall = (x_diff < y_diff);
        const diff = is_tall ? y_diff : x_diff;
        const off = M.sub([0.5, 0.5], M.div([x_diff, y_diff], 2*diff));
        return P.map(p => M.add(M.div(M.sub(p, [x_min, y_min]), diff), off));
    },
    interior_point: (P) => {    // currently O(n^2), could be O(n log n)
        // In:  P | array of 2D points that define a simple polygon with the
        //        | inside of the polygon on the left of the boundary tour
        // Out: x | centroid of P's largest ear, i.e., triangle formed by three
        //        | consecutive points of P that lies entirely in P, two of
        //        | which exist by the two ears theorem.
        const n = P.length;
        let largest_ear;
        let max_area = -Infinity;
        let [p1, p2] = [P[n - 2], P[n - 1]];
        for (const p3 of P) {
            const a = M.area2(p1, p2, p3);
            if (a <= 0) {           // reflex vertex cannot be an ear
                continue;
            }
            let found = true;
            for (const p of P) {    // check if triangle contains another vertex
                if ((p != p1) && (p != p2) && (p != p3) &&
                    ((M.area2(p1, p2, p) >= 0) &&
                     (M.area2(p2, p3, p) >= 0) &&
                     (M.area2(p3, p1, p) >= 0))
                ) {
                    found = false;
                    break;
                }
            }
            if (found) {            // convex ear is contained in P
                if (max_area < a) {
                    max_area = a;
                    largest_ear = [p1, p2, p3];
                }
            }
            [p1, p2] = [p2, p3];
        }
        if (largest_ear == undefined) { debugger; }
        return M.centroid(largest_ear);
    },
    on_segment: (a, b, c, eps) => {
        // assumes a, b, c all pairwise separated by more than eps
        // returns true if c is within dist_eps of segment a, b
        const v = M.sub(b, a);
        const [pa, pb, pc] = [a, b, c].map(p => M.dot(p, v));
        if ((pc < pa) == (pc < pb)) {
            // projection of c is not between a and b
            return false;
        }
        const d = M.dot(M.unit(M.perp(v)), M.sub(c, a));
        return (Math.abs(d) <= eps);
    },
    polygon_area2: (P) => {
        let area = 0;
        let p1 = P[P.length - 1];
        for (const p2 of P) {
            area += (p1[0] + p2[0])*(p2[1] - p1[1]);
            p1 = p2;
        }
        return area;
    },
    intersect: ([a, b], [c, d], eps) => {
        // Adapted from Computational Geometry in C [O'Rourke]
        // Returns a proper intersection point of segments [a, b] and [c, d]
        // or undefined if no proper intersection point exists
        if (M.close(a, c, eps) || M.close(a, d, eps) ||
            M.close(b, c, eps) || M.close(b, d, eps) ||
            M.on_segment(a, b, c, eps) || M.on_segment(a, b, d, eps) ||
            M.on_segment(c, d, a, eps) || M.on_segment(c, d, b, eps)) {
            return;
        }
        const denom = (
            a[0] * (d[1] - c[1]) + b[0] * (c[1] - d[1]) +
            d[0] * (b[1] - a[1]) + c[0] * (a[1] - b[1])
        );
        if (M.near_zero(denom)) { return; }
        const s_num = (
            a[0] * (d[1] - c[1]) +
            c[0] * (a[1] - d[1]) +
            d[0] * (c[1] - a[1])
        );
        if (M.near_zero(s_num) || M.near_zero(s_num - denom)) { return; }
        const t_num = -(
            a[0] * (c[1] - b[1]) +
            b[0] * (a[1] - c[1]) +
            c[0] * (b[1] - a[1])
        );
        if (M.near_zero(t_num) || M.near_zero(t_num - denom)) { return; }
        const s = s_num / denom;
        const t = t_num / denom;
        if ((s < 0) || (1 < s) || (t < 0) || (1 < t)) { return; }
        const p = [
            a[0] + s * (b[0] - a[0]),
            a[1] + s * (b[1] - a[1])
        ];
        if (M.close(a, p, eps) || M.close(b, p, eps) ||
            M.close(c, p, eps) || M.close(d, p, eps)) {
            return;
        }
        return p;
    },
    bit_encode: (A) => {
        const B = [];
        for (let i = 0; i < A.length; i += 8) {
            let bite = 0;
            for (let j = 0; j < 8; ++j) {
                if (i + j < A.length) {
                    const b = A[i + j] - 1;
                    bite = bite | (b << j);
                }
            }
            B.push(bite);
        }
        return M.encode(B);
    },
    bit_decode: (B, n) => {
        if (n == 0) { return []; }
        const A = [];
        for (const bite of M.decode(B)) {
            for (let j = 0; j < 8; ++j) {
                A.push(((bite >> j) & 1) + 1);
                if (A.length == n) {
                    return A;
                }
            }
        }
        debugger; // input array shorter than requested length
    },
};
