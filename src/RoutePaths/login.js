const express = require('express');
const { verifyIdTokenDetails } = require('../authMiddleware');
const router = express.Router();

//For Login
router.get("/login", verifyIdTokenDetails, async (req, res) => {

    if (req != null && req != undefined) {

        try {
            res.json({ name: req.Name });
        }
        catch {
            res.sendStatus(400);
        }
    }
});

module.exports = router;
