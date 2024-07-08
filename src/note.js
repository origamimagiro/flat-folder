export const NOTE = {  // ANNOTATION
    show: true,
    lines: [],
    console: ((typeof document == "undefined")
        ? undefined : document.getElementById("console")),
    start: (label) => {
        TIME.start_main();
        if (label != undefined) {
            NOTE.time(label);
        }
    },
    lap: () => {
        const time = TIME.lap();
        NOTE.log(`   - Time elapsed: ${TIME.str(time)}`);
        return time;
    },
    start_check: (label, A, interval = 5000) => {
        const lim = (A == undefined) ? A : A.length;
        TIME.start_est(lim);
        NOTE.check_interval = interval;
        NOTE.check_label = label;
    },
    check: (i) => {
        if (TIME.read_est() > NOTE.check_interval) {
            if (TIME.est_lim != undefined) {
                NOTE.log(`    On ${
                    NOTE.check_label} ${i} out of ${
                    TIME.est_lim}, est time left: ${TIME.remaining(i)}`);
            } else {
                NOTE.log(`    On ${NOTE.check_label} ${i} of unknown`);
            }
            TIME.lap_est();
        }
    },
    annotate: (A, label) => {
        const main = `   - Found ${A.length} ${label}`;
        const detail = (A.length == 0) ? "" : `[0] = ${JSON.stringify(A[0])}`;
        NOTE.log(main.concat(detail));
    },
    time: (label) => {
        const time = (new Date()).toLocaleTimeString();
        NOTE.log(`${time} | ${label}`);
    },
    end: () => {
        const time = TIME.read_time();
        NOTE.log(`*** Total Time elapsed: ${TIME.str(time)} ***`);
        NOTE.log("");
        return time;
    },
    count: (A, label, div = 1) => {
        const n = Array.isArray(A) ? NOTE.count_subarrays(A)/div : A;
        NOTE.log(`   - Found ${n} ${label}`);
        return n;
    },
    log: (str) => {
        if (NOTE.show) {
            console.log(str);
            NOTE.lines.push(str);
            if (NOTE.console) {
                NOTE.console.value += str + '\n';
                NOTE.scroll();
            }
        }
    },
    scroll: () => {
        if (NOTE.console) {
            const c = NOTE.console;
            // clientHeight is 8 rows, so this will auto scroll if
            // console was scrolled within 3 rows of the bottom
            // when the new line appeared.
            if ((c.scrollHeight - c.scrollTop - c.clientHeight) < c.clientHeight/2) {
                c.scrollTop = c.scrollHeight;
            }
        }
    },
    clear_log: () => {
        NOTE.lines = [];
        if (NOTE.console) {
            NOTE.console.value = "";
        }
    },
    count_subarrays: (A) => {
        let n = 0;
        for (const adj of A) {
            n += adj.length;
        }
        return n;
    },
};

const TIME = {  // TIME
    main_start: 0, main_lap: 0,
    est_start:  0, est_lap:  0, est_lim: 0,
    start_main: () => {
        TIME.main_start = Date.now();
        TIME.main_lap = TIME.main_start;
    },
    read_time: () => Date.now() - TIME.main_start,
    lap: () => {
        const stop = Date.now();
        const time = stop - TIME.main_lap;
        TIME.main_lap = stop;
        return time;
    },
    read_est: () => Date.now() - TIME.est_lap,
    start_est: (lim) => {
        TIME.est_start = Date.now();
        TIME.est_lap = TIME.est_start;
        TIME.est_lim = lim;
    },
    lap_est: () => (TIME.est_lap = Date.now()),
    remaining: (i) => {
        return TIME.str((Date.now() - TIME.est_start)*(TIME.est_lim/i - 1));
    },
    str: (time) => {
        if (time < 1000) {
            const milli = Math.ceil(time);
            return `${milli} millisecs`;
        } else if (time < 60000) {
            const secs = Math.ceil(time / 1000);
            return `${secs} secs`;
        } else {
            const mins = Math.floor(time / 60000);
            const secs = Math.ceil((time - mins*60000) / 1000);
            return `${mins} mins ${secs} secs`;
        }
    },
};
