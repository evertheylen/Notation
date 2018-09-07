
// TODO
// [ ] incorporate speed info into smoothing
// [ ] limit pressure change to prevent chopped up lines
// [ ] make redraw quicker
// [ ] benchmark


// Initialize canvas and bind handlers
// -----------------------------------

var CV = undefined;
var CTX = undefined;

log = console.log;

document.addEventListener("DOMContentLoaded", function(event) {
    CV = document.getElementById("main_canvas");
    CTX = CV.getContext("2d");
    CTX.strokeStyle = 'black';

    FRCV = document.getElementById("firstresponse_canvas");
    FRCTX = FRCV.getContext("2d");
    FRCTX.strokeStyle = 'black';
    FRCV.addEventListener("pointerdown", handle_start, false);
    FRCV.addEventListener("pointerup", handle_end, false);
    FRCV.addEventListener("pointercancel", handle_cancel, false);
    FRCV.addEventListener("pointerleave", handle_cancel, false); // cancel if cursor leaves window
    FRCV.addEventListener("pointermove", handle_move, false);
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, false);
});

function resizeCanvas(evt) {
    CV.width = document.body.clientWidth;
    CV.height = document.body.clientHeight;
    redraw();
    FRCV.width = document.body.clientWidth;
    FRCV.height = document.body.clientHeight;
}


// Actual drawing state and functions
// ----------------------------------

const smoothing = 0.1;

// Drawing state
var ongoing_curves = {};
var curves = new Array();

function redraw() {
    curves.forEach(function(arr) {
        const len = arr.length;
        // TODO handle lines with len < 4
        bezier_line(arr[0], arr[0], arr[1], arr[2]);
        for (var i=1; i<len-2; i++) {
            bezier_line(arr[i-1], arr[i], arr[i+1], arr[i+2]);
        }
        bezier_line(arr[len-3], arr[len-2], arr[len-1], arr[len-1]);
    });
}

function straight_line(prev_point, point) {
    FRCTX.beginPath();
    FRCTX.moveTo(prev_point.x, prev_point.y);
    FRCTX.lineTo(point.x, point.y);
    FRCTX.lineWidth = point.pressure * 5;
    FRCTX.stroke();
}

function remove_straight_line(prev_point, point) {
    FRCTX.globalCompositeOperation = 'destination-out';
    FRCTX.beginPath();
    FRCTX.moveTo(prev_point.x, prev_point.y);
    FRCTX.lineTo(point.x, point.y);
    FRCTX.lineWidth = point.pressure * 10;
    FRCTX.stroke();
    FRCTX.globalCompositeOperation = 'source-over';
}

function bezier_controlpoint(prev, cur, next, reverse) {
    const xd = prev.x - next.x;
    const yd = prev.y - next.y;
    
    const length = Math.sqrt(xd**2 + yd**2) * smoothing;  // TODO include speed info
    const angle = Math.atan2(yd, xd) + (reverse ? Math.PI : 0);
    
    return {
        x: cur.x + Math.cos(angle)*length,
        y: cur.y + Math.sin(angle)*length
    };
}

function bezier_line(a, b, c, d) {
    // b and c are the actual points between which need to draw a bezier curve
    // a and d are the previous and next points
    const c1 = bezier_controlpoint(a, b, c, true);
    const c2 = bezier_controlpoint(b, c, d, false);

    CTX.beginPath();
    CTX.moveTo(b.x, b.y);
    CTX.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, c.x, c.y);
    CTX.lineWidth = c.pressure * 5; // TODO
    CTX.stroke();
}

function add_and_draw_point(arr, point, is_end) {
    const len = arr.length;
    const prev_point = arr[len-1];

    // First we add the most immediate point as a simple line
    straight_line(prev_point, point);

    // Then we do bezier stuff if possible :)
    if (len == 3) {
        remove_straight_line(arr[0], arr[1]);
        bezier_line(arr[0], arr[0], arr[1], arr[2]);
    } else if (len >= 4) {
        remove_straight_line(arr[len-3], arr[len-2]);
        bezier_line(arr[len-4], arr[len-3], arr[len-2], arr[len-1]);
    }
    
    if (is_end) {
        remove_straight_line(arr[len-2], arr[len-1]);
        bezier_line(arr[len-3], arr[len-2], arr[len-1], arr[len-1]);
    }

    //CTX.beginPath();
    //CTX.arc(point.x, point.y, 10, 0, 2*Math.PI);
    //CTX.strokeStyle = 'red';
    //CTX.stroke();
    
    arr.push(point);
}

function event_to_point(evt) {
    return {
        x: evt.clientX, 
        y: evt.clientY,
        pressure: evt.pressure,
        time: new Date()
    };
}

function handle_start(evt) {
    log("pointerdown: id = " + evt.pointerId);

    var points = [event_to_point(evt)];
    ongoing_curves[evt.pointerId] = points;
} 

function handle_move(evt) {
    console.log(evt);

    var arr = ongoing_curves[evt.pointerId];
    if (arr != undefined) {
        add_and_draw_point(arr, event_to_point(evt));
    }
}

function finalize_curve(arr, pointer_id) {
    delete ongoing_curves[pointer_id];
    if (arr.length >= 2) {
        curves.push(arr);
    }
    if (Object.keys(ongoing_curves).length === 0) {
        FRCTX.clearRect(0, 0, FRCV.width, FRCV.height);
    }
    // TODO: print benchmark info based on timings
}

function handle_end(evt) {
    log("pointerup");
    
    var arr = ongoing_curves[evt.pointerId];
    if (arr != undefined) {
        add_and_draw_point(arr, event_to_point(evt), true);
        finalize_curve(arr, evt.pointerId);
    }
}

function handle_cancel(evt) {
    log("pointercancel");
    
    var arr = ongoing_curves[evt.pointerId];
    if (arr != undefined) {
        // same as end, but don't draw (we don't have location info at all)
        finalize_curve(arr, evt.pointerId);
    }
}
