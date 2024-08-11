const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db, currentTime } = require('../credentials/firebaseCredentials');
const { verifyIdToken, verifyIdTokenDetails } = require('../authMiddleware');
const { adminRole } = require('../RoleFunctions');

//Home Page to Fetch Details
router.get("/home", verifyIdTokenDetails, async (req, res) => {

    try {
        let docRef;
        let status = req.headers['x-status'];

        if (status === 'Deactive') {
            docRef = db.collection(config.collections.studentDetailsDeactiveStatus).orderBy('studentName', 'asc');
        }
        else if (status === 'Unapproval') {
            docRef = db.collection(config.collections.studentDetailsApprovalStatus).orderBy('studentName', 'asc');
        }
        else {
            docRef = db.collection(config.collections.studentDetailsActiveStatus).orderBy('studentName', 'asc');
        }

        const snapshot = await docRef.get();

        // Map the snapshot to an array of document data
        let homePageDataArray = snapshot.docs.map(doc => {
            const data = doc.data();
            const { createdDateTime, ...otherData } = data; // Destructure to exclude createdDateTime
            return {
                ...otherData,
            };
        });

        return res.json(homePageDataArray);
    }
    catch {
        return res.sendStatus(400);
    }
}
);


//Search Code
router.post("/searchCode", verifyIdToken, async (req, res) => {

    try {
        let studentCode = req.body.studentCode;

        if (!studentCode.includes("PAI")) {
            studentCode = "PAI-" + studentCode;
        }

        const docRef = db.collection(config.collections.studentDetailsActiveStatus).doc(studentCode);
        const doc = await docRef.get();
        if (doc.exists) {
            return res.json({ returnCode: 1 });
        }

        return res.json({ returnCode: 0 })
    }
    catch {
        return res.sendStatus(400);
    }
}
);



//Create new documents
router.post("/create", verifyIdTokenDetails, async (req, res) => {

    try {
        let requestBody = req.body;
        let studentCode = requestBody.studentCode;

        if (!studentCode.includes("PAI")) {
            studentCode = "PAI-" + studentCode;
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

        let document = { ...requestBody, studentCode: studentCode, createdDateTime: currentTime, createdDateTimeFormatted: createdDateTime };


        if (adminRole(req)) {

            let docRef = db.collection(config.collections.studentDetailsActiveStatus).doc(studentCode);
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
            let docRef = db.collection(config.collections.studentDetailsApprovalStatus).doc(studentCode);
            await docRef.set(document);

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

//Update new documents
router.post("/update", verifyIdTokenDetails, async (req, res) => {

    try {
        if (adminRole(req)) {

            let status = req.headers['x-update'].toLowerCase();
            let currentDocRef, newDocRef;
            if (status === 'deactive') {
                currentDocRef = db.collection(config.collections.studentDetailsActiveStatus);
                newDocRef = db.collection(config.collections.studentDetailsDeactiveStatus);
            }
            else if (status === 'active') {
                currentDocRef = db.collection(config.collections.studentDetailsDeactiveStatus);
                newDocRef = db.collection(config.collections.studentDetailsActiveStatus);
            }
            else if (status === 'approve') {
                currentDocRef = db.collection(config.collections.studentDetailsApprovalStatus);
                newDocRef = db.collection(config.collections.studentDetailsActiveStatus);
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
    catch {
        return res.sendStatus(400);
    }
}
);

module.exports = router;
