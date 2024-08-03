const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db, currentTime } = require('../credentials/firebaseCredentials');
const { verifyIdToken } = require('../authMiddleware');

router.use(verifyIdToken);

//Home Page to Fetch Details
router.get("/Home", async (req, res) => {

    try {
        let homePageDataArray = [];
        let docRef;
        let status = req.headers['x-status'];

        if (status === 'Deactive') {
            docRef = db.collection(config.Collections.StudentDetailsDeactiveStatus);
        }
        else if (status === 'Unapproval') {
            docRef = db.collection(config.Collections.StudentDetailsApprovalStatus);
        }
        else {
            docRef = db.collection(config.Collections.StudentDetailsActiveStatus);
        }

        const snapshot = await docRef.get();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.CreatedDateTime) {
                let createdDateTime = doc.data().CreatedDateTime.toDate().toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                });

                data.CreatedDateTime = createdDateTime;
            }
            homePageDataArray.push(data)
        });

        res.json(homePageDataArray);
    }
    catch {
        res.sendStatus(400);
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

        const docRef = db.collection(config.Collections.StudentDetailsActiveStatus).doc(studentCode);
        const doc = await docRef.get();
        if (doc.exists) {
            return res.json({ returnCode: 1 });
        }

        res.json({ returnCode: 0 })
    }
    catch {
        res.sendStatus(400);
    }
}
);

module.exports = router;
