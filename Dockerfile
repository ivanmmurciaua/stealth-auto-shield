FROM node:22-alpine

WORKDIR /app

# System deps to compile native modules (LevelDB, etc.)
RUN apk add --no-cache python3 make g++ git

# Copy manifests first (layer cache)
COPY package.json ./

# Install deps (for updated packages)
RUN npm install

# Copy sources
COPY tsconfig.json ./
COPY src/ ./src/

# Directory to persist the RAILGUN state between restarts
VOLUME ["/app/.railgun-db"]

# The .env is mounted at runtime — it is never included in the image
CMD ["node", "--no-warnings", "--loader", "ts-node/esm", "--experimental-specifier-resolution=node", "src/index.ts"]
