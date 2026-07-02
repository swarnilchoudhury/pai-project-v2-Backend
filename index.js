const serverless = require("serverless-http");
const app = require("./src/app");

// AWS Lambda handler configured as index.handler.
module.exports.handler = serverless(app);
