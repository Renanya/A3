const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path')
// require('dotenv').config()

const userRoutes = require('./routes/userRoutes');
const videoRoutes = require('./routes/videoRoutes');

const app = express();

const userModel = require('./models/users')

// CORS first
app.use(cors({
  origin: false,
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


// Routes
app.use('/api', userRoutes);
app.use('/api', videoRoutes);


// Serve static files from 'uploads' and 'thumbnails' directories
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));


// Simple health route
app.get('/', (req, res) => res.send('Backend is running!'));

// ONE listen only
const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
