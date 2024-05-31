const express = require("express");
const serverless = require("serverless-http");

// Create an instance of the Express app
const app = express();

// Create a router to handle routes
const router = express.Router();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, PUT");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
})
// Define a route that responds with a JSON object when a GET request is made to the root path
router.get("/", (req, res) => {

  res.json({ name: "Hello", Age: 19 });

});

// Use the router to handle requests to the `/.netlify/functions/api` path
app.use("/api/", router);

// Export the app and the serverless function
module.exports = app;
module.exports.handler = serverless(app);