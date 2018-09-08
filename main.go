package main

import (
	"fmt"
	"net/http"

	"google.golang.org/appengine"
	"google.golang.org/appengine/datastore"
)

// Datastore Types
// ---------------

// A User in our site, only for auth purposes (we use Users API)
type User struct {
	EmailAddress string
}

// Handlers
// --------

func main() {
	http.HandleFunc("/", root)
	http.HandleFunc("/d/*", drawing)
	// /static defined inside app.yaml

	appengine.Main()
}

func root(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)

	u := User{EmailAddress: "foo@bar.com"}
	k := datastore.NewIncompleteKey(ctx, "User", nil)
	if _, err := datastore.Put(ctx, k, &u); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	fmt.Fprintln(w, "Hello, mars!")
}

func drawing(w http.ResponseWriter, r *http.Request) {

}
