FROM anmok/node-slim-sharp:latest

COPY package.json yarn.lock /srv/app/

RUN cd /srv/app \
    && yarn install --production \
    && yarn link sharp \
    && yarn cache clean

COPY . /srv/app
COPY ../shared /srv/shared

WORKDIR /srv/app

CMD ["node", "app.js"]
