#!/usr/bin/node

import { BATCH  } from "../src/batch.js";
import * as fs from 'fs';
import { cpus } from 'os';

const main = async () => {
    const lim = 1;              // limit number of solutions to compute
    const dataset = "process";  // folder from which to process files
    const wn = cpus().length;
    await BATCH.startup(wn, "./../src/worker.js");
    const path = "./" + dataset + "/";
    const files = fs.readdirSync(path).filter(f => f.slice(-4) == "fold");
    const lines = await BATCH.process_files(files, lim,
        async f => fs.readFileSync(path + f), f => f.slice(0, 3));
    fs.writeFileSync("./data.csv", lines.join("\n"));
};

main();
