const express = require('express');
const { verifyIdToken, fetchIdTokenDetails } = require('../authMiddleware');
const { admin } = require('../credentials/firebaseCredentials');
const { authTokenTimeLogic } = require('../AuthTokenTimeLogic');
const router = express.Router();

//Verify Token
router.post("/verifyToken", verifyIdToken, async (req, res) => {

    try {
        res.sendStatus(200);
    }
    catch {
        res.sendStatus(401);
    }
}
);

//Refresh Token
router.post("/refreshToken", async (req, res, next) => {

    try {
        if (req != null && req != undefined) {


            let authToken = req.headers.authorization?.split('Bearer ')[1];

            if (authToken) {
                let userDetails = fetchIdTokenDetails(req, res, next);
                const { authToken, authTokenTime } = authTokenTimeLogic(userDetails.id);
                res.json({
                    authToken: authToken,
                    authTokenTime: authTokenTime
                });
            }

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
