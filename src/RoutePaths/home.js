const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { v4: uuidv4 } = require('uuid');
const { db, currentTime } = require('../credentials/firebaseCredentials');
const { adminRole } = require('../roleFunctions');
const { insertAuditDetails } = require('../commonFunctions');

//Home Page to Fetch Details
router.get("/home", async (req, res) => {

    try {
        let docRef;
        let status = req.headers['x-status'].toLowerCase(); //Fetch Status from UI

        if (status === 'deactive') {
            docRef = db.collection(config.collections.studentDetailsDeactiveStatus).orderBy('studentName', 'asc');
        }
        else if (status === 'unapproval') {
            docRef = db.collection(config.collections.studentDetailsApprovalStatus).orderBy('studentName', 'asc');
        }
        else {
            docRef = db.collection(config.collections.studentDetailsActiveStatus).orderBy('studentName', 'asc');
        }

        const snapshot = await docRef.select(
            'studentName',
            'studentCode',
            'phoneNumber',
            'guardianName',
            'dob',
            'admissionDate',
            'createdDateTimeFormatted',
            'createdBy')
            .get();

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


//Search Code
router.post("/searchCode", async (req, res) => {

    try {
        let { studentCode } = req.body; //Fetch Student Code from req body

        if (!studentCode.includes("PAI")) {
            studentCode = "PAI-" + studentCode; //Append PAI
        }

        // Validate in active state by Student Code
        const activeDocRef = db.collection(config.collections.studentDetailsActiveStatus)
            .where('studentCode', '==', studentCode)
            .limit(1); // Limit to 1 document to improve performance

        const activeDocSnapshot = await activeDocRef.get();

        if (!activeDocSnapshot.empty) { // Send Message if present in Active
            return res.json({ returnCode: 1, message: `${studentCode} already present in Active` });
        }

        // Validate in approval state by Student Code
        const approvalDocRef = db.collection(config.collections.studentDetailsApprovalStatus)
            .where('studentCode', '==', studentCode)
            .limit(1); // Limit to 1 document to improve performance

        const approvalDocSnapshot = await approvalDocRef.get();

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

//Latest StudentCode
router.get("/latestCode", async (req, res) => {

    try {
        const activeDocRef = db.collection(config.collections.studentDetailsActiveStatus).orderBy('studentCodeNumeric', 'desc').limit(1);
        const activeDocSnapshot = await activeDocRef.get();

        let activeLatestStudentCode = activeDocSnapshot.docs.length > 0 ? activeDocSnapshot.docs[0].data().studentCode : "Empty";

        const approveDocRef = db.collection(config.collections.studentDetailsApprovalStatus).orderBy('studentCodeNumeric', 'desc').limit(1);
        const approveDocSnapshot = await approveDocRef.get();

        let approveLatestStudentCode = approveDocSnapshot.docs.length > 0 ? approveDocSnapshot.docs[0].data().studentCode : "Empty";

        return res.json({ latestStudentCode: `${activeLatestStudentCode} (Active),${approveLatestStudentCode} (Approve)` });
    }
    catch {
        return res.sendStatus(400);
    }
}
);

//Create new documents
router.post("/req/create", async (req, res) => {
    try {
        let { studentCode } = req.body; //Fetch Student Code from req body

        let studentCodeNumeric = parseInt(studentCode);

        if (!studentCode.includes("PAI")) {
            studentCode = "PAI-" + studentCode; //Append PAI
        }

        // Validate in active state by Student Code
        const activeDocRef = db.collection(config.collections.studentDetailsActiveStatus)
            .where('studentCode', '==', studentCode)
            .limit(1); // Limit to 1 document to improve performance

        const activeDocSnapshot = await activeDocRef.get();

        if (!activeDocSnapshot.empty) { // Send Message if present in Active
            return res.json({ message: `${studentCode} already present in Active` });
        }

        // Validate in approval state by Student Code
        const approvalDocRef = db.collection(config.collections.studentDetailsApprovalStatus)
            .where('studentCode', '==', studentCode)
            .limit(1); // Limit to 1 document to improve performance

        const approvalDocSnapshot = await approvalDocRef.get();

        if (!approvalDocSnapshot.empty) { // Send Message if present in Approval
            return res.json({ message: `${studentCode} already present in Approval` });
        }


        let { studentName, guardianName, phoneNumber, admissionDate, dob } = req.body; //Fetch required details from req body

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

        const studentView = studentName + " - " + studentCode;

        const document = {
            studentName,
            studentCode,
            guardianName,
            studentCodeNumeric,
            phoneNumber,
            admissionDate,
            dob,
            studentView,
            createdDateTime: currentTime,
            createdDateTimeFormatted: createdDateTimeFormat,
            createdBy: createdByName
        }; //Add the required details to the document

        // Determine the target collection based on user role
        const collectionName = adminRole(req)
            ? config.collections.studentDetailsActiveStatus
            : config.collections.studentDetailsApprovalStatus;

        const documentId = uuidv4(); //Generate UUID
        const docRef = db.collection(collectionName).doc(documentId);

        // Write the document to the database
        await docRef.set(document);

        // Confirm the document was written successfully
        const docSnapshot = await docRef.get();

        if (docSnapshot.exists) {

            const message = adminRole(req) //Admin role
                ? `${studentCode} has been created`
                : `${studentCode} has been sent for approval`;

            return res.json({ message });
        } else {
            return res.json({ message: 'Failed to write document' });
        }
    } catch {
        return res.sendStatus(400);
    }
});

//For Changing of Status for Student
router.post("/req/update", async (req, res) => {
    try {
        if (!adminRole(req)) {
            return res.status(200).json({ message: "Not Authorized" });
        }

        let status = req.headers['x-update'].toLowerCase(); //Fetch Status from UI
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

        const UpdateDetails = async (currentDocRef, newDocRef, documentId, studentCode) => { //Update

            let docRef = currentDocRef.doc(documentId);

            const docSnapshot = await docRef.get();
            const docData = docSnapshot.data();

            await newDocRef.doc(documentId).set(docData);
            await docRef.delete();

            await insertAuditDetails(req, systemComments, documentId, studentCode);
        }

        let message = "";
        const movePromises = req.body.data.map(async (studentDetails) => { //Move the data

            let [documentId, studentCode] = studentDetails.split('/');

            if (validateFlag) {

                const newDocumentRef = newDocRef.doc(documentId);
                let result = await newDocumentRef.get();

                if (result.exists) { //If Exists then don't update
                    message += `${studentCode} `;
                }
                else { //Update the details
                    await UpdateDetails(currentDocRef, newDocRef, documentId, studentCode);
                }

            } else {
                await UpdateDetails(currentDocRef, newDocRef, documentId, studentCode);
            }
        });

        await Promise.all(movePromises); //Wait till all the data moves

        if (message) {
            return res.status(200).json({ message: `${message} already present in Active Status` });
        } else {
            return res.sendStatus(200);
        }
    } catch {
        return res.sendStatus(400);
    }
});

module.exports = router;