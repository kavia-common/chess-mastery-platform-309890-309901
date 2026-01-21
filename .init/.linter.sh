#!/bin/bash
cd /home/kavia/workspace/code-generation/chess-mastery-platform-309890-309901/backend_express
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

