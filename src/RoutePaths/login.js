const express = require('express');
const { db, admin } = require('../credentials/firebaseCredentials');
const config = require("../../config/config.json");
const router = express.Router();
var jwt = require('jsonwebtoken');


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

const jwtSign = async (req) => {

    // Get the current date and time
    const currentDate = new Date();
    let expiry = currentDate.getTime() + (60 * 60 * 1000);

    let emailId = req.body.emailId;
    let Name = "", Role = "";
    const docRef = db.collection('UserName').doc(emailId);
    const doc = await docRef.get();
    if (doc.exists) {
        Name = doc.data().Name;
        Role = doc.data().role;
    }

    var authToken = jwt.sign({ authToken: req.idToken, Role: Role }, config.SecretKey);

    return {
        authToken: authToken,
        expiry: expiry,
        Name: Name
    }

}


//For Login
router.post("/login", async (req, res) => {

    if (req != null && req != undefined) {

        try {
            let responseJson = await jwtSign(req);
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

            let responseJson = await jwtSign(req);
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
