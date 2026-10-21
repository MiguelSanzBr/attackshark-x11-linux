FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
# o build sai com base /attackshark-x11-linux/ (GitHub Pages), então serve no mesmo caminho
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/attackshark-x11-linux
EXPOSE 80
