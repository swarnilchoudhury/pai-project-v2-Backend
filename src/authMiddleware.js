const { admin } = require("./credentials/firebaseCredentials");
const config = require("../config/config.json");
const jwt = require('jsonwebtoken');

const verifyIdToken = async (req, res, next) => {
  try {
    if (req != null && req != undefined) {
    
      const authToken = req.headers.authorization?.split('Bearer ')[1];

      try {
        if (req.url.includes("/login")) {
          await admin.auth().verifyIdToken(authToken);
        }
        else {
          jwt.verify(authToken, config.SecretKey);
        }

      }
      catch {
        return res.sendStatus(401);
      }
    }

    next();
  }
  catch (error) {
    return res.sendStatus(401);
  }
};


const fetchIdTokenDetails = (req, res, next) => {
  try {
    if (req != null && req != undefined) {

      const authToken = req.headers.authorization?.split('Bearer ')[1];

      try {
        console.log("Hi 2")
        let userDetails = jwt.verify(authToken, config.SecretKey);

        return userDetails;

      }
      catch {
        return res.sendStatus(401);
      }
    }

    next();
  }
  catch (error) {
    return res.sendStatus(401);
  }
};



module.exports = { verifyIdToken, fetchIdTokenDetails };
