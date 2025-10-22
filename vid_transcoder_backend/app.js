const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path')
// require('dotenv').config()

require('./controller/videoController');


const app = express();


// CORS first
app.use(cors({
  origin: true,
  methods: ['GET','PUT','POST','DELETE'],
  credentials: true,
}));

// Enable file upload BEFORE body parsers; set limits
app.use(fileUpload({
  createParentPath: true,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB, adjust for your needs
  abortOnLimit: true,
}));

app.use(cookieParser());

// Body parsers (safe after fileUpload)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Simple health route
app.get('/', (req, res) => res.send('Backend is running!'));

// ONE listen only
const PORT = 8000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
