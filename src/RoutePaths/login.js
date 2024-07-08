const express = require('express');
const { db, admin } = require('../credentials/firebaseCredentials');
const { verifyIdToken } = require('../authMiddleware');
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

    // Get the current date and time
    const currentDate = new Date();
    let expiry = currentDate.getTime() + (60 * 60 * 1000);

    let emailId = req.body.emailId;
    let Name = "";
    const docRef = db.collection('UserName').doc(emailId);
    const doc = await docRef.get();
    if (doc.exists) {
        Name = doc.data().Name;
    }
    
    return {
        expiry: expiry,
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

//Refresh Token
router.post("/refreshToken", async (req, res) => {

    try {
        if (req != null && req != undefined) {

            let authToken = req.idToken;

            // Verify the old token
            const decodedToken = await admin.auth().verifyIdToken(authToken);
            const uid = decodedToken.uid;

            // Issue a new token
            const customToken = await admin.auth().createCustomToken(uid);

            req.idToken = customToken;

            let responseJson = await fetchData(req);
            res.json(responseJson);

        }
        else {
            res.sendStatus(400); 
        }
    }
    catch (ex) {
        res.sendStatus(401);
    }

});

module.exports = router;
