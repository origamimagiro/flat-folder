import { M }      from "./math.js";
import { NOTE }   from "./note.js";
import { CON }    from "./constraints.js";
import { SVG }    from "./svg.js";
import { IO }     from "./io.js";
import { X }      from "./conversion.js";
import { GUI }    from "./gui.js";
import { SOLVER } from "./solver.js";
import { PAR }    from "./parallel.js";

if("window" in globalThis) {
    window.onload = () => BATCH.main();   // entry point
}

let W;
export const BATCH = {
    main: async () => {
        NOTE.time("Computing constraint implication maps");
        CON.build();
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
        document.getElementById("import").onchange = async (e) => {
            const files = e.target.files;
            const val = document.getElementById("limit_select").value;
            const lim = (val == "all") ? Infinity : +val;
            const thr = document.getElementById("thread_select").value;
            const max_t = (thr == "all") ? Infinity : +thr;
            const lines = await BATCH.process_files(files, lim, max_t,
                async f => await new Promise((res) => {
                    const file_reader = new FileReader();
                    file_reader.onload = async (e) => res(e.target.result);
                    file_reader.readAsText(f);
                }),
                f => f.name.slice(0, 3),
            );
            const data = new Blob([lines.join("\n")], {type: "text/plain"});
            const ex = SVG.clear("export");
            const link = document.createElement("a");
            const button = document.createElement("input");
            ex.appendChild(link);
            link.appendChild(button);
            link.setAttribute("download", `output.csv`);
            link.setAttribute("href", window.URL.createObjectURL(data));
            button.setAttribute("type", "button");
            button.setAttribute("value", "csv");
        };
    },
    process_files: async (files, lim, max_t, file_2_data, file_2_number) => {
        NOTE.clear_log();
        NOTE.start();
        const wn = ((window.Worker == undefined) ? 1
            : Math.min((navigator.hardwareConcurrency ?? 8), max_t));
        if ((wn != undefined) && (wn > 1)) {
            W = await PAR.get_workers(wn, "./src/worker.js");
        }
        const headers = [];
        const lines = [];
        for (const file of files) {
            const data = await file_2_data(file);
            const fold = JSON.parse(data);
            fold.number = file_2_number(file);
            NOTE.show = true;
            NOTE.time(`Processing file #${fold.number}: ${fold.file_title}`);
            NOTE.show = false;
            try {
                const D = await BATCH.process_file(fold, lim, max_t);
                if (headers.length == 0) {
                    for (const key of Object.keys(D)) { headers.push(key); }
                    lines.push(headers.join(","));
                }
                const L = [];
                for (const val of Object.values(D)) { L.push(val); }
                lines.push(L.join(","));
            } catch { console.log(" -- error, skipping"); }
        }
        NOTE.show = true;
        NOTE.end();
        return lines;
    },
    process_file: async (fold, lim, max_t) => {
        const t0 = performance.now();
        const V  = fold.vertices_coords;
        const EV = fold.edges_vertices;
        const EA = fold.edges_assignment;
        const FV = fold.faces_vertices;
        const VV = X.V_FV_2_VV(V, FV);
        const [EF, FE] = X.EV_FV_2_EF_FE(EV, FV);
        const [Vf, Ff] = X.V_FV_EV_EA_2_Vf_Ff(V, FV, EV, EA);
        const L = EV.map((P) => M.expand(P, Vf));
        const [P, SP, SE, eps_i] = X.L_2_V_EV_EL(L);
        if (P.length == 0) {
            console.log("(Precision Error: could not find stable graph)");
            throw new Error();
        }
        const eps = 2**eps_i;
        const [,CP] = X.V_EV_2_VV_FV(P, SP);
        const [SC, CS] = X.EV_FV_2_EF_FE(SP, CP);
        const [CF, FC] = X.EF_FV_SP_SE_CP_SC_2_CF_FC(EF, FV, SP, SE, CP, SC);
        const BF = X.EF_SP_SE_CP_CF_2_BF(EF, SP, SE, CP, CF);
        const BI = new Map();
        const num = {};
        let BT;
        {
            for (const [i, F] of BF.entries()) { BI.set(F, i); }
            const ExE = X.SE_2_ExE(SE);
            const ExF = X.SE_CF_SC_2_ExF(SE, CF, SC);
            const [BT0, BT1, BT2] = X.BF_BI_EF_ExE_ExF_2_BT0_BT1_BT2(
                BF, BI, EF, ExE, ExF);
            num.BT0 = NOTE.count_subarrays(BT0)/6;
            num.BT1 = NOTE.count_subarrays(BT1)/2;
            num.BT2 = NOTE.count_subarrays(BT2)/2;
            let BT3x;
            if (W != undefined) {
                BT3x = await X.FC_BF_BI_BT0_BT1_W_2_BT3x(
                    FC, BF, BI, BT0, BT1, W);
            } else {
                BT3x = X.FC_BF_BI_BT0_BT1_2_BT3x(FC, BF, BI, BT0, BT1);
            }
            let BT3, nx;
            if (W != undefined) {
                [BT3, nx] = await X.FC_CF_BF_BT3x_W_2_BT3(FC, CF, BF, BT3x, W);
            } else {
                [BT3, nx] = X.EF_SP_SE_CP_FC_CF_BF_BT3x_2_BT3(
                    EF, SP, SE, CP, FC, CF, BF, BT3x);
            }
            num.red_trans = NOTE.count_subarrays(BT3)/3;
            num.tot_trans = nx + num.red_trans;
            BT = BF.map((F,i) => [BT0[i], BT1[i], BT2[i], BT3[i]]);
        }
        const BA0 = SOLVER.EF_EA_Ff_BF_BI_2_BA0(EF, EA, Ff, BF, BI);
        const out = SOLVER.initial_assignment(BA0, BF, BT, BI);
        if ((out.length == 3) && (out[0].length == undefined)) {
            const [type, F, E] = out;
            console.log(` - Unable to resolve ${CON.names[type]} on faces [${F}]`);
            throw new Error();
        }
        const BA = out;
        const GB = SOLVER.get_components(BI, BF, BT, BA);
        NOTE.count(GB.length - 1, "unassigned components");
        const t1 = performance.now();
        const GA = SOLVER.solve(BI, BF, BT, BA, GB, lim);
        if (GA.length == undefined) {
            console.log(`   - Unable to resolve component ${GA}`);
            throw new Error();
        }
        const n = GA.reduce((s, A) => s*BigInt(A.length), BigInt(1));
        NOTE.count(n, "folded states");
        const t2 = performance.now();
        return {
            number: fold.number,
            author: fold.file_author,
            title: fold.file_title,
            vertices: V.length,
            edges: EV.length,
            faces: FV.length,
            eps: eps,
            variables: BF.length,
            "taco-taco": num.BT0,
            "taco-tortilla": num.BT1,
            "tortilla-tortilla": num.BT2,
            transitivity: num.tot_trans,
            reduced_trans: num.red_trans,
            components: GB.length,
            limited: (GA.reduce((s, A) => (s && (A.length != lim)), true)
                ? "no limit" : lim),
            states: n,
            component_assignments: `|${GA.map((A) => A.length).join("|")}|`,
            setup_sec: Math.round((10**6)*(t1 - t0))/(10**9),
            solve_sec: Math.round((10**6)*(t2 - t1))/(10**9),
        };
    },
};
