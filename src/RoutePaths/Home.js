const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { verifyIdToken } = require('../authMiddleware');
const { db, currentTime } = require('../credentials/firebaseCredentials');

router.use(verifyIdToken);

//Home Page to Fetch Details
router.post("/Home", async (req, res) => {

    try {
        res.sendStatus(200);
    }
    catch {
        res.sendStatus(400);
    }
}
);

//Create new documents
router.post("/Create", async (req, res) => {

    try {

        let requestBody = req.body;
        const docRef = db.collection(config.Collection.StudentDetails).doc(requestBody.Name);
        const docSnapshot = await docRef.get();

        if (docSnapshot.data()) {
            res.send({ "responseCode": 2 });
        }
        else {
            await docRef.set({
                ...requestBody, CreatedDateTime: currentTime
            });
            res.send({ "responseCode": 1 });
        }

    }
    catch {
        res.send({ "responseCode": 0 }).status(400);
    }
}
);

module.exports = router;
