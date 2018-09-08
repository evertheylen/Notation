
.PHONY: run
run: 
	GOPATH=/home/new_evert/gopath ~/gcloud/bin/dev_appserver.py app.yaml

.PHONY: deploy
deploy:
	GOPATH=/home/new_evert/gopath ~/gcloud/bin/gcloud app deploy app.yaml
