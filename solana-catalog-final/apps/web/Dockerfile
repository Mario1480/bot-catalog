FROM node:20-alpine AS build
WORKDIR /app

# English comment: Toolchain + kernel headers + udev headers for native addons (usb/libusb).
RUN apk add --no-cache python3 make g++ linux-headers libusb-dev eudev-dev pkgconfig

COPY package.json package-lock.json* ./
RUN npm install

COPY next.config.js tsconfig.json ./
COPY src ./src

ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE

RUN npm run build


FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src ./src

EXPOSE 3000
CMD ["npm","run","start"]

