const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db, currentTime, admin } = require('../credentials/firebaseCredentials');
const { adminRole } = require('../roleFunctions');
const { insertAuditDetails } = require('../commonFunctions');

router.post("/req/paymentsViews", async (req, res) => {

    try {
        if (!adminRole(req)) {
            return res.status(200).json({ message: "Not Authorized" });
        }

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
            let unpaidStudentsArray = unpaidStudents.map(student => student.studentDetails).sort();
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

router.post("/req/createPayments", async (req, res) => {

    try {
        if (!adminRole(req)) {
            return res.status(200).json({ message: "Not Authorized" });
        }

        let { students, amount, modeOfPayment, month, paymentDate } = req.body; // Fetch details from req body

        if (!students) {
            return res.status(400).json({ message: 'Students is empty' });
        }
        else if (!amount || amount === 0.00) {
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

        const newPayment = {
            amount,
            createdDateTime: createdDateTimeFormat, // use the current timestamp or any specific timestamp
            modeOfPayment,
            paymentDate
        };

        let message = `Payment Added for Month ${month}:-  `;

        for (const student of students) {

            let studentDoc = await db.collection(config.collections.studentDetailsActiveStatus)
                .where("studentDetails", "==", student)
                .limit(1)
                .get();

            let docDetails = studentDoc.empty ? null : studentDoc.docs[0].data();

            if (docDetails) {
                let docid = studentDoc.docs[0].id;

                // Update the individual student details
                const docRef = db.collection(config.collections.studentDetailsPayment).doc(docid);

                const docSnapshot = await docRef.get();

                if (docSnapshot.exists) {

                    await docRef.update({
                        [`payments.${month}`]: newPayment,
                        latestEntry: `${month}, ${amount}, ${modeOfPayment}`
                    });

                } else {
                    await docRef.set({
                        createdDateTime: currentTime,
                        payments: {
                            [month]: newPayment,
                        },
                        studentCode: docDetails.studentCode,
                        studentName: docDetails.studentName,
                        latestEntry: `${month}, ${amount}, ${modeOfPayment}`
                    });
                }

                // Update the monthly payment
                const monthlyDocRef = db.collection(config.collections.monthlyPaymentDetails).doc(month);

                const monthlyDocSnapshot = await monthlyDocRef.get();

                if (monthlyDocSnapshot.exists) {

                    await monthlyDocRef.update({
                        monthlyPayments: admin.firestore.FieldValue.arrayUnion(docid),
                    });

                } else {
                    await monthlyDocRef.set({
                        createdDateTime: currentTime,
                        monthlyPayments: [docid],
                    });
                }

                // Update the total monthly amount details
                const totalMonthlyDocRef = db.collection(config.collections.totalMonthlyAmountDetails).doc(month);

                const totalMonthlyDocSnapshot = await totalMonthlyDocRef.get();

                let totalMonthlyAmountPayment;

                if (modeOfPayment === 'Bank') {
                    totalMonthlyAmountPayment = {
                        bank: admin.firestore.FieldValue.increment(amount),
                        totalAmount: admin.firestore.FieldValue.increment(amount)
                    };
                } else if (modeOfPayment === 'Cash') {
                    totalMonthlyAmountPayment = {
                        cash: admin.firestore.FieldValue.increment(amount),
                        totalAmount: admin.firestore.FieldValue.increment(amount)
                    };
                } else {
                    totalMonthlyAmountPayment = {
                        others: admin.firestore.FieldValue.increment(amount),
                        totalAmount: admin.firestore.FieldValue.increment(amount)
                    };
                }

                if (totalMonthlyDocSnapshot.exists) {
                    // Update the document with the new values
                    await totalMonthlyDocRef.update(totalMonthlyAmountPayment);
                } else {
                    // Create a new document with the initial values
                    await totalMonthlyDocRef.set({
                        createdDateTime: currentTime,
                        bank: 0,
                        cash: 0,
                        others: 0,
                        ...totalMonthlyAmountPayment
                    });
                }

                // Update the Audit
                insertAuditDetails(req, `Added Payment, Month:- ${month}, Amount:- ${amount}, Payment Mode:- ${modeOfPayment}`, docid, docDetails.studentDetails);

                message = message + `${docDetails.studentDetails}` + ", ";
            }
        }


        let newMessage = message.slice(0, -2);

        return res.status(200).json({ message: newMessage });
    }
    catch {
        return res.sendStatus(400);
    }

}
);

router.get("/req/studentsDetails", async (req, res) => {

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

router.post("/req/studentsPayments", async (req, res) => {

    try {
        let { studentId } = req.body; // Fetch details from req body

        let docRef = db.collection(config.collections.studentDetailsPayment).doc(studentId);

        const snapshot = await docRef.get();

        if (snapshot.exists) {
            const payments = snapshot.get('payments');

            const paymentsArray = Object.entries(payments)
                .map(([monthKey, details]) => ({
                    month: monthKey,
                    ...details,
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

router.post("/req/monthlyPayments", async (req, res) => {

    try {
        let { month, isGiven } = req.body;

        const monthlyPaymentDoc = db.collection(config.collections.monthlyPaymentDetails).doc(month);
        const monthlySnapshot = await monthlyPaymentDoc.get();
        const data = monthlySnapshot.data();
        const monthlyPaymentsArray = data?.monthlyPayments ?? [];

        if (isGiven === 1) { //If isGiven is 1

            if (!monthlySnapshot.exists || monthlyPaymentsArray.length === 0) {
                return res.status(200).json({});
            }

            let paymentDetailsArray = [];

            for (const docId of monthlyPaymentsArray) {

                const studentDetailsPaymentDoc = db.collection(config.collections.studentDetailsPayment).doc(docId);
                const snapshot = await studentDetailsPaymentDoc.get();

                if (!snapshot.exists) {
                    continue;
                }

                const docData = snapshot.data();
                const paymentDetails = docData.payments;

                if (paymentDetails && paymentDetails[month]) {
                    const paymentInfo = paymentDetails[month];

                    paymentDetailsArray.push({
                        studentCode: docData.studentCode,
                        studentName: docData.studentName,
                        modeOfPayment: paymentInfo.modeOfPayment,
                        amount: paymentInfo.amount,
                        paymentDate: paymentInfo.paymentDate,
                        createdDateTime: paymentInfo.createdDateTime
                    });

                } else {
                    continue;
                }
            }

            paymentDetailsArray = paymentDetailsArray.sort((a, b) => {
                return a.studentName.localeCompare(b.studentName);
            });

            return res.status(200).json(paymentDetailsArray);

        }
        else { //If isGiven is 0

            if (!monthlySnapshot.exists || monthlyPaymentsArray.length === 0) {

                const activeStudents = db.collection(config.collections.studentDetailsActiveStatus);
                const snapshot = await activeStudents.select(
                    'studentName',
                    'studentCode')
                    .get();

                let activeStudentDocIds = snapshot.docs.map((doc) => doc.data());
                activeStudentDocIds = activeStudentDocIds.sort((a, b) => {
                    return a.studentName.localeCompare(b.studentName);
                });

                return res.status(200).json(activeStudentDocIds);
            }

            const activeStudents = db.collection(config.collections.studentDetailsActiveStatus);
            const activeStudentSnapshot = await activeStudents.get();
            const activeStudentDocIds = activeStudentSnapshot.docs.map(doc => doc.id);
            let unpaidStudents = activeStudentDocIds.filter(docid => !monthlyPaymentsArray.includes(docid));

            const notGivenPromises = unpaidStudents.map(async docId => {
                const doc = await activeStudents.doc(docId).get();
                if (doc.exists) {
                    const { studentName, studentCode } = doc.data();
                    return { studentName, studentCode };
                }
                return null;
            });

            let notGivenDetails = (await Promise.all(notGivenPromises)).filter(detail => detail !== null);

            notGivenDetails = notGivenDetails.sort((a, b) => {
                return a.studentName.localeCompare(b.studentName);
            });

            res.status(200).json(notGivenDetails);

        }

    } catch {
        return res.sendStatus(400);
    }
}
);


router.get("/req/totalPayments", async (req, res) => {

    const docRef = db.collection(config.collections.totalMonthlyAmountDetails).orderBy('createdDateTime', 'desc').limit(12);

    try {
        const snapshot = await docRef.get();

        if (!snapshot.empty) {
            const totalMonthlyPaymentsArray = snapshot.docs.map(doc => {
                const { createdDateTime, ...otherData } = doc.data(); // Exclude createdDateTime
                return {
                    month: doc.id,
                    ...otherData,
                };
            });

            return res.json(totalMonthlyPaymentsArray);
        } else {
            return res.status(200).json({ message: "Not Found" });
        }
    } catch {
        return res.sendStatus(400);
    }

});

module.exports = router;