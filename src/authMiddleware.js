const { admin } = require("./credentials/firebaseCredentials");

const verifyIdToken = async (req, res, next) => {
  try {
    if (req != null && req != undefined) {

      const authToken = req.headers.authorization?.split('Bearer ')[1];

      try {

        await admin.auth().verifyIdToken(authToken);
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


const fetchIdTokenDetails = async (req, res, next) => {
  try {
    if (req != null && req != undefined) {

      const authToken = req.headers.authorization?.split('Bearer ')[1];

      try {

        let userDetails = await admin.auth().verifyIdToken(authToken);

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
