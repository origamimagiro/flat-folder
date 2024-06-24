const L = 0, R = 1, X = 2, H = 3, N = 4;
export class AVL {
    #comp;
    #root;
    #free;
    #n;
    #A;
    #get(off, i) {
        return this.#A[i*N + off];
    }
    #set(off, i, v) {
        this.#A[i*N + off] = v;
    }
    #H(i) {
        return (i == undefined) ? 0 : this.#get(H, i);
    }
    #skew(i) {
        return this.#H(this.#get(R, i)) - this.#H(this.#get(L, i));
    }
    #update(i) {
        const hL = this.#H(this.#get(L, i))
        const hR = this.#H(this.#get(R, i));
        this.#set(H, i, 1 + ((hL < hR) ? hR : hL));
    }
    #obtain() {
        ++(this.#n);
        let i = this.#A.length/N;
        if (this.#free != undefined) {
            i = this.#free;
            this.#free = this.#get(R, i);
            this.#set(R, i);
        } else {
            for (let k = 0; k < N; ++k) { this.#A.push(undefined); }
        }
        return i;
    }
    #release(i) {
        --(this.#n);
        for (let k = 0; k < N; ++k) { this.#set(k, i); }
        this.#set(R, i, this.#free);
        this.#free = i;
    }
    #rotate(D, r, l) {
        const B = this.#get(l, D);  //  __D_      _B__
        const E = this.#get(r, D);  // _B_ E  =>  A _D_
        const d = this.#get(X, D);  // A C          C E
        const A = this.#get(l, B);
        const C = this.#get(r, B);
        const b = this.#get(X, B);
        this.#set(l,B,C);
        this.#set(r,B,E);
        this.#set(X,B,d);
        this.#set(l,D,A);
        this.#set(r,D,B);
        this.#set(X,D,b);
        this.#update(B);
        this.#update(D);
    }
    #maintain(P) { // maintains AVL property for all nodes in P, O(lg n)
        while (P.length > 0) {
            const i = P.pop();
            this.#update(i);
            const s = this.#skew(i);
            for (const [t, r, l] of [[1, R, L], [-1, L, R]]) {
                if (s != 2*t) { continue; }
                const j = this.#get(r, i);
                if (this.#skew(j) == -t) { this.#rotate(j, r, l); }
                this.#rotate(i, l, r);
            }
        }
    }
    #path(x) { // returns root path to x equiv, or possible parent, O(lg n)
        if (this.#root == undefined) { return []; }
        const P = [];
        let c;
        let i = this.#root;
        do {
            P.push(i);
            c = this.#comp(x, this.#get(X, i));
            i = this.#get((c < 0) ? L : R, i);
        } while ((c != 0) && (i != undefined));
        return P;
    }
    #adj(P, r) { // modifies P ending at i to its (r) successor, O(lg n)
        let i = P[P.length - 1];
        let j = this.#get(r, i);
        if (j == undefined) {
            P.pop();
            while (P.length > 0) {
                const p = P.pop();
                if (this.#get(r, p) != i) {
                    P.push(p);
                    break;
                }
                i = p;
            }
        } else {
            while (j != undefined) {
                P.push(j);
                j = this.#get(r ^ 1, j);
            }
        }
    }
    #seq = () => { // returns array of node indices in inorder traversal
        const out = [];
        const dfs = (i) => {
            if (i == undefined) { return; }
            dfs(this.#get(L, i));
            out.push(i);
            dfs(this.#get(R, i));
        };
        dfs(this.#root);
        return out;
    }
    constructor(comp = (a, b) => a - b) {
        this.#comp = comp;
        this.#n = 0;
        this.#A = [];
        this.#root = undefined;
        this.#free = undefined;
    }
    get length() {
        return this.#n;
    }
    insert(x) { // adds x, or returns x equiv if already in set, O(lg n)
        const i = this.#obtain();
        const P = this.#path(x);
        if (P.length == 0) {
            this.#root = i;
        } else {
            const p = P[P.length - 1];
            const x_ = this.#get(X, p);
            const c = this.#comp(x, x_);
            if (c == 0) {
                this.#release(i);
                return x_;
            }
            this.#set((c < 0) ? L : R, p, i);
        }
        this.#set(X, i, x);
        P.push(i);
        this.#maintain(P);
        return undefined;
    }
    #remove(P) {
        let i = P[P.length - 1];
        let r = R;
        let c = this.#get(R, i);
        if (c == undefined) {
            r = L
            c = this.#get(L, i);
        }
        while (c != undefined) {
            while (c != undefined) {
                P.push(c);
                c = this.#get(r ^ 1, c);
            }
            c = P[P.length - 1];
            this.#set(X, i, this.#get(X, c));
            i = c;
            c = this.#get(r, i);
        }
        P.pop(); this.#release(i);
        const p = P[P.length - 1];
        if (p == undefined) {
            this.#root = undefined;
        } else {
            this.#set((this.#get(L, p) == i) ? L : R, p);
            this.#maintain(P);
        }
    }
    remove(x) { // removes and returns x equiv, or undefined, O(lg n)
        if (this.#root == undefined) { return undefined; }
        const P = this.#path(x);
        let i = P[P.length - 1];
        const x_ = this.#get(X, i);
        if (this.#comp(x, x_) != 0) { return undefined; }
        this.#remove(P);
        return x_;
    }
    next(x, r = R) { // O(lg n)
        // if (r == R): returns smallest x_ in tree for which comp(x, x_) < 0
        // if (r == L): returns  largest x_ in tree for which comp(x, x_) > 0
        if (this.#root == undefined) { return undefined; }
        const P = this.#path(x);
        let i = P[P.length - 1];
        const c = this.#comp(x, this.#get(X, i));
        if ((c != 0) && ((r == R) == (c < 0))) { return this.#get(X, i); }
        this.#adj(P, r); i = P.pop();
        return (i == undefined) ? undefined : this.#get(X, i);
    }
    prev(x) {
        return this.next(x, L);
    }
    remove_next(x, r = R) {
        if (this.#root == undefined) { return undefined; }
        const P = this.#path(x);
        let i = P[P.length - 1];
        const c = this.#comp(x, this.#get(X, i));
        if (!((c != 0) && ((r == R) == (c < 0)))) {
            this.#adj(P, r); i = P.pop();
            if (i == undefined) { return undefined; }
            P.push(i);
        }
        const x_ = this.#get(X, i);
        this.#remove(P);
        return x_;
    }
    remove_prev(x) {
        return this.remove_next(x, L);
    }
    iter() {
        return this.#seq().map(i => this.#get(X, i));
    }
    str() { // print tree string to console, O(n lg n)
        const str = (i) => `${this.#get(X, i)}`;
        if (this.#root == undefined) { return "(empty)"; }
        const h = this.#H(this.#root);
        const w = this.#seq().reduce((a, i) => a + str(i).length, 0);
        const S = Array(h).fill(0).map(() => Array(w).fill(" "));
        let k = 0;
        const dfs = (i, d, t) => {
            if (i == undefined) { return k; }
            const l = this.#get(L, i);
            const r = this.#get(R, i);
            const s = str(i);
            const k0 = dfs(l, d + 1, L);
            const k1 = k;
            k += s.length;
            const k2 = k;
            const k3 = dfs(r, d + 1, R);
            for (let x = k0; x < k3; ++x) { S[d][x] = "_"; }
            for (let x = k1; x < k2; ++x) { S[d][x] = s[x - k1]; }
            return (t == L) ? k1 : k2;
        }; dfs(this.#root, 0);
        return S.map(R => R.join("")).join("\n");
    }
    print() { console.log(this.str()); }
    check() { // checks whether tree invarients are valid, O(n)
        const error = (s) => console.log(`***** CHECK FAILED: ${s} *****`);
        const S = this.#seq();
        let chk = (S.length == this.#n);
        let out = chk;
        if (!chk) { error("SIZE"); }
        for (const i of S) {
            const h = this.#H(i);
            this.#update(i);
            chk &&= (h == this.#H(i));
        }
        if (!chk) { error("HEIGHTS"); }
        out &&= chk;
        chk = true;
        for (let i = 1; i < S.length; ++i) {
            chk &&= (this.#comp(
                this.#get(X, S[i - 1]),
                this.#get(X, S[i])
            ) < 0);
        }
        if (!chk) { error("ORDER"); }
        return (out && chk);
    }
}
