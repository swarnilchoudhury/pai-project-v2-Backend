const config = require('../config/config.json')
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const sqsClient = new SQSClient({
    region: process.env.AWS_REGION_KEY || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1"
});

const queueWorkerUrl = process.env.SQS_QUEUE_URL;

const sendQueueWorkerMessage = async (message) => {
    if (!queueWorkerUrl) {
        console.warn("SQS_QUEUE_URL is not configured. QueueWorker message skipped.");
        return;
    }

    try {
        await sqsClient.send(new SendMessageCommand({
            QueueUrl: queueWorkerUrl,
            MessageBody: JSON.stringify(message)
        }));
    } catch (error) {
        console.error("Error sending QueueWorker message:", error);
    }
};

const insertAuditDetails = async (
    req,
    systemComments = '',
    documentId,
    studentDetails = '',
    isUpdate = false,
    collectionName = null
) => {
    await insertAuditDetailsBatch(req, [
        {
            systemComments,
            documentId,
            studentDetails,
            isUpdate,
            collectionName
        }
    ]);
};

const insertAuditDetailsBatch = async (req, auditDetails = []) => {
    const user = req.Name ? req.Name.toUpperCase() : "-";
    const normalizedAuditDetails = auditDetails
        .filter((auditDetail) => auditDetail && auditDetail.documentId)
        .map((auditDetail) => ({
            systemComments: auditDetail.systemComments || '',
            documentId: auditDetail.documentId,
            studentDetails: auditDetail.studentDetails ?? '',
            isUpdate: auditDetail.isUpdate || false,
            collectionName: auditDetail.collectionName || config.collections.studentDetailsAudit
        }));

    if (normalizedAuditDetails.length === 0) {
        return;
    }

    await sendQueueWorkerMessage({
        eventType: "InsertAuditDetails",
        user,
        auditDetails: normalizedAuditDetails
    });
};

const adminRole = (req) => {
    try {
        if (req != null && req != undefined) {
            return req.Role.trim().toUpperCase() === "ADMIN"; // IF ADMIN, then return true
        }
        else {
            return false;
        }
    }
    catch {
        return false;
    }
};


module.exports = { insertAuditDetails, insertAuditDetailsBatch, adminRole, sendQueueWorkerMessage }
