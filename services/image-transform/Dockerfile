FROM node:8-slim

COPY package.json yarn.lock /srv/app/

RUN    apt-get update \
    && apt-get install -y \
         make \
         gcc \
         g++ \
         python

RUN    cd /srv/app \
    && yarn install --production \
    && yarn cache clean \
    && apt-get remove --purge -y \
         make \
         gcc \
         g++ \
         python \
         `apt-mark showauto` \
    && rm -rf \
         /var/lib/apt/lists/* \
         /tmp/*

COPY . /srv/app

RUN    cd /srv/app/shared/duk-task-queue \
    && yarn \
    && yarn link \
    && cd /srv/app \
    && yarn link duk-task-queue

WORKDIR /srv/app

CMD ["node", "app.js"]
