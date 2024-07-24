const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db, currentTime } = require('../credentials/firebaseCredentials');
const { fetchIdTokenDetails } = require('../authMiddleware');

router.use(async (req, res, next) => {

    let userDetails = await fetchIdTokenDetails(req, res, next);
    let Role = "";

    const docRef = db.collection('UserName').doc(userDetails.id);
    const doc = await docRef.get();
    if (doc.exists) {
        Name = doc.data().Name,
        Role = doc.data().Role;
    }

    req.Name = Name;
    req.Role = Role;

    next();

});

//Create new documents
router.post("/Create", async (req, res) => {

    try {
        let requestBody = req.body;

        if (req.Role.toUpperCase() === "ADMIN") {

            const docRef = db.collection("StudentDetailsV2").doc(requestBody.Name);
            const docSnapshot = await docRef.get();

            if (docSnapshot.data()) {
                res.send({ "responseCode": 2 });
            }
            else {
                await docRef.set({
                    ...requestBody, CreatedDateTime: currentTime, CreatedBy: req.Name
                });
                res.send({ "responseCode": 1 });
            }

        }
        else {
            const docRef = db.collection("StudentDetailsV2Approval").doc(requestBody.Name);
            const docSnapshot = await docRef.get();

            if (docSnapshot.data()) {
                res.send({ "responseCode": 2 });
            }
            else {
                await docRef.set({
                    ...requestBody, CreatedDateTime: currentTime, CreatedBy: req.Name
                });
                res.send({ "responseCode": 3 });
            }
        }


    }
    catch {
        res.send({ "responseCode": 0 }).status(400);
    }
}
);

module.exports = router;
