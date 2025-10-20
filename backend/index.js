const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
require('dotenv').config(__dirname);

const S3 = require("@aws-sdk/client-s3");
const S3Presigner = require("@aws-sdk/s3-request-presigner");

const outputDirectory = path.join(__dirname, ".", "downloads");
const fileName = "gamble.mp4";
const outputPath = path.join(outputDirectory, fileName);
const newFormat = 'mp4';
const newCodec = 'libx264'
const inputCodec = 'libx264'

if (!fs.existsSync(outputDirectory)) {
fs.mkdirSync(outputDirectory, { recursive: true });
}

// Creating a client for sending commands to S3

const s3Client = new S3.S3Client({ region: 'ap-southeast-2' });
const prefix = `a2-group4-bucket`
const uploadsBucket = `${prefix}-uploads`;

async function getPresignedURL(key) {
    const command = new S3.GetObjectCommand({Bucket: uploadsBucket, Key: key,});
    const presignedURL = await S3Presigner.getSignedUrl(s3Client, command, {expiresIn: 3600});
    return presignedURL;
}

// Create a promise to handle the formatting
transcode = async (presignedURL) => {
    return new Promise ((resolve, reject) => {
        ffmpeg(presignedURL)
        .videoCodec(newCodec || inputCodec) // user’s chosen codec or mapped fallback
        .format(newFormat)
        .on("start", (cmd) => console.log("Running ffmpeg:", cmd))
        .on("error", (error) => {
            console.error("FFmpeg error:", error.message);
            reject(error);
        })
        .on("end", () => {
            console.log("Reformat finished:", outputPath);
            resolve();
        })
        .save(outputPath);
        });
};

getPresignedURL(fileName)
.then((url) => {
    transcode(url);
})
.catch((error) => console.log(error));