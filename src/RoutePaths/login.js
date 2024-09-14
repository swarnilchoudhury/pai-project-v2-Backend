const express = require('express');
const router = express.Router();

//For Login
router.get("/req/login", async (req, res) => {

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
