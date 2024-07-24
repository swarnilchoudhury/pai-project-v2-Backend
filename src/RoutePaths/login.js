const express = require('express');
const { db } = require('../credentials/firebaseCredentials');
const { verifyIdToken } = require('../authMiddleware');
const { authTokenTimeLogic } = require('../AuthTokenTimeLogic');

const router = express.Router();

router.use(verifyIdToken);

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
    let id = "";
    const docRef = db.collection('UserName').doc(emailId);
    const doc = await docRef.get();
    if (doc.exists) {
        Name = doc.data().Name;
        id = doc.id;
    }

    const { authToken, authTokenTime } = authTokenTimeLogic(id);

    return {
        authToken: authToken,
        authTokenTime: authTokenTime,
        Name: Name
    }

}


//For Login
router.post("/login", async (req, res) => {

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
