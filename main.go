package main

import (
	"context"
	"encoding/json"
	"html/template"
	"net/http"
	"strings"

	"google.golang.org/appengine"
	"google.golang.org/appengine/datastore"
	//"cloud.google.com/go/datastore"
	"google.golang.org/appengine/log"
	"google.golang.org/appengine/user"
)

// Datastore Types
// ----------------------------------------------

// User proxies the default appengine user
type User user.User

// Drawing is made out of Curves
type Drawing struct {
	// parent should be a User
	ValidIndex		int64		`json:"valid_index" datastore:",noindex"`
}

// Curve contains points
type Curve struct {
	// parent should be a Drawing
	ID 				int64     	`json:"ID"                datastore:"-"` // to be manually set
	Index           int64       `json:"index"             datastore:""`
	Color           string    	`json:"color" datastore   datastore:",noindex"`
	WidthMultiplier float64   	`json:"width_multiplier"  datastore:",noindex"`
	Points          []Point   	`json:"points"            datastore:",noindex"`
}

// Point represents a single measurement of the pen
type Point struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Pressure float64 `json:"p"`
	Width    float64 `json:"w"`
	// milliseconds since epoch
	Time     int64 `json:"t"`
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
	http.HandleFunc("/api/drawing/set", drawingSet)
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
	if r.URL.Path != "/" {
		// meh
        http.NotFound(w, r)
        return
    }

	ctx := appengine.NewContext(r)
	u := user.Current(ctx)
	data := make(map[string]interface{})

	if u == nil {
		// not logged in
		log.Infof(ctx, "Showing homepage")

		url, err := user.LoginURL(ctx, "/")
		if err != nil {
			http.Error(w, "Couldn't login: " + err.Error(), 500)
			return
		}
		data["login_url"] = url

		err = templates["index_public"].Execute(w, &data)
		if err != nil {
			http.Error(w, "Couldn't render index_public: " + err.Error(), 500)
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
			http.Error(w, "Couldn't upsert user: " + err.Error(), 500)
			return
		}

		url, err := user.LogoutURL(ctx, "/")
		if err != nil {
			http.Error(w, "Couldn't create logout URL: " + err.Error(), 500)
			return
		}
		data["logout_url"] = url

		err = templates["index_user"].Execute(w, &data)
		if err != nil {
			http.Error(w, "Couldn't render index_user: " + err.Error(), 500)
			return
		}
	}
}

func drawing(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	log.Infof(ctx, "Showing a drawing")
	uk := getUserKey(ctx)
	data := make(map[string]interface{})
	drawing_key := strings.TrimPrefix(r.URL.Path, "/d/")
	k, err := datastore.DecodeKey(drawing_key)
	if err != nil {
		http.Error(w, "Couldn't decode drawing key: " + err.Error(), 500)
		return
	}

	var drawing Drawing
	err = datastore.Get(ctx, k, &drawing)
	if err != nil {
		http.Error(w, "Couldn't get drawing from datastore: " + err.Error(), 500)
		return
	}

	curves := make([]Curve, 0)
	keys, err := datastore.NewQuery("Curve").Order("Index").Ancestor(k).
		Filter("Index <=", drawing.ValidIndex).GetAll(ctx, &curves)
	if err != nil {
		http.Error(w, "Couldn't get curves: " + err.Error(), 500)
		return
	}
	for i, _ := range curves {
		curves[i].ID = keys[i].IntID()
	}

	data["editable"] = (uk != nil && *k.Parent() == *uk)
	data["drawing"] = drawing
	data["curves"] = curves

	err = templates["drawing"].Execute(w, &data)
	if err != nil {
		http.Error(w, "Couldn't render drawing template: " + err.Error(), 500)
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
		DrawingKey string `json:"drawing_key"`
		Curve      Curve  `json:"curve"`
	}

	decoder := json.NewDecoder(r.Body)
	err := decoder.Decode(&info)
	if err != nil {
		http.Error(w, "Couldn't decode JSON: " + err.Error(), 500)
		return
	}

	dk, err := datastore.DecodeKey(info.DrawingKey)
	if err != nil {
		http.Error(w, "Couldn't decode drawing key: " + err.Error(), 500)
		return
	}

	if *dk.Parent() != *uk {
		http.Error(w, "Not authorized", 401)
		return
	}

	drawing := Drawing{}
	err = datastore.Get(ctx, dk, &drawing)
	if err != nil {
		http.Error(w, "Couldn't get drawing from datastore: ", 500)
		return
	}

	new_valid_index := info.Curve.Index
	for true {
		to_delete, err := datastore.NewQuery("Curve").Ancestor(dk).Filter("Index >= ", new_valid_index).
			KeysOnly().Limit(500).GetAll(ctx, nil)
		if err != nil {
			http.Error(w, "Couldn't get keys of curves to delete: " + err.Error(), 500)
			return
		}

		if len(to_delete) > 0 {
			err = datastore.DeleteMulti(ctx, to_delete)
			if err != nil {
				http.Error(w, "Couldn't delete curves: " + err.Error(), 500)
				return
			}
		}
		if len(to_delete) < 500 {
			break
		}
	}

	/*
	last_curve_arr := make([]Curve, 1)
	_, err = datastore.NewQuery("Curve").Order("-index").Limit(1).GetAll(ctx, &last_curve_arr);
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	last_curve := last_curve_arr[0];
	*/

	ck := datastore.NewIncompleteKey(ctx, "Curve", dk)
	_, err = datastore.Put(ctx, ck, &info.Curve)
	if err != nil {
		http.Error(w, "Couldn't insert new curve: " + err.Error(), 500)
		return
	}

	drawing.ValidIndex = new_valid_index
	log.Infof(ctx, "drawing index %v", new_valid_index)
	// Upsert drawing
	_, err = datastore.Put(ctx, dk, &drawing)
	if err != nil {
		http.Error(w, "Couldn't update drawing: " + err.Error(), 500)
		return
	}
}

func drawingAdd(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	uk := getUserKey(ctx)
	if uk == nil {
		http.Error(w, "Not logged in", 401)
		return
	}

	k := datastore.NewIncompleteKey(ctx, "Drawing", uk)
	k, err := datastore.Put(ctx, k, new(Drawing))
	if err != nil {
		http.Error(w, "Couldn't insert new drawing: " + err.Error(), 500)
		return
	}
	renderJSON(w, map[string]string{
		"url": "https://" + r.Host + "/d/" + k.Encode(),
	})
}

func drawingSet(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	uk := getUserKey(ctx)
	if uk == nil {
		http.Error(w, "Not logged in", 401)
		return
	}

	var info struct {
		DrawingKey string  `json:"drawing_key"`
		Drawing    Drawing `json:"drawing"`
	}

	decoder := json.NewDecoder(r.Body)
	err := decoder.Decode(&info)
	if err != nil {
		http.Error(w, "Couldn't decode JSON: " + err.Error(), 500)
		return
	}

	dk, err := datastore.DecodeKey(info.DrawingKey)
	if err != nil {
		http.Error(w, "Invalid drawing key: " + err.Error(), 500)
		return
	}

	if *dk.Parent() != *uk {
		http.Error(w, "Not authorized", 401)
		return
	}

	log.Infof(ctx, "new set drawing index %v", info.Drawing.ValidIndex)

	// Upsert drawing
	_, err = datastore.Put(ctx, dk, &info.Drawing)
	if err != nil {
		http.Error(w, "Couldn't upsert drawing: " + err.Error(), 500)
		return
	}
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
		http.Error(w, "Couldn't marshal JSON: " + err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, err = w.Write(js)
	if err != nil {
		http.Error(w, "Error while writing JS: " + err.Error(), 500)
		return
	}
	return
}

func getUserKey(ctx context.Context) *datastore.Key {
	u := user.Current(ctx)
	if u == nil {
		return nil
	}
	return datastore.NewKey(ctx, "User", u.ID, 0, nil)
}
