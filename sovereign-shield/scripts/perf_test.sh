#!/bin/bash
# Simple placeholder for performance testing the filter endpoint
URL=${1:-http://localhost:3000/api/filter}
PAYLOAD='{"userId":"test","content":"This is a test message with spam","contentType":"text"}'

echo "Running naive perf test against $URL"
for i in {1..100}; do
  curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD" $URL > /dev/null
done

echo "Completed 100 requests"
