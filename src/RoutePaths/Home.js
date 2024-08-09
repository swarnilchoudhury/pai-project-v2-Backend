const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db } = require('../credentials/firebaseCredentials');

//Home Page to Fetch Details
router.get("/Home", async (req, res) => {

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
    catch (e) {
        console.log(e)
        return res.sendStatus(400);
    }
}
);

//Search Code
router.post("/searchCode", async (req, res) => {

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

module.exports = router;
