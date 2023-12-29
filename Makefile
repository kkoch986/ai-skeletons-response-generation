GIT_SHA=$(shell git rev-parse --short=8 HEAD)

all: index.js
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
