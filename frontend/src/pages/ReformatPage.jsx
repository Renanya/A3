// ReformatPage.jsx
import { useEffect, useState } from 'react';
import ReformatForm from '../forms/ReformatForm';
import './ReformatPage.css';
import { useParams } from 'react-router-dom';
import axios from '../api/axios';
const { baseURL } = require('../Baseurl');

function Reformat() {
  const { id } = useParams();
  const [videoData, setVideoData] = useState(null);   // ← start null
  const [thumbnailURL, setThumbnailURL] = useState('');
  const BASE_URL = baseURL;

  const formatSize = (bytes = 0) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDuration = (seconds = 0) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  useEffect(() => {
    // make sure axios baseURL includes /api, so this hits /api/video/:id
    axios.get(`video/${id}`)
      .then((res) => {
        // if your backend now returns a single object:
        console.log("API /video response:", res.data); // 👈 log it
        setVideoData(res.data);
        // if it still returns an array, use: setVideoData(res.data?.[0] ?? null);
      })
      .catch((err) => {
        console.error('Error fetching video data:', err);
      });
  }, [id]);

    useEffect(() => {
    if (videoData && videoData.thumbnail) {
        setThumbnailURL(encodeURI(BASE_URL + videoData.thumbnail));
  }
}, [videoData, BASE_URL]);

  // Only render once data is loaded
  if (!videoData) return <div>Loading...</div>;

  return (
    <div className='reformat-bg'>
      <div className="video-wrapper">
        {thumbnailURL && (
          <img className="video-thumbnail" src={thumbnailURL} alt="Video Thumbnail" />
        )}
        <h1 className="video-name">{videoData.filename}</h1>
        <div className="video-details">
          <span><strong>Size: </strong>{formatSize(videoData.size)}</span>
          <span><strong>Duration: </strong>{formatDuration(videoData.duration)} mins</span>
          <span><strong>File Type: </strong>{videoData.mimetype}</span>
          <span><strong>Codec Type: </strong>{videoData.codec}</span>
          <span><strong>Upload Date: </strong>{videoData.uploadDate}</span>
        </div>
      </div>

      {/* Either pass the whole object, or pass individual fields */}
      <ReformatForm
        filename={videoData.filename}
        mimetype={videoData.mimetype}
        filepath={videoData.filepath}
        codec={videoData.codec}
      />
      {/* Or: <ReformatForm videoData={videoData} /> and guard inside the form */}
    </div>
  );
}

export default Reformat;
