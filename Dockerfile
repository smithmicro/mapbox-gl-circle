# To build: docker build -t mapbox-gl-circle .
# To run:   docker run -i -p 9966:9966 mapbox-gl-circle
# To test:  open http://localhost:9966

FROM node:8-alpine

WORKDIR /opt/mapbox-gl-circle

COPY package.json example/index.js lib/main.js /opt/mapbox-gl-circle/

RUN mkdir -p example/ lib/ && mv index.js example/ && mv main.js lib/ && npm install

EXPOSE 9966

CMD npm start

