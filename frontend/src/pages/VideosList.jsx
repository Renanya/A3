import './VideosList.css'
import VideoCards from "../forms/VideoCards"
import { Link } from 'react-router-dom'

import React, { useEffect, useState } from 'react'
import axios from '../api/axios'

function Video() {

    const [myVideos, setMyVideos] = useState([])
    const token = localStorage.getItem('token');
    console.log('Token from localStorage:', token);

    const viewUserVideos = () => {
        axios.get("videos",{
             withCredentials: true
        })
        .then((response) => {
            setMyVideos(response.data)
        })
        .catch((error) => {
            console.error("Error fetching data:", error);
        })
    }

    useEffect(() => {
        viewUserVideos()
    }, [])



    return (
        <div className='section'>
            <h1 className='video-title'>My Videos</h1>
            <div className = 'content'>
                {myVideos.length > 0 ? (
                    myVideos.map((video, index) => (
                        <VideoCards 
                            key={index}
                            videos = {video}
                            viewUserVideos = {viewUserVideos}
                        />
                    ))
                ) : (
                    <div className='no-content'>
                        <p className = "no-vid"><Link to="/upload"><span>Click me to Upload Videos!</span></Link></p>
                        
                    </div>
                )}
            </div>
        </div>
    )
}
export default Video