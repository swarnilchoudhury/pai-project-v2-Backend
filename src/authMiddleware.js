const { admin, auth } = require("./credentials/firebaseCredentials");

const verifyIdToken = async (req, res, next) => {

  try {

    const authTokenCookie = req.cookies.authToken;

    if (authTokenCookie != undefined && authTokenCookie != null
        && authTokenCookie != '') 
    {
      await admin.auth().verifyIdToken(authTokenCookie);
    }
    else {
      return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    next();
  }
  catch (error) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

module.exports = { verifyIdToken };
