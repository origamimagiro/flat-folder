import { SOLVER } from "./solver.js";
import { X } from "./conversion.js";
import { CON } from "./constraints.js";

const route = { SOLVER, X };

// Handle requests from UI thread
onmessage = event => {
    if(!event.ports[0]) return;
    const data = event.data;
    const result = route[data.action][data.name](...data.args);
    event.ports[0].postMessage(result);
}

CON.build();