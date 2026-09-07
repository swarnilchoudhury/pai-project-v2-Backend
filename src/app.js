const express = require("express");
const swaggerUi = require("swagger-ui-express");
const loginRouter = require("./RoutePaths/login");
const homeRouter = require("./RoutePaths/home");
const paymentsRouter = require("./RoutePaths/payments");
const permissionsRouter = require("./RoutePaths/permissions");
const batchesRouter = require("./RoutePaths/batches");
const auditsRouter = require("./RoutePaths/audits");
const { verifyIdToken } = require("./authMiddleware");
const swaggerDocument = require("./swagger");

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
    return res.json({ message: "Health is OK" });
});

// Documentation is public. Calls to protected endpoints made from Swagger
// still require a Firebase ID token through the Authorize button.
app.get("/api-docs.json", (req, res) => res.json(swaggerDocument));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customSiteTitle: "PAI Project API Docs",
    swaggerOptions: { persistAuthorization: true }
}));

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, PUT");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Credentials", true);
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();
});

app.use(verifyIdToken);
app.use("/api/", loginRouter);
app.use("/api/", homeRouter);
app.use("/api/", permissionsRouter);
app.use("/api/", paymentsRouter);
app.use("/api/", batchesRouter);
app.use("/api/", auditsRouter);

module.exports = app;
