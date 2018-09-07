#!/bin/bash

cd "$(dirname "$0")"

echo "Making sure modules are up to date..."
npm install

echo "Zipping function code..."
zip function-code.zip -r  * -x function-code.zip

echo "Uploading Lambda function code..."
aws lambda update-function-code --function-name keyBackupService --zip-file fileb://./function-code.zip --profile cryptomessaging