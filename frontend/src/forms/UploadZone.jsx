import { useEffect, useRef, useState } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/solid';
import { ImCross } from 'react-icons/im';
import axios from '../api/axios.js';
import './UploadZone.css';

const fileKey = (f) => `${f.name}_${f.size}_${f.lastModified ?? ''}`;

function UploadZone({ className }) {
  const [files, setFiles] = useState([]);
  const [rejected, setRejected] = useState([]);
  const inputRef = useRef(null);

  const openPicker = () => inputRef.current?.click();

  const addFiles = (selected) => {
    const existingKeys = new Set(files.map(fileKey));
    const nextAccepted = [];
    const nextRejected = [];

    selected.forEach((f) => {
      // accept only videos (mirrors accept="video/*")
      if (!f.type?.startsWith('video/')) {
        nextRejected.push({
          file: f,
          errors: [{ code: 'file-invalid-type', message: 'Only video files are allowed' }],
        });
        return;
      }
      if (!existingKeys.has(fileKey(f))) {
        nextAccepted.push(Object.assign(f, { preview: URL.createObjectURL(f) }));
      }
    });

    if (nextAccepted.length) setFiles((prev) => [...prev, ...nextAccepted]);
    if (nextRejected.length) setRejected((prev) => [...prev, ...nextRejected]);
  };

  const onFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length) addFiles(selected);
    // allow picking the same file again later
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (name) => {
    setFiles((fs) => {
      fs.forEach((f) => {
        if (f.name === name && f.preview) URL.revokeObjectURL(f.preview);
      });
      return fs.filter((f) => f.name !== name);
    });
  };

  const removeRejected = (name) =>
    setRejected((rs) => rs.filter(({ file }) => file.name !== name));

  const removeAll = () => {
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    setRejected([]);
  };

  // cleanup on unmount
  useEffect(() => {
    return () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmits = async (e) => {
    e.preventDefault();
    if (!files?.length) return alert('No files selected');

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    try {
      const res = await axios.post('upload', formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0,
      });

      if (res.status === 201 || res.status === 200) {
        removeAll();
        alert('Successful Upload');
      } else {
        alert(`Unexpected status: ${res.status}`);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data ||
        err?.message ||
        'Upload failed';
      alert(`Error: ${msg}`);
    }
  };

  return (
    <form onSubmit={handleSubmits} className="Upload-form">
      {/* Clickable area */}
      <div
        onClick={openPicker}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}
        className={className}
        style={{ borderWidth: '4px', height: '400px', borderRadius: '20px', cursor: 'pointer' }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowUpTrayIcon style={{ width: 48, height: 48 }} />
          <p>Click to select video files</p>
        </div>
      </div>

      <section className="below-Upload">
        <div className="Upload-buttons">
          <button type="button" onClick={removeAll} className="remove-button">
            Remove all files
          </button>
          <button type="submit" className="upload-button">
            Upload Files
          </button>
        </div>

        <h3 className="accepted-title">Accepted Files</h3>
        <ul className="accepted-list">
          {files.map((file) => (
            <li key={fileKey(file)} className="accepted-card">
              <button
                type="button"
                className="x-button"
                onClick={() => removeFile(file.name)}
                aria-label={`Remove ${file.name}`}
              >
                <ImCross className="text-danger" style={{ fontSize: '16px' }} />
              </button>
              <p>{file.name}</p>
            </li>
          ))}
        </ul>

        <h3 className="rejected-title">Rejected Files</h3>
        <ul className="reject-list">
          {rejected.map(({ file, errors }) => (
            <li key={fileKey(file)} className="rejected-card">
              <button
                type="button"
                className="x-button"
                onClick={() => removeRejected(file.name)}
                aria-label={`Remove ${file.name}`}
              >
                <ImCross className="text-danger" style={{ fontSize: '16px' }} />
              </button>
              <div>
                <p>{file.name}</p>
                <ul>
                  {errors.map((er) => (
                    <li key={er.code}>{er.message}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}

export default UploadZone;
