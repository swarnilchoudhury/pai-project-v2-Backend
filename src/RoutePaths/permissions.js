const express = require('express');
const { adminRole } = require('../commonFunctions');
const router = express.Router();

// For permissions
router.get("/req/permissions", async (req, res) => {

    if (req != null && req != undefined) {
 
        try {

            let isEditPermissions = false;
            if (adminRole(req)) { // Verify admin Roles
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
