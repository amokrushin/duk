#!/usr/bin/env bash

for var in "$@"
do
    curl --data build=true -X POST "$var"
done
