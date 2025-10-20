// Import Packages
const Cognito = require("@aws-sdk/client-cognito-identity-provider");
const jwt = require("aws-jwt-verify");
const crypto = require("crypto");

// Import Middleware Functions for AWS
const aws_sdk_helpers = require('../middleware/aws_sdk.js');

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
    console.log("[getIDVerifier] Unable to retrieve parameters" + error);
  }

  return idVerifier;
}
////////// Middleware Helper Functions for Paramters
async function getAccessVerifier() {
  let accessVerifier;

  try {
    const userPoolID = await aws_sdk_helpers.getParameterFromSSM("cognito/userPoolID");
    const clientID = await aws_sdk_helpers.getParameterFromSSM("cognito/clientID");

    accessVerifier = jwt.CognitoJwtVerifier.create({
      userPoolId: userPoolID,
      tokenUse: "access",
      clientId: clientID,
    });

    console.log("[getAccessVerifier] Successfully retrieved parameters");
  } catch (error) {
    console.log("[getAccessVerifier] Unable to retrieve parameters" + error);
  }

  return accessVerifier;
}
async function getSecretHash(userName) {
  let hasher;

  try {
    const clientID = await aws_sdk_helpers.getParameterFromSSM("cognito/clientID");
    const secretString = await aws_sdk_helpers.getSecretFromSEC("cognito/clientSecret");
    const clientSecret = JSON.parse(secretString).clientSecret;
    hasher = crypto.createHmac('sha256', clientSecret);
    hasher.update(`${userName}${clientID}`);
    console.log("[secretHash] Successfully retrieved parameters and secrets");
  } catch (error) {
    console.log("[secretHash] Unable to retrieve parameters and secrets");
  }
  return hasher.digest('base64');
};

// Register a new user
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const client = new Cognito.CognitoIdentityProviderClient({ region: 'ap-southeast-2' });

    if (!username || !email || !password) 
        return res.status(400).json({ message: 'All fields are required' });
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) 
        return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) 
        return res.status(400).json({ message: 'Invalid email format' });
    // const hashedPassword = await bcrypt.hash(password, saltRounds);

    // await the async createUser function
    // const userID = await userModel.createUser(username, email, hashedPassword);
    const secretHash = await getSecretHash(username);
    const clientID = await aws_sdk_helpers.getParameterFromSSM("cognito/clientID");
    const command = new Cognito.SignUpCommand({
        ClientId: clientID,
        SecretHash: secretHash,
        Username: username,
        Password: password,
        UserAttributes: [{ Name: "email", Value: email }],
    }); 
    await client.send(command);
    console.log(res);
    res.status(201).json({ message: 'User created successfully'});

  } catch (err) {
    console.error('Register error:', err.message);

    if (err.message === 'Username already exists' || err.message === 'Email already exists') {
      return res.status(409).json({ message: err.message });
    }

    res.status(500).json({ message: 'Server error' });
  }
};

const login = async (req, res) => {
  const { username, password, code } = req.body || {};
  if (!username || !password) {
    // code is optional on first call
    return res.status(400).json({ message: "All fields are required" });
  }

  const client = new Cognito.CognitoIdentityProviderClient({ region: "ap-southeast-2" });
  const clientID = await aws_sdk_helpers.getParameterFromSSM("cognito/clientID");
  const secretHash = await getSecretHash(username);
  const ISSUER = "CAB432"; // show in authenticator app

  // Read any temp sessions we stored earlier
  const mfaSession = req.signedCookies?.mfa_session || req.cookies?.mfa_session;     // for SOFTWARE_TOKEN_MFA
  const totpSession = req.signedCookies?.totp_session || req.cookies?.totp_session;   // for MFA_SETUP flow
  console.log("mfaSession:", mfaSession);
  console.log("totpSession:", totpSession);
  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Fast path: client is sending an OTP code now
    // ─────────────────────────────────────────────────────────────────────────────
    if (code) {
      // A) User already enrolled → SOFTWARE_TOKEN_MFA path
      if (mfaSession) {
        const finish = await client.send(
          new Cognito.RespondToAuthChallengeCommand({
            ClientId: clientID,
            ChallengeName: "SOFTWARE_TOKEN_MFA",
            Session: mfaSession,
            ChallengeResponses: {
              USERNAME: username,
              SOFTWARE_TOKEN_MFA_CODE: code,
              SECRET_HASH: secretHash, // required when GenerateSecret=true
            },
          })
        );
        if (!finish.AuthenticationResult) {
          return res.status(401).json({ message: "MFA failed" });
        }

        const IdToken = finish.AuthenticationResult.IdToken;
        const idVerifier = await getIDVerifier()  
        const IdTokenVerifyResult = await idVerifier.verify(IdToken); 
        console.log(IdTokenVerifyResult);
        res.clearCookie("mfa_session", { path: "/" });
        // set your app cookie(s)
        res.cookie("token", IdToken, { ...cookieOpts });
        return res.status(200).json({ message: "Login successful" });
      }

      // B) User is enrolling now → verify TOTP then complete MFA_SETUP
      if (totpSession) {
        const verify = await client.send(
          new Cognito.VerifySoftwareTokenCommand({
            Session: totpSession,
            UserCode: code,
            FriendlyDeviceName: "Authenticator",
          })
        );
        if (verify.Status !== "SUCCESS" || !verify.Session) {
          return res.status(401).json({ message: "Invalid TOTP code" });
        }

        const finish = await client.send(
          new Cognito.RespondToAuthChallengeCommand({
            ClientId: clientID,
            ChallengeName: "MFA_SETUP",
            Session: verify.Session,
            ChallengeResponses: { USERNAME: username, SECRET_HASH: secretHash },
          })
        );
        if (!finish.AuthenticationResult) {
          return res.status(500).json({ message: "Failed to complete MFA setup" });
        }

        const IdToken = finish.AuthenticationResult.IdToken;
        const idVerifier = await getIDVerifier()  
        const IdTokenVerifyResult = await idVerifier.verify(IdToken); 
        console.log(IdTokenVerifyResult);
        res.clearCookie("totp_session", { path: "/" });
        res.cookie("token", IdToken, { ...cookieOpts });
        return res.status(200).json({ message: "Login successful" });
      }

      // If code provided but no session cookies, client likely skipped the first step
      return res.status(400).json({ message: "Missing/expired session. Re-enter username & password." });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // First pass: no code yet → start auth with username/password
    // ─────────────────────────────────────────────────────────────────────────────
    const init = await client.send(
      new Cognito.InitiateAuthCommand({
        ClientId: clientID,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: username, PASSWORD: password, SECRET_HASH: secretHash },
      })
    );

    // 2) User has TOTP enabled → ask for code (store session)
    if (init.ChallengeName === "SOFTWARE_TOKEN_MFA" && init.Session) {
      res.cookie("mfa_session", init.Session, { ...cookieOpts });
      return res.status(200).json({
        next: "MFA_CODE_REQUIRED",
        challenge: "SOFTWARE_TOKEN_MFA",
        message: "Enter 6-digit code",
      });
    }

    // 3) User must enroll TOTP now → start enrollment, return QR + store latest session
    if (init.ChallengeName === "MFA_SETUP" && init.Session) {
      const assoc = await client.send(
        new Cognito.AssociateSoftwareTokenCommand({ Session: init.Session })
      );
      if (!assoc.SecretCode || !assoc.Session) {
        return res.status(500).json({ message: "Could not start TOTP enrollment" });
      }

      const otpauthUri = buildOtpAuthUri(assoc.SecretCode, ISSUER, username);
      // store the *latest* session for VerifySoftwareToken
      res.cookie("totp_session", assoc.Session, { ...cookieOpts });
      return res.status(200).json({
        next: "MFA_SETUP_REQUIRED",
        otpauthUri,
        secretCode: assoc.SecretCode, // optional to display as manual key
        message: "Scan QR and submit the 6-digit code",
      });
    }

    // 4) Other challenges (e.g., NEW_PASSWORD_REQUIRED)
    return res.status(409).json({
      message: "Additional challenge",
      challengeName: init.ChallengeName,
      session: init.Session,
    });
  } catch (err) {
    console.error(err);
    if (err.name === "NotAuthorizedException" || err.name === "UserNotFoundException") {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    return res.status(500).json({ message: "Auth error" });
  }
};


// Logout a user
const logout = (req, res) => {
    // Clear the token cookie
    res.clearCookie('token', {
        httpOnly: true, // Ensure it matches the cookie attributes used when setting it
        secure: process.env.NODE_ENV === 'production', // Use the same secure setting
        sameSite: 'Strict', // Match the sameSite attribute
        path: '/' // important to match the original cookie
    });

    // Send a response to indicate successful logout
    res.status(200).json({ message: 'Logged out successfully' });
};


// Cookie options
const cookieOpts = {
  httpOnly: true,
  sameSite: "Lax",  // dev: keep both front & back on localhost to avoid cross-site
  secure: false,    // dev over http; in prod use true + SameSite: 'None'
  path: "/",
  maxAge: 10 * 60 * 1000, // 10 minutes; keep short
};
const confirm = async (req, res) => {
  const { username, password, confirmationCode } = req.body;
  if (!username || !confirmationCode || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const client = new Cognito.CognitoIdentityProviderClient({ region: "ap-southeast-2" });

  // Fetch app client id & secret hash
  const clientID = await aws_sdk_helpers.getParameterFromSSM("cognito/clientID");
  const secretHash = await getSecretHash(username);

  // 1) Confirm sign-up
  try {
    const confirmCmd = new Cognito.ConfirmSignUpCommand({
      ClientId: clientID,
      SecretHash: secretHash,
      Username: username,
      ConfirmationCode: confirmationCode,
    });
    await client.send(confirmCmd);
  } catch (err) {
    console.log(err);
    if (err.name === "CodeMismatchException" || err.name === "UserNotFoundException") {
      return res.status(401).json({ message: "Invalid confirmation code" });
    }
    if (err.name === "NotAuthorizedException") {
      return res.status(401).json({ message: "User already confirmed" });
    }
    return res.status(500).json({ message: "Server error" });
  }

  // 2) Sign in (USER_PASSWORD_AUTH)
  let auth;
  try {
    const authCmd = new Cognito.InitiateAuthCommand({
      AuthFlow: Cognito.AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: secretHash,
      },
      ClientId: clientID,
    });
    auth = await client.send(authCmd);
    console.log(auth);
  } catch (err) {
    console.log(err);
    if (err.name === "NotAuthorizedException" || err.name === "UserNotFoundException") {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    return res.status(500).json({ message: "Server error" });
  }
  // ---------- PATH B: MFA_SETUP (no tokens; use Session) ----------
  if (auth.ChallengeName === "MFA_SETUP" && auth.Session) {
    try {
      const assoc = await client.send(
        new Cognito.AssociateSoftwareTokenCommand({ Session: auth.Session })
      );
      if (!assoc.SecretCode || !assoc.Session) {
        return res.status(500).json({ message: "AssociateSoftwareToken did not return secret/session" });
      }
      console.log(assoc);
      const issuer = "CAB432";
      const label = encodeURIComponent(`${issuer}:${username}`);
      const otpauthUri =
        `otpauth://totp/${label}` +
        `?secret=${assoc.SecretCode}` +
        `&issuer=${encodeURIComponent(issuer)}` +
        `&algorithm=SHA1&digits=6&period=30`;
      console.log(otpauthUri);
      // Return QR + new session for Verify step
    // IMPORTANT: rotate cookie to the *latest* session returned here
      res.cookie("totp_session", assoc.Session, {
        httpOnly: true,
        sameSite: "Lax",     // dev: Lax; prod (cross-site): 'None' + secure: true
        secure: false,       // dev over http; prod true over https
        path: "/",
        maxAge: 10 * 60 * 1000,
      });
      return res.status(200).json({
        message: "User confirmed. TOTP enrollment started (session path).",
        next: "VERIFY_WITH_SESSION",
        secretCode: assoc.SecretCode,
        otpauthUri,
        session: assoc.Session, // <-- keep this; needed for VerifySoftwareToken
        username,               // <-- needed for RespondToAuthChallenge
      });
    } catch (err) {
      return res.status(500).json({ message: "Failed to start TOTP enrollment (session path)"+err });
    }
  }
};

const verifyTotp = async (req, res) => {
  const { username, code } = req.body || {};
  const session = req.signedCookies?.totp_session || req.cookies?.totp_session;
  if (!session || !username || !code) {
    return res.status(400).json({ message: "session, username, and code are required" });
  }

  const client = new Cognito.CognitoIdentityProviderClient({ region: "ap-southeast-2" });

  try {
    // 1) Verify the user's 6-digit code using the Session (not AccessToken)
    const verify = await client.send(
      new Cognito.VerifySoftwareTokenCommand({
        Session: session,
        UserCode: code,
        FriendlyDeviceName: "Authenticator",
      })
    );

    if (verify.Status !== "SUCCESS" || !verify.Session) {
      return res.status(401).json({ message: "Invalid TOTP code or missing session" });
    }

    // 2) Complete the MFA_SETUP challenge to get tokens
    const clientID = await aws_sdk_helpers.getParameterFromSSM("cognito/clientID");
    const secretHash = await getSecretHash(username); // required if your app client has a secret

    const finish = await client.send(
      new Cognito.RespondToAuthChallengeCommand({
        ClientId: clientID,
        ChallengeName: "MFA_SETUP",
        Session: verify.Session, // <- the new session from VerifySoftwareToken
        ChallengeResponses: {
          USERNAME: username,
          SECRET_HASH: secretHash, // include when GenerateSecret=true on the client
        },
      })
    );

    if (!finish.AuthenticationResult) {
      return res.status(500).json({ message: "Failed to complete MFA_SETUP" });
    }

    const tokens = finish.AuthenticationResult;

    // 3) Optional: mark software-token as preferred (now we *do* have an AccessToken)
    try {
      await client.send(
        new Cognito.SetUserMFAPreferenceCommand({
          AccessToken: tokens.AccessToken,
          SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
        })
      );
    } catch (e) {
      // Not critical; TOTP is already verified and required if your pool enforces MFA
      console.warn("SetUserMFAPreference failed (optional):", e?.name || e);
    }

    return res.status(200).json({
      message: "TOTP enabled (session path)",
      tokens, // id/access/refresh tokens
    });
  } catch (err) {
    console.error(err);
    if (err.name === "CodeMismatchException") {
      return res.status(401).json({ message: "Invalid TOTP code" });
    }
    if (err.name === "NotAuthorizedException") {
      return res.status(401).json({ message: "Invalid or expired session — restart sign-in" });
    }
    return res.status(500).json({ message: "Failed to verify TOTP (session path)" });
  }
};

const ban = async (req, res) => {
  // Extract information from the request
  let token = req.cookies?.token;
  const targetUser = req.body.targetUser;
  
  // Check that the request contains a token...
  if (!token) {
    res.status(401).json({message: "Malformed request: Token required."});
  }
  
  // Verify the Token
  let requestUser;
  try {
    const idVerifier = await getIDVerifier();
    const user = await idVerifier.verify(token);
    requestUser = user["cognito:username"];
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Token.' });
  }

  // Check that the user making the request is an Admin
  console.log("[/ban] Check request user admin status...");
  const userAdminStatus = await aws_sdk_helpers.isUserAdmin(requestUser);
  if(!userAdminStatus) {
    res.status(401).json({message: "Unauthorized: You do not have sufficient permissions to action this request."})
  }

  // Check that the user making the request isn't the same as the target user,
  // or that the target user is another admin.
  console.log("[/ban] Check target user admin status...");
  const targetAdminStatus = await aws_sdk_helpers.isUserAdmin(targetUser); 
  if(requestUser === targetUser || targetAdminStatus) {
    res.status(403).json({message: "Forbidden: You do not have sufficient permissions to ban this user."})
  }

  // Action the Ban
  aws_sdk_helpers.banUser(targetUser)
  .then((response) => {
    if(response) {
      res.status(200).json({message: `Accepted: User was banned`});
    } else {
      res.status(400).json({message: `Rejected: User was not banned`});
    }
  })
  .catch((error) => {
    res.status(500).json({message: error});
  })

  return;
}

module.exports = {
    register, 
    login,
    logout,
    confirm,
    verifyTotp,
    ban,
}