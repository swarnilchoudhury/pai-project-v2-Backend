const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db } = require('../credentials/firebaseCredentials');
const { verifyIdTokenDetails } = require('../authMiddleware');
const { adminRole } = require('../roleFunctions');

router.get("/paymentsViews", verifyIdTokenDetails, async (req, res) => {

    try {
        if (!adminRole(req)) {
            return res.status(200).json({ message: "Not Authorized" });
        }

        let docRef = db.collection(config.collections.studentDetailsActiveStatus).orderBy('studentName', 'asc');

        const snapshot = await docRef.select('studentView').get();

        // Extract the 'studentView' field from each document
        let paymentsPageDataArray = snapshot.docs
            .map(doc => doc.get('studentView')) // Get only 'studentView' field
            .filter(value => value !== undefined && value !== null); // Filter out undefined or null values

        return res.json(paymentsPageDataArray);
    }
    catch {
        return res.sendStatus(400);
    }
}
);

module.exports = router;