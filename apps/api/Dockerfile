FROM node:20-alpine AS build

WORKDIR /app

# English comment: Install build toolchain for native deps (node-gyp).
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


FROM node:20-alpine
WORKDIR /app

# English comment: Runtime image can still be minimal.
RUN apk add --no-cache python3

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node","dist/index.js"]
