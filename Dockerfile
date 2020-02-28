# Build: docker build -t mapbox-gl-circle:dev .
# Start: docker run -itp 9966:9966 mapbox-gl-circle:dev
# Evaluate: open http://localhost:9966

FROM node:8-alpine

WORKDIR /opt/mapbox-gl-circle

COPY package.json /opt/mapbox-gl-circle/
COPY index.html /opt/mapbox-gl-circle/
COPY lib/main.ts /opt/mapbox-gl-circle/lib/
COPY example/index.ts /opt/mapbox-gl-circle/example/

RUN npm install

EXPOSE 9966 35729

CMD npm start
