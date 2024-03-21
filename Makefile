GIT_SHA=$(shell git rev-parse --short=8 HEAD)

pull-models:
	curl http://localhost:11434/api/pull -d '{"name": "neural-chat"}'

all: index.js pull-models
	node index.js

index.js: index.ts
	tsc index.ts

clean:
	rm index.js

docker-build: Dockerfile
	docker build . \
		-t kkoch986/ai-skeletons-response-generation:latest \
		-t kkoch986/ai-skeletons-response-generation:$(GIT_SHA)

.PHONY: all clean docker-build
