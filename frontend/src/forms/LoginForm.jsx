import './LoginForm.css'
import {useState, useEffect} from 'react'
import { useNavigate }from 'react-router-dom'
import axios from '../api/axios'
import { useToken } from '../TokenContext';
import QRCode from "react-qr-code";
function LoginForm(){
    // Preparing the forms for inputs
    const[action, setAction] = useState('')
    const[username, setUsername]= useState('')
    const[password, setPassword]= useState('')
    const[confirmationCode, setConfirmationCode]= useState('')
    const[code, setCode] = useState('')
    const[otpkey, setOtpkey] = useState('')
    const[accessToken, setAccessToken] = useState('')
    const[qrUri, setQrUri] = useState('')
    // const[secretCode, setSecretCode] = useState('') --- IGNORE ---
    const[session, setSession] = useState('')
    const[email, setEmail]= useState('')
    const { } = useToken();
    const navigate = useNavigate()

    useEffect(() => {
        if(document.cookie){
            console.log(document.cookie)
        } else {
            console.log("no cookie")
        }
    }, [])
    // Clears all input fields 
    const clearInfo = () => {
        setUsername('');
        setPassword('');
        setEmail('');
        setConfirmationCode('');
    };

    const movetoLogin = () =>{
        clearInfo()
        setAction('')
    }
    const movetoRegister=()=>{
        clearInfo()
        setAction(' active')
    }
    const movetoConfirm=()=>{
        clearInfo()
        setAction(' confirm')
    }
    const movetoOTP=()=>{
        clearInfo()
        setAction(' otp')
    }

    const handleLogins = async (e) => {
    e.preventDefault();
    try {
        const response = await axios.post("/login", {
        username,
        password,
        // send code only if the user has entered one
        ...(code ? { code } : {}),
        });

        if (response.status !== 200) {
        return alert("Unexpected status");
        }

        const data = response.data;

        // --- Intermediate states (no redirect) ---
        if (data.next === "MFA_CODE_REQUIRED") {
        // show OTP input; no QR for this path
        setQrUri("");        // make sure QR is hidden
        setOtpkey("");       // optional
        return alert("Please Input OTP");
        return;              // <-- stop here, do NOT navigate
        }

        if (data.next === "MFA_SETUP_REQUIRED") {
        // show QR for enrollment, then user will submit code
        setQrUri(data.otpauthUri);
        setOtpkey(data.secretCode ?? "");
        return alert("Please Input OTP");
        return;              // <-- stop here, do NOT navigate
        }

        // --- Success state from backend ---
        if (data.message === "Login successful") {
        // if your backend sets an HttpOnly cookie, you don't need to store a token
        // localStorage.setItem('token', data.token) // only if your API actually returns a token
        navigate("/videos");
        return;
        }

        // Fallback
        alert(data?.message || "Unexpected response");
    } catch (err) {
        const msg = err.response?.data?.message || "Login failed";
        alert(msg);
    }
    };



    const handleRegistrations = async(e) => {
        e.preventDefault();
        try {
            const response = await axios.post('/register', {
                username,
                email,
                password,
            })

            if (response.status === 201){
                movetoConfirm()
                alert("Registration Successful")
            }else{
                alert("status not 201")
            }
        }catch(err){
            if (err.response && err.response.data && err.response.data.message) {
                const errorMessage = `Error ${err.response.status}: ${err.response.data.message}`;
                alert(errorMessage);
            } else {
                console.error(err);
            }
        }
    }
    const handleConfirmations = async (e) => {
        e.preventDefault();
        // 1) confirm
        const confirmRes = await axios.post("/confirm", { username, password, confirmationCode });
        if (confirmRes.status !== 200) return alert(confirmRes.data?.message || "Confirm failed");

        // You will usually get an initial session back when challenge=MFA_SETUP:
        const session1 = confirmRes.data.session;
        if (!session1) return alert("Missing session from /confirm");

        // 2) start TOTP to obtain secret + QR + **latest** session
        setQrUri(confirmRes.data.otpauthUri);
        setOtpkey(confirmRes.data.secretCode);

        setSession(confirmRes.data.session);               // ✅ store LATEST session
        localStorage.setItem("totpSession", confirmRes.data.session); // optional backup

        movetoOTP();
    };

    const handleOTPsetup = async (e) => {
        e.preventDefault();

        await axios.post("/verify-totp", { username, code });

        alert("OTP Setup Successful");
        navigate("/videos");
    };


    return(
        <div className= {`wrapper${action}`}>
            <div className = "form-box login">
                <form action= "form-box login" onSubmit={handleLogins}>
                    <h1>Login</h1>
                    <div><h5>Username</h5></div>
                    <div className = "input-box">
                        <input type = "text" 
                        value = {username} 
                        onChange={(e)=>setUsername(e.target.value)} 
                        placeholder='Username' 
                        required/>
                    </div>
                    <h5>Password</h5>
                    <div className='input-box'>
                        <input type = 'text' 
                        value = {password} 
                        onChange={(e)=> setPassword(e.target.value)} 
                        placeholder='Password' 
                        required/>
                    </div>
                    <h5>OTP CODE</h5>
                    <div className='input-box'>
                        <input type = 'text' 
                        value = {code} 
                        onChange={(e)=> setCode(e.target.value)} 
                        placeholder='OTP Code (if set up)' 
                        />
                    </div>
                    <button type="submit">Login</button>
                    <div className="register-link">
                        <p><a href ="#" onClick={movetoRegister}>Click me to register yay!</a></p>
                    </div>
                    <div className="confirm-link">
                        <p><a href ="#" onClick={movetoConfirm}>Click me to confirm your account yay!</a></p>
                    </div>
                    <div className="otp-link">
                        <p><a href ="#" onClick={movetoOTP}>OTP Setup TIMEEEEEE!!!!</a></p>
                    </div>
                </form>
            </div>

            <div className="form-box register">
                <form action="form-box register" onSubmit={handleRegistrations}>
                    <h1>Register a new User!</h1>
                    <h5>Username</h5>
                    <div className = "input-box">
                        <input type = 'text' 
                        value = {username} 
                        onChange={(e)=> setUsername(e.target.value)} 
                        placeholder="Enter Username" 
                        required/>
                    </div>
                    <h5>Password</h5>
                    <div className = "input-box">
                        <input type = 'text' 
                        value = {password} 
                        onChange={(e)=> setPassword(e.target.value)} 
                        placeholder="Enter Password" 
                        required/>
                    </div>
                    <h5>Email</h5>
                    <div className = "input-box">
                        <input 
                        type = 'text' 
                        value = {email} 
                        onChange={(e)=> setEmail(e.target.value)} 
                        placeholder = "Enter Email Address" 
                        required/>
                    </div>
                    <button type="submit">Register!</button>
                    <div className="register-link"><p><a href = "#" onClick={movetoLogin}>Move back to login page</a></p> </div>
                </form>
            </div>
            <div className="form-box confirm">
                <form action="form-box confirm" onSubmit={handleConfirmations}>
                    <h1>Confirm your account!</h1>
                    <h5>Username</h5>
                    <div className = "input-box">
                        <input type = 'text' 
                        value = {username} 
                        onChange={(e)=> setUsername(e.target.value)} 
                        placeholder="Enter Username" 
                        required/>
                    </div>
                    <h5>Password</h5>
                    <div className = "input-box">
                        <input type = 'text' 
                        value = {password} 
                        onChange={(e)=> setPassword(e.target.value)} 
                        placeholder="Enter Password" 
                        required/>
                    </div>
                    <h5>Confirmation Code</h5>
                    <div className = "input-box">
                        <input type = 'text' 
                        value = {confirmationCode} 
                        onChange={(e)=> setConfirmationCode(e.target.value)} 
                        placeholder="Enter Confirmation Code" 
                        required/>
                    </div>
                    <button type="submit">Confirm!</button>
                    <div className="register-link"><p><a href = "#" onClick={movetoOTP}>Move back to login page</a></p> </div>
                </form>
            </div>
            <div className="form-box otp">
                <form action="form-box otp" onSubmit={handleOTPsetup}>
                    <h1>OTP Setup</h1>
                    <p>Scan the QR code with your Authenticator app (e.g. Google Authenticator, Authy)</p>
                    {qrUri ? <QRCode value={qrUri} size={224} /> : null}
                    <p>If you can't scan the QR code, use this manual key:</p>
                    {/* <p>Manual Key: {secretCode}</p> --- IGNORE --- */}
                    <p>Manual Key: {otpkey}</p>
                    <h5>Username</h5>
                    <div className = "input-box">
                        <input type = 'text' 
                        value = {username} 
                        onChange={(e)=> setUsername(e.target.value)} 
                        placeholder="Enter Username" 
                        required/>
                    </div>
                    <h5>OTP Code</h5>
                    <div className = "input-box">
                        <input type = 'text' 
                        value = {code} 
                        onChange={(e)=> setCode(e.target.value)} 
                        placeholder="Enter OTP Code" 
                        required/>
                    </div>
                    <button type="submit">Setup OTP!</button>
                    <div className="register-link"><p><a href = "#" onClick={movetoLogin}>Move back to login page</a></p> </div>
                </form>
            </div>
        </div>
    )
}
export default LoginForm