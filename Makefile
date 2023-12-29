
all: index.js
	node index.js

index.js: index.ts
	tsc index.ts

clean:
	rm index.js

.PHONY: all clean
