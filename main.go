package main

import (
	"context"
	"encoding/json"
	"html/template"
	"net/http"
	"strings"

	"google.golang.org/appengine"
	"google.golang.org/appengine/datastore"
	"google.golang.org/appengine/log"
	"google.golang.org/appengine/user"
)

// Datastore Types
// ----------------------------------------------

// User proxies the default appengine user
type User user.User

// Drawing is made out of Curves
type Drawing struct {
	// parent should be a user
}

// Curve contains points
type Curve struct {
	Color           string  `json:"color"`
	WidthMultiplier float64 `json:"width_multiplier"`
	Points          []Point `json:"points"`
}

// Point represents a single measurement of the pen
type Point struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Pressure float64 `json:"p"`
	Width    float64 `json:"w"`
	// milliseconds since epoch
	Time int64 `json:"t"`
}

// Handlers
// ----------------------------------------------

/*
.Funcs(template.FuncMap{
	"toJSON": func(v interface{}) template.JS {
		a, err := json.Marshal(v)
		if err != nil {
			panic(err)
		}
		return template.JS(a)
	},
})
*/

var templates map[string]*template.Template

func main() {
	http.HandleFunc("/", root)
	http.HandleFunc("/d/", drawing)
	http.HandleFunc("/api/curve/add", curveAdd)
	http.HandleFunc("/api/drawing/add", drawingAdd)
	http.HandleFunc("/api/drawing/clear", drawingClear)
	// /static defined inside app.yaml

	funcMap := template.FuncMap{
		"toJSON": func(v interface{}) template.JS {
			a, err := json.Marshal(v)
			if err != nil {
				panic(err)
			}
			return template.JS(a)
		},
	}

	templates = make(map[string]*template.Template)
	templates["index_user"], _ = template.New("index_user.html").Funcs(funcMap).ParseFiles("templates/base.html", "templates/index_user.html")
	templates["index_public"], _ = template.New("index_public.html").Funcs(funcMap).ParseFiles("templates/base.html", "templates/index_public.html")
	templates["drawing"], _ = template.New("drawing.html").Funcs(funcMap).ParseFiles("templates/base.html", "templates/drawing.html")

	appengine.Main()
}

func root(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	u := user.Current(ctx)
	data := make(map[string]interface{})

	if u == nil {
		// not logged in
		log.Infof(ctx, "Showing homepage")

		url, err := user.LoginURL(ctx, "/")
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		data["login_url"] = url

		err = templates["index_public"].Execute(w, &data)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
	} else {
		// logged in
		log.Infof(ctx, "Showing user page")
		data["user"] = u

		// upsert user
		k := datastore.NewKey(ctx, "User", u.ID, 0, nil)
		k, err := datastore.Put(ctx, k, u)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		url, err := user.LogoutURL(ctx, "/")
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		data["logout_url"] = url

		err = templates["index_user"].Execute(w, &data)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
	}
}

func drawing(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	log.Infof(ctx, "Showing a drawing")
	uk := getUserKey(ctx)
	data := make(map[string]interface{})
	drawingID := strings.TrimPrefix(r.URL.Path, "/d/")
	k, err := datastore.DecodeKey(drawingID)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	var drawing Drawing
	err = datastore.Get(ctx, k, &drawing)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	curves := make([]Curve, 0)
	_, err = datastore.NewQuery("Curve").Ancestor(k).GetAll(ctx, &curves)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	data["editable"] = (uk != nil && *k.Parent() == *uk)
	data["drawing"] = drawing
	data["curves"] = curves

	err = templates["drawing"].Execute(w, &data)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
}

// API handlers
// ----------------------------------------------

func curveAdd(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	uk := getUserKey(ctx)
	if uk == nil {
		http.Error(w, "Not logged in", 401)
		return
	}

	var info struct {
		Drawing string `json:"drawing"`
		Curve   Curve  `json:"curve"`
	}

	decoder := json.NewDecoder(r.Body)
	err := decoder.Decode(&info)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	dk, err := datastore.DecodeKey(info.Drawing)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	if *dk.Parent() != *uk {
		http.Error(w, "Not authorized", 401)
		return
	}

	ck := datastore.NewIncompleteKey(ctx, "Curve", dk)
	_, err = datastore.Put(ctx, ck, &info.Curve)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
}

func drawingAdd(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	uk := getUserKey(ctx)
	k := datastore.NewIncompleteKey(ctx, "Drawing", uk)
	k, err := datastore.Put(ctx, k, new(Drawing))
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	renderJSON(w, map[string]string{
		"url": "https://" + r.Host + "/d/" + k.Encode(),
	})
}

func drawingClear(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	u := user.Current(ctx)
	log.Debugf(ctx, "API user: %s", u.Email)
}

// Utilities
// ----------------------------------------------

func parseTemplate(name string) *template.Template {
	t, err := template.New("templates/" + name).Funcs(template.FuncMap{
		"toJSON": func(v interface{}) template.JS {
			a, err := json.Marshal(v)
			if err != nil {
				panic(err)
			}
			return template.JS(a)
		},
	}).ParseFiles("templates/base.html")
	if err != nil {
		panic(err)
	}
	return t
}

func renderJSON(w http.ResponseWriter, data interface{}) (err error) {
	js, err := json.Marshal(data)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, err = w.Write(js)
	return
}

func getUserKey(ctx context.Context) *datastore.Key {
	u := user.Current(ctx)
	if u == nil {
		return nil
	}
	return datastore.NewKey(ctx, "User", u.ID, 0, nil)
}
