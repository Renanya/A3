const path = require('path');
const fs = require('fs');
const JWT = require('jsonwebtoken');
const VideoModel = require('../models/video');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
const jwt = require("aws-jwt-verify");
const ffmpeg1 = require('../ffmpeg.js');
const axios = require('axios')

const JWT_SECRET = 'JWT_SECRET';

// Import Middleware Functions for AWS
const aws_sdk_helpers = require('../middleware/aws_sdk.js');
const { CreateUserPoolClientResponseFilterSensitiveLog } = require('@aws-sdk/client-cognito-identity-provider');

////////// Middleware Helper Functions for Paramters
async function getIDVerifier() {
  let idVerifier;

  try {
    const userPoolID = await aws_sdk_helpers.getParameterFromSSM("cognito/userPoolID");
    const clientID = await aws_sdk_helpers.getParameterFromSSM("cognito/clientID");

    idVerifier = jwt.CognitoJwtVerifier.create({
      userPoolId: userPoolID,
      tokenUse: "id",
      clientId: clientID,
    });

    console.log("[getIDVerifier] Successfully retrieved parameters");
  } catch (error) {
    console.log("[getIDVerifier] Unable to retrieve parameters");
  }

  return idVerifier;
}



// Define a mapping of MIME types to file formats
const mimeTypeToFormat = {
    'video/mp4': 'mp4',
    'video/avi': 'avi',
    'video/mkv': 'mkv',
    'video/quicktime': 'mov',
    'video/x-ms-wmv': 'wmv',
    'video/x-flv': 'flv',
    'video/webm': 'webm',
    'video/mpeg': 'mpeg',
    'video/3gpp': '3gp',
    'video/ogg': 'ogg'
};

// Function to get the format from MIME type
const getFormatFromMimeType = (mimeType) => {
    return mimeTypeToFormat[mimeType] || null; // Default to 'unknown' if MIME type is not found
};
// --- Helpers using fluent-ffmpeg ---
function FFreformatVideo(inputPath, outputPath, outputFormat, outputCodec, cb) {
  try {
    ffmpeg(inputPath)
      .videoCodec(outputCodec)           // e.g. 'libx264'
      .format(outputFormat)              // e.g. 'mp4', 'avi'
      // optional tuning flags:
      // .outputOptions(['-movflags +faststart']) // good for mp4 streaming
      .on('start', cmd => console.log('[ffmpeg] start:', cmd))
      .on('progress', p => console.log(`[ffmpeg] ${Math.round(p.percent || 0)}%`))
      .on('error', err => {
        console.error('[ffmpeg] error:', err);
        cb(err);
      })
      .on('end', () => {
        console.log('[ffmpeg] done:', outputPath);
        cb(null, outputPath);
      })
      .save(outputPath);
  } catch (e) {
    cb(e);
  }
}

function FFgetVideoMetadata(inputPath, cb) {
  ffmpeg.ffprobe(inputPath, (err, data) => {
    if (err) return cb(err);
    const stream = (data.streams || []).find(s => s.codec_type === 'video') || {};
    const format = data.format || {};
    cb(null, {
      duration: Math.round(format.duration || 0),
      codec: stream.codec_name || null,
      width: stream.width || null,
      height: stream.height || null,
      formatName: format.format_name || null,
    });
  });
}

function FFcaptureThumbnail(inputPath, outputPath, atSeconds = 5, cb) {
  ffmpeg(inputPath)
    .on('error', cb)
    .on('end', () => cb(null, outputPath))
    .screenshots({
      timestamps: [atSeconds],
      filename: path.basename(outputPath),
      folder: path.dirname(outputPath),
      size: '640x?'
    });
}


const formatToMimeType = {
    'mp4': 'video/mp4',
    'avi': 'video/avi',
    'mkv': 'video/mkv',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'mpeg': 'video/mpeg',
    '3gp': 'video/3gpp',
    'ogg': 'video/ogg'
};
function getMimeTypeFromFormat(format) {
    return formatToMimeType[format.toLowerCase()] || 'application/octet-stream'; // Default MIME type
}
const reformatVideo = async (req, res) => {
    const { format: newFormat, videoData } = req.body;
    const format = getFormatFromMimeType(videoData.mimetype);
    console.log(newFormat, videoData, format)
    if (!newFormat || !videoData || !format ) {
        return res.status(400).json({ message: 'Missing required parameters.' });
    }
    console.log("reformatting video...")
    try {
    const s3url = await aws_sdk_helpers.readFromUploads(videoData.filename);
    const outputFileName = `reformatted-${videoData.filename.split('.')[0]}.${newFormat.toLowerCase()}`;
    const mimeType = getMimeTypeFromFormat(newFormat);


      if (format.toLowerCase() === newFormat.toLowerCase()) {
        console.log("same format, streaming directly...");
        // If same format, stream directly from S3 to client
        const response = await axios({
          method: 'get',
          url: s3url,
          responseType: 'stream'
        });
        response.data.pipe(res, { end: true });
        return;
      }

      console.log("formats are different, converting...");
      // Stream from S3 and convert on the fly
      const response = await axios({
        method: 'get',
        url: s3url,
        responseType: 'stream'
      });
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
      console.log("piping through ffmpeg...");
      ffmpeg(response.data)
        .toFormat(newFormat)
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error reformating', error: err.message });
          }
        })
        .pipe(res, { end: true }); // Pipe directly to response
        console.log("piped to response.");
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error reformating', error: error.message });
    }
};

const pollQueue = async() => {
    console.log("Run")
    try {
        const response = await sqs.retrieveMessage()
        if (response.Messages){
            console.log("got messages")
            console.log(response.Messages)
            const data = JSON.parse(response.Messages[0].Body)
            const { format: newFormat, videoData, idtoken_videoid } = data;
            const format = getFormatFromMimeType(videoData.mimetype);
            const videoID = idtoken_videoid.split('#')[1];
            const newVideoid = uuidv4()
            const s3url = await s3.getVideo(videoID)
            const ffmpegResponse = await ffmpeg.reformatVideo(s3url, videoID, format, newFormat, newVideoid)
            await s3.uploadReformat(newVideoid, fs.readFileSync(ffmpegResponse.filePath), getMimeTypeFromFormat(newFormat), newFormat)
            fs.unlinkSync(ffmpegResponse.filePath);
            await dynamodb.addReformatMetadata(idtoken_videoid.split('#')[0], newVideoid, data)
            await sqs.deleteMessage(response.Messages[0].ReceiptHandle)
        } else {
            console.log("No messages")
        }
    } catch (error) {
        console.log(error)
    }

    setTimeout(pollQueue, 10000);
}




module.exports = {
    reformatVideo,
}