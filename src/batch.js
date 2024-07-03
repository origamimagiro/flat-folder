import { M }        from "./math.js";
import { NOTE }     from "./note.js";
import { CON }      from "./constraints.js";
import { SVG }      from "./svg.js";
import { IO }       from "./io.js";
import { X }        from "./conversion.js";
import { GUI }      from "./gui.js";
import { SOLVER }   from "./solver.js";

const main = async () => {
    NOTE.clear_log();
    NOTE.start();
    const limit_select = document.getElementById("limit_select");
    for (const val of ["all", 10000, 1000, 100, 10, 1]) {
        const el = document.createElement("option");
        el.setAttribute("value", val);
        el.textContent = val;
        limit_select.appendChild(el);
    }
    let W = undefined;
    const wn = navigator.hardwareConcurrency ?? 8;
    if ((window.Worker != undefined) && (wn != 1)) {
        NOTE.time(`*** Setting up ${wn} web workers ***`);
        W = Array(wn).fill()
            .map(() => new Worker("./src/worker.js", {type: "module"}));
        for (const w of W) { w.onerror = (e) => { debugger; }; }
        await X.send_work(W, "init", wi => [wi]);
    }
    const headers = ["number", "author", "title", "vertices",
        "edges", "faces", "eps", "variables", "taco-taco", "taco-tortilla",
        "tortilla-tortilla", "transitivity", "reduced_trans",
        "components", "limited", "states", "component_assignments"];
    document.getElementById("import").onchange = async (e) => {
        const val = document.getElementById("limit_select").value;
        const lim = (val == "all") ? Infinity : +val;
        const lines = [headers.join(",")];
        for (let i = 0; i < e.target.files.length; ++i) {
            NOTE.start();
            const file = e.target.files[i];
            const data = await new Promise((res) => {
                const file_reader = new FileReader();
                file_reader.onload = async (e) => res(e.target.result);
                file_reader.readAsText(file);
            });
            const fold = JSON.parse(data);
            fold.number = file.name.slice(0, 3);
            NOTE.show = true;
            NOTE.time(`Processing file: ${file.name}`);
            NOTE.show = false;
            try {
                const D = await process_file(fold, lim, W);
                lines.push(headers.map(f => D[f]).join(","));
            } catch { console.log(" -- error, skipping"); }
        }
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
    NOTE.time("Computing constraint implication maps");
    CON.build();
    NOTE.end();
};

const process_file = async (fold, lim, W) => {
    const V  = fold.vertices_coords;
    const EV = fold.edges_vertices;
    const EA = fold.edges_assignment;
    const FV = fold.faces_vertices;
    const VV = X.V_FV_2_VV(V, FV);
    const [EF, FE] = X.EV_FV_2_EF_FE(EV, FV);
    const [Vf, Ff] = X.V_FV_EV_EA_2_Vf_Ff(V, FV, EV, EA);
    const L = EV.map((P) => M.expand(P, Vf));
    const [P, SP, SE, eps_i] = X.L_2_V_EV_EL(L);
    const eps = 2**eps_i;
    const [,CP] = X.V_EV_2_VV_FV(P, SP);
    const [SC, CS] = X.EV_FV_2_EF_FE(SP, CP);
    const [CF, FC] = X.EF_FV_SP_SE_CP_SC_2_CF_FC(EF, FV, SP, SE, CP, SC);
    const ExE = X.SE_2_ExE(SE);
    const ExF = X.SE_CF_SC_2_ExF(SE, CF, SC);
    const BF = ((W == undefined) ?
        X.EF_SP_SE_CP_CF_2_BF(EF, SP, SE, CP, CF) :
        (await X.CF_W_2_BF(CF, W))
    );
    const BT3 = ((W == undefined) ?
        X.EF_SP_SE_CP_FC_CF_BF_2_BT3(EF, SP, SE, CP, FC, CF, BF) :
        (await X.FC_CF_BF_W_2_BT3(FC, CF, BF, W))
    );
    const init_trans = NOTE.count_subarrays(BT3)/3;
    const [BT0, BT1, BT2] = await X.BF_EF_ExE_ExF_BT3_2_BT0_BT1_BT2(
        BF, EF, ExE, ExF, BT3);
    await X.BF_BT0_BT1_BT3_2_clean_BT3(BF, BT0, BT1, BT3);
    const BT = BF.map((F,i) => [BT0[i], BT1[i], BT2[i], BT3[i]]);
    const BA0 = X.EF_EA_Ff_BF_2_BA0(EF, EA, Ff, BF);
    const [GB, GA] = SOLVER.solve(BF, BT, BA0, lim);
    const n = (GA == undefined) ? 0 : GA.reduce((s, A) => {
        return s*BigInt(A.length);
    }, BigInt(1));
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
    };
};

main();
