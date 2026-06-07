const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db, admin } = require('../credentials/firebaseCredentials');
const { sendQueueWorkerMessage } = require('../commonFunctions');
const { adminOnly } = require('../authMiddleware');
router.use(adminOnly);

function addMonthlyPaymentGivenIndexUpdate(batch, {
    month,
    id,
    paymentDate,
    modeOfPayment,
    amount,
    createdDateTime,
    studentCode,
    studentName,
    updatedDateTime
}) {
    const monthDocRef = db.collection(config.collections.monthlyPaymentDetails).doc(month);

    batch.set(monthDocRef, {
        updatedDateTime
    }, { merge: true });

    const givenData = {
        documentId: id,
        id,
        studentCode,
        studentName,
        paymentDate,
        modeOfPayment
    };

    if (amount !== undefined) {
        givenData.amount = amount;
    }

    if (createdDateTime !== undefined) {
        givenData.createdDateTime = createdDateTime;
    }

    batch.set(monthDocRef.collection("given").doc(id), givenData, { merge: true });

    batch.delete(monthDocRef.collection("notGiven").doc(id));
}

function addMonthlyPaymentGivenIndexDelete(batch, {
    month,
    id,
    studentCode,
    studentName,
    updatedDateTime
}) {
    const monthDocRef = db.collection(config.collections.monthlyPaymentDetails).doc(month);

    batch.set(monthDocRef, {
        monthlyPayments: admin.firestore.FieldValue.arrayRemove(id),
        updatedDateTime
    }, { merge: true });

    batch.delete(monthDocRef.collection("given").doc(id));
    batch.set(monthDocRef.collection("notGiven").doc(id), {
        documentId: id,
        id,
        studentCode,
        studentName
    }, { merge: true });
}

router.post("/paymentsViews", async (req, res) => {
    try {
        const { month } = req.body;

        if (!month) {
            return res.status(400).json({ message: "Month is required" });
        }

        const monthDocRef = db
            .collection(config.collections.monthlyPaymentDetails)
            .doc(month);

        const givenSnapshot = await monthDocRef
            .collection("given")
            .get();

        // If given is empty, send all active students
        if (givenSnapshot.empty) {
            const activeStudentsSnapshot = await db
                .collection(config.collections.studentDetailsActiveStatus)
                .orderBy("studentName", "asc")
                .select("studentDetails", "studentName", "studentCode")
                .get();

            const activeStudents = activeStudentsSnapshot.docs
                .map(doc => {
                    const data = doc.data();

                    if (data.studentDetails) {
                        return data.studentDetails;
                    }

                    if (data.studentName && data.studentCode) {
                        return `${data.studentName} - ${data.studentCode}`;
                    }

                    return data.studentName || data.studentCode || "Unknown";
                })
                .filter((value, index, self) => self.indexOf(value) === index)
                .sort((a, b) => a.localeCompare(b));

            return res.json(activeStudents);
        }

        const notGivenSnapshot = await monthDocRef
            .collection("notGiven")
            .get();

        // If notGiven is empty, all students have paid
        if (notGivenSnapshot.empty) {
            return res.json({
                message: `All payments are done for ${month}`
            });
        }

        // Otherwise send notGiven students
        const unpaidStudents = notGivenSnapshot.docs
            .map(doc => {
                const data = doc.data();
                if (data.studentName && data.studentCode) {
                    return `${data.studentName} - ${data.studentCode}`;
                }

                return data.studentName || data.studentCode || "Unknown";
            })
            .filter((value, index, self) => self.indexOf(value) === index)
            .sort((a, b) => a.localeCompare(b));

        return res.json(unpaidStudents);

    } catch {
        return res.sendStatus(400);
    }
});

router.post("/createPayments", async (req, res) => {

    try {

        let { students, studentIds, amount, modeOfPayment, month, paymentDate } = req.body; // Fetch details from req body
        const paymentStudents = Array.isArray(studentIds) && studentIds.length > 0 ? studentIds : students;

        if (!Array.isArray(paymentStudents) || paymentStudents.length === 0) {
            return res.status(400).json({ message: 'Students is empty' });
        }
        else if (!amount || amount === 0) {
            return res.status(400).json({ message: 'Amount is empty' });
        }
        else if (!modeOfPayment) {
            return res.status(400).json({ message: 'Mode of Payment is empty' });
        }
        else if (!month || month.length === 0 || month.includes("Invalid Date")) {
            return res.status(400).json({ message: 'Month is empty/invalid' });
        }

        if (!paymentDate) {
            paymentDate = "-";
        }

        await sendQueueWorkerMessage({
            eventType: "CreatePayments",
            students: paymentStudents,
            amount,
            modeOfPayment,
            month,
            paymentDate,
            user: req.Name ? req.Name.toUpperCase() : "-"
        });

        return res.status(200).json({
            message: `Payment creation has been done for ${paymentStudents.length} student(s).`
        });
    }
    catch {
        return res.sendStatus(400);
    }

}
);

router.get("/studentsDetails", async (req, res) => {

    try {

        let docRef = db.collection(config.collections.studentDetailsActiveStatus).orderBy('studentName', 'asc');

        const snapshot = await docRef
            .select('studentDetails')
            .get();

        // Map the snapshot to an array of document data
        let dataArray = snapshot.docs.map((doc) => {
            // Merge the document data with its ID
            return { id: doc.id, ...doc.data() };
        });

        return res.json(dataArray);
    }
    catch {
        return res.sendStatus(400);
    }
}
);

router.post("/studentsPayments", async (req, res) => {

    try {

        let { studentId } = req.body; // Fetch details from req body

        let docRef = db.collection(config.collections.studentDetailsPayment).doc(studentId);

        const snapshot = await docRef.get();

        if (snapshot.exists) {
            const payments = snapshot.get('payments');

            const paymentsArray = Object.entries(payments)
                .map(([monthKey, details]) => ({
                    id: studentId,
                    month: monthKey,
                    amount: details.amount,
                    modeOfPayment: details.modeOfPayment,
                    paymentDate: details.paymentDate,
                    createdDateTime: details.createdDateTime,
                    modifiedDateTime: details.modifiedDateTime
                }))
                .sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime)); // Sort by createdDateTime in descending order

            return res.json(paymentsArray);

        } else {
            return res.status(200).json([]);
        }

    }
    catch {
        return res.sendStatus(400);
    }
}
);

router.post("/monthlyPayments", async (req, res) => {

    try {

        let { month, isGiven } = req.body;

        if (isGiven === 1) { //If isGiven is 1 - Fetch given payments from index

            try {
                const indexDocRef = db.collection(config.collections.monthlyPaymentDetails).doc(month);
                const givenCollRef = indexDocRef.collection("given");
                const givenSnapshot = await givenCollRef.get();

                if (givenSnapshot.empty) {
                    return res.status(200).json([]);
                }

                let paymentDetailsArray = givenSnapshot.docs.map(doc => ({
                    id: doc.id,
                    studentCode: doc.data().studentCode,
                    studentName: doc.data().studentName,
                    modeOfPayment: doc.data().modeOfPayment,
                    amount: doc.data().amount,
                    paymentDate: doc.data().paymentDate,
                    createdDateTime: doc.data().createdDateTime
                }));

                paymentDetailsArray = paymentDetailsArray.sort((a, b) => {
                    return a.studentName.localeCompare(b.studentName);
                });

                return res.status(200).json(paymentDetailsArray);
            }
            catch {
                return res.status(200).json([]);
            }

        }
        else { //If isGiven is 0 - Fetch not given payments from index

            try {
                const indexDocRef = db.collection(config.collections.monthlyPaymentDetails).doc(month);
                const indexDoc = await indexDocRef.get();

                if (!indexDoc.exists) {
                    const activeStudentsSnapshot = await db
                        .collection(config.collections.studentDetailsActiveStatus)
                        .orderBy("studentName", "asc")
                        .select("studentName", "studentCode")
                        .get();

                    let activeStudentsArray = activeStudentsSnapshot.docs.map(doc => ({
                        studentCode: doc.data().studentCode,
                        studentName: doc.data().studentName
                    }));

                    return res.status(200).json(activeStudentsArray);
                }

                const notGivenCollRef = indexDocRef.collection("notGiven");
                const notGivenSnapshot = await notGivenCollRef.get();

                if (notGivenSnapshot.empty) {
                    // Index exists but notGiven is empty = all students are paid
                    return res.status(200).json([]);
                }

                let notGivenDetailsArray = notGivenSnapshot.docs.map(doc => ({
                    studentCode: doc.data().studentCode,
                    studentName: doc.data().studentName
                }));

                notGivenDetailsArray = notGivenDetailsArray.sort((a, b) => {
                    return a.studentName.localeCompare(b.studentName);
                });

                return res.status(200).json(notGivenDetailsArray);
            }
            catch {
                return res.sendStatus(400);
            }
        }

    } catch {
        return res.sendStatus(400);
    }
}
);


router.get("/totalPayments", async (req, res) => {


    const docRef = db.collection(config.collections.totalMonthlyAmountDetails).orderBy('createdDateTime', 'desc').limit(12);

    try {
        const snapshot = await docRef.get();

        if (snapshot.empty) {
            return res.status(200).json({ message: "Not Found" });
        }

        const totalMonthlyPaymentsArray = snapshot.docs.map(doc => {
            const { createdDateTime, ...otherData } = doc.data(); // Exclude createdDateTime
            return {
                month: doc.id,
                ...otherData,
            };
        });

        return res.json(totalMonthlyPaymentsArray);
    } catch {
        return res.sendStatus(400);
    }

});

router.put("/updateStudentPayment", async (req, res) => {
    let { updateForm } = req.body;

    try {

        const { id, month, ...newUpdateForm } = updateForm;

        const docRef = db.collection(config.collections.studentDetailsPayment).doc(id);
        const snapshot = await docRef.get();
        let oldData = snapshot.data();

        let auditMessage = 'Updated Payment';

        for (let key in updateForm) {

            if (key === 'modeOfPayment' || key === 'paymentDate') {
                auditMessage += `, ${key.toUpperCase()}:- ${oldData['payments'][month][key]} to ${updateForm[key]} `;
            }
        }

        let modifiedByName = req.Name ? req.Name.toUpperCase() : "-";

        const modifiedDateTimeFormat = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        const updatedPaymentFields = {
            ...newUpdateForm,
            updateComments: auditMessage,
            modifiedBy: modifiedByName,
            modifiedDateTime: modifiedDateTimeFormat
        };

        const paymentUpdate = Object.entries(updatedPaymentFields).reduce((updates, [key, value]) => {
            updates[`payments.${month}.${key}`] = value;
            return updates;
        }, {});

        let studentDetails = oldData.studentName + '-' + oldData.studentCode;
        const currentPayment = oldData.payments[month];

        // Direct synchronous update for real-time UI feedback
        const updateBatch = db.batch();
        updateBatch.update(docRef, paymentUpdate);
        addMonthlyPaymentGivenIndexUpdate(updateBatch, {
            month,
            id,
            paymentDate: updateForm.paymentDate || currentPayment.paymentDate,
            modeOfPayment: updateForm.modeOfPayment || currentPayment.modeOfPayment,
            amount: currentPayment.amount,
            createdDateTime: currentPayment.createdDateTime,
            studentCode: oldData.studentCode,
            studentName: oldData.studentName,
            updatedDateTime: modifiedDateTimeFormat
        });

        await updateBatch.commit();
        await sendQueueWorkerMessage({
            eventType: "UpdatePaymentTotals",
            id,
            month,
            oldMode: currentPayment.modeOfPayment,
            newMode: updateForm.modeOfPayment || currentPayment.modeOfPayment,
            amount: currentPayment.amount,
            paymentDate: updateForm.paymentDate || currentPayment.paymentDate,
            studentCode: oldData.studentCode,
            studentName: oldData.studentName,
            studentDetails,
            auditMessage: auditMessage,
            modifiedBy: modifiedByName,
            modifiedDateTime: modifiedDateTimeFormat,
            user: req.Name ? req.Name.toUpperCase() : "-"
        });

        return res.status(200).json({ message: `Successfully updated for ${studentDetails}` });
    }
    catch {
        return res.sendStatus(400);
    }

});

router.post("/deleteStudentPayment", async (req, res) => {

    try {
        let { id, month, amount, modeOfPayment, studentName, studentCode, studentDetail } = req.body;

        const studentDetailsDocRef = db.collection(config.collections.studentDetailsPayment).doc(id);

        let auditMessage = `Deleted Payment:- ${[month]}`;

        let modifiedByName = req.Name ? req.Name.toUpperCase() : "-";

        const modifiedDateTimeFormat = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        // Direct synchronous delete for real-time UI feedback
        const deleteBatch = db.batch();
        deleteBatch.update(studentDetailsDocRef, {
            [`payments.${month}`]: admin.firestore.FieldValue.delete()
        });

        addMonthlyPaymentGivenIndexDelete(deleteBatch, {
            month,
            id,
            studentCode,
            studentName,
            updatedDateTime: modifiedDateTimeFormat
        });


        let studentDetails = studentDetail || studentName + '-' + studentCode;

        await deleteBatch.commit();
        await sendQueueWorkerMessage({
            eventType: "DeletePaymentTotals",
            id,
            month,
            amount,
            modeOfPayment,
            studentCode,
            studentName,
            studentDetails,
            auditMessage: auditMessage,
            modifiedBy: modifiedByName,
            modifiedDateTime: modifiedDateTimeFormat,
            user: req.Name ? req.Name.toUpperCase() : "-"
        });

        return res.status(200).json({ message: `Successfully Deleted for ${studentDetails}` });
    }
    catch {
        return res.sendStatus(400);
    }

});

module.exports = router;

