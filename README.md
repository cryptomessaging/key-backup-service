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
	        /<persona id>.zip (suggested layout below...)
	            /persona.json
	            /keyring
	                /secrets.json
	                /subkey(<id>).json

## API

POST /accounts

	Creates a new account for an email address that has not been registered yet.  Email is case-insensitive.
	Request body: { email:, password: }
	Response 409: email already registered, try again or reset password

POST /personas/&lt;persona id&gt;

    Basic authentication required
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

PUT /password/reset

    Request body: { email: <email address> }
    Response 200: Email sent with code if recognized, otherwise ignored

GET /password/reset/&lt;email&gt;

    Alternative to PUT method above to ease testing with a browser.
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
    - IAM service...
    - Roles...
    - Type: Lambda
    - Name: lambda-keyBackupService-execution-role
    - Add policy names:
        - AwsLambdaFullExecute
    - "Create Role"

    - Add inline policy:
        - Name: keybackups-s3-policy
        
        	```
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
    		```
    - Add another inline policy to allow SES/email
    	- Name: keybackups-SES-policy 	
   
   			``` 
	    	{
		  		"Version":"2012-10-17",
		  		"Statement":[
		    		{
		      			"Effect":"Allow",
		      			"Action":[
		        			"ses:SendEmail",
		        			"ses:SendRawEmail"
		      			],
		      			"Resource":"*"
		    		}
		  		]
			}
			```

3. Create Lambda function:
    - Name: keyBackupService
    - Runtime: Node.js 8.10
    - Role: lambda-keyBackupService-execution-role
    - "Create"
    - Update index.handler to lambda.handler
    - "Save"

4. Create API Gateway for lambda function
	- API Gateway service...
	- "Create API"...
	- New API
	- API Name: keyBackupService
	- Endpoint type: Regional
	- "Create"
	- Select newly created API which shows submenu with Resource...
	- Select "Resources"
	- Action: "Create Resource"
		- Checkmark "Configure as proxy resource"
		- Checkmark "Enable API Gateway CORS"
		- "Create Resource"
	- Edit newly created "ANY" resource
		- Lambda Function: keyBackupService
		- "Save"
	- Select "Resources"
		- "Actions"
		- "Deploy API"
		- Stage name: prod
		- "Deploy"
		- Copy the shown "Invoke URL", such as https://c28l3rkuva.execute-api.us-west-2.amazonaws.com/prod
	- Create ACM Certificate for a custom domain name
		- Certificate Manager...
		- Change to US-WEST-1 (Oregon)
		- Create certification for domain name...
	- "Custom Domain Names"
		- "Create Custom Domain Name"
		- Domain Name: keybackups.cryptomessaging.org
		- Endpoint Configuration: Regional
		- ACM Certificate: (the one created above)
		- "Create"
		- "Edit"
		- Add custom domain name
		- Path: /
		- Destination: keyBackupService:prod
		- "Save"
		- Copy Target domain name: d-w6nky6m2oi.execute-api.us-west-2.amazonaws.com
	- Route 53
		- "Create Record Set"
		- Name: keybackups
		- Type: CNAME
		- Alias: No
		- Value: d-w6nky6m2oi.execute-api.us-west-2.amazonaws.com
		- "Create"


