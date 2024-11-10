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

        // Map and sort the unpaid students by student details
        let unpaidStudentsArray = unpaidStudents.map(student => student.studentDetails).sort();

        return res.json(unpaidStudentsArray);
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

module.exports = router;