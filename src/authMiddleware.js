const { admin, auth } = require("./credentials/firebaseCredentials");
const config = require("../config/config.json")
var jwt = require('jsonwebtoken');

const fetchAuthToken = (req) => {

  const authToken = req.headers.authorization?.split('Bearer ')[1];
  try {
    var decoded = jwt.verify(authToken, config.SecretKey);
  }
  catch{
    return null;
  }

  return decoded;
}

const verifyIdToken = async (req, res, next) => {
  try {
    if (req != null && req != undefined) {

      const decoded = fetchAuthToken(req);

      if (decoded) {
        await admin.auth().verifyIdToken(decoded.authToken);
      }
      else {
        return res.sendStatus(401);
      }

    }

    next();
  }
  catch (error) {
    return res.sendStatus(401);
  }
};



module.exports = { verifyIdToken, fetchAuthToken };
