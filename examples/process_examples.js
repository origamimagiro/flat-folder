#!/usr/bin/node

import { M      } from "../src/math.js";
import { CON    } from "../src/constraints.js";
import { X      } from "../src/conversion.js";
import { SOLVER } from "../src/solver.js";
import { NOTE   } from "../src/note.js";
import * as fs from 'fs';

const main = () => {
    const lim = 10000;
    const start = Date.now();
    NOTE.clear_log();
    NOTE.start();
    CON.build();
    const fold_files = [];
    for (const dataset of ["grids", "instagram"]) {
        const path = `./${dataset}/`;
        const files = fs.readdirSync(path);
        for (const file of files) {
            const ext = file.slice(-4);
            if (ext == "fold") {
                fold_files.push([dataset, file]);
            }
        }
    }
    const headers = ["dataset", "number", "author", "title", "vertices", 
        "edges", "faces", "eps", "variables", "taco-taco", "taco-tortilla", 
        "tortilla-tortilla", "transitivity", "reduced_trans", 
        "components", "limited", "states", "component_assignments"];
    const lines = [headers];
    for (const [dataset, file] of fold_files) {
        const data = fs.readFileSync(`./${dataset}/${file}`); 
        const fold = JSON.parse(data);
        fold.file_name = file;
        fold.dataset = dataset;
        fold.number = file.slice(0, 3);
        for (const eps of [300, 1000, 3000]) {
            NOTE.show = true;
            NOTE.time(`Processing file: ${fold.file_name} with eps = ${eps}`);
            NOTE.show = false;
            try {
                const D = process_file(fold, eps, lim);
                const L = [];
                for (const field of headers) {
                    L.push(D[field]);
                }
                lines.push(L.join(","));
                break;
            } catch (e) {
                NOTE.show = true;
                NOTE.time(`   - ERROR, trying new eps`);
            }
        }
    }
    fs.writeFileSync("./data.csv", lines.join("\n"));
}

const process_file = (fold, EPS, lim) => {
    M.EPS = EPS;
    const V  = fold.vertices_coords;
    const EV = fold.edges_vertices;
    const EA = fold.edges_assignment;
    const FV = fold.faces_vertices;
    const VV = X.V_FV_2_VV(V, FV);
    const [EF, FE] = X.EV_FV_2_EF_FE(EV, FV);
    const [Vf, Ff] = X.V_FV_EV_EA_2_Vf_Ff(V, FV, EV, EA);
    const L = EV.map((P) => M.expand(P, Vf));
    const eps = M.min_line_length(L) / M.EPS;
    const [P, SP, SE] = X.L_2_V_EV_EL(L, eps);
    const [,CP] = X.V_EV_2_VV_FV(P, SP);
    const [SC, CS] = X.EV_FV_2_EF_FE(SP, CP);
    const [CF, FC] = X.EF_FV_SP_SE_CP_SC_2_CF_FC(EF, FV, SP, SE, CP, SC);
    const ExE = X.SE_2_ExE(SE);
    const ExF = X.SE_CF_SC_2_ExF(SE, CF, SC);
    const BF = X.CF_2_BF(CF);
    const BT3 = X.FC_CF_BF_2_BT3(FC, CF, BF);
    const init_trans = NOTE.count_subarrays(BT3)/3;
    const [BT0, BT1, BT2] = X.BF_EF_ExE_ExF_BT3_2_BT0_BT1_BT2(BF, EF, ExE, ExF, BT3);
    const BT = BF.map((F,i) => [BT0[i], BT1[i], BT2[i], BT3[i]]);
    const BA0 = X.EF_EA_Ff_BF_2_BA0(EF, EA, Ff, BF);
    const [GB, GA] = SOLVER.solve(BF, BT, BA0, lim);
    const n = (GA == undefined) ? 0 : GA.reduce((s, A) => {
        return s*BigInt(A.length);
    }, BigInt(1));
    return {
        dataset: fold.dataset,
        number: fold.number,
        author: fold.file_author,
        title: fold.file_title,
        vertices: V.length,
        edges: EV.length,
        faces: FV.length,
        eps: EPS,
        variables: BF.length,
        "taco-taco": NOTE.count_subarrays(BT0)/6,
        "taco-tortilla": NOTE.count_subarrays(BT1)/3,
        "tortilla-tortilla": NOTE.count_subarrays(BT2)/2,
        transitivity: init_trans,
        reduced_trans: NOTE.count_subarrays(BT3)/3,
        components: GB.length,
        limited: !GA.reduce((s, A) => (s && (A.length != lim)), true),
        states: n,
        component_assignments: `|${GA.map((A) => A.length).join("|")}|`,
    };
};

main();
