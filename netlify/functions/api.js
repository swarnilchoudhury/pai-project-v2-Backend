const express = require("express");
const serverless = require("serverless-http");
const loginRouter = require("../../src/RoutePaths/login");
const homeRouter = require("../../src/RoutePaths/Home");
const verifyToken = require("../../src/RoutePaths/VerifyToken");
const roleRouter = require("../../src/RoutePaths/Role");

// Create an instance of the Express app
const app = express();

// To parse JSON bodies
app.use(express.json());

// Create a router to handle routes
const router = express.Router();

app.use((req, res, next) => {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, PUT");
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', true);

   // Handle preflight requests
   if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
})

// For Login routes
app.use('/api/', loginRouter);

// For HomePage routes
app.use('/api/', homeRouter);

//For verifyToken
app.use('/api/', verifyToken);

//For Roles related routes
app.use("/api/", roleRouter)

// Use the router to handle requests to the `/.netlify/functions/api` path
app.use("/api/", router);

// Export the app and the serverless function
module.exports = app;
module.exports.handler = serverless(app);