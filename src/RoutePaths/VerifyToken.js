const express = require('express');
const router = express.Router();
const { verifyIdToken } = require('../authMiddleware');

//Home Page to Fetch Details
router.post("/verifyToken", verifyIdToken, async (req, res) => {

    try {
        res.sendStatus(200);
    }
    catch {
        res.sendStatus(401);
    }
}
);

module.exports = router;
