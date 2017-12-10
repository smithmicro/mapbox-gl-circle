# Build: docker build -t mapbox-gl-circle:dev .
# Start: docker run -itp 9966:9966 mapbox-gl-circle:dev
# Evaluate: open http://localhost:9966

FROM node:8-alpine

WORKDIR /opt/mapbox-gl-circle

COPY package.json /opt/mapbox-gl-circle/

RUN npm install && mkdir -p example/ lib/

COPY lib/main.js /opt/mapbox-gl-circle/lib/
COPY example/index.js /opt/mapbox-gl-circle/example/

EXPOSE 9966 35729

CMD npm start
