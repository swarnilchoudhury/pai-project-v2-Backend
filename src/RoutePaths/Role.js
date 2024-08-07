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

//Update new documents
router.post("/update", async (req, res) => {

    try {
        if (req.Role.toUpperCase() === 'ADMIN') {
            let status = req.headers['x-update'].toLowerCase();
            let currentDocRef, newDocRef;
            if (status === 'deactive') {
                currentDocRef = db.collection(config.Collections.StudentDetailsActiveStatus);
                newDocRef = db.collection(config.Collections.StudentDetailsDeactiveStatus);
            }
            else if(status === 'active'){
                currentDocRef = db.collection(config.Collections.StudentDetailsDeactiveStatus);
                newDocRef = db.collection(config.Collections.StudentDetailsActiveStatus);
            }

            const movePromises = req.body.data.map(
                async studentCode => {
                    let docRef = currentDocRef.doc(studentCode);

                    // Get the document
                    const docSnapshot = await docRef.get();

                    // Get the document data
                    const docData = docSnapshot.data();

                    // Reference to the new document location in the target collection
                    const newDocumentRef = newDocRef.doc(studentCode);

                    // Write the document data to the new collection
                    await newDocumentRef.set(docData);

                    // Delete the document from the original collection
                    await docRef.delete();

                }
            );

            // Wait for all move operations to complete
            await Promise.all(movePromises);

            return res.sendStatus(200);
        }
        else {
            return res.json({ message: "Not Authorized" });
        }

    }
    catch (e) {
        console.log(e);
        return res.sendStatus(400);
    }
}
);

module.exports = router;
