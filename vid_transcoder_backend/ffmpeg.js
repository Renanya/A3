const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { PassThrough } = require('stream');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const aws_sdk_helpers = require('./middleware/aws_sdk.js');


ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
async function reformatVideo(videoData, format, newFormat) {
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
        return;
      }

      console.log("formats are different, converting...");
      // Stream from S3 and convert on the fly
      const response = await axios({
        method: 'get',
        url: s3url,
        responseType: 'stream'
      });
      console.log("piping through ffmpeg...");
      ffmpeg(response.data)
        .toFormat(newFormat)
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error reformating', error: err.message });
          }
        })

        console.log("ffmpeg complete");
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error reformating', error: error.message });
    }
};


module.exports = {
    reformatVideo,
};