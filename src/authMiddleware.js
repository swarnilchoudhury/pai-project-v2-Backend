const { admin, db } = require("./credentials/firebaseCredentials");
const config = require("../config/config.json");

const verifyIdToken = async (req, res, next) => {
  try {

    const authToken = req.headers.authorization?.split('Bearer ')[1];

    if (!authToken) {
      return res.sendStatus(401);
    }

    const userDetails = await admin.auth().verifyIdToken(authToken);

    const docRef = db.collection(config.collections.userName).doc(userDetails.email);

    const result = await docRef.get();

    if (!result.exists) {
      return res.sendStatus(400);
    }

    const { role, name } = result.data();

    req.Role = role;
    req.Name = name;

    next();

  } catch {
    return res.sendStatus(401);
  }
};

// Middleware to restrict endpoints to Admin users only
const adminOnly = (req, res, next) => {
  if (req.Role !== "Admin") {
    return res.sendStatus(401);
  }
  next();
};

module.exports = { verifyIdToken, adminOnly };
