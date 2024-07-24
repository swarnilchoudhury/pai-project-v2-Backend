const config = require("../config/config.json");
const jwt = require('jsonwebtoken');

const authTokenTimeLogic = (id) => {
    let currentDate = new Date();

    // Create futureDate as one day after the current date
    let authTokenTime = new Date(currentDate);
    authTokenTime.setDate(currentDate.getDate() + 1);

    var authToken = jwt.sign({
        id: id
    }, config.SecretKey, { expiresIn: '1d' });

    return {
        authToken: authToken,
        authTokenTime: authTokenTime
    }

}

module.exports = { authTokenTimeLogic }