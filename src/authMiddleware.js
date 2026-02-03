const { admin, db } = require("./credentials/firebaseCredentials");
const config = require("../config/config.json");

const verifyIdToken = async (req, res, next) => {
  try {

    const authToken = req.headers.authorization?.split('Bearer ')[1];

    if (!authToken) {
      return res.sendStatus(401);
    }

    const userDetails = await admin.auth().verifyIdToken(authToken);

    if (!req.url.includes("/req/")) {
      return next();
    }

    const docRef = db.collection(config.collections.userName).doc(userDetails.email);

    const result = await docRef.get();

    if (!result.exists) {
      return res.sendStatus(400);
    }

    const { role, name } = result.data();

    req.Role = role;
    req.Name = name;

    if (req.url.includes("/permissions") || req.url.includes("/login")) {
      return next();
    }

    if (role !== "Admin") {
      return res.sendStatus(401);
    }

    next();

  } catch {
    return res.sendStatus(401);
  }
};

module.exports = { verifyIdToken };
