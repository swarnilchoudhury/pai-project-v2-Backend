const express = require('express');
const { db, admin } = require('../credentials/firebaseCredentials');
const router = express.Router();

router.post("/login", async (req, res) => {
    if (req != null && req != undefined) {

        try {

            let idToken = req.headers.authorization?.split('Bearer ')[1];


            if (!idToken) {
                return res.status(401).json({ message: 'Unauthorized: No token provided' });
            }

            // Get the current date and time
            const currentDate = new Date();
            let expiry = currentDate.getTime() + (60 * 60 * 1000);

            // Set authentication token in a secure cookie
            res.cookie('authToken', idToken, {
                secure: false, // Cookie will only be sent over HTTPS
                httpOnly: true, // Cookie cannot be accessed by client-side JavaScript
                maxAge: 60 * 60 * 1000 // Cookie will expire after 60 minutes (1 hour) (in milliseconds)
            });

            res.cookie('expiresAt', expiry, {
                secure: false, // Cookie will only be sent over HTTPS
                httpOnly: false, // Cookie can be accessed by client-side JavaScript
                maxAge: 60 * 60 * 1000 // Cookie will expire after 60 minutes (1 hour) (in milliseconds)
            });

            let emailId = req.body.emailId;
            const docRef = db.collection('UserName').doc(emailId);
            const doc = await docRef.get();
            if (doc.exists) {
                res.json({ 'Name': doc.data().Name });
            }
            else {
                res.json({ 'Name': "Unidentified" });
            }

        }
        catch {
            res.json({ "Invalid": "Invalid Email Or Password" }).status(400);
        }
    }
});

//Refresh Token
router.post("/refreshToken", async (req, res) => {

    try {
        if (req.cookies != null && req.cookies != undefined) {

            let authToken = req.cookies.authToken;

            if (authToken == undefined) {
                throw new Error();
            }

            // Verify the old token
            const decodedToken = await admin.auth().verifyIdToken(authToken);
            const uid = decodedToken.uid;

            // Issue a new token
            const newToken = await admin.auth().createCustomToken(uid);

            // Get the current date and time
            const currentDate = new Date();
            let expiry = currentDate.getTime() + (60 * 60 * 1000);

            // Set authentication token in a secure cookie
            res.cookie('authToken', newToken, {
                secure: false, // Cookie will only be sent over HTTPS
                httpOnly: true, // Cookie cannot be accessed by client-side JavaScript
                maxAge: 60 * 60 * 1000 // Cookie will expire after 60 minutes (1 hour) (in milliseconds)
            });

            res.cookie('expiresAt', expiry, {
                secure: false, // Cookie will only be sent over HTTPS
                httpOnly: false, // Cookie can be accessed by client-side JavaScript
                maxAge: 60 * 60 * 1000 // Cookie will expire after 60 minutes (1 hour) (in milliseconds)
            });

            res.sendStatus(200);

        }
        else {
            res.sendStatus(401);
        }
    }
    catch (ex) {
        res.sendStatus(401);
    }

});

module.exports = router;
