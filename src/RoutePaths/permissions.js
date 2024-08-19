const express = require('express');
const { verifyIdTokenDetails } = require('../authMiddleware');
const { adminRole } = require('../roleFunctions');
const router = express.Router();

//For permissions
router.get("/permissions", verifyIdTokenDetails, async (req, res) => {

    if (req != null && req != undefined) {

        try {

            let isEditPermissions = false;
            if (adminRole(req)) { //Verify admin Roles
                isEditPermissions = true;
            }

            res.json({ isEditPermissions: isEditPermissions });
        }
        catch {
            res.sendStatus(400);
        }
    }
});

module.exports = router;
