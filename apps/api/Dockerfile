# Dockerfile for the NestJS API.
# Build context: apps/api/
# Fly.io builds and runs this with `fly deploy` using its remote builder.

FROM node:22-alpine
WORKDIR /app

# Install dependencies first for better Docker layer caching.
COPY package*.json ./
RUN npm ci

# Generate the Prisma client before copying source (schema rarely changes).
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source and compile TypeScript.
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/main.js"]
