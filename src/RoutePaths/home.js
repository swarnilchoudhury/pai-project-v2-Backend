const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db, currentTime } = require('../credentials/firebaseCredentials');
const { verifyIdToken, verifyIdTokenDetails } = require('../authMiddleware');
const { adminRole } = require('../roleFunctions');

//Home Page to Fetch Details
router.get("/home", verifyIdToken, async (req, res) => {

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

        const snapshot = await docRef.select('studentName',
            'studentCode',
            'phoneNumber',
            'guardianName',
            'dob',
            'admissionDate',
            'createdDateTimeFormatted')
            .get();

        // Map the snapshot to an array of document data
        let homePageDataArray = snapshot.docs.map(doc => doc.data());

        return res.json(homePageDataArray);
    }
    catch {
        return res.sendStatus(400);
    }
}
);


//Search Code
router.post("/searchCode", verifyIdToken, async (req, res) => {

    try {
        let studentCode = req.body.studentCode; //Fetch student Code from UI

        if (!studentCode.includes("PAI")) {
            studentCode = "PAI-" + studentCode; //Append PAI
        }

        const docRef = db.collection(config.collections.studentDetailsActiveStatus).doc(studentCode);
        const doc = await docRef.get();
        if (doc.exists) {
            return res.json({ returnCode: 1 });
        }

        return res.json({ returnCode: 0 })
    }
    catch {
        return res.sendStatus(400);
    }
}
);

//Latest StudentCode
router.get("/latestCode", verifyIdToken, async (req, res) => {

    try {
        const docRef = db.collection(config.collections.studentDetailsActiveStatus).orderBy('studentCodeNumeric', 'desc').limit(1);
        const snapshot = await docRef.get();

        let latestStudentCode = snapshot.docs.length > 0 ? snapshot.docs[0].data().studentCodeNumeric : "";

        return res.json({ latestStudentCode: "PAI-" + latestStudentCode });
    }
    catch {
        return res.sendStatus(400);
    }
}
);

//Create new documents
router.post("/create", verifyIdTokenDetails, async (req, res) => {
    try {
        let { studentCode, phoneNumber, ...otherData } = req.body; //Fetch student Code from UI

        let studentCodeNumeric = parseInt(studentCode);

        if (!studentCode.includes("PAI")) {
            studentCode = "PAI-" + studentCode; //Append PAI
        }

        if (phoneNumber.length === 0) {
            phoneNumber = "-";
        }

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

        const document = {
            ...otherData,
            studentCode,
            studentCodeNumeric,
            phoneNumber,
            createdDateTime: currentTime,
            createdDateTimeFormatted: createdDateTimeFormat,
        }; //Add the studentCode and createdDateTime to the document

        // Determine the target collection based on user role
        const collectionName = adminRole(req)
            ? config.collections.studentDetailsActiveStatus
            : config.collections.studentDetailsApprovalStatus;

        const docRef = db.collection(collectionName).doc(studentCode);

        // Write the document to the database
        await docRef.set(document);

        // Confirm the document was written successfully
        const docSnapshot = await docRef.get();
        if (docSnapshot.exists) {
            const message = adminRole(req) //Admin role
                ? `${studentCode} has been created`
                : `${studentCode} has been sent for approval`;

            return res.status(200).json({ message });
        } else {
            return res.status(400).json({ message: 'Failed to write document' });
        }
    } catch {
        return res.sendStatus(400);
    }
});

//For Changing of Status for Student
router.post("/update", verifyIdTokenDetails, async (req, res) => {
    try {
        if (!adminRole(req)) {
            return res.status(200).json({ message: "Not Authorized" });
        }

        let status = req.headers['x-update'].toLowerCase(); //Fetch Status from UI
        let validateFlag = false;
        let currentDocRef, newDocRef;

        if (status === 'deactive') {
            currentDocRef = db.collection(config.collections.studentDetailsActiveStatus);
            newDocRef = db.collection(config.collections.studentDetailsDeactiveStatus);
        } else if (status === 'active') {
            currentDocRef = db.collection(config.collections.studentDetailsDeactiveStatus);
            newDocRef = db.collection(config.collections.studentDetailsActiveStatus);
            validateFlag = true;
        } else if (status === 'approve') {
            currentDocRef = db.collection(config.collections.studentDetailsApprovalStatus);
            newDocRef = db.collection(config.collections.studentDetailsActiveStatus);
            validateFlag = true;
        }

        const UpdateDetails = async (currentDocRef, newDocRef, studentCode) => { //Update
            let docRef = currentDocRef.doc(studentCode);

            const docSnapshot = await docRef.get();
            const docData = docSnapshot.data();

            await newDocRef.doc(studentCode).set(docData);
            await docRef.delete();
        }

        let message = "";
        const movePromises = req.body.data.map(async (studentCode) => { //Move the data
            const newDocumentRef = newDocRef.doc(studentCode);

            let result = await newDocumentRef.get();

            if (validateFlag && result.exists) {
                message += `${studentCode} `;
            } else {
                await UpdateDetails(currentDocRef, newDocRef, studentCode);
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
