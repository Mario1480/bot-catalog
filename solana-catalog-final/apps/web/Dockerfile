FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY next.config.js tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 3000
CMD ["npm","run","start"]