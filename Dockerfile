# To build: docker build -t draw-circle .
# To run:   docker run -d -p 9966:9966 draw-circle
# To test:  open http://localhost:9966

FROM node:8-alpine

WORKDIR /opt/draw-circle

COPY package.json index.html index.js circle.js /opt/draw-circle/

RUN npm install

EXPOSE 9966

CMD npm start

