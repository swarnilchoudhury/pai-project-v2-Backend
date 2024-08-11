const express = require('express');
const { db } = require('../credentials/firebaseCredentials');
const config = require('../../config/config.json');
const { verifyIdToken } = require('../authMiddleware');

const router = express.Router();

// Middleware to extract Bearer token
router.use((req, res, next) => {
    let idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
        return res.sendStatus(401);
    }

    // Attach the token to the request object for further processing
    req.idToken = idToken;
    next();
});

const fetchData = async (req) => {

    let emailId = req.body.emailId;
    let Name = "";
    const docRef = db.collection(config.collections.userName).doc(emailId);
    const doc = await docRef.get();
    if (doc.exists) {
        Name = doc.data().name
    }

    return {
        name: Name
    }

}

//For Login
router.post("/login", verifyIdToken, async (req, res) => {

    if (req != null && req != undefined) {

        try {
            let responseJson = await fetchData(req);

            res.json(responseJson);
        }
        catch {
            res.sendStatus(400);
        }
    }
});

module.exports = router;
