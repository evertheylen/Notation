
// Initialize canvas, some stuff, and bind handlers
// ------------------------------------------------

var CV = undefined;
var CTX = undefined;

log = console.log;
drawing_key = undefined;

function dom_content_loaded(editable) {
    CV = document.getElementById("main_canvas");
    CTX = CV.getContext("2d");

    FRCV = document.getElementById("firstresponse_canvas");
    FRCTX = FRCV.getContext("2d");
    
    stored_color_mode = window.localStorage.getItem('color_mode')
    if (stored_color_mode == null) {
        stored_color_mode = 'light';
    }

    if (editable) {
        // Don't worry, the server will block if you don't have the proper credentials :)
        log("Enabling editing");
        ctx_menu = htmlToElement(ctx_menu_html);
        document.body.appendChild(ctx_menu);
        set_color_mode(stored_color_mode);
        FRCV.addEventListener("pointerdown", handle_start, false);
        FRCV.addEventListener("pointerup", handle_end, false);
        FRCV.addEventListener("pointercancel", handle_cancel, false);
        FRCV.addEventListener("pointerleave", handle_cancel, false); // cancel if cursor leaves window
        FRCV.addEventListener("pointermove", handle_move, false);

        document.addEventListener('contextmenu', on_context_menu);
        set_ctx_menu_handlers(ctx_menu);
        document.getElementById("contextmenu_link").style.display = 'block';
        document.getElementById("firstresponse_canvas").style.display = 'block';

        // CTRL+Z and CTRL+SHIFT+Z
        document.onkeydown = function(e) {
            if (e.keyCode == 90 && e.ctrlKey) {
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            }
        }
    } else {
        set_color_mode(stored_color_mode);
    }

    curves = preload_curves();
    curves_valid_index = curves.length-1;
    // init_history
    drawing_history = [
        {valid_index: curves_valid_index}
    ];
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, false);
    drawing_key = window.location.pathname.split('/')[2];
    log("Drawing key = '" + drawing_key + "'");
}

function resizeCanvas(evt) {
    CV.width = document.body.clientWidth;
    CV.height = document.body.clientHeight;
    redraw_all();
    FRCV.width = document.body.clientWidth;
    FRCV.height = document.body.clientHeight;
}


// Colors and dark/light mode
// --------------------------

var color_mode = undefined;

function set_color_mode(mode) {
    console.log("Setting color mode " + mode);
    if (mode === color_mode) return;
    color_mode = mode;

    document.body.className = color_mode;
    var switchmode = document.getElementById('switchmode');
    switchmode.textContent = {light: "Use Dark Mode", dark: "Use Light Mode"}[color_mode];

    redraw_all();

    var swatches = document.getElementsByClassName('pick-color');
    for (var i=0; i<swatches.length; i++) {
        var el = swatches[i];
        var el_color = el.getAttribute("data-color");
        el.style['background-color'] = colors[color_mode][el_color];
        el.onclick = (function(evt) {
            color = this.el_color;
            menu_action_done();
        }).bind({el_color: el_color});
    }

    var sizes = document.getElementsByClassName('pick-size');
    for (var i=0; i<sizes.length; i++) {
        var el = sizes[i];
        var dot = el.children[0];
        var size = parseInt(el.getAttribute("data-size"));
        dot.style.height = size + "px";
        dot.style.width = size + "px";
        el.onclick = (function(evt) {
            width_multiplier = this.size;
            menu_action_done();
        }).bind({size: size});
    }

    window.localStorage.setItem("color_mode", color_mode);
}

const colors = {
    dark: {
        default: '#caccce',
        gray: '#788084',
        brown: '#937264',
        orange: '#ffa344',
        yellow: '#ffdc49',
        green: '#4dab9a',
        blue: '#529cca',
        purple: '#9a6dd7',
        pink: '#e255a1',
        red: '#ff7369'
    },
    light: {
        default: '#37352f',
        gray: '#949ca0',
        brown: '#64473a',
        orange: '#d9730d',
        yellow: '#dfab01',
        green: '#0f7b6c',
        blue: '#0b6e99',
        purple: '#6940a5',
        pink: '#ad1a72',
        red: '#e03e3e'
    }
}


// Right click menu
// ----------------

var ctx_menu_html = `<div id="contextmenu">
<div class="menu-row">
    <span id="undo" class="menu-button">undo</span>
    <span id="clearcanvas" class="menu-button">clear</span>
    <span id="redo" class="menu-button">redo</span>
</div>
<div class="menu-item">
    <span class="pick-color" data-color="default"></span>
    <span class="pick-color" data-color="gray"></span>
    <span class="pick-color" data-color="brown"></span>
    <span class="pick-color" data-color="orange"></span>
    <span class="pick-color" data-color="yellow"></span>
    <br>
    <span class="pick-color" data-color="green"></span>
    <span class="pick-color" data-color="blue"></span>
    <span class="pick-color" data-color="purple"></span>
    <span class="pick-color" data-color="pink"></span>
    <span class="pick-color" data-color="red"></span>
</div>
<div class="menu-item">
    <span class="pick-size" data-size="3"><span class="dot"></span></span>
    <span class="pick-size" data-size="5"><span class="dot"></span></span>
    <span class="pick-size" data-size="8"><span class="dot"></span></span>
    <span class="pick-size" data-size="12"><span class="dot"></span></span>
    <span class="pick-size" data-size="17"><span class="dot"></span></span>
</div>
<div id="switchmode" class="menu-item link">Use Dark Mode</div>
</div>`

var ctx_menu = undefined;
var ctx_menu_reason = undefined;

function on_context_menu(evt) {
    ctx_menu_reason = 'rightclick';
    if (ctx_menu.style.display == 'block') {
        ctx_menu.style.display = 'none';
    } else {
        // Some non trivial logic to make sure menu is displayed correctly
        // First display but hide element so we know bounding rect
        ctx_menu.style.top = '5px';
        ctx_menu.style.removeProperty('bottom');
        ctx_menu.style.left = '5px';
        ctx_menu.style.removeProperty('right');
        
        ctx_menu.style.visibility = 'hidden';
        ctx_menu.style.display = 'block';

        var body_rect = document.body.getBoundingClientRect();
        var menu_rect = ctx_menu.getBoundingClientRect();

        if (evt.clientX + menu_rect.width + 8 > body_rect.width) {
            ctx_menu.style.removeProperty('left');
            ctx_menu.style.right = (body_rect.width - evt.clientX + 4) + 'px';
        } else {
            ctx_menu.style.left = (evt.clientX+4) + 'px';
            ctx_menu.style.removeProperty('right');
        }

        if (evt.clientY + menu_rect.height + 8 > body_rect.height) {
            ctx_menu.style.removeProperty('top');
            ctx_menu.style.bottom = (body_rect.height - evt.clientY + 4) + 'px';
        } else {
            ctx_menu.style.top = (evt.clientY+4) + 'px';
            ctx_menu.style.removeProperty('bottom');
        }
        
        ctx_menu.style.removeProperty('visibility');
    }
    evt.preventDefault();
}

function set_ctx_menu_handlers(ctx_menu) {
    document.getElementById("switchmode").onclick = function(evt) {
        if (color_mode === 'light') set_color_mode('dark');
        else set_color_mode('light');
        menu_action_done();
    };

    document.getElementById("clearcanvas").onclick = function(evt) {
        CTX.clearRect(0, 0, CV.width, CV.height);
        menu_action_done();
        add_to_history({
            valid_index: -1,
            clear_history: true
        });
        clear_history = true;
        be_drawing_set();
    }


    document.getElementById("undo").onclick = function(evt) {
        menu_action_done();
        undo();
    }

    document.getElementById("redo").onclick = function(evt) {
        menu_action_done();
        redo();
    }

    document.getElementById("contextmenu_link").onclick = function(evt) {
        if (ctx_menu.style.display == 'block') {
            ctx_menu.style.display = 'none';
        } else {
            ctx_menu_reason = 'menu';
            ctx_menu.style.top = '30px';
            ctx_menu.style.removeProperty('bottom');
            ctx_menu.style.left = '5px';
            ctx_menu.style.removeProperty('right');
            ctx_menu.style.display = 'block';
        }
    }
}

function menu_action_done() {
    if (ctx_menu_reason == 'rightclick') {
        ctx_menu.style.display = 'none';
    }
}

// Actual drawing state, history and functions
// -------------------------------------------

var color = 'default';
var width_multiplier = 5;

const smoothing = 0.1;
// There is no way to draw a bezier curve on a canvas with
// a different starting and ending thickness (without writing)
// your own render engine. So by limiting the maximum change
// in thickness, it hopefully looks fluent enough that 
// no one notices it.
const max_pressure_diff = 0.5;

// Drawing state
var ongoing_curves = {};
var curves = new Array();
var curves_valid_index = -1;
var drawing_history = null;  // to be set later
// points to current actual point in history
var current_history_index = 0;
var clear_history = false; // clear history if curve is added

function bounded(min, val, max) {
    return Math.max(Math.min(val, max), min);
}

function add_to_history(event) {
    // aka 'set_present' ?
    if (drawing_history[current_history_index].clear_history) {
        console.log("clearing history");
        drawing_history = [{valid_index: -1}];
        current_history_index = 0;
    } else {
        // remove future if necessary
        drawing_history = drawing_history.slice(0, current_history_index+1);
    }
    drawing_history.push(event);
    current_history_index = drawing_history.length - 1;
    curves_valid_index = event.valid_index;
}

function set_history(i) {
    if (i<0 || i>=drawing_history.length) {
        console.log("ignoring set_history", i);
        return;
    }

    curves_valid_index = drawing_history[i].valid_index;
    console.log("Setting history to", i, curves_valid_index);
    current_history_index = i;
    resizeCanvas();
    be_drawing_set();
}

function undo() {
    set_history(current_history_index-1);
}

function redo() {
    set_history(current_history_index+1);
}

function redraw_all() {
    for (var i=0; i<curves.length; i++) {
        var curve = curves[i];
        if (curve.index > curves_valid_index) break;
        redraw(curve);
    }
}

function redraw(curve) {
    var pts = curve.points;
    const len = pts.length;

    CTX.strokeStyle = colors[color_mode][curve.color];
    CTX.fillStyle = colors[color_mode][curve.color];

    CTX.beginPath();
    CTX.arc(pts[0].x, pts[0].y, pts[0].w/2, 0, 2*Math.PI);
    CTX.fill();
    if (len == 2) {
        straight_line(pts[0], pts[1], curve, CTX);
    } else if (len > 2) {
        bezier_line(pts[0], pts[0], pts[1], pts[2], curve);
        for (var i=1; i<len-2; i++) {
            bezier_line(pts[i-1], pts[i], pts[i+1], pts[i+2], curve);
        }
        bezier_line(pts[len-3], pts[len-2], pts[len-1], pts[len-1], curve);
    }
}

function straight_line(prev_point, point, curve, ctx) {
    ctx = ctx || FRCTX;
    ctx.beginPath();
    ctx.moveTo(prev_point.x, prev_point.y);
    ctx.lineTo(point.x, point.y);
    ctx.lineWidth = point.w;
    ctx.stroke();
}

function remove_straight_line(prev_point, point, curve) {
    FRCTX.globalCompositeOperation = 'destination-out';
    FRCTX.beginPath();
    FRCTX.moveTo(prev_point.x, prev_point.y);
    FRCTX.lineTo(point.x, point.y);
    FRCTX.lineWidth = point.w * 2;
    FRCTX.stroke();
    FRCTX.globalCompositeOperation = 'source-over';
}

function bezier_controlpoint(prev, cur, next, reverse) {
    const xd = prev.x - next.x;
    const yd = prev.y - next.y;
    
    const length = Math.sqrt(xd**2 + yd**2);
    const angle = Math.atan2(yd, xd) + (reverse ? Math.PI : 0);
    // So far, I have not been able to find a better formula
    // one that includes the speed would be cool
    const adjusted_length = Math.min(length*smoothing, length/5);

    return {
        x: cur.x + Math.cos(angle)*adjusted_length,
        y: cur.y + Math.sin(angle)*adjusted_length
    };
}

function bezier_line(a, b, c, d, curve) {
    // b and c are the actual points between which need to draw a bezier curve
    // a and d are the previous and next points
    const dist = Math.sqrt((b.x-c.x)**2 + (b.y-c.y)**2);

    if (c.w > 3) {
        CTX.beginPath();
        CTX.arc(c.x, c.y, c.w/2, 0, 2*Math.PI);
        CTX.fill();
    }

    if (dist <= 3) {
        straight_line(b, c, curve, CTX);
        return;
    }

    const c1 = bezier_controlpoint(a, b, c, true);
    const c2 = bezier_controlpoint(b, c, d, false);

    CTX.beginPath();
    CTX.moveTo(b.x, b.y);
    CTX.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, c.x, c.y);
    CTX.lineWidth = c.w;
    CTX.stroke();

    /*
    CTX.beginPath();
    CTX.arc(b.x, b.y, 8, 0, 2*Math.PI);
    CTX.strokeStyle = 'red';
    CTX.stroke();
    CTX.strokeStyle = 'black';

    [c1, c2].forEach(p => {
        CTX.beginPath();
        CTX.arc(p.x, p.y, 3, 0, 2*Math.PI);
        CTX.fillStyle = 'green';
        CTX.fill();
        CTX.fillStyle = 'black';
    });
    */
}

function add_and_draw_point(curve, point, is_end) {
    var pts = curve.points;
    pts.push(point);
    var len = pts.length;
    var prev_point = pts[len-2];

    // First we add the most immediate point as a simple line
    straight_line(prev_point, point, curve);

    // Then we do bezier stuff if possible :)
    if (len == 3) {
        remove_straight_line(pts[0], pts[1], curve);
        bezier_line(pts[0], pts[0], pts[1], pts[2], curve);
    } else if (len >= 4) {
        remove_straight_line(pts[len-3], pts[len-2], curve);
        bezier_line(pts[len-4], pts[len-3], pts[len-2], pts[len-1], curve);
    }

    if (is_end) {
        remove_straight_line(pts[len-2], pts[len-1], curve);
        bezier_line(pts[len-3], pts[len-2], pts[len-1], pts[len-1], curve);
    }
}

function event_to_point(evt, width_mult, prev_width) {
    var width = (prev_width == undefined) ? 
        (evt.pressure * width_mult) :
        bounded(prev_width - max_pressure_diff, evt.pressure * width_mult, prev_width + max_pressure_diff);

    return {
        x: evt.clientX, 
        y: evt.clientY,
        p: evt.pressure,
        w: width,
        t: Date.now(),
    };
}

function handle_start(evt) {
    // 1 -> actual drawing
    // 2 -> right mouse
    // 4 -> second button on my wacom
    if (evt.buttons === 1) {
        var pt = event_to_point(evt, width_multiplier);
        var curve = {
            index: curves_valid_index+1,
            color: color,
            width_multiplier: width_multiplier,
            points: [pt]
        };
        CTX.strokeStyle = colors[color_mode][curve.color];
        CTX.fillStyle = colors[color_mode][curve.color];
        FRCTX.strokeStyle = colors[color_mode][curve.color];
        ongoing_curves[evt.pointerId] = curve;

        CTX.beginPath();
        CTX.arc(pt.x, pt.y, pt.w/2, 0, 2*Math.PI);
        CTX.fill();
    }
    if (evt.buttons !== 2) {
        document.getElementById('contextmenu').style.display = 'none';
    }
} 

function handle_move(evt) {
    var curve = ongoing_curves[evt.pointerId];
    if (curve != undefined) {
        var pt = event_to_point(evt, curve.width_multiplier, curve.points[curve.points.length-1].w);
        add_and_draw_point(curve, pt);
    }
}

function finalize_curve(curve, pointer_id) {
    delete ongoing_curves[pointer_id];
    
    add_to_history({
        valid_index: curves_valid_index+1,
        clear_history: false
    });

    var last_valid_arr_index = -1;
    for (var i=curves.length-1; i>=0; i--) {
        var existing_curve = curves[i];
        if (existing_curve.index <= curves_valid_index-1) {
            last_valid_arr_index = i;
            break;
        }
    }
    curves = curves.slice(0, last_valid_arr_index+1);

    curves.push(curve);
    var pts = curve.points;
    var total_length = 0;
    var prev = pts[0];
    for (var i=1; i<pts.length; i++) {
        total_length += Math.sqrt((pts[i].x - prev.x)**2 + (pts[i].y - prev.y)**2);
        prev = pts[i];
    }
    const total_time = pts[pts.length-1].t - pts[0].t;
    const avg_time = total_time / pts.length;
    log("Average time between drawing points: ", avg_time);
    const avg_speed = total_length / total_time;
    log("Average speed: ", total_length);

    if (Object.keys(ongoing_curves).length === 0) {
        FRCTX.clearRect(0, 0, FRCV.width, FRCV.height);
    }

    be_curve_add(curve);
}

function handle_end(evt) {
    var curve = ongoing_curves[evt.pointerId];
    if (curve != undefined) {
        add_and_draw_point(curve, event_to_point(evt), true);
        finalize_curve(curve, evt.pointerId);
    }
}

function handle_cancel(evt) {
    var curve = ongoing_curves[evt.pointerId];
    if (curve != undefined) {
        // same as end, but don't draw (we don't have location info at all)
        finalize_curve(curve, evt.pointerId);
    }
}


// Backend communication
// ---------------------

function be_curve_add(curve) {
    fetch(window.origin + "/api/curve/add", {
        method: "POST",
        body: JSON.stringify({
            drawing_key: drawing_key,
            curve: curve
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    }).then(log).catch(log);
}

function be_drawing_set() {
    fetch(window.origin + "/api/drawing/set", {
        method: "POST",
        body: JSON.stringify({
            drawing_key: drawing_key,
            drawing: {
                valid_index: curves_valid_index
            }
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    }).then(log).catch(log);
}

// Utilities
// ---------

// https://stackoverflow.com/a/35385518
function htmlToElement(html) {
    var template = document.createElement('template');
    html = html.trim();
    template.innerHTML = html;
    return template.content.firstChild;
}
