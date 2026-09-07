const express = require('express');
const router = express.Router();
const config = require("../../config/config.json");
const { db } = require('../credentials/firebaseCredentials');

const auditCollection = () => db.collection(config.collections.auditsHistoryAll);

const getThirtyDaysAgo = () => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
};

const getDateValue = (data) => {
    const value = data.dateTime || data.updatedDateTime || data.createdDateTime;
    if (value?.toDate) {
        return value.toDate();
    }

    return value ? new Date(value) : null;
};

const formatDateTime = (date) => date.toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
});

const normalizeAuditData = (doc) => {
    const data = doc.data();
    const date = getDateValue(data);
    return {
        title: data.title || data.systemComments || '',
        user: data.user || '-',
        dateTime: typeof data.dateTime === 'string'
            ? data.dateTime
            : date
                ? formatDateTime(date)
                : data.updatedDateTime || ''
    };
};

const mapAuditDoc = (doc) => {
    const data = doc.data();
    const date = getDateValue(data);
    return {
        id: doc.id,
        title: data.title || data.systemComments || '',
        user: data.user || '-',
        dateTime: typeof data.dateTime === 'string'
            ? data.dateTime
            : date
                ? formatDateTime(date)
                : data.updatedDateTime || ''
    };
};

router.get("/audits", async (req, res) => {
    try {
        const thirtyDaysAgo = getThirtyDaysAgo();
        const snapshot = await auditCollection().get();

        const auditData = snapshot.docs
            .map((doc) => ({
                audit: mapAuditDoc(doc),
                date: getDateValue(doc.data())
            }))
            .filter(({ date }) => date && date >= thirtyDaysAgo)
            .sort((a, b) => b.date - a.date)
            .map(({ audit }) => audit);

        return res.status(200).json(auditData);
    } catch {
        return res.sendStatus(400);
    }
});

router.post("/audits/clear", async (req, res) => {
    try {
        const thirtyDaysAgo = getThirtyDaysAgo();
        const snapshot = await auditCollection().get();

        const docsToKeep = [];
        const docsToDelete = [];

        snapshot.docs.forEach((doc) => {
            const date = getDateValue(doc.data());
            if (date && date >= thirtyDaysAgo) {
                docsToKeep.push(doc);
            } else {
                docsToDelete.push(doc);
            }
        });

        if (docsToKeep.length > 0 || docsToDelete.length > 0) {
            const batchSize = 450;
            const docsToProcess = [
                ...docsToKeep.map((doc) => ({ doc, action: 'keep' })),
                ...docsToDelete.map((doc) => ({ doc, action: 'delete' }))
            ];

            for (let i = 0; i < docsToProcess.length; i += batchSize) {
                const batch = db.batch();
                docsToProcess.slice(i, i + batchSize).forEach(({ doc, action }) => {
                    if (action === 'delete') {
                        batch.delete(doc.ref);
                    } else {
                        batch.set(doc.ref, normalizeAuditData(doc));
                    }
                });
                await batch.commit();
            }
        }

        return res.status(200).json({ message: "Clear Started" });
    } catch {
        return res.sendStatus(400);
    }
});

module.exports = router;
