const bearerSecurity = [{ bearerAuth: [] }];

const jsonBody = (schema, required = true) => ({
    required,
    content: { "application/json": { schema } }
});

const objectSchema = (properties, required = []) => ({
    type: "object",
    properties,
    ...(required.length ? { required } : {})
});

const string = (example, description) => ({ type: "string", ...(example ? { example } : {}), ...(description ? { description } : {}) });
const stringArray = (example = []) => ({ type: "array", items: { type: "string" }, example });

const operation = (tag, summary, options = {}) => ({
    tags: [tag],
    summary,
    security: options.public ? [] : bearerSecurity,
    ...(options.description ? { description: options.description } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body ? { requestBody: jsonBody(options.body) } : {}),
    responses: {
        200: { description: options.success || "Successful response" },
        ...(options.public ? {} : { 401: { description: "Missing/invalid Firebase token, or insufficient role" } }),
        400: { description: "Invalid request or data-store operation failed" }
    }
});

const idBody = (name = "id") => objectSchema({ [name]: string("student-or-document-id") }, [name]);
const studentFields = {
    studentCode: string("PAI-101"),
    studentName: string("ANITA SHARMA"),
    guardianName: string("RAJ SHARMA"),
    phoneNumber: string("9876543210"),
    admissionDate: string("2026-07-02"),
    dob: string("2012-04-10")
};

const swaggerDocument = {
    openapi: "3.0.3",
    info: {
        title: "PAI Project Backend API",
        version: "1.0.0",
        description: "API for student records, payments, teachers, and batches. Except for health and documentation, endpoints require a Firebase ID token. Payment and batch endpoints require an Admin role."
    },
    servers: [
        { url: "/", description: "AWS API Gateway, Lambda Function URL, or local server" }
    ],
    tags: [
        { name: "System", description: "Service health" },
        { name: "Authentication", description: "Authenticated user details and permissions" },
        { name: "Students", description: "Student lifecycle and audit history" },
        { name: "Audits", description: "Global user-side audit history" },
        { name: "Payments", description: "Admin-only payment operations" },
        { name: "Batches", description: "Admin-only batch operations" },
        { name: "Teachers", description: "Admin-only teacher operations" }
    ],
    components: {
        securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Firebase ID token", description: "Paste the Firebase ID token only (without the word Bearer)." }
        },
        schemas: {
            StudentInput: objectSchema(studentFields, ["studentCode", "studentName", "guardianName"]),
            Message: objectSchema({ message: string("Operation completed") })
        }
    },
    paths: {
        "/health": { get: operation("System", "Check whether the backend is running", { public: true }) },
        "/api/login": { get: operation("Authentication", "Return the signed-in user's display name") },
        "/api/permissions": { get: operation("Authentication", "Return whether the user has edit/admin permission") },

        "/api/home": { get: operation("Students", "List students by status", { parameters: [{ in: "header", name: "x-status", required: true, schema: { type: "string", enum: ["active", "deactive", "unapproval"] }, description: "Selects the Firestore status collection." }] }) },
        "/api/searchCode": { post: operation("Students", "Check whether a student code already exists", { body: objectSchema({ studentCode: string("101", "PAI- is added when omitted") }, ["studentCode"]) }) },
        "/api/latestCode": { get: operation("Students", "Get the latest active and pending student codes") },
        "/api/create": { post: operation("Students", "Create a student or send one for approval", { description: "Admins create an active student. Other users create a pending-approval student.", body: { $ref: "#/components/schemas/StudentInput" } }) },
        "/api/update": { post: operation("Students", "Move students between lifecycle states (Admin)", { parameters: [{ in: "header", name: "x-update", required: true, schema: { type: "string", enum: ["active", "deactive", "approve"] } }], body: objectSchema({ data: stringArray(["student-id/PAI-101"]) }, ["data"]) }) },
        "/api/updateStudent": { put: operation("Students", "Edit a student's details", { body: objectSchema({ updateForm: objectSchema({ id: string("student-id"), ...studentFields }, ["id"]), status: { type: "integer", enum: [1, 2, 3], description: "1 active, 2 deactive, 3 approval" } }, ["updateForm", "status"]) }) },
        "/api/studentAudit": { post: operation("Students", "Get a student's audit history", { body: idBody() }) },
        "/api/deleteStudent": { post: operation("Students", "Delete a student", { body: objectSchema({ id: string("student-id"), status: { type: "string", enum: ["Active", "Deactive", "Approval"] } }, ["id", "status"]) }) },
        "/api/audits": { get: operation("Audits", "List user-side audit history from the last 30 days, latest first") },
        "/api/audits/clear": { post: operation("Audits", "Clear audit history older than 30 days", { success: "Clear Started" }) },

        "/api/paymentsViews": { post: operation("Payments", "List students still eligible for payment in a month", { body: objectSchema({ month: string("July_2026") }, ["month"]) }) },
        "/api/createPayments": { post: operation("Payments", "Queue payment creation for one or more students", { body: objectSchema({ studentIds: stringArray(["student-id"]), amount: { type: "number", example: 500 }, modeOfPayment: string("Bank"), month: string("July_2026"), paymentDate: string("2026-07-02") }, ["studentIds", "amount", "modeOfPayment", "month"]) }) },
        "/api/studentsDetails": { get: operation("Payments", "List active students for payment screens") },
        "/api/studentsPayments": { post: operation("Payments", "Get all payments for one student", { body: objectSchema({ studentId: string("student-id") }, ["studentId"]) }) },
        "/api/monthlyPayments": { post: operation("Payments", "List paid or unpaid students for a month", { body: objectSchema({ month: string("July_2026"), isGiven: { type: "integer", enum: [0, 1], description: "1 paid, 0 unpaid" } }, ["month", "isGiven"]) }) },
        "/api/totalPayments": { get: operation("Payments", "Get totals for the latest 12 months") },
        "/api/updateStudentPayment": { put: operation("Payments", "Update a student's payment and queue total recalculation", { body: objectSchema({ updateForm: objectSchema({ id: string("student-id"), month: string("July_2026"), modeOfPayment: string("Cash"), paymentDate: string("2026-07-02") }, ["id", "month"]) }, ["updateForm"]) }) },
        "/api/deleteStudentPayment": { post: operation("Payments", "Delete a payment and queue total recalculation", { body: objectSchema({ id: string("student-id"), month: string("July_2026"), amount: { type: "number", example: 500 }, modeOfPayment: string("Cash"), studentName: string("ANITA SHARMA"), studentCode: string("PAI-101") }, ["id", "month", "amount", "modeOfPayment"]) }) },

        "/api/batches/all": { get: operation("Batches", "List all batches") },
        "/api/batches/students/{batchId}": { get: operation("Batches", "List students in a batch", { parameters: [{ in: "path", name: "batchId", required: true, schema: { type: "string" } }] }) },
        "/api/batches/audit": { post: operation("Batches", "Get a batch's audit history", { body: idBody("batchId") }) },
        "/api/batches/availableStudents": { get: operation("Batches", "List active students not assigned to a batch") },
        "/api/batches/searchStudents": { post: operation("Batches", "Find selected students' current batch details", { description: "Returns selected active students. Batch fields are N/A when the student is not assigned to a batch.", body: objectSchema({ studentIds: stringArray(["student-id-1", "student-id-2"]) }, ["studentIds"]) }) },
        "/api/batches/create": { post: operation("Batches", "Create a batch", { body: objectSchema({ batchName: string("MORNING A"), day: string("Monday"), timeSlot: string("09:00-10:00"), teacherIds: stringArray(["teacher-id"]) }, ["batchName", "day", "timeSlot", "teacherIds"]) }) },
        "/api/batches/addStudent/{batchId}": { put: operation("Batches", "Add students to a batch", { parameters: [{ in: "path", name: "batchId", required: true, schema: { type: "string" } }], body: objectSchema({ studentIds: stringArray(["student-id-1", "student-id-2"]) }, ["studentIds"]) }) },
        "/api/batches/students/delete": { post: operation("Batches", "Remove a student from their batch", { body: idBody() }) },
        "/api/batches/students/move": { post: operation("Batches", "Move a student between batches", { body: objectSchema({ studentId: string("student-id"), fromBatchId: string("source-batch-id"), toBatchId: string("target-batch-id") }, ["studentId", "fromBatchId", "toBatchId"]) }) },

        "/api/batchTeachers/create": { post: operation("Teachers", "Create a teacher", { body: objectSchema({ teacherName: string("MEERA PATEL") }, ["teacherName"]) }) },
        "/api/batchTeachers/all": { get: operation("Teachers", "List all teachers") },
        "/api/batchTeachers/audit": { post: operation("Teachers", "Get a teacher's audit history", { body: idBody("teacherId") }) },
        "/api/batchTeachers/delete": { post: operation("Teachers", "Delete a teacher and unassign them from batches", { body: idBody("teacherId") }) },
        "/api/batchTeachers/update/{teacherId}": { put: operation("Teachers", "Rename a teacher", { parameters: [{ in: "path", name: "teacherId", required: true, schema: { type: "string" } }], body: objectSchema({ teacherName: string("MEERA PATEL") }, ["teacherName"]) }) }
    }
};

module.exports = swaggerDocument;
