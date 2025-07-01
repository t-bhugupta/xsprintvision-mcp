FROM node:22.12-alpine AS builder

WORKDIR /app

# Install Python and pip in the builder stage and create python symlinks
RUN apk add --no-cache python3 py3-pip \
 && ln -sf $(which python3) /usr/bin/python \
 && ln -sf $(which python3) /usr/local/bin/python

# Copy package.json and package-lock.json first for better layer caching
COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src/
COPY data/ ./data/

RUN npm install

RUN npm run build

FROM node:22-alpine AS release

WORKDIR /app

# Install Python and pip in the release stage and create python symlinks
RUN apk add --no-cache python3 py3-pip \
 && ln -sf $(which python3) /usr/bin/python \
 && ln -sf $(which python3) /usr/local/bin/python

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/data ./data

ENV NODE_ENV=production
ENV PORT=80

RUN npm ci --ignore-scripts --omit-dev

EXPOSE 80

CMD ["node", "dist/server.js"]