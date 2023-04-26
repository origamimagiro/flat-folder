
/** This sends the NOTE operations back to the UI thread. */
export const NOTE = new Proxy({}, {
    get(target, name) {
        target[name] = target[name] || function(...args) {
            if(name == "start_check") {
                last_check = performance.now();
            }
            if(name == "check") {
                const now = performance.now();
                if(now - last_check < 5000) return;
                else last_check = now;
            }
            postMessage({ name, args });
        };
        return target[name];
    }
});

let last_check = performance.now();
