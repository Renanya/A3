import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from '../api/axios';

function BanUser() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [banned, setBanned] = useState(null);
    const [username, setUsername] = useState(null);

    useEffect(() => {
        setUsername(searchParams.get("username"));
    }, [searchParams]);

    const handleBanUser = async () => {
        axios.post(`/ban`, {targetUser: `${username}`})
        .then((response) => {
            if(response.status === 200) {
                setBanned(true);
                alert("User successfully banned.")
            } else {
                const responseMessage = `${response.status}: ${response.message}`;
                setBanned(false);
                alert(`${responseMessage}`);
            }
        })
        .catch((error) => {
            const errorMessage = `Error ${error.response.status}: ${error.response.data.message}`;
            setBanned(false);
            alert(errorMessage);
        })
    }

    if(!banned) {
     return (
        <div className='ban-user-div'>
            <h3 className="ban-user-header">{`Are you sure you want to ban: ${username}?`}</h3>
            <button type="submit" className="ban-button" onClick={handleBanUser}>
                <span>Confirm</span> 
            </button>
        </div>
     )
    } else {
        <div className='ban-user-div'>
            <h3 className="ban-user-header">{`${username} Banned.`}</h3>
            <button type="submit" className="nav-button" onClick={navigate('/')}>
                <span>Return Home</span> 
            </button>
        </div>
    }
}

export default BanUser;