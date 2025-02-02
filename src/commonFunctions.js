const { db, admin, currentTime } = require("./credentials/firebaseCredentials");
const config = require('../config/config.json')

const insertAuditDetails = async (req, systemComments = '', documentId, studentDetails = '', isUpdate = false) => {
    try {
        // Create timestamp for the document
        const updatedDateTimeFormat = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        // Define the new audit entry
        const newAuditEntry = {
            systemComments,
            user: req.Name ? req.Name.toUpperCase() : "-",
            updatedDateTime: updatedDateTimeFormat
        };

        // Reference to the audit document
        const auditDocRef = db.collection(config.collections.studentDetailsAudit).doc(documentId);

        // Fetch the current audit document
        const auditDocSnapshot = await auditDocRef.get();

        if (!isUpdate) {
            studentDetails = auditDocSnapshot.data()?.studentDetails || studentDetails // Set studentDetails if it doesn't exist
        }

        // Audit Data
        const auditData = {
            audits: admin.firestore.FieldValue.arrayUnion(newAuditEntry), // Append new entry to the audits array
            createdDateTime: auditDocSnapshot.data()?.createdDateTime || currentTime, // Set createdDateTime if it doesn't exist
            studentDetails: studentDetails
        };

        // Update or create the audit document
        await auditDocRef.set(auditData, { merge: true });

    } catch {
        throw new Error();
    }
};

const adminRole = (req) => {
    try {
        if (req != null && req != undefined) {
            return req.Role.trim().toUpperCase() === "ADMIN"; // IF ADMIN, then return true
        }
        else {
            return false;
        }
    }
    catch {
        return false;
    }
};


module.exports = { insertAuditDetails, adminRole }