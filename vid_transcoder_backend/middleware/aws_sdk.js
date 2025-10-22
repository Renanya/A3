// Code Adapted from:
//  - Week 4 Practical: S3 blob storage service (Javascript)
//  - https://stackoverflow.com/questions/11944932/how-to-download-a-file-with-node-js-without-using-third-party-libraries

require('dotenv').config(__dirname);
// require('dotenv').config(__dirname);
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const S3 = require("@aws-sdk/client-s3");
const S3Presigner = require("@aws-sdk/s3-request-presigner");
const SSM = require("@aws-sdk/client-ssm");
const SEC = require("@aws-sdk/client-secrets-manager")
const COG = require("@aws-sdk/client-cognito-identity-provider")

// Define useful constants
const region = 'ap-southeast-2';
const prefix = `a2group4`
const uploadsBucket = `${prefix}-uploadsbucket223`;
const thumbnailsBucket = `${prefix}-bucket-thumbnails`;
const buckets = [uploadsBucket, thumbnailsBucket];
const qutUsername = 'n11288353@qut.edu.au';
const qutUsername2 = 'n8319065@qut.edu.au';
const purpose = 'assessment-2';

// Creating a client for sending commands to S3
const s3Client = new S3.S3Client({ region: region });
const ssmClient = new SSM.SSMClient({region: region});
const secClient = new SEC.SecretsManagerClient({region: region});
const cogClient = new COG.CognitoIdentityProvider({region: region});

// SQS stuff
const SQS = require("@aws-sdk/client-sqs");
const sqsQueueUrl = "https://sqs.ap-southeast-2.amazonaws.com/901444280953/a3group16-transcode-queue";

const SQSclient = new SQS.SQSClient({
  region: region,
});

async function sendMessageToSQS(messageBody) {
   // Send a message
   const command = new SQS.SendMessageCommand({
      QueueUrl: sqsQueueUrl,
      DelaySeconds: 10,
      MessageBody: messageBody,
   });
   try{
        const response = await SQSclient.send(command);
        return response;
   }
    catch (error){
        console.log("Error sending message to SQS:", error);
    }
}

async function receiveMessageFromSQS() {
   // Receive a message from the queue
   const receiveCommand = new SQS.ReceiveMessageCommand({
      MaxNumberOfMessages: 1,
      QueueUrl: sqsQueueUrl,
      WaitTimeSeconds: 20, // how long to wait for a message before returning if none.
      VisibilityTimeout: 20, // overrides the default for the queue?
   });

   try{
        const receiveResponse = await SQSclient.send(receiveCommand);
        return receiveResponse;
   }
    catch (error){
        console.log("Error receiving message from SQS:", error);
    }
}

async function deleteMessageFromSQS(receiptHandle) {
   // Delete the message after dealt with.
   const deleteCommand = new SQS.DeleteMessageCommand({
      QueueUrl: sqsQueueUrl,
      ReceiptHandle: receiptHandle,
   });
    try{
        const deleteResponse = await SQSclient.send(deleteCommand);
        return deleteResponse;
   }
    catch (error){
        console.log("Error deleting message from SQS:", error);
    }
}
// End of SQS stuff


// Utility Function: Create the S3 Buckets (used in aws_setup.js)
async function createBuckets() {
    // Utilise Promises to create each bucket and tag them
    await Promise.all(buckets.map(async (bucket) => {
        
        try {
            const command = new S3.CreateBucketCommand({ Bucket: bucket });
            const response = await s3Client.send(command);
            console.log(`Bucket created: ${bucket}`);
            console.log(response.Location);
        } catch (err) {
            if (err.name === "BucketAlreadyOwnedByYou") {
            console.log(`Bucket "${bucket}" already exists (owned by you).`);
            return;
            } else if (err.name === "BucketAlreadyExists") {
            console.error(`Bucket "${bucket}" is taken globally. Pick another name.`);
            throw err;
            } else {
            throw err; // unexpected errors should still bubble up
            }
        }

        // Code to tag S3
        command = new S3.PutBucketTaggingCommand({
            Bucket: bucket,
            Tagging: {
                TagSet: [
                    {
                        Key: 'qut-username',
                        Value: qutUsername,
                    },
                    {
                        Key: 'qut-username2',
                        Value: qutUsername2
                    },
                    {
                        Key: 'purpose',
                        Value: purpose
                    }
                ]
            }
        });

        // Send the command to tag the bucket
        try {
            const response = await s3Client.send(command);
            console.log(`Bucket Tagged: ${bucket}`);
            console.log(response)
        } catch (err) {
            console.log(err);
        } 
    }));
};

// Upload a video from S3 utilising a Presigned URL
async function uploadVideoToS3(fileName, fileType, fileData) {

    // Generate the Presigned URL to upload the video to S3
    const command = new S3.PutObjectCommand(
        {
            Bucket: uploadsBucket,
            Key: fileName,
            ContentType: fileType,
        });
    const presignedURL = await S3Presigner.getSignedUrl(s3Client, command, {expiresIn: 3600});
    console.log(presignedURL);
    return new Promise((resolve, reject) => {
        axios.put(presignedURL, fileData)
        .then(() => {
            resolve();
        })
        .catch((error) => {
            console.log(error.message);
            reject();
        })
    })
}

// Download a video from S3 utilising a Presigned URL
async function downloadVideoFromS3(fileName, filePath) {
    // Generate a Presigned URL to retrieve the file from S3
    const command = new S3.GetObjectCommand({Bucket: uploadsBucket, Key: fileName,});
    const presignedURL = await S3Presigner.getSignedUrl(s3Client, command, {expiresIn: 3600});

    // Make a request to the Presigned URL and write the response to the output file path
    fs.writeFileSync(filePath, presignedURL);
}

async function uploadThumbnailToS3(fileName, fileType, fileData) {
    // Generate the Presigned URL to upload the video to S3
    const command = new S3.PutObjectCommand(
        {
            Bucket: thumbnailsBucket,
            Key: fileName,
            ContentType: fileType,
        });
    const presignedURL = await S3Presigner.getSignedUrl(s3Client, command, {expiresIn: 3600});
    
    return new Promise((resolve, reject) => {
        axios.put(presignedURL, fileData)
        .then(() => {
            resolve();
        })
        .catch((error) => {
            console.log(error.message);
            reject();
        })
    })
}

// Read Video from the specified Bucket (Returns a Buffer)
async function readFromUploads(key) {
    const command = new S3.GetObjectCommand({
        Bucket: uploadsBucket,
        Key: key,   
     })

    try {
        const presignedURL = await S3Presigner.getSignedUrl(s3Client, command, {expiresIn: 3600} );
        console.log(presignedURL);
        return presignedURL
    } catch (error) {
        throw error
    }
}
// Retrieve a parameter from the AWS Parameter Store
// middleware/aws_sdk.js  (getParameterFromSSM)
async function getParameterFromSSM(parameterName) {
  const fullName = `/${prefix}/${parameterName}`;
  const command = new SSM.GetParameterCommand({
    Name: fullName,
    WithDecryption: true,     // <-- important for SecureString
  });

  try {
    const res = await ssmClient.send(command);
    console.log(`[getParameterFromSSM] OK: ${fullName}`);
    return res.Parameter.Value;
  } catch (err) {
    // Log details so you know exactly what's wrong
    console.error(
      `[getParameterFromSSM] FAIL ${fullName} :: ${err.name} :: ${err.message}`,
      err.$metadata ? { http: err.$metadata.httpStatusCode, requestId: err.$metadata.requestId } : {}
    );
    throw err;  // bubble up so callers can handle it
  }
}

// Retrieve a secret from the AWS Secrets Manager
async function getSecretFromSEC(secretName) {
    // Create the full secret name as stored in Secret Manager
    const full_secret_name = `${prefix}/${secretName}`;
    const command = new SEC.GetSecretValueCommand({SecretId: full_secret_name,
        withDecryption: true,
    });

    return new Promise((resolve, reject) => {
        secClient.send(command)
        .then((response) => {
            console.log(`[getSecretFromSEC] Successfully retrieved Secret: ${secretName}`)
            resolve(response.SecretString);
        })
        .catch((error) => {
            console.log(`[getSecretFromSEC] Failed to retrieve Secret: ${secretName}`);
            reject(error);
        })
    })    
}

// 
async function getUserDetails(token) {
    const command = new COG.GetUserCommand(
        {
            AccessToken: token,   
        });

    return new Promise((resolve, reject) => {
        cogClient.send(command)
        .then((response) => {
            console.log(`[getUserDetails] Details able to be retrieved`);
            resolve(response);
        })
        .catch((error) => {
            console.log(`[getUserDetails] Error: ${error.message}`);
            console.log(`[getUserDetails] Details unable to be retrieved`);
            reject(error);
        })
    })
}

// Check whether a user is an Administrative User
async function isUserAdmin(userName) {
    let result;
    
    // Extract the userPoolID Paramater from SSM
    let userPoolID;
    try {
        userPoolID = await getParameterFromSSM("cognito/userPoolID");
    } catch (error) {
        console.log(`[isUserAdmin] Error: ${error.message}`);
    }

    // Create the command to check the Cognito Groups of the User
    const command = new COG.AdminListGroupsForUserCommand(
    {
        UserPoolId: userPoolID,
        Username: userName,
    });

    // Utilise a Promise to handle the command and response
    return new Promise((resolve, reject) => {
        cogClient.send(command)
        .then((response) => {
            if(!response.Groups) {
                result = false;
            } else {
                const groups = response.Groups.map((group) => group.GroupName);
                const isAdmin = (group) => group === "Admin";
                result = groups.some(isAdmin);
            }
            console.log(`[isUserAdmin] Result: ${result}`);
            resolve(result);
        })
        .catch((error) => {
            console.log(`[isUserAdmin] Error: ${error.message}`);

            console.log(`[isUserAdmin] Unable to check user groups`);
            reject(error);
        })
    })
}

async function banUser(userName) {
    let result;
    
    // Extract the userPoolID Paramater from SSM
    let userPoolID;
    try {
        userPoolID = await getParameterFromSSM("cognito/userPoolID");
    } catch (error) {
        console.log(`[banUser] Error: ${error.message}`);
        throw error;
    }
    
    // Create the command to ban a user from the Cognito
    const command = new COG.AdminDisableUserCommand(
    {
        UserPoolId: userPoolID,
        Username: userName,
    });

    return new Promise((resolve, reject) => {
        cogClient.send(command)
        .then((response) => {
            const status = response["$metadata"].httpStatusCode;
            if (!status | status == 200) {
                result = true;
                console.log(`[banUser] Accepted: Successfully banned user ${userName}`);
            } else {
                result = false;
                console.log(`[banUser] Rejected: Unable to ban user ${userName}`);
            }
            resolve(result);
        })
        .catch((error) => {
            console.log(`[banUser] Error: ${error.message}`);

            reject(error);
        })
    })
}

// Export Functions for use elsewhere in the application
module.exports = {
    sendMessageToSQS,
    receiveMessageFromSQS,
    deleteMessageFromSQS,
    createBuckets,
    downloadVideoFromS3,
    uploadVideoToS3,
    getParameterFromSSM,
    getSecretFromSEC,
    isUserAdmin,
    banUser,
    readFromUploads,
};