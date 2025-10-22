import { useState } from 'react';
import { FaArrowsRotate, FaDownload } from "react-icons/fa6";
import './ReformatForm.css';
import axios from '../api/axios';
import { useNavigate } from 'react-router-dom';
function ReformatForm(videos) {

    const [format, setFormat]  = useState("mp4");
    const [codec] = useState ("libx264");
    const [showDownloadButton, setShowDownloadButton] = useState(false);
    const [showText, setShowText] = useState(false);

    const navigate = useNavigate();

    // Handler for format select change
    const handleFormatChange = (e) => {
        setFormat(e.target.value);
    };

    const handleReformat = async (e) => {
        e.preventDefault();

        try {
            setShowText(true);

            const payload = {
                format,
                videoData: {
                    filename: videos.filename,
                    mimetype: videos.mimetype,
                    filepath: videos.filepath,
                    codec: videos.codec
                }
            };

            console.log("Sending reformat payload:", payload);

            const response = await axios.post('/reformat', payload, { responseType: 'blob' });

            if (response.status === 200) {
                setShowText(false);
                // Get the filename from Content-Disposition header if available
                let filename = "reformatted-video." + format;
                const disposition = response.headers['content-disposition'];
                if (disposition && disposition.indexOf('filename=') !== -1) {
                    filename = disposition.split('filename=')[1].replace(/"/g, '');
                }
                // Create a link and trigger download
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);
                setShowDownloadButton(false);
                alert("Download successful");
            } else {
                alert("Status code not 200");
            }
        } catch (err) {
            setShowText(false);
            if (err.response?.data?.message) {
                const errorMessage = `Error ${err.response.status}: ${err.response.data.message}`;
                alert(errorMessage);
            } else {
                console.error(err);
            }
        }
    };

    const handleDownloads = async (e) => {
        e.preventDefault();
    
        const baseFilename = videos.filename.replace(/\.[^/.]+$/, "");
        const newFilename = `${baseFilename}.${format}`;

        try {
            const response = await axios.post('/download', {}, { responseType: 'blob' });
    
            if (response.status === 200) {

                // Create a link element
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
    
                // Set the download attribute with a filename
                link.setAttribute('download', newFilename); // Set the appropriate filename and extension
    
                // Append the link to the body
                document.body.appendChild(link);
    
                // Programmatically click the link to trigger the download
                link.click();
    
                // Clean up and remove the link
                link.parentNode.removeChild(link);
    
                alert("Download successful");
                navigate('/videos');
            } else {
                alert("Status code not 200");
            }
        } catch (err) {
            if (err.response && err.response.data && err.response.data.message) {
                const errorMessage = `Error ${err.response.status}: ${err.response.data.message}`;
                alert(errorMessage);
            } else {
                console.error(err);
            }
        }
    };
    
    return (
        <div className="reformat-form-container">
            <form className="reformat-form">
                <label htmlFor="format" className="reformat-label">Select video format:</label>
                <select id="format" name="format" className="reformat-select" onChange={handleFormatChange}>
                    <option value="mp4" defaultValue>MP4</option>
                    <option value="avi">AVI</option>
                    <option value="mov">MOV</option>
                    <option value="flv">FLV</option>
                    <option value="webm">WebM</option>
                    <option value="mpeg">MPEG</option>
                    <option value="3gp">3GP</option>
                    <option value="ogg">Ogg</option>
                </select>                
                {/* <label htmlFor="codec" className="reformat-label">Select video codec: </label>
                <select id="codec" name="codec" className="reformat-select" onChange={handleCodecChange}>
                    <option value="libx264" selected>H.264 (libx264)</option>
                    <option value="libx265">H.265/HEVC (libx265)</option>
                    <option value="libvpx">VP8 (libvpx)</option>
                    <option value="libvpx-vp9">VP9 (libvpx-vp9)</option>
                    <option value="mpeg4">MPEG-4 Part 2 (mpeg4)</option>
                    <option value="libtheora">Theora (libtheora)</option>
                </select> */}
            </form>
            <div className='reformat-form-buttons'>
                <button type="submit" className="reformat-button" onClick={handleReformat}>
                    <span>Reformat</span> 
                    <FaArrowsRotate />
                </button>
                {showDownloadButton && (
                    <button type="button" className="reformat-button" onClick={handleDownloads}>
                        <span>Download</span> 
                        <FaDownload />
                    </button>
                )}
            </div>
            {showText && (
                <span className='loading-text'>Reformating...</span>
            )}
        </div>
    );
}

export default ReformatForm;
