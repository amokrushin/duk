FROM node:8.1.0-slim

RUN \
# app root path
    mkdir -p /srv/app && \
# download repo and extract to /tmp
    wget -P /tmp --quiet https://github.com/amokrushin/duk/archive/master.tar.gz && \
    tar -xzf /tmp/master.tar.gz -C /tmp && \
# move service from repo to /srv/app
    mv /tmp/duk-master/services/store/* /srv/app && \
# move shared from repo to /srv/shared
    mv /tmp/duk-master/shared/ /srv/shared && \
# install shared deps and link it
    cd /srv/shared/duk-task-queue/ && \
    yarn install --production && \
    yarn link && \
# install service deps and link shared
    cd /srv/app && \
    yarn install --production && \
    yarn link duk-task-queue && \
# cleanup
    rm /tmp/* -rf

WORKDIR /srv/app

CMD ["node", "app.js"]