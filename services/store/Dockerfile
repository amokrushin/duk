FROM node:8-slim

COPY package.json yarn.lock /srv/app/

RUN cd /srv/app \
    && yarn install --production \
    && yarn clean \
    && yarn cache clean

COPY . /srv/app

RUN cd /srv/app/shared/duk-task-queue \
    && yarn \
    && yarn link \
    && cd /srv/app \
    && yarn link duk-task-queue

WORKDIR /srv/app

CMD ["node", "app.js"]