#!/usr/bin/env bash

set -e  # Always.

VERSION_CAT=$1

if [ -z "$VERSION_CAT" ]; then
    echo "Error: Provide a version for 'npm version'; major | minor | patch | prerelease" && exit 1
fi

echo "Current git version: $(npm version from-git)"

NEXT_VERSION=$(npm version "$VERSION_CAT")
echo "Next $VERSION_CAT version: $NEXT_VERSION"

if [[ ! $VERSION_CAT =~ ^pre ]]; then
    echo ""
    echo "TODO:"
    echo "- Add/update the '### v. $NEXT_VERSION' heading at the top of the README changelog and commit"
fi

