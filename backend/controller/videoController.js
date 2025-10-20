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

// helpers (promise-wrapped)
const ffprobeMeta = (p) => new Promise((resolve, reject) => {
  ffmpeg.ffprobe(p, (err, meta) => err ? reject(err) : resolve(meta));
});

const makeThumb = (inputPath, thumbPath, atSecond = 5) => new Promise((resolve, reject) => {
  
  ffmpeg(inputPath)
  .screenshots({
    timestamps: [atSecond],
    filename: path.basename(thumbPath),
    folder: ".",
    size: '320x240'
  })
  .on('error', reject)
  .on('end', resolve)
})

const uploadVideo = async (req, res) => {
  try {
    // Basic checks
    if (!req.files || !req.files.files) {
      return res.status(400).json({ message: 'No files were uploaded' });
    }

    // Auth (cookie or bearer fallback is nice)
    let token = req.cookies?.token;
    if (!token) {
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) token = auth.slice(7);
    }
    if (!token) return res.status(401).json({ message: 'No token provided' });

    let user;
    try {
      const idVerifier = await getIDVerifier();
      user = await idVerifier.verify(token);
    } catch (e) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Normalize to array
    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

    console.log('[upload] start');
    const results = await Promise.all(files.map(async (file) => {      
      
      const thumbnailPath = path.join(__dirname, '..', 'thumbnails', `${path.parse(file.name).name}.png`);
      fs.mkdirSync(path.dirname(thumbnailPath), { recursive: true });

      const tempPath = path.join(__dirname, '..', 'temp', file.name);
      fs.mkdirSync(path.dirname(tempPath), { recursive: true });

      // Move file
      await file.mv(tempPath);
      console.log(`[upload] Temporarily saved to disk at: ${tempPath}`);

      ////////// Upload the videofile to S3 using Presigned URLs
      console.log("[upload] Before upload video file to S3.")
      const videoFileName = file.name;
      const videoFileType = file.mimetype;
      const videoFileData = file.data;
      await aws_sdk_helpers.uploadVideoToS3(videoFileName, videoFileType, videoFileData);
      console.log("[upload] After upload video file to S3.")
      ////////// 

      // Metadata
      console.log('[upload] before ffprobe');
      const meta = await ffprobeMeta(tempPath);
      const duration = meta?.format?.duration ?? 0;
      const codec = meta?.streams?.find(s => s.codec_type === 'video')?.codec_name || 'unknown';
      console.log('[upload] after ffprobe', { duration });

      // Thumbnail
      console.log('[upload] before thumbnail');
      await makeThumb(tempPath, thumbnailPath, 5);
      console.log('[upload] after thumbnail');

      // DB
      console.log('[upload] before DB');
      const video = {
        title: file.name,
        filename: file.name,
        filepath: `/temp/${file.name}`,
        mimetype: file.mimetype,
        size: file.size,
        duration,
        author: user.sub, // Cognito unique user id
        thumbnail: `/thumbnails/${path.basename(thumbnailPath)}`,
        codec
      };
      const videoID = await VideoModel.addVideo(video); // ensure this returns a Promise and stringifies BigInt insertId
      console.log('[upload] after DB');

      console.log('[upload] Before removing temp file.');
      await fs.unlinkSync(tempPath);
      console.log('[upload] After removing temp file.');

      return { message: 'File uploaded and metadata saved', file: file.name, videoID };
    }));

    // Single response for all files
    console.log('[upload] end');
    return res.status(201).json(results);

  } catch (err) {
    console.error('[upload] error:', err);
    // Map known errors if you want
    if (err?.message?.includes('ffprobe')) {
      return res.status(500).json({ message: 'ffprobe not available', error: err.message });
    }
    return res.status(500).json({ message: 'Upload failed', error: err.message });
  }
};

const authorVideo = async (req, res) => {
  let token = req.cookies?.token;
  if (!token) {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  }
  if (!token) return res.status(401).json({ error: 'Unauthorized: no token provided' });

  let user;
  try {
    const idVerifier = await getIDVerifier();
    user = await idVerifier.verify(token);
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }

  try {
    const videos = await VideoModel.getVideosByAuthor(user.sub);
    res.json(videos);
  } catch (e) {
    console.error('DB error:', e);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
};

const getVideo = async (req, res) => {
  try {
    const videoID = req.params.id;
    const video = await VideoModel.getVideoById(videoID);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.json(video); // or [video] depending on frontend
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Failed to fetch video" });
  }
};

// Delete a video of specific id
const deleteVideo = (req, res) => {
    const videoId = req.params.id;
    console.log('umm:',req.params.id)
    VideoModel.getVideoById(videoId, (err, video) => { // Assuming you have a method to get video metadata
        if (err) {
            return res.status(500).json({ message: 'Server error', error: err.message });
        }

        if (!video) { 
            return res.status(404).json({ message: 'Video not found' });
        }
        console.log("video")
        const videoPath = path.join(__dirname, '..', 'uploads', video[0].filename);
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', `${path.basename(video[0].filename, path.extname(video[0].filename))}.png`);
        console.log("do i get past dis")
        // Delete the video file and thumbnail
        fs.unlink(videoPath, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Failed to delete video file', error: err.message });
            }

            fs.unlink(thumbnailPath, (err) => {
                if (err) {
                    return res.status(500).json({ message: 'Failed to delete thumbnail file', error: err.message });
                }

                // Proceed to delete the video metadata
                VideoModel.deleteVideo(videoId, (err, wasDeleted) => {
                    if (err) {
                        return res.status(500).json({ message: 'Server error', error: err.message });
                    }

                    if (!wasDeleted) {
                        return res.status(404).json({ message: 'Video not found' });
                    }

                    res.status(200).json({ message: 'Video deleted successfully' });
                });
            });
        });
    });
};
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

// --- Codec mapping: map codec names from metadata to valid ffmpeg encoders
const codecMap = {
  h264: "libx264",
  hevc: "libx265",
  vp9: "libvpx-vp9",
  vp8: "libvpx",
  mpeg4: "mpeg4",
  theora: "libtheora"
};
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
        // Create output directory if it doesn't exist
        const outputDirectory = path.join(__dirname, '..', 'output_directory');
        fs.mkdirSync(outputDirectory, { recursive: true });
        
        const s3url = await aws_sdk_helpers.readFromUploads(videoData.filename)
        const tempInputPath = path.join(__dirname, '..', 'temp', videoData.filename);
        const outputFileName = `reformatted-${videoData.filename.split('.')[0]}.${newFormat.toLowerCase()}`;
        const outputPath = path.join(outputDirectory, outputFileName);

        // Ensure temp directory exists
        fs.mkdirSync(path.dirname(tempInputPath), { recursive: true });
        console.log("temp path", tempInputPath)
        // Download from S3 to temp file
        await new Promise((resolve, reject) => {
            axios({
                method: 'get',
                url: s3url,
                responseType: 'stream'
            })
            .then(response => {
                const writer = fs.createWriteStream(tempInputPath);
                response.data.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', reject);
            })
            .catch(reject);
        });
        console.log("downloaded to temp file")
        // Check if formats are the same
        if (format.toLowerCase() === newFormat.toLowerCase()) {
            // If same format, just copy to output directory
            fs.copyFileSync(tempInputPath, outputPath);
            fs.unlinkSync(tempInputPath); // Clean up temp file
            return res.redirect(307, `/download`); // Adjust this URL to match your routes
        }
        console.log("formats are different, converting...")
        // Perform the conversion
        await new Promise((resolve, reject) => {
            ffmpeg(tempInputPath)
                .toFormat(newFormat)
                .save(outputPath)
                .on('end', () => {
                    fs.unlink(tempInputPath, (err) => {
                        if (err) console.error('Error deleting temp file:', err);
                    });
                    resolve();
                })
                .on('error', (err) => {
                    fs.unlink(tempInputPath, (err) => {
                        if (err) console.error('Error deleting temp file:', err);
                    });
                    reject(err);
                });
        });
        console.log("conversion done, output at:", outputPath)
        res.status(200).json({ message: 'Video reformatted successfully', outputFileName });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error reformating', error: error.message });
    }
};


// Function to download video
const downloadVideo = (req, res) => {
    const outputDirectory = path.join(__dirname, '..', 'output_directory');
    
    fs.readdir(outputDirectory, (err, files) => {
        if (err) {
            return res.status(500).json({ message: 'Error reading output directory', error: err });
        }

        // Filter for video files based on possible extensions
        const videoFile = files.find(file => Object.values(mimeTypeToFormat).some(ext => file.endsWith(`.${ext}`)));

        if (!videoFile) {
            return res.status(404).json({ message: 'No video file found in the output directory' });
        }

        const filePath = path.join(outputDirectory, videoFile);

        // Extract the MIME type from the file extension
        const fileExtension = path.extname(videoFile).substring(1); // Get file extension without the dot
        const mimeType = Object.keys(mimeTypeToFormat).find(key => mimeTypeToFormat[key] === fileExtension);

        if (!mimeType) {
            return res.status(415).json({ message: 'Unsupported video file format' });
        }

        // Set the Content-Type header based on the MIME type
        res.setHeader('Content-Type', mimeType);

        // Use res.download to send the file to the client with the correct filename
        res.download(filePath, videoFile, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error downloading video file', error: err });
            }

            // Optionally delete the file after download
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting video file:', err);
                }
            });
        });
    });
};

module.exports = {
    uploadVideo,
    authorVideo,
    getVideo,
    deleteVideo,
    reformatVideo,
    downloadVideo,
}