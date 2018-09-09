
document.addEventListener("DOMContentLoaded", function(evt) {
    var new_drawing = document.getElementById("new_drawing");
    new_drawing.onclick = function() {
        fetch(window.origin + "/api/drawing/add", {
            method: "POST",
        }).then(res => res.json())
        .then(resp => {
            document.getElementById("drawing_url_container").style.display = 'block';
            document.getElementById("drawing_url").value = resp.url;
            document.getElementById("drawing_url2").href = resp.url;
        })
        .catch(console.log);
    }
})
