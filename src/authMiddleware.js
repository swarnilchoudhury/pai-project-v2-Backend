const { admin, db } = require("./credentials/firebaseCredentials");
const config = require("../config/config.json")

const verifyIdToken = async (req, res, next) => {
  try {
    if (req != null && req != undefined) {

      const authToken = req.headers.authorization?.split('Bearer ')[1]; //Fetch Token Details

      try {
        await admin.auth().verifyIdToken(authToken);
      }
      catch {
        return res.sendStatus(401);
      }
    }

    next();
  }
  catch {
    return res.sendStatus(400);
  }
};

const verifyIdTokenDetails = async (req, res, next) => {
  try {
    if (req != null && req != undefined) {
      const authToken = req.headers.authorization?.split('Bearer ')[1]; //Fetch Token Details

      try {
        let userDetails = await admin.auth().verifyIdToken(authToken); //Fetch User Details

        const docRef = db.collection(config.collections.userName).doc(userDetails.email);
        let result = await docRef.get();

        if (result.exists) {
          req.Role = result.data().role; //Fetch Role
          req.Name = result.data().name; //Fetch Name
        }
        else {
          return res.sendStatus(400);
        }
      }
      catch {
        return res.sendStatus(401);
      }
    }

    next();
  }
  catch {
    return res.sendStatus(400);
  }
};

module.exports = { verifyIdToken, verifyIdTokenDetails };