const { db, admin, currentTime } = require("./credentials/firebaseCredentials");
const config = require('../config/config.json')

const insertAuditDetails = async (
    req,
    systemComments = '',
    documentId,
    studentDetails = '',
    isUpdate = false,
    collectionName = null
) => {
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

        // Use provided collection name if passed; fallback to student audit collection
        const collection = collectionName || config.collections.studentDetailsAudit;
        const auditDocRef = db.collection(collection).doc(documentId);

        // Fetch the current audit document
        const auditDocSnapshot = await auditDocRef.get();

        if (!isUpdate && studentDetails !== null) {
            studentDetails = auditDocSnapshot.data()?.studentDetails || studentDetails // Set studentDetails if it doesn't exist
        }

        const auditData = {
            audits: admin.firestore.FieldValue.arrayUnion(newAuditEntry),
            createdDateTime: auditDocSnapshot.data()?.createdDateTime || currentTime,
            ...(
                studentDetails !== null &&
                studentDetails !== undefined &&
                studentDetails !== '' && { studentDetails }
            )
        };

        // Update or create the audit document
        await auditDocRef.set(auditData, { merge: true });

    } catch {
        throw new Exception();
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