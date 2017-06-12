#!/usr/bin/env bash

echo "Docker deploy trigger"
echo "Tag $TRAVIS_TAG"

for var in "$@"
do
    curl -X POST "$1" \
        -H "Content-Type: application/json" \
        --data '{"source_type": "Tag", "source_name": "'$TRAVIS_TAG'"}'
done
