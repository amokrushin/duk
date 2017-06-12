#!/usr/bin/env bash

echo "Docker deploy trigger"
echo "Tag $TRAVIS_TAG"

#for var in "$@"
#do
#$TRAVIS_TAG
#    curl --data build=true -X POST "$var"
#    curl --data build=true -X POST "$1"
curl -X POST "$1" \
    -H "Content-Type: application/json" \
    --data '{"source_type": "Tag", "source_name": "'$TRAVIS_TAG'"}'
#done
