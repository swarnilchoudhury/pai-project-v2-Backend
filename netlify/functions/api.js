const express = require("express");
const serverless = require("serverless-http");
const loginRouter = require("../../src/RoutePaths/login");
const homeRouter = require("../../src/RoutePaths/Home");
const roleRouter = require("../../src/RoutePaths/Role");

// Create an instance of the Express app
const app = express();

// To parse JSON bodies
app.use(express.json());

// Create a router to handle routes
const router = express.Router();

app.get('/health', async (req, res) => {
  return res.json({ message: "Health is OK" })
});

app.use((req, res, next) => {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, PUT");
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Cache-Control', 'no-store');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);

  }

  next();
})

//For Roles related routes
app.use("/api/role", roleRouter);

// For Login routes
app.use('/api/', loginRouter);

// For HomePage routes
app.use('/api/', homeRouter);

// Use the router to handle requests to the `/.netlify/functions/api` path
app.use("/api/", router);

// Export the app and the serverless function
module.exports = app;
module.exports.handler = serverless(app);