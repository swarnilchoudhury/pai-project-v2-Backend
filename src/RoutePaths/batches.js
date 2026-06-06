const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { v4: uuidv4 } = require('uuid');
const { db, admin } = require('../credentials/firebaseCredentials');
const { insertAuditDetails, insertAuditDetailsBatch } = require('../commonFunctions');
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

const getStudentDetailsById = async (studentIds) => {
    const uniqueStudentIds = [...new Set(studentIds.filter(Boolean))];

    if (uniqueStudentIds.length === 0) {
        return new Map();
    }

    const refs = uniqueStudentIds.map((studentId) =>
        db.collection(config.collections.studentDetailsActiveStatus).doc(studentId)
    );

    const studentDocs = await db.getAll(...refs);
    const studentDetailsById = new Map();

    studentDocs.forEach((studentDoc) => {
        if (!studentDoc.exists) {
            studentDetailsById.set(studentDoc.id, studentDoc.id);
            return;
        }

        const studentData = studentDoc.data();
        studentDetailsById.set(
            studentDoc.id,
            studentData.studentDetails || studentDoc.id
        );
    });

    return studentDetailsById;
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

        const studentDocs = await db.getAll(
            ...studentIds.map((studentId) =>
                db.collection(config.collections.studentDetailsActiveStatus).doc(studentId)
            )
        );

        return res.json(
            studentDocs
                .filter((studentDoc) => studentDoc.exists)
                .map((studentDoc) => ({
                    id: studentDoc.id,
                    ...studentDoc.data()
                }))
        );
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
        const [batchesSnapshot, activeStudentsSnapshot] = await Promise.all([
            db.collection(config.collections.batches).select("studentIds").get(),
            db.collection(config.collections.studentDetailsActiveStatus)
                .orderBy("studentName", "asc")
                .select("studentDetails")
                .get()
        ]);

        const assignedStudentIds = new Set(
            batchesSnapshot.docs.flatMap((doc) => {
                const studentIds = doc.data().studentIds;
                return Array.isArray(studentIds) ? studentIds : [];
            })
        );

        const availableStudents = activeStudentsSnapshot.docs
            .filter((doc) => !assignedStudentIds.has(doc.id))
            .map((doc) => ({
                id: doc.id,
                studentDetails: doc.data().studentDetails
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
        const newIdsToAdd = idsToAdd.filter((studentId) => !currentStudents.includes(studentId));

        if (newIdsToAdd.length === 0) {
            return res.json({ message: "Students already present in batch" });
        }

        const batchesSnapshot = await db.collection(config.collections.batches)
            .select("studentIds")
            .get();

        const assignedStudentIds = new Set(
            batchesSnapshot.docs
                .filter((doc) => doc.id !== batchId)
                .flatMap((doc) => {
                    const studentIds = doc.data().studentIds;
                    return Array.isArray(studentIds) ? studentIds : [];
                })
        );
        const alreadyAssignedStudentIds = newIdsToAdd.filter((studentId) =>
            assignedStudentIds.has(studentId)
        );

        if (alreadyAssignedStudentIds.length > 0) {
            return res.json({
                message: "One or more students are already assigned to another batch"
            });
        }

        if (currentStudents.length + newIdsToAdd.length > 40) {
            return res.json({ message: "Batch is full (40 students max)" });
        }

        const batch = db.batch();

        // Update batch document
        batch.update(db.collection(config.collections.batches).doc(batchId), {
            studentIds: admin.firestore.FieldValue.arrayUnion(...newIdsToAdd),
            modifiedDateTime: getFormattedTime()
        });

        await batch.commit();

        const studentDetailsById = await getStudentDetailsById(newIdsToAdd);
        const studentAuditDetails = newIdsToAdd.map((studentId) => ({
            studentId,
            studentDetails: studentDetailsById.get(studentId) || studentId
        }));

        await insertAuditDetailsBatch(req, [
            ...studentAuditDetails.map(({ studentId, studentDetails }) => ({
                systemComments: `Added to batch: ${batchData.batchName}`,
                documentId: studentId,
                studentDetails
            })),
            {
                systemComments: `Students added: ${studentAuditDetails.map(({ studentDetails }) => studentDetails).join(", ")}`,
                documentId: batchId,
                studentDetails: null,
                collectionName: config.collections.batchesAudit
            }
        ]);

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

router.post("/batchTeachers/audit", async (req, res) => {
    try {
        const { teacherId } = req.body;
        if (!teacherId) {
            return res.status(400).json({ message: "teacherId is required" });
        }

        const snapshot = await db.collection(config.collections.teacherDetailsAudit).doc(teacherId).get();
        const audits = snapshot.exists ? (snapshot.data()?.audits || []) : [];
        return res.status(200).json([...audits].reverse());
    } catch {
        return res.sendStatus(400);
    }
});

router.post("/batchTeachers/delete", async (req, res) => {
    try {
        const { teacherId } = req.body;
        if (!teacherId) {
            return res.status(400).json({ message: "teacherId is required" });
        }

        const [teacherDoc, assignedBatchesSnapshot] = await Promise.all([
            db.collection(config.collections.teacherDetails).doc(teacherId).get(),
            db.collection(config.collections.batches)
                .where("teacherIds", "array-contains", teacherId)
                .get()
        ]);

        if (!teacherDoc.exists) {
            return res.json({ message: "Teacher not found" });
        }

        const teacherData = teacherDoc.data();
        const teacherName = teacherData.teacherName || '';

        const writes = [
            {
                type: "delete",
                ref: teacherDoc.ref
            },
            ...assignedBatchesSnapshot.docs.map((batchDoc) => ({
                type: "update",
                ref: batchDoc.ref
            }))
        ];

        for (let i = 0; i < writes.length; i += 450) {
            const batch = db.batch();

            writes.slice(i, i + 450).forEach((write) => {
                if (write.type === "delete") {
                    batch.delete(write.ref);
                }
                else {
                    batch.update(write.ref, {
                        teacherIds: admin.firestore.FieldValue.arrayRemove(teacherId),
                        modifiedDateTime: getFormattedTime()
                    });
                }
            });

            await batch.commit();
        }

        await insertAuditDetails(
            req,
            `Teacher deleted: ${teacherName}`,
            teacherId,
            null,
            false,
            config.collections.teacherDetailsAudit
        );

        return res.json({ message: "Teacher deleted successfully" });
    } catch {
        return res.sendStatus(400);
    }
});

router.put("/batchTeachers/update/:teacherId", async (req, res) => {
    try {
        const { teacherId } = req.params;
        const { teacherName } = req.body;

        if (!teacherId || !teacherName || teacherName.trim().length === 0) {
            return res.json({ message: "Teacher ID and name are required" });
        }

        const normalizedTeacherName = teacherName.toUpperCase();
        const teacherDoc = await db.collection(config.collections.teacherDetails).doc(teacherId).get();

        if (!teacherDoc.exists) {
            return res.json({ message: "Teacher not found" });
        }

        const formattedTime = getFormattedTime();

        await db.collection(config.collections.teacherDetails).doc(teacherId).update({
            teacherName: normalizedTeacherName,
            modifiedBy: req.Name ? req.Name.toUpperCase() : "SYSTEM",
            modifiedDateTime: formattedTime
        });

        await insertAuditDetails(
            req,
            `Teacher updated: ${normalizedTeacherName}`,
            teacherId,
            null,
            true,
            config.collections.teacherDetailsAudit
        );

        return res.json({ message: "Teacher updated successfully" });
    } catch {
        return res.sendStatus(400);
    }
});

router.post("/batches/students/delete", async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.json({ message: "Student ID is required" });
        }

        const batchSnapshot = await db.collection(config.collections.batches)
            .where("studentIds", "array-contains", id)
            .limit(1)
            .get();

        if (batchSnapshot.empty) {
            return res.json({ message: "Student not found in any batch" });
        }

        const batchDoc = batchSnapshot.docs[0];
        const batchId = batchDoc.id;
        const batchData = batchDoc.data();
        const studentDetailsById = await getStudentDetailsById([id]);
        const studentDetails = studentDetailsById.get(id) || id;

        const batch = db.batch();
        batch.update(batchDoc.ref, {
            studentIds: admin.firestore.FieldValue.arrayRemove(id),
            modifiedDateTime: getFormattedTime()
        });

        await batch.commit();

        await insertAuditDetailsBatch(req, [
            {
                systemComments: `Removed from batch: ${batchData.batchName}`,
                documentId: id,
                studentDetails
            },
            {
                systemComments: `Student removed: ${studentDetails}`,
                documentId: batchId,
                studentDetails: null,
                collectionName: config.collections.batchesAudit
            }
        ]);

        return res.json({ message: "Student deleted successfully" });
    } catch {
        return res.sendStatus(400);
    }
});

router.post("/batches/students/move", async (req, res) => {
    try {
        const { studentId, fromBatchId, toBatchId } = req.body;

        if (!studentId || !fromBatchId || !toBatchId) {
            return res.json({ message: "studentId, fromBatchId, and toBatchId are required" });
        }

        const [fromBatchDoc, toBatchDoc] = await Promise.all([
            db.collection(config.collections.batches).doc(fromBatchId).get(),
            db.collection(config.collections.batches).doc(toBatchId).get()
        ]);

        if (!fromBatchDoc.exists) {
            return res.json({ message: "Source batch not found" });
        }

        if (!toBatchDoc.exists) {
            return res.json({ message: "Target batch not found" });
        }

        const fromBatchData = fromBatchDoc.data();
        const toBatchData = toBatchDoc.data();
        const fromStudentIds = Array.isArray(fromBatchData.studentIds) ? fromBatchData.studentIds : [];

        // Check if target batch is full
        const toStudentIds = Array.isArray(toBatchData.studentIds) ? toBatchData.studentIds : [];
        if (!fromStudentIds.includes(studentId)) {
            return res.json({ message: "Student not found in source batch" });
        }

        if (toStudentIds.length >= 40) {
            return res.json({ message: "Target batch is full (40 students max)" });
        }

        const formattedTime = getFormattedTime();
        const batch = db.batch();

        batch.update(fromBatchDoc.ref, {
            studentIds: admin.firestore.FieldValue.arrayRemove(studentId),
            modifiedDateTime: formattedTime
        });

        batch.update(toBatchDoc.ref, {
            studentIds: admin.firestore.FieldValue.arrayUnion(studentId),
            modifiedDateTime: formattedTime
        });

        await batch.commit();

        const studentDetailsById = await getStudentDetailsById([studentId]);
        const studentDetails = studentDetailsById.get(studentId) || studentId;

        await insertAuditDetailsBatch(req, [
            {
                systemComments: `Moved from batch: ${fromBatchData.batchName} to ${toBatchData.batchName}`,
                documentId: studentId,
                studentDetails
            },
            {
                systemComments: `Student moved out: ${studentDetails}`,
                documentId: fromBatchId,
                studentDetails: null,
                collectionName: config.collections.batchesAudit
            },
            {
                systemComments: `Student moved in: ${studentDetails}`,
                documentId: toBatchId,
                studentDetails: null,
                collectionName: config.collections.batchesAudit
            }
        ]);

        return res.json({ message: "Student moved successfully" });
    } catch {
        return res.sendStatus(400);
    }
});

module.exports = router;
