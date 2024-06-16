const admin = require('firebase-admin');
const serviceAccount = require("../../credentials/serviceAccount.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const db = admin.firestore();
const currentTime = admin.firestore.FieldValue.serverTimestamp();

module.exports = { admin, db, currentTime };
