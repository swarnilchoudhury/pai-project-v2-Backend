const express = require('express');
const { verifyIdToken } = require('../authMiddleware');
const router = express.Router();

router.use(verifyIdToken);

//Home Page to Fetch Details
router.post("/verifyToken", async (req, res) => {

    try {
        res.sendStatus(200);
    }
    catch {
        res.sendStatus(401);
    }
}
);

module.exports = router;
