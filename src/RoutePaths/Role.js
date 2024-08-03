const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db, currentTime } = require('../credentials/firebaseCredentials');
const { verifyIdToken } = require('../authMiddleware');

router.use(async (req, res, next) => {
    try {
        let userDetails = await verifyIdToken(req, res, next);
        let Role = "";
        const docRef = db.collection(config.Collections.UserName).doc(userDetails.email);
        let result = await docRef.get();

        if (result.exists) {
            Role = result.data().Role;
        }

        req.Role = Role;

    }
    catch {
        return res.sendStatus(400);
    }

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

        let document = { ...requestBody, studentCode: studentCode, CreatedDateTime: currentTime }

        if (req.Role.toUpperCase() === "ADMIN") {

            let docRef = db.collection(config.Collections.StudentDetailsActiveStatus).doc(studentCode);
            await docRef.set(document);

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
                return res.status(200).json({ message: studentCode + ' has been sent for approval.' });
            } else {
                return res.status(500).json({ message: 'Failed to write document' });
            }
        }

    }
    catch {
        return res.send({ "responseCode": 0 }).status(400);
    }
}
);

module.exports = router;
