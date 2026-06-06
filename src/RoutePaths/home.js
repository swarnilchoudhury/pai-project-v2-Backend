const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { v4: uuidv4 } = require('uuid');
const { db, currentTime } = require('../credentials/firebaseCredentials');
const { insertAuditDetails, insertAuditDetailsBatch, adminRole, sendQueueWorkerMessage } = require('../commonFunctions');
const { adminOnly } = require('../authMiddleware');

const getStudentCodeSnapshots = (studentCode) => Promise.all([
    db.collection(config.collections.studentDetailsActiveStatus)
        .where('studentCode', '==', studentCode)
        .limit(1)
        .get(),
    db.collection(config.collections.studentDetailsApprovalStatus)
        .where('studentCode', '==', studentCode)
        .limit(1)
        .get()
]);

// Home Page to Fetch Details
router.get("/home", async (req, res) => {

    try {
        let docRef;
        let status = req.headers['x-status'].toLowerCase(); // Fetch Status from UI

        if (status === 'deactive') {
            docRef = db.collection(config.collections.studentDetailsDeactiveStatus).orderBy('studentName', 'asc');
        }
        else if (status === 'unapproval') {
            docRef = db.collection(config.collections.studentDetailsApprovalStatus).orderBy('studentName', 'asc');
        }
        else {
            docRef = db.collection(config.collections.studentDetailsActiveStatus).orderBy('studentName', 'asc');
        }

        let snapshot;

        if (status === 'deactive') {

            snapshot = await docRef.select(
                'studentName',
                'studentCode',
                'phoneNumber',
                'guardianName',
                'dob',
                'admissionDate',
                'createdDateTimeFormatted',
                'lastDeactivatedOn',
                'createdBy')
                .get();
        }
        else {

            snapshot = await docRef.select(
                'studentName',
                'studentCode',
                'phoneNumber',
                'guardianName',
                'dob',
                'admissionDate',
                'createdDateTimeFormatted',
                'modifiedDateTimeFormatted',
                'createdBy')
                .get();
        }

        // Map the snapshot to an array of document data
        let homePageDataArray = snapshot.docs.map((doc) => {
            // Merge the document data with its ID
            return { id: doc.id, ...doc.data() };
        });

        return res.json(homePageDataArray);
    }
    catch {
        return res.sendStatus(400);
    }
}
);


// Search Code
router.post("/searchCode", async (req, res) => {

    try {
        let { studentCode } = req.body; // Fetch Student Code from req body

        if (!studentCode.includes("PAI")) {
            studentCode = "PAI-" + studentCode; // Append PAI
        }

        const [activeDocSnapshot, approvalDocSnapshot] = await getStudentCodeSnapshots(studentCode);

        if (!activeDocSnapshot.empty) { // Send Message if present in Active
            return res.json({ returnCode: 1, message: `${studentCode} already present in Active` });
        }

        if (!approvalDocSnapshot.empty) { // Send Message if present in Approval
            return res.json({ returnCode: 1, message: `${studentCode} already present in Approval` });
        }

        return res.json({ returnCode: 0 })
    }
    catch {
        return res.sendStatus(400);
    }
}
);

// Latest StudentCode
router.get("/latestCode", async (req, res) => {

    try {
        const [activeDocSnapshot, approveDocSnapshot] = await Promise.all([
            db.collection(config.collections.studentDetailsActiveStatus)
                .orderBy('studentCodeNumeric', 'desc')
                .limit(1)
                .get(),
            db.collection(config.collections.studentDetailsApprovalStatus)
                .orderBy('studentCodeNumeric', 'desc')
                .limit(1)
                .get()
        ]);

        let activeLatestStudentCode = activeDocSnapshot.docs.length > 0 ? activeDocSnapshot.docs[0].data().studentCode : "Empty";

        let approveLatestStudentCode = approveDocSnapshot.docs.length > 0 ? approveDocSnapshot.docs[0].data().studentCode : "Empty";

        return res.json({ latestStudentCode: `${activeLatestStudentCode} (Active),${approveLatestStudentCode} (Approve)` });
    }
    catch {
        return res.sendStatus(400);
    }
}
);

// Create new documents
router.post("/create", async (req, res) => {
    try {
        let { studentCode } = req.body; // Fetch Student Code from req body

        let studentCodeNumeric = Number.parseInt(studentCode);

        if (!studentCode.includes("PAI")) {
            studentCode = "PAI-" + studentCode; // Append PAI
        }

        const [activeDocSnapshot, approvalDocSnapshot] = await getStudentCodeSnapshots(studentCode);

        if (!activeDocSnapshot.empty) { // Send Message if present in Active
            return res.json({ message: `${studentCode} already present in Active` });
        }

        if (!approvalDocSnapshot.empty) { // Send Message if present in Approval
            return res.json({ message: `${studentCode} already present in Approval` });
        }


        let { studentName, guardianName, phoneNumber, admissionDate, dob } = req.body; // Fetch required details from req body

        // Convert to UPPER CASE
        studentName = studentName ? studentName.toUpperCase() : studentName;
        guardianName = guardianName ? guardianName.toUpperCase() : guardianName;

        if (!phoneNumber || phoneNumber.length === 0) {
            phoneNumber = "-";
        }

        if (!admissionDate || admissionDate.length === 0 || admissionDate.includes("Invalid Date")) {
            admissionDate = "-";
        }

        if (!dob || dob.length === 0 || dob.includes("Invalid Date")) {
            dob = "-";
        }

        let createdByName = req.Name ? req.Name.toUpperCase() : "-";

        // Create timestamp for the document
        const createdDateTimeFormat = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        const studentDetails = studentName + " - " + studentCode;

        const document = {
            studentName,
            studentCode,
            guardianName,
            studentCodeNumeric,
            phoneNumber,
            admissionDate,
            dob,
            studentDetails,
            createdDateTime: currentTime,
            createdDateTimeFormatted: createdDateTimeFormat,
            createdBy: createdByName,
            modifiedDateTimeFormatted: '-'
        }; // Add the required details to the document

        // Determine the target collection based on user role
        const collectionName = adminRole(req)
            ? config.collections.studentDetailsActiveStatus
            : config.collections.studentDetailsApprovalStatus;

        const documentId = uuidv4(); // Generate UUID
        const docRef = db.collection(collectionName).doc(documentId);

        await docRef.set(document);

        let message = '';
        let auditMessage = '';

        if (adminRole(req)) { // Admin role
            message = `${studentCode} has been created`;
            auditMessage = 'Created in Active State';
        }
        else {
            message = `${studentCode} has been sent for approval`;
            auditMessage = 'Sent in Approval State';
        }

        await insertAuditDetails(req, auditMessage, documentId, studentDetails);

        return res.json({ message });
    } catch {
        return res.sendStatus(400);
    }
});

// For Changing of Status for Student
router.post("/update", adminOnly, async (req, res) => {
    try {

        let status = req.headers['x-update'].toLowerCase(); // Fetch Status from UI
        let validateFlag = false;
        let currentDocRef, newDocRef;
        let systemComments = '';

        if (status === 'deactive') {
            currentDocRef = db.collection(config.collections.studentDetailsActiveStatus);
            newDocRef = db.collection(config.collections.studentDetailsDeactiveStatus);
            systemComments = 'Updated from Active to Deactive State';
        } else if (status === 'active') {
            currentDocRef = db.collection(config.collections.studentDetailsDeactiveStatus);
            newDocRef = db.collection(config.collections.studentDetailsActiveStatus);
            validateFlag = true;
            systemComments = 'Updated from Deactive to Active State';
        } else if (status === 'approve') {
            currentDocRef = db.collection(config.collections.studentDetailsApprovalStatus);
            newDocRef = db.collection(config.collections.studentDetailsActiveStatus);
            validateFlag = true;
            systemComments = 'Approved';
        }

        const auditDetails = [];
        const deactivatedStudentIds = [];

        const UpdateDetails = async (currentDocRef, newDocRef, documentId, status, studentCode) => { // Update

            let docRef = currentDocRef.doc(documentId);

            const docSnapshot = await docRef.get();
            const docData = docSnapshot.data();

            if (status === 'deactive') {

                let lastDeactivatedOn = new Date().toLocaleString("en-US", {
                    timeZone: "Asia/Kolkata",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                });

                docData.lastDeactivatedOn = lastDeactivatedOn;

                deactivatedStudentIds.push(documentId);
            }

            await newDocRef.doc(documentId).set(docData, { merge: true });
            await docRef.delete();

            auditDetails.push({
                systemComments,
                documentId
            });
        }

        let message = "";
        const movePromises = req.body.data.map(async (studentDetails) => { // Move the data

            let [documentId, studentCode] = studentDetails.split('/');

            if (validateFlag) {

                const newDocumentRef = db.collection(config.collections.studentDetailsActiveStatus)
                    .where('studentCode', '==', studentCode)
                    .limit(1); // Limit to 1 document to improve performance

                const activeDocSnapshot = await newDocumentRef.get();

                if (activeDocSnapshot.empty) { // Update the details
                    await UpdateDetails(currentDocRef, newDocRef, documentId, status, studentCode);

                }
                else { // If Exists then don't update
                    message += `${studentCode} `;
                }

            } else { // Update the details
                await UpdateDetails(currentDocRef, newDocRef, documentId, status, studentCode);
            }
        });

        await Promise.all(movePromises); // Wait till all the data moves

        if (deactivatedStudentIds.length > 0) {
            await sendQueueWorkerMessage({
                eventType: "RemoveStudentFromBatch",
                studentIds: deactivatedStudentIds,
                user: req.Name ? req.Name.toUpperCase() : "-",
                auditDetails: auditDetails
            });
        } else {
            await insertAuditDetailsBatch(req, auditDetails);
        }

        if (message) {
            return res.status(200).json({ message: `${message} already present in Active Status` });
        } else {
            return res.sendStatus(200);
        }
    } catch {
        return res.sendStatus(400);
    }
});


router.put("/updateStudent", async (req, res) => {

    try {
        const { updateForm, status } = req.body;

        if (status === 0) {
            return res.status(200).json({ message: `Something went wrong.` });
        }

        const modifiedDateTimeFormat = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        let collection = '';

        // Admin users can access all collections
        if (adminRole(req)) {
            if (status === 1) {
                collection = config.collections.studentDetailsActiveStatus;
            }
            else if (status === 2) {
                collection = config.collections.studentDetailsDeactiveStatus;
            }
            else {
                collection = config.collections.studentDetailsApprovalStatus;
            }
        } else {
            // For non-admin users, restrict to approval status only 
            collection = config.collections.studentDetailsApprovalStatus;
        }

        let modifiedByName = req.Name ? req.Name.toUpperCase() : "-";
        const docRef = db.collection(collection).doc(updateForm.id);
        const snapshot = await docRef.get();
        let oldData = snapshot.data();

        const { id, ...newUpdateForm } = updateForm;

        // Convert studentName and guardianName to UPPER CASE before building audit message
        if (newUpdateForm.studentName) {
            newUpdateForm.studentName = newUpdateForm.studentName.toUpperCase();
        }
        if (newUpdateForm.guardianName) {
            newUpdateForm.guardianName = newUpdateForm.guardianName.toUpperCase();
        }

        let auditMessage = 'Updated Student';

        for (let key in newUpdateForm) {
            if (key === 'id') continue;

            auditMessage = auditMessage + `, ${key.toUpperCase()}:- ${oldData[key]} to ${newUpdateForm[key]} `;

        }

        if (updateForm.studentName && updateForm.studentName !== '') {

            const studentDetails =
                newUpdateForm.studentName +
                " - " +
                oldData.studentCode;

            await docRef.update({
                ...newUpdateForm,
                studentDetails,
                modifiedBy: modifiedByName,
                modifiedDateTimeFormatted: modifiedDateTimeFormat
            });

            if (status === 1 || status === 2) {

                let paymentRef = db
                    .collection(config.collections.studentDetailsPayment)
                    .doc(updateForm.id);

                const paymentDoc = await paymentRef.get();

                if (paymentDoc.exists) {
                    await paymentRef.update({
                        studentName: newUpdateForm.studentName,
                        studentDetails
                    });
                }
            }

            await insertAuditDetails(
                req,
                auditMessage,
                updateForm.id,
                studentDetails,
                true
            );
        }
        else {
            await docRef.update({
                ...newUpdateForm,
                modifiedBy: modifiedByName,
                modifiedDateTimeFormatted: modifiedDateTimeFormat
            });

            await insertAuditDetails(
                req,
                auditMessage,
                updateForm.id
            );
        }

        let jsonMessage = `Successfully Updated For ${oldData.studentName}`;

        return res.status(200).json({ message: jsonMessage });

    }
    catch {
        return res.sendStatus(400);
    }
});


router.post("/studentAudit", async (req, res) => {
    try {
        let { id } = req.body;
        const docRef = db.collection(config.collections.studentDetailsAudit).doc(id);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
            return res.json({ message: "No Data Found" });
        }

        let auditData = snapshot.data().audits;
        let reverseAudit = auditData.reverse();

        return res.json(reverseAudit);
    }
    catch {
        return res.sendStatus(400);
    }

});

router.post("/deleteStudent", async (req, res) => {
    try {
        let { id, status } = req.body;
        let systemComments = '';
        let docData = null;

        if (!adminRole(req)) {
            status = 'Approval';
        }

        const deletePromises = [];
        if (status === 'Active') {
            let docRef = db.collection(config.collections.studentDetailsActiveStatus).doc(id);

            const docSnapshot = await docRef.get();
            docData = docSnapshot.data();

            deletePromises.push(
                db.collection(config.collections.studentDetailsDelete).doc(id).set(docData),
                docRef.delete()
            );

            systemComments = 'Deleted from Active Status and moved to deleted';
        }
        else if (status === 'Deactive') {
            let docRef = db.collection(config.collections.studentDetailsDeactiveStatus).doc(id);
            deletePromises.push(docRef.delete());

            systemComments = 'Deleted from Deactive Status';
        }
        else {
            let docRef = db.collection(config.collections.studentDetailsApprovalStatus).doc(id);
            deletePromises.push(docRef.delete());

            systemComments = 'Deleted from Approval Status';
        }

        deletePromises.push(
            sendQueueWorkerMessage({
                eventType: "RemoveStudentFromBatch",
                studentId: id,
                user: req.Name ? req.Name.toUpperCase() : "-",
                systemComments: systemComments,
                documentId: id
            })
        );

        await Promise.all(deletePromises);

        return res.sendStatus(200);
    }
    catch {
        return res.sendStatus(400);
    }

});

module.exports = router;


