const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { PassThrough } = require('stream');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;


ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
async function reformatVideo(s3url, videoid, currentFormat, newFormat) {
    // Path to temporarily store the downloaded video
    const tempFilePath = path.join(__dirname, `${videoid}.${currentFormat}`);

    return new Promise((resolve, reject) => {
        if (currentFormat.toLowerCase() === newFormat.toLowerCase()) {
            resolve({ same: true, s3url });
        } else {
            axios({
                method: 'get',
                url: s3url,
                responseType: 'stream'
            })
            .then(response => {
                const writeStream = fs.createWriteStream(tempFilePath);

                response.data.pipe(writeStream);

                writeStream.on('finish', () => {
                    console.log()
                    // Reformat the video to the newFormat
                    const outputStream = new PassThrough();

                    ffmpeg(tempFilePath)
                        .toFormat(newFormat)
                        .on('end', () => {
                            // Clean up the temp file
                            fs.unlink(tempFilePath, (err) => {
                                if (err) {
                                    console.error('Error deleting temp file:', err);
                                }
                            });
                        })
                        .on('error', (err) => {
                            console.error(newFormat)
                            console.error('FFmpeg error:', err);
                            fs.unlink(tempFilePath, (err) => {
                                if (err) {
                                    console.error('Error deleting temp file:', err);
                                }
                            });
                            reject(err);
                        })
                        .pipe(outputStream, { end: true });

                    resolve({ same: false, videoStream: outputStream });
                });

                writeStream.on('error', (err) => {
                    fs.unlink(tempFilePath, (err) => {
                        if (err) {
                            console.error('Error deleting temp file:', err);
                        }
                    });
                    reject(err);
                });
            })
            .catch(error => {
                reject(error);
            });
        }
    });
}
module.exports = {
    reformatVideo,
};