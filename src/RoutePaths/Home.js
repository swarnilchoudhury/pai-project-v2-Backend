const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db } = require('../credentials/firebaseCredentials');
const { verifyIdToken } = require('../authMiddleware');

router.use(verifyIdToken);

//Home Page to Fetch Details
router.get("/Home", async (req, res) => {

    try {
        let docRef;
        let status = req.headers['x-status'];

        if (status === 'Deactive') {
            docRef = db.collection(config.Collections.StudentDetailsDeactiveStatus).orderBy('StudentName', 'asc');
        }
        else if (status === 'Unapproval') {
            docRef = db.collection(config.Collections.StudentDetailsApprovalStatus).orderBy('StudentName', 'asc');
        }
        else {
            docRef = db.collection(config.Collections.StudentDetailsActiveStatus).orderBy('StudentName', 'asc');
        }

        const snapshot = await docRef.get();

        // Map the snapshot to an array of document data
        let homePageDataArray = snapshot.docs.map(doc => {
            const data = doc.data();
            const { CreatedDateTime, ...otherData } = data; // Destructure to exclude createdDateTime
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
        let StudentCode = req.body.StudentCode;

        if (!StudentCode.includes("PAI")) {
            StudentCode = "PAI-" + StudentCode;
        }

        const docRef = db.collection(config.Collections.StudentDetailsActiveStatus).doc(StudentCode);
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
