const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { v4: uuidv4 } = require('uuid');
const { db } = require('../credentials/firebaseCredentials');
const { insertAuditDetails } = require('../commonFunctions');
const { adminOnly } = require('../authMiddleware');

router.use(adminOnly);

const getFormattedTime = () => {
    return new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
};

const getTeacherNameMap = async () => {
    const teachersSnapshot = await db.collection(config.collections.teacherDetails).get();
    const teacherNameById = new Map();

    teachersSnapshot.docs.forEach((doc) => {
        const teacherData = doc.data();
        teacherNameById.set(doc.id, teacherData.teacherName || '');
    });

    return teacherNameById;
};

router.get("/batches/all", async (req, res) => {
    try {
        const [batchesSnapshot, teacherNameById] = await Promise.all([
            db.collection(config.collections.batches).get(),
            getTeacherNameMap()
        ]);

        let batchesArray = batchesSnapshot.docs.map((doc) => {
            const batchData = doc.data();
            const teacherIds = Array.isArray(batchData.teacherIds) ? batchData.teacherIds : [];
            const teacherNames = teacherIds
                .map((teacherId) => teacherNameById.get(teacherId))
                .filter(Boolean);

            return {
                id: doc.id,
                ...batchData,
                teacherIds,
                teacherNames: teacherNames.length > 0 ? teacherNames : (batchData.teacherNames || [])
            };
        });

        batchesArray.sort((a, b) => {
            const dateA = new Date(a.createdDateTime);
            const dateB = new Date(b.createdDateTime);
            return dateB - dateA;
        });

        return res.json(batchesArray);
    } catch {
        return res.sendStatus(400);
    }
});

router.get("/batches/students/:batchId", async (req, res) => {
    try {
        const { batchId } = req.params;
        const batchDoc = await db.collection(config.collections.batches).doc(batchId).get();

        if (!batchDoc.exists) {
            return res.json({ message: "Batch not found" });
        }

        const batchData = batchDoc.data();
        const studentIds = Array.isArray(batchData.studentIds) ? batchData.studentIds : [];

        if (studentIds.length === 0) {
            return res.json([]);
        }

        const studentDocs = await Promise.all(
            studentIds.map(async (studentId) => {
                const studentDoc = await db.collection(config.collections.studentDetailsActiveStatus).doc(studentId).get();
                if (!studentDoc.exists) return null;
                return {
                    id: studentDoc.id,
                    ...studentDoc.data()
                };
            })
        );

        return res.json(studentDocs.filter(Boolean));
    } catch {
        return res.sendStatus(400);
    }
});

router.post("/batches/audit", async (req, res) => {
    try {
        const { batchId } = req.body;
        if (!batchId) {
            return res.status(400).json({ message: "batchId is required" });
        }

        const snapshot = await db.collection(config.collections.batchesAudit).doc(batchId).get();
        const audits = snapshot.exists ? (snapshot.data()?.audits || []) : [];
        return res.status(200).json([...audits].reverse());
    } catch {
        return res.sendStatus(400);
    }
});

router.get("/batches/availableStudents", async (req, res) => {
    try {
        const batchesSnapshot = await db.collection(config.collections.batches).get();
        const assignedStudentIds = new Set();

        batchesSnapshot.docs.forEach((doc) => {
            const batchData = doc.data();
            const studentIds = Array.isArray(batchData.studentIds) ? batchData.studentIds : [];
            studentIds.forEach((studentId) => assignedStudentIds.add(studentId));
        });

        const activeStudentsSnapshot = await db
            .collection(config.collections.studentDetailsActiveStatus)
            .orderBy("studentName", "asc")
            .get();

        const availableStudents = activeStudentsSnapshot.docs
            .map((doc) => ({
                id: doc.id,
                ...doc.data()
            }))
            .filter((student) => !assignedStudentIds.has(student.id))
            .map((student) => ({
                id: student.id,
                studentDetails: student.studentDetails
            }));

        return res.json(availableStudents);
    } catch {
        return res.sendStatus(400);
    }
});

router.post("/batches/create", async (req, res) => {
    try {
        const { batchName, day, timeSlot, teacherIds } = req.body;

        if (!batchName || !day || !timeSlot || !Array.isArray(teacherIds) || teacherIds.length === 0) {
            return res.json({ message: "All fields are required. At least one teacher is required." });
        }

        const batchId = uuidv4();
        const formattedTime = getFormattedTime();

        await db.collection(config.collections.batches).doc(batchId).set({
            batchName: batchName.toUpperCase(),
            day,
            timeSlot,
            teacherIds,
            studentIds: [],
            createdBy: req.Name ? req.Name.toUpperCase() : "SYSTEM",
            createdDateTime: formattedTime
        });

        await insertAuditDetails(
            req,
            `Batch created: ${batchName.toUpperCase()}`,
            batchId,
            null,
            false,
            config.collections.batchesAudit
        );

        return res.json({ message: "Batch created successfully", batchId });
    } catch {
        return res.sendStatus(400);
    }
});

router.put("/batches/addStudent/:batchId", async (req, res) => {
    try {
        const { batchId } = req.params;
        const idsPayload = Array.isArray(req.body.id) ? req.body.id : req.body.studentIds;

        if (!Array.isArray(idsPayload) || idsPayload.length === 0) {
            return res.json({ message: "studentIds must be a non-empty array" });
        }

        const batchDoc = await db.collection(config.collections.batches).doc(batchId).get();
        if (!batchDoc.exists) {
            return res.json({ message: "Batch not found" });
        }

        const batchData = batchDoc.data();
        const currentStudents = Array.isArray(batchData.studentIds) ? batchData.studentIds : [];
        const idsToAdd = [...new Set(idsPayload.filter(Boolean))];
        const newStudentIds = [...new Set([...currentStudents, ...idsToAdd])];

        await db.collection(config.collections.batches).doc(batchId).update({
            studentIds: newStudentIds,
            modifiedDateTime: getFormattedTime()
        });

        await Promise.all(
            idsToAdd.map(async (studentId) => {
                const studentDoc = await db.collection(config.collections.studentDetailsActiveStatus).doc(studentId).get();
                const studentDetails = studentDoc.exists ? (studentDoc.data().studentDetails || '') : '';
                await insertAuditDetails(
                    req,
                    `Added to batch: ${batchData.batchName}`,
                    studentId,
                    studentDetails
                );
            })
        );

        const studentDetailsForBatchAudit = await Promise.all(
            idsToAdd.map(async (studentId) => {
                const studentDoc = await db.collection(config.collections.studentDetailsActiveStatus).doc(studentId).get();
                if (!studentDoc.exists) return studentId;
                return studentDoc.data().studentDetails || studentId;
            })
        );

        await insertAuditDetails(
            req,
            `Students added: ${studentDetailsForBatchAudit.join(", ")}`,
            batchId,
            null,
            false,
            config.collections.batchesAudit
        );

        return res.json({ message: "Students added successfully" });
    } catch {
        return res.sendStatus(400);
    }
});

router.post("/batchTeachers/create", async (req, res) => {
    try {
        const { teacherName } = req.body;

        if (!teacherName || teacherName.trim().length === 0) {
            return res.json({ message: "Teacher name is required" });
        }

        const normalizedTeacherName = teacherName.toUpperCase();
        const existingTeacherSnapshot = await db.collection(config.collections.teacherDetails)
            .where("teacherName", "==", normalizedTeacherName)
            .limit(1)
            .get();

        if (!existingTeacherSnapshot.empty) {
            return res.json({ message: "Teacher already exists" });
        }

        const teacherId = uuidv4();
        const formattedTime = getFormattedTime();

        await db.collection(config.collections.teacherDetails).doc(teacherId).set({
            teacherName: normalizedTeacherName,
            createdBy: req.Name ? req.Name.toUpperCase() : "SYSTEM",
            createdDateTime: formattedTime
        });

        await insertAuditDetails(
            req,
            `Batch teacher created: ${normalizedTeacherName}`,
            teacherId,
            null,
            false,
            config.collections.teacherDetailsAudit
        );

        return res.status(200).json({ message: "Teacher created successfully" });
    } catch {
        return res.sendStatus(400);
    }
});

router.get("/batchTeachers/all", async (req, res) => {
    try {
        const teachersSnapshot = await db.collection(config.collections.teacherDetails).get();
        let teachersArray = teachersSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }));

        teachersArray.sort((a, b) => {
            const nameA = (a.teacherName || '').toUpperCase();
            const nameB = (b.teacherName || '').toUpperCase();
            return nameA.localeCompare(nameB);
        });

        return res.json(teachersArray);
    } catch {
        return res.sendStatus(400);
    }
});

module.exports = router;
