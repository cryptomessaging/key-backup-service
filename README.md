# Key Backup Service


## Introduction 

Provides backups of private keys and basic persona information - enough to reconstruct your messenger experience on another device.

Uses an email address as your unique id, and a *hopefully* semi-strong text password.

This service is intended as a stop-gap until more energy can be put into a robust key backup architecture.


## Schema

For each account being backed up, the directory structure is

	/<email address>
	    /user.json - { email: , password: { type:, hash: } }
	    /personas
	        /<persona id>.zip
	            /persona.json
	            /keyring
	                /secrets.json
	                /subkey(<id>).json

## API

POST /accounts

    Request body: { email:, password: }
    Response 409: email already registered, try again or reset password

POST /personas/&lt;persona id&gt;

    Authentication required
    Request body: Zip file of persona

GET /personas

    Authentication required
    Response body: { personas:[ "<persona id>",... ] }

GET /personas/&lt;persona id&gt;

    Authentication required
    Response body: Zip file
    Response 410: Zip file doesn't exist

DELETE /personas/&lt;persona id&gt;

    Authentication required
    Response 200: When deleted or file doesn't exist

GET /password/reset/&lt;email&gt;

    Response 200: Email sent with code if recognized, otherwise ignored

GET /password/reset.html?email=&lt;email&gt;&code=&lt;code&gt;

    Query string parameters:
    	 email: email address of account to reset password
    	 code: challenge code to provide to server
    	 
	 Response: HTML page that provides a form for the user to create a new password and submit back to server.
        

POST /password/reset

    Request body: { email:, code:, new_password: }
    Response 409: code doesn't match expected, try again 


General responses:

- 200 - Success
- 400 - Bad request; The server cannot or will not process the request due to an apparent client error (e.g., malformed request syntax, size too large)
- 401 - Authorization missing or invalid
- 5xx - Server problems




## Configuring AWS

1. Create S3 bucket:
    - Bucket name: keybackups.cryptomessaging.org
    - Region: US West (Oregon)
        "Create Bucket"

2. Create Lambda Execution Role:
    - Type: Lambda
    - Name: lambda-keyBackupService-execution-role
    - Add policy names:
        - AwsLambdaFullExecute
    - "Create Role"

    - Add inline policy:
        - Name: keybackups-s3-policy
        JSON:
            {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Sid": "VisualEditor0",
                        "Effect": "Allow",
                        "Action": [
                            "s3:ListAllMyBuckets",
                            "s3:HeadBucket"
                        ],
                        "Resource": "*"
                    },
                    {
                        "Sid": "VisualEditor1",
                        "Effect": "Allow",
                        "Action": "s3:*",
                        "Resource": [
                            "arn:aws:s3:::keybackups.cryptomessaging.org",
                            "arn:aws:s3:::keybackups.cryptomessaging.org/*"
                        ]
                    }
                ]
            }

3. Create Lambda function:
    - Name: keyBackupService
    - Runtime: Node.js 8.10
    - Role: lambda-keyBackupService-execution-role
    - "Create"

4. Create API Gateway for lambda function




