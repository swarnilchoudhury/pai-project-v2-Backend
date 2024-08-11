const { admin, db } = require("./credentials/firebaseCredentials");
const config = require("../config/config.json")

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
    return res.sendStatus(400);
  }
};

const verifyIdTokenDetails = async (req, res, next) => {
  try {
    if (req != null && req != undefined) {

      const authToken = req.headers.authorization?.split('Bearer ')[1];

      try {
        let userDetails = await admin.auth().verifyIdToken(authToken);
        let Role = "";
        const docRef = db.collection(config.collections.userName).doc(userDetails.email);
        let result = await docRef.get();

        if (result.exists) {
            Role = result.data().role;
        }

        req.Role = Role;
      }
      catch {
        return res.sendStatus(401);
      }
    }

    next();
  }
  catch (error) {
    return res.sendStatus(400);
  }
};

module.exports = { verifyIdToken, verifyIdTokenDetails };
