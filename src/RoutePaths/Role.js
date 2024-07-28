const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db, currentTime } = require('../credentials/firebaseCredentials');
const { fetchIdTokenDetails } = require('../authMiddleware');

router.use(async (req, res, next) => {

    let userDetails = await fetchIdTokenDetails(req, res, next);
    let Role = "";

    const docRef = db.collection(config.Collections.UserName).doc(userDetails.id);
    const doc = await docRef.get();
    if (doc.exists) {
            Role = doc.data().Role;
    }

    req.Role = Role;

    next();

});

//Create new documents
router.post("/create", async (req, res) => {

    try {
        let requestBody = req.body;
        let studentCode = requestBody.studentCode;

        if (!studentCode.includes("PAI")) {
            studentCode = "PAI-" + studentCode;
        }

        if (req.Role.toUpperCase() === "ADMIN") {

            let docRef = db.collection(config.Collections.StudentDetailsActiveStatus).doc(studentCode);
            await docRef.set(requestBody);
            
            // Confirm the document was written successfully
            let doc = await docRef.get();
            if (doc.exists) {
                return res.status(200).json({ message: studentCode + ' has been created.' });
            } else {
                return res.status(500).json({ message: 'Failed to write document' });
            }
        }
        else {
            let docRef = db.collection(config.Collections.StudentDetailsApprovalStatus).doc(studentCode);
            await docRef.set(requestBody);
            
            // Confirm the document was written successfully
            let doc = await docRef.get();
            if (doc.exists) {
                return res.status(200).json({ message: studentCode + '  has sent for approval.' });
            } else {
                return res.status(500).json({ message: 'Failed to write document' });
            }
        }

    }
    catch {
        res.send({ "responseCode": 0 }).status(400);
    }
}
);

module.exports = router;
