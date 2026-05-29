const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db, admin } = require('../credentials/firebaseCredentials');
const { insertAuditDetails, sendQueueWorkerMessage } = require('../commonFunctions');
const { adminOnly } = require('../authMiddleware');
router.use(adminOnly);

router.post("/paymentsViews", async (req, res) => {

    try {

        let { month } = req.body; // Fetch Student Code from req body

        let activeStudentsSnapshot = await db.collection(config.collections.studentDetailsActiveStatus)
            .select('studentDetails')
            .get();

        let activeStudentIds = activeStudentsSnapshot.docs.map(doc => ({
            id: doc.id,
            studentDetails: doc.data().studentDetails
        }));

        const paymentsSnapshot = await db.collection(config.collections.monthlyPaymentDetails)
            .doc(month)
            .get();

        let paidStudentIds = [];

        if (paymentsSnapshot.exists) {
            // Retrieve the monthlyPayments array from the document
            paidStudentIds = paymentsSnapshot.data().monthlyPayments || [];
        }

        // Filter out active students who are not in the paidStudentIds array
        let unpaidStudents = activeStudentIds.filter(student => !paidStudentIds.includes(student.id));

        if (unpaidStudents.length > 0) {
            // Map and sort the unpaid students by student details
            let unpaidStudentsArray = unpaidStudents.map(student => student.studentDetails).sort((a, b) => a.localeCompare(b));
            return res.json(unpaidStudentsArray);
        }
        else {
            return res.json({ message: `All Payments are done on ${month}` });
        }
    }
    catch {
        return res.sendStatus(400);
    }
}
);

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
            return res.status(200).json({});
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
                const indexDocRef = db.collection(config.collections.monthlyPaymentStatusIndex).doc(month);
                const givenCollRef = indexDocRef.collection("given");
                const givenSnapshot = await givenCollRef.get();

                if (givenSnapshot.empty) {
                    return res.status(200).json({});
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
            catch (indexError) {
                console.error("Error reading payment index:", indexError);
                // Fallback to old method if index doesn't exist
                return res.status(200).json({});
            }

        }
        else { //If isGiven is 0 - Fetch not given payments from index

            try {
                const indexDocRef = db.collection(config.collections.monthlyPaymentStatusIndex).doc(month);
                const indexSnapshot = await indexDocRef.get();

                // If index doesn't exist yet, return empty (no data to show)
                if (!indexSnapshot.exists) {
                    return res.status(200).json({});
                }

                const notGivenCollRef = indexDocRef.collection("notGiven");
                const notGivenSnapshot = await notGivenCollRef.get();

                if (notGivenSnapshot.empty) {
                    // Index exists but notGiven is empty = all students are paid
                    return res.status(200).json({});
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

        const updatedPayment = {
            ...newUpdateForm,
            updateComments: auditMessage,
            modifiedBy: modifiedByName,
            modifiedDateTime: modifiedDateTimeFormat
        };

        // Direct synchronous update for real-time UI feedback
        await docRef.set({
            payments: {
                [month]: updatedPayment
            }
        }, { merge: true });

        let studentDetails = oldData.studentName + '-' + oldData.studentCode;

        // Send SQS message for background processing (totals, index, audit)
        const currentPayment = oldData.payments[month];
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
        await studentDetailsDocRef.update({
            [`payments.${month}`]: admin.firestore.FieldValue.delete()
        });

        const monthlyPaymentDocRef = db.collection(config.collections.monthlyPaymentDetails).doc(month);
        await monthlyPaymentDocRef.update({
            monthlyPayments: admin.firestore.FieldValue.arrayRemove(id)
        });

        let studentDetails = studentDetail || studentName + '-' + studentCode;

        // Send SQS message for background processing (totals, index, audit)
        await sendQueueWorkerMessage({
            eventType: "DeletePaymentTotals",
            id,
            month,
            amount,
            modeOfPayment,
            studentCode,
            studentName,
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
