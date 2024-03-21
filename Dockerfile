# Build the typescript files into JS files
FROM node:18-alpine AS build
WORKDIR /srv
COPY package*.json /srv/
RUN npm ci

COPY index.ts /srv/index.ts
RUN npx tsc index.ts
RUN npm ci --production

FROM alpine:3
RUN apk add nodejs --no-cache

# install chrome for puppeteer
ENV CHROME_BIN=/usr/bin/chromium-browser
RUN apk add --no-cache chromium

# Copy over the build files from the previous step
WORKDIR /srv
COPY --from=build /srv/node_modules /srv/node_modules
COPY --from=build /srv/index.js /srv/
CMD node index.js
