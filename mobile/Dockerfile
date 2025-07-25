FROM node:20
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install \
    && npx expo install react-native-web react-dom

COPY . .

EXPOSE 19006
CMD ["npx","expo","start","--web","--non-interactive","--host","lan","--port","19006"]
