
.PHONY: run
run: 
	GOPATH=/home/new_evert/gopath ~/gcloud/bin/dev_appserver.py debug.yaml

.PHONY: deploy
deploy:
	GOPATH=/home/new_evert/gopath ~/gcloud/bin/gcloud app deploy deploy.yaml
