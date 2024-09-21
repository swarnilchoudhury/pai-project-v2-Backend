const { db, admin, currentTime } = require("./credentials/firebaseCredentials");
const config = require('../config/config.json')

const insertAuditDetails = async (req, systemComments = '', documentId, studentCode = '') => {
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
            updatedBy: req.Name ? req.Name.toUpperCase() : "-",
            updatedDateTime: updatedDateTimeFormat
        };

        // Reference to the audit document
        const auditDocRef = db.collection(config.collections.studentDetailsAudit).doc(documentId);

        // Fetch the current audit document
        const auditDocSnapshot = await auditDocRef.get();

        // Prepare the data to update
        const updateData = {
            studentCode,
            audits: admin.firestore.FieldValue.arrayUnion(newAuditEntry) // Append new entry to the audits array
        };

        // Check if createdDateTime exists and add it if it doesn't
        if (!auditDocSnapshot.exists || !auditDocSnapshot.data().createdDateTime) {
            updateData.createdDateTime = currentTime; // Add createdDateTime if it does not exist
        }

        // Update or create the audit document
        await auditDocRef.set(updateData, { merge: true });

    } catch {
        throw new Error();
    }
};


module.exports = { insertAuditDetails }