#!/usr/bin/env bash

echo 'Docker deploy trigger'

for var in "$@"
do
    curl --data build=true -X POST "$var"
done
