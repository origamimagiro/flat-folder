
/** This sends the NOTE operations back to the UI thread. */
export const NOTE = new Proxy({}, {
    get(target, name) {
        target[name] = target[name] || function(...args) {
            postMessage({ name, args });
        };
        return target[name];
    }
});