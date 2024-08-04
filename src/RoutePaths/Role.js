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
        let StudentCode = requestBody.StudentCode;

        if (!StudentCode.includes("PAI")) {
            StudentCode = "PAI-" + StudentCode;
        }

        let createdDateTime = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        let document = { ...requestBody, StudentCode: StudentCode, CreatedDateTime: currentTime, CreatedDateTimeFormatted: createdDateTime };


        if (req.Role.toUpperCase() === "ADMIN") {

            let docRef = db.collection(config.Collections.StudentDetailsActiveStatus).doc(StudentCode);
            await docRef.set(document);

            // Confirm the document was written successfully
            let doc = await docRef.get();
            if (doc.exists) {
                return res.status(200).json({ message: StudentCode + ' has been created.' });
            } else {
                return res.status(500).json({ message: 'Failed to write document' });
            }
        }
        else {
            let docRef = db.collection(config.Collections.StudentDetailsApprovalStatus).doc(StudentCode);
            await docRef.set(document);

            // Confirm the document was written successfully
            let doc = await docRef.get();
            if (doc.exists) {
                return res.status(200).json({ message: StudentCode + ' has been sent for approval.' });
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
