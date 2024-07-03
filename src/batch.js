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

export const BATCH = {
    W: undefined,
    main: async () => {
        const wn = ((window.Worker == undefined) ? 1
            : (navigator.hardwareConcurrency ?? 8));
        await BATCH.startup(wn, "./src/worker.js");
        const limit_select = document.getElementById("limit_select");
        for (const val of ["all", 10000, 1000, 100, 10, 1]) {
            const el = document.createElement("option");
            el.setAttribute("value", val);
            el.textContent = val;
            limit_select.appendChild(el);
        }
        document.getElementById("import").onchange = async (e) => {
            const files = e.target.files;
            const val = document.getElementById("limit_select").value;
            const lim = (val == "all") ? Infinity : +val;
            const lines = await BATCH.process_files(files, lim,
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
    startup: async (wn = 1, path) => {
        NOTE.time("Computing constraint implication maps");
        CON.build();
        if (wn != 1) { BATCH.W = await PAR.get_workers(wn, path); }
    },
    headers: [
        "number", "author", "title", "vertices",
        "edges", "faces", "eps", "variables", "taco-taco", "taco-tortilla",
        "tortilla-tortilla", "transitivity", "reduced_trans",
        "components", "limited", "states", "component_assignments",
        "setup_sec", "solve_sec"
    ],
    process_files: async (files, lim, file_2_data, file_2_number) => {
        NOTE.clear_log();
        NOTE.start();
        const lines = [BATCH.headers.join(",")];
        for (const file of files) {
            const data = await file_2_data(file);
            const fold = JSON.parse(data);
            fold.number = file_2_number(file);
            NOTE.show = true;
            NOTE.time(`Processing file: ${fold.file_title}`);
            NOTE.show = false;
            try {
                const D = await BATCH.process_file(fold, lim);
                lines.push(BATCH.headers.map(f => D[f]).join(","));
            } catch { console.log(" -- error, skipping"); }
        }
        NOTE.show = true;
        NOTE.end();
        return lines;
    },
    process_file: async (fold, lim) => {
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
        const ExE = X.SE_2_ExE(SE);
        const ExF = X.SE_CF_SC_2_ExF(SE, CF, SC);
        const BF = X.EF_SP_SE_CP_CF_2_BF(EF, SP, SE, CP, CF);
        const BT3 = ((BATCH.W == undefined) ?
            X.EF_SP_SE_CP_FC_CF_BF_2_BT3(EF, SP, SE, CP, FC, CF, BF) :
            (await X.FC_CF_BF_W_2_BT3(FC, CF, BF, BATCH.W))
        );
        const init_trans = NOTE.count_subarrays(BT3)/3;
        const [BT0, BT1, BT2] = X.BF_EF_ExE_ExF_BT3_2_BT0_BT1_BT2(
            BF, EF, ExE, ExF, BT3);
        X.BF_BT0_BT1_BT3_2_clean_BT3(BF, BT0, BT1, BT3);
        const BT = BF.map((F,i) => [BT0[i], BT1[i], BT2[i], BT3[i]]);
        const out = SOLVER.initial_assignment(EF, EA, Ff, BF, BT);
        if (out.length == 3) {
            const [type, F, E] = out;
            console.log(` - Unable to resolve ${CON.names[type]} on faces [${F}]`);
            throw new Error();
        }
        const [BI, BA] = out;
        const GB = SOLVER.get_components(BI, BF, BT, BA);
        const t1 = performance.now();
        const GA = SOLVER.solve(BI, BF, BT, BA, GB, lim);
        if (GA.length == undefined) {
            console.log(`   - Unable to resolve component ${GA}`);
            throw new Error();
        }
        const n = GA.reduce((s, A) => s*BigInt(A.length), BigInt(1));
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
            "taco-taco": NOTE.count_subarrays(BT0)/6,
            "taco-tortilla": NOTE.count_subarrays(BT1)/3,
            "tortilla-tortilla": NOTE.count_subarrays(BT2)/2,
            transitivity: init_trans,
            reduced_trans: NOTE.count_subarrays(BT3)/3,
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
