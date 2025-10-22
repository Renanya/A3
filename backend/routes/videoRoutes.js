const express = require('express');
const router = express.Router();
const videoController = require('../controller/videoController');


router.post('/upload', videoController.uploadVideo)
router.get('/videos', videoController.authorVideo)
router.get('/video/:id', videoController.getVideo)
router.post('/reformat', videoController.reformatVideo)
router.post('/download', videoController.downloadVideo)
router.post("/reformat-queue", videoController.reformatQueuer);

module.exports = router;